/**
 * Bridge to Suprema's BioMiniWebAgent (the local service started by BioMiniWebAgent.exe).
 *
 * The web agent serves HTTPS with a 2016-era TLS stack that modern browsers refuse,
 * so the browser talks to this bridge (plain HTTP on localhost) and the bridge talks
 * to the web agent with legacy TLS allowed. It only ever connects to 127.0.0.1.
 *
 * The endpoints and parameters below come from the agent's own BiominiWebAgent.js.
 */
import https from "node:https";
import { constants } from "node:crypto";

const HOST = process.env.BIOMINI_HOST ?? "127.0.0.1";
const PORT = Number(process.env.BIOMINI_PORT ?? 8083);
const QUALITY_LEVEL = process.env.BIOMINI_QUALITY_LEVEL ?? "6";

const tlsAgent = new https.Agent({
  rejectUnauthorized: false, // the agent ships a self-signed localhost certificate
  minVersion: "TLSv1",
  ciphers: "ALL:@SECLEVEL=0",
  secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT, // old servers without secure renegotiation
});

export class BiominiError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

interface Reply {
  retValue: number;
  retString?: string;
  [key: string]: unknown;
}

interface ScannerInfo {
  DeviceHandle: number | string;
  DeviceIndex: number;
  DeviceType: string;
  ScannerName: string;
}

const pageId = Math.random(); // the demo page sends one random id with every call
let cookie = "";
let scanner: ScannerInfo | null = null;

/** Vendor builds return retValue inconsistently as number 0 or string "0".
 *  Normalize before comparing; never use === 0 on it directly. */
function retOk(reply: Reply): boolean {
  const v = (reply as { retValue?: unknown }).retValue;
  if (v === undefined || v === null) return false;
  return Number(v) === 0;
}

function call(
  path: string,
  params: Record<string, string | number> = {},
  timeoutMs = 15000,
): Promise<Reply> {
  const qs = new URLSearchParams({ dummy: String(Math.random()) });
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: HOST,
        port: PORT,
        path: `${path}?${qs}`,
        method: "GET",
        agent: tlsAgent,
        headers: cookie ? { Cookie: cookie } : {},
        timeout: timeoutMs,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body.replace(/^\uFEFF/, "")) as Reply);
          } catch {
            console.error(
              "[biomini]",
              path,
              "reply is not JSON:",
              body.slice(0, 300),
            );
            reject(
              new BiominiError(
                `پاسخ نامعتبر از BioMiniWebAgent (HTTP ${res.statusCode})`,
              ),
            );
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("TIMEOUT")));
    req.on("error", (err: NodeJS.ErrnoException) => {
      console.error("[biomini]", path, err.code ?? "", err.message);
      reject(
        new BiominiError(
          `به BioMiniWebAgent وصل نشد (${
            err.code ?? err.message
          }). برنامه BioMiniWebAgent.exe را اجرا کنید.`,
          503,
        ),
      );
    });
    req.end();
  });
}

async function ensureSession(): Promise<void> {
  if (cookie) return;
  try {
    const r = await call("/api/createSessionID");
    if (typeof r.sessionId === "string") cookie = `username=${r.sessionId}`;
  } catch (err) {
    if ((err as BiominiError).status === 503) throw err; // agent unreachable: stop here
  }
}

async function initScanner(): Promise<ScannerInfo | null> {
  await ensureSession();
  const r = await call("/api/initDevice");
  const list = (r.ScannerInfos ?? []) as ScannerInfo[];
  scanner = retOk(r) && list.length > 0 ? list[0] : null;
  if (!scanner)
    console.error(
      "[biomini] initDevice found no scanner. Reply:",
      JSON.stringify(r).slice(0, 300),
    );
  return scanner;
}

export async function biominiStatus(): Promise<{
  mode: "device";
  scannerConnected: boolean;
  model?: string;
}> {
  if (!scanner) await initScanner();
  if (!scanner) return { mode: "device", scannerConnected: false };
  const s = await call("/api/getScannerStatus", {
    sHandle: scanner.DeviceHandle,
  });
  const v = (s as { retValue?: unknown }).retValue;
  if (v !== undefined && Number(v) !== 0) {
    console.error(
      "[biomini] getScannerStatus failed:",
      JSON.stringify(s).slice(0, 300),
    );
    scanner = null;
    return { mode: "device", scannerConnected: false };
  }
  return { mode: "device", scannerConnected: true, model: scanner.ScannerName };
}

async function doCapture(): Promise<{ template: string; format: string }> {
  try {
    if (!scanner) await initScanner();
    if (!scanner) {
      throw new BiominiError(
        "اسکنر پیدا نشد. کابل USB را بررسی کنید و برنامه‌های دیگری که از اسکنر استفاده می‌کنند را ببندید.",
      );
    }

    const handle = scanner.DeviceHandle;

    const cap = await call(
      "/api/captureSingle",
      { sHandle: handle, id: pageId, resetTimer: 30000 },
      45000,
    );
    // CHANGED 1: was `if (cap.retValue !== 0)`
    if (!retOk(cap))
      throw new BiominiError(
        `اسکن انجام نشد: ${cap.retString ?? "خطای نامشخص"}`,
      );

    const tpl = await call("/api/getTemplateData", {
      sHandle: handle,
      id: pageId,
      encrypt: 0,
      encryptKey: "",
      extractEx: 0,
      qualityLevel: QUALITY_LEVEL,
    });
    const b64 =
      typeof tpl.templateBase64 === "string"
        ? tpl.templateBase64.replace(/\s+/g, "")
        : "";
    // CHANGED 2: was `if (tpl.retValue !== 0 || ...)`
    if (!retOk(tpl) || Buffer.from(b64, "base64").length < 32) {
      throw new BiominiError(
        `استخراج اثر انگشت انجام نشد (کیفیت پایین؟): ${
          tpl.retString ?? ""
        }. دوباره اسکن کنید.`,
      );
    }

    return { template: b64, format: "SUPREMA" };
  } catch (err) {
    scanner = null; // re-initialise on the next attempt
    throw err;
  }
}

// One capture at a time: the scanner can only serve a single request.
let queue: Promise<unknown> = Promise.resolve();
export function biominiCapture(): Promise<{
  template: string;
  format: string;
}> {
  const run = queue.then(doCapture, doCapture);
  queue = run.catch(() => undefined);
  return run;
}

// ---- Diagnostics: GET http://localhost:8443/api/debug shows the agent's raw replies ----

function rawGet(
  path: string,
): Promise<{ httpStatus?: number; body?: string; error?: string }> {
  const sep = path.includes("?") ? "&" : "?";
  return new Promise((resolve) => {
    const req = https.request(
      {
        host: HOST,
        port: PORT,
        path: `${path}${sep}dummy=${Math.random()}`,
        method: "GET",
        agent: tlsAgent,
        headers: cookie ? { Cookie: cookie } : {},
        timeout: 10000,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({ httpStatus: res.statusCode, body: body.slice(0, 1500) }),
        );
      },
    );
    req.on("timeout", () => req.destroy(new Error("TIMEOUT")));
    req.on("error", (err: NodeJS.ErrnoException) =>
      resolve({ error: `${err.code ?? ""} ${err.message}`.trim() }),
    );
    req.end();
  });
}

export async function biominiDebug(): Promise<Record<string, unknown>> {
  const parse = (text?: string) =>
    JSON.parse((text ?? "").replace(/^\uFEFF/, ""));
  const out: Record<string, unknown> = {
    target: `https://${HOST}:${PORT}`,
    node: process.version,
  };

  out.createSessionID = await rawGet("/api/createSessionID");
  try {
    const id = parse((out.createSessionID as { body?: string }).body).sessionId;
    if (id) cookie = `username=${id}`;
  } catch {
    /* reported in the raw reply above */
  }

  const init = await rawGet("/api/initDevice");
  out.initDevice = init;
  try {
    const handle = parse(init.body).ScannerInfos?.[0]?.DeviceHandle;
    if (handle !== undefined)
      out.getScannerStatus = await rawGet(
        `/api/getScannerStatus?sHandle=${handle}`,
      );
  } catch {
    /* reported in the raw reply above */
  }
  return out;
}

async function needScanner(): Promise<ScannerInfo> {
  if (!scanner) await initScanner();
  if (!scanner) throw new BiominiError("اسکنر پیدا نشد.");
  return scanner;
}

export async function dbQuery(): Promise<string[]> {
  const s = await needScanner();
  const r: any = await call("/db/queryData", { sHandle: s.DeviceHandle });
  if (!retOk(r)) throw new BiominiError(`queryData: ${r.retString ?? ""}`);
  const n = parseInt(r.db?.size ?? "0", 10);
  return Array.from({ length: n }, (_, i) => String(r.db[i].id));
}

async function dbRemoveUser(userId: string): Promise<void> {
  const s = await needScanner();
  const ids = await dbQuery();
  const index = ids.indexOf(userId);
  if (index === -1) return;
  const r: any = await call("/db/delete", {
    sHandle: s.DeviceHandle,
    userSerialNo: index,
  });
  if (!retOk(r)) throw new BiominiError(`delete: ${r.retString ?? ""}`);
}

export async function dbEnroll(userId: string): Promise<void> {
  const s = await needScanner();
  // A failed earlier try can leave a half-made entry. Remove it first.
  await dbRemoveUser(userId);
  const ids = await dbQuery();
  const r: any = await call(
    "/db/enroll",
    {
      sHandle: s.DeviceHandle,
      id: pageId,
      userID: userId,
      userSerialNo: ids.length,
      selectTemplate: 0,
      encrypt: 0,
      encryptKey: "",
      extractEx: 0,
      qualityLevel: QUALITY_LEVEL,
    },
    60000,
  );
  if (!retOk(r)) {
    // Do not leave a half-made entry behind.
    await dbRemoveUser(userId).catch(() => undefined);
    throw new BiominiError(`enroll: ${r.retString ?? "ناموفق"}`);
  }
}

export async function dbIdentify(): Promise<string | null> {
  const s = await needScanner();
  const r: any = await call(
    "/db/identify",
    {
      sHandle: s.DeviceHandle,
      id: pageId,
      extractEx: 0,
      qualityLevel: QUALITY_LEVEL,
    },
    60000,
  );
  const idx = Number(r.matchedIndex);
  if (Number.isFinite(idx)) return idx === -1 ? null : String(r.matchedID);
  throw new BiominiError(`identify: ${r.retString ?? "پاسخ نامعتبر"}`);
}

export async function dbDeleteAll(): Promise<void> {
  const s = await needScanner();
  const r: any = await call("/db/deleteAll", { sHandle: s.DeviceHandle });
  if (!retOk(r)) throw new BiominiError(`deleteAll: ${r.retString ?? ""}`);
}
