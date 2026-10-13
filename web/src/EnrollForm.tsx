import { useEffect, useState } from "react";
import {
  AgentStatus,
  captureFingerprint,
  getScannerStatus,
  ScanResult,
} from "./scanner";
import PeopleList from "./PeopleList";

type Notice = { kind: "info" | "ok" | "error"; text: string } | null;

const AGENT_URL = import.meta.env.VITE_AGENT_URL ?? "http://localhost:8443";

const emptyForm = { fullName: "", nationalId: "", phone: "" };
const STATUS_TEXT: Record<AgentStatus["state"], { cls: string; text: string }> =
  {
    ready: { cls: "ok", text: "اسکنر متصل است" },
    mock: {
      cls: "warn",
      text: "حالت آزمایشی: اسکنر واقعی وصل نیست و اثر انگشت‌ها ساختگی هستند.",
    },
    disconnected: {
      cls: "bad",
      text: "سرویس اسکنر در حال اجراست اما دستگاه وصل نیست. کابل USB را بررسی کنید.",
    },
    unreachable: {
      cls: "bad",
      text: "سرویس اسکنر در دسترس نیست. برنامه اسکنر را اجرا کنید.",
    },
  };

/** Teaches the scanner this finger. userId = the person's database id,
 *  so the identify page can find the person again. */
async function enrollInScanner(personId: number): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 70000);
  try {
    const res = await fetch(
      `${AGENT_URL}/api/db/enroll?userId=${encodeURIComponent(String(personId))}`,
      { method: "POST", signal: controller.signal },
    );
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(body.error ?? `خطای اسکنر (${res.status})`);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("زمان اسکن تمام شد.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export default function EnrollForm() {
  const [form, setForm] = useState(emptyForm);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  // Set when the person is saved but the scanner has not learned the finger yet.
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const checkScanner = () => getScannerStatus().then(setStatus);
  useEffect(() => {
    checkScanner();
  }, []);

  const set =
    (key: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onScan() {
    setScanning(true);
    setScan(null);
    setNotice({ kind: "info", text: "انگشت خود را روی اسکنر بگذارید." });
    try {
      setScan(await captureFingerprint());
      setNotice({ kind: "ok", text: "اثر انگشت ثبت شد." });
    } catch (err) {
      setNotice({ kind: "error", text: (err as Error).message });
      checkScanner();
    } finally {
      setScanning(false);
    }
  }

  async function runScannerEnroll(id: number) {
    setEnrolling(true);
    setNotice({
      kind: "info",
      text: "حالا همان انگشت را یک بار دیگر روی اسکنر بگذارید تا برای شناسایی ثبت شود.",
    });
    try {
      await enrollInScanner(id);
      setPendingId(null);
      setNotice({
        kind: "ok",
        text: `ثبت کامل شد. شماره رکورد: ${id.toLocaleString("fa-IR", {
          useGrouping: false,
        })}`,
      });
    } catch (err) {
      setPendingId(id);
      setNotice({
        kind: "error",
        text: `اطلاعات ذخیره شد، اما ثبت در اسکنر انجام نشد: ${
          (err as Error).message
        } با دکمه «تلاش دوباره» دوباره امتحان کنید.`,
      });
    } finally {
      setEnrolling(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!scan) {
      setNotice({ kind: "error", text: "ابتدا اثر انگشت را اسکن کنید." });
      return;
    }
    setSaving(true);
    let savedId: number | null = null;
    try {
      const res = await fetch("/api/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          fingerprint: scan.templateBase64,
          fpFormat: scan.format,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        id?: number;
      };
      if (!res.ok)
        throw new Error(body.error ?? `ذخیره انجام نشد (خطای ${res.status})`);
      savedId = body.id ?? null;
      setForm(emptyForm);
      setScan(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setNotice({ kind: "error", text: (err as Error).message });
    } finally {
      setSaving(false);
    }

    if (savedId !== null) await runScannerEnroll(savedId);
  }

  const st = status ? STATUS_TEXT[status.state] : null;
  const busy = scanning || saving || enrolling;

  return (
    <main className="shell">
      <form className="panel" onSubmit={onSubmit}>
        <h1>ثبت اثر انگشت</h1>
        <p className="lede">
          اطلاعات را وارد کنید، یک انگشت را اسکن کنید و ذخیره کنید. بعد از ذخیره،
          باید همان انگشت را یک بار دیگر بگذارید.
        </p>
        {st && (
          <div className={`status ${st.cls}`} role="status">
            <span>{st.text}</span>
            <button type="button" className="link" onClick={checkScanner}>
              بررسی دوباره
            </button>
          </div>
        )}

        <label>
          نام و نام خانوادگی
          <input
            value={form.fullName}
            onChange={set("fullName")}
            required
            autoComplete="off"
          />
        </label>
        <label>
          کد ملی
          <input
            className="ltr"
            value={form.nationalId}
            onChange={set("nationalId")}
            inputMode="numeric"
            autoComplete="off"
          />
        </label>
        <label>
          شماره تلفن
          <input
            className="ltr"
            value={form.phone}
            onChange={set("phone")}
            inputMode="tel"
            autoComplete="off"
          />
        </label>

        <div className="scan-row">
          <button
            type="button"
            className="secondary"
            onClick={onScan}
            disabled={busy}
          >
            {scanning ? "در حال اسکن…" : scan ? "اسکن مجدد" : "اسکن اثر انگشت"}
          </button>
          <span className={`scan-state ${scan ? "done" : ""}`}>
            {scan ? "اثر انگشت آماده است" : "هنوز اسکن نشده"}
          </span>
        </div>

        <button type="submit" disabled={busy || !scan}>
          {saving
            ? "در حال ذخیره…"
            : enrolling
              ? "در حال ثبت در اسکنر…"
              : "ذخیره"}
        </button>

        {pendingId !== null && !enrolling && (
          <button
            type="button"
            className="secondary"
            onClick={() => runScannerEnroll(pendingId)}
          >
            تلاش دوباره برای ثبت در اسکنر
          </button>
        )}

        <p
          className={`notice ${notice?.kind ?? ""}`}
          role="status"
          aria-live="polite"
        >
          {notice?.text}
        </p>
      </form>
      <PeopleList refreshKey={refreshKey} />
    </main>
  );
}
