import { useEffect, useState } from "react";
import {
  AgentStatus,
  captureFingerprint,
  getScannerStatus,
  ScanResult,
} from "./scanner";
import PeopleList from "./PeopleList";

type Notice = { kind: "info" | "ok" | "error"; text: string } | null;

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

export default function EnrollForm() {
  const [form, setForm] = useState(emptyForm);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!scan) {
      setNotice({ kind: "error", text: "ابتدا اثر انگشت را اسکن کنید." });
      return;
    }
    setSaving(true);
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
      setNotice({
        kind: "ok",
        text: `ذخیره شد. شماره رکورد: ${(body.id ?? 0).toLocaleString("fa-IR", {
          useGrouping: false,
        })}`,
      });
      setForm(emptyForm);
      setScan(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setNotice({ kind: "error", text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  const st = status ? STATUS_TEXT[status.state] : null;

  return (
    <main className="shell">
      <form className="panel" onSubmit={onSubmit}>
        <h1>ثبت اثر انگشت</h1>
        <p className="lede">
          اطلاعات را وارد کنید، یک انگشت را اسکن کنید و ذخیره کنید.
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
            disabled={scanning || saving}
          >
            {scanning ? "در حال اسکن…" : scan ? "اسکن مجدد" : "اسکن اثر انگشت"}
          </button>
          <span className={`scan-state ${scan ? "done" : ""}`}>
            {scan ? "اثر انگشت آماده است" : "هنوز اسکن نشده"}
          </span>
        </div>

        <button type="submit" disabled={saving || scanning || !scan}>
          {saving ? "در حال ذخیره…" : "ذخیره"}
        </button>

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
