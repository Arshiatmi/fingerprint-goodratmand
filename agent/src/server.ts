/**
 * MOCK scanner agent, for developing without hardware.
 *
 * To use the real Suprema scanner, either:
 *  - run Suprema's own WebAgent and point VITE_AGENT_URL / AGENT_URL at it
 *    (then adjust web/src/scanner.ts and api/src/matcher.ts to its API), or
 *  - replace the two handlers below with calls into the Suprema UFScanner /
 *    UFMatcher SDK (via a native Node addon, or a small helper process).
 *
 * The contract the rest of the app relies on:
 *   GET  /api/status           -> { mode: "mock" | "device", scannerConnected: boolean, model?: string }
 *   POST /api/capture          -> { template: <base64>, format: string }
 *   POST /api/match            -> { matchedId: number | null }
 *        body: { probe: <base64>, candidates: [{ id, template: <base64> }] }
 */
import "dotenv/config";
import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import {
  BiominiError,
  biominiCapture,
  biominiDebug,
  biominiStatus,
} from "./biomini";

const app = express();
app.use(cors({ origin: ["http://localhost:5173", "http://127.0.0.1:5173"] }));
app.use(express.json({ limit: "10mb" }));
// Real scanner: these routes are registered first, so the mock routes below never run.
if (process.env.AGENT_MODE === "biomini") {
  console.log("Mode: real scanner via BioMiniWebAgent");
  app.get("/api/status", async (_req, res) => {
    try {
      res.json(await biominiStatus());
    } catch (err) {
      res.status(503).json({ error: (err as Error).message });
    }
  });
  app.post("/api/capture", async (_req, res) => {
    try {
      res.json(await biominiCapture());
    } catch (err) {
      res
        .status((err as BiominiError).status ?? 502)
        .json({ error: (err as Error).message });
    }
  });
  app.get("/api/debug", async (_req, res) => {
    res.json(await biominiDebug());
  });
  app.post("/api/match", (_req, res) => {
    res.status(501).json({ error: "تطبیق اثر انگشت هنوز پیاده‌سازی نشده است" });
  });
}

// The UI shows a warning banner whenever mode is "mock".
app.get("/api/status", (_req, res) => {
  res.json({ mode: "mock", scannerConnected: false, model: "Mock" });
});

// ?finger=alice always returns the same template (to test duplicate detection).
// Without it, every scan is a new random "finger".
app.post("/api/capture", (req, res) => {
  const finger =
    typeof req.query.finger === "string" && req.query.finger
      ? req.query.finger
      : null;
  // 384 bytes, the size of a real BioMini template.
  const bytes = finger
    ? Buffer.concat(
        Array.from({ length: 6 }, (_, i) =>
          crypto
            .createHash("sha512")
            .update(`mock-finger:${finger}:${i}`)
            .digest()
            .subarray(0, 64)
        )
      )
    : crypto.randomBytes(384);
  setTimeout(
    () => res.json({ template: bytes.toString("base64"), format: "MOCK" }),
    600
  );
});

app.post("/api/match", (req, res) => {
  const { probe, candidates } = req.body as {
    probe: string;
    candidates: { id: number; template: string }[];
  };
  const hit = candidates.find((c) => c.template === probe);
  res.json({ matchedId: hit ? hit.id : null });
});

const port = Number(process.env.AGENT_PORT ?? 8443);
app.listen(port, "127.0.0.1", () =>
  console.log(`Mock scanner agent on http://localhost:${port}`)
);
