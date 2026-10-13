import { useEffect, useState } from "react";
import "./identify.css";

const AGENT_URL = import.meta.env.VITE_AGENT_URL ?? "http://localhost:8443";

type Person = {
  id: number;
  fullName: string;
  nationalId: string | null;
  phone: string | null;
  createdAt: string;
};

type Status = "idle" | "scanning" | "found" | "notfound" | "error";

/** Show only the last 4 digits on paper: ******1234 */
function mask(value: string | null): string {
  if (!value) return "";
  return value.length <= 4 ? value : "*".repeat(value.length - 4) + value.slice(-4);
}

export default function IdentifyPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [person, setPerson] = useState<Person | null>(null);
  const [error, setError] = useState("");
  const [autoPrint, setAutoPrint] = useState(true);

  // Print as soon as a person is found (after the receipt has rendered).
  useEffect(() => {
    if (status === "found" && person && autoPrint) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [status, person, autoPrint]);

  async function scan() {
    setStatus("scanning");
    setPerson(null);
    setError("");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 70000);

    try {
      // 1) Scanner agent: scans the finger and matches against enrolled users.
      const r = await fetch(`${AGENT_URL}/api/db/identify`, {
        method: "POST",
        signal: controller.signal,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `Scanner error ${r.status}`);

      if (data.matchedId === null || data.matchedId === undefined) {
        setStatus("notfound");
        return;
      }

      // 2) API: load the details of the matched person (public fields only).
      const pr = await fetch(`/api/people/${encodeURIComponent(data.matchedId)}`);
      if (pr.status === 404) {
        throw new Error("Fingerprint matched, but this user is not in the database.");
      }
      const pdata = await pr.json();
      if (!pr.ok) throw new Error(pdata.error ?? `API error ${pr.status}`);

      setPerson(pdata.person);
      setStatus("found");
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "AbortError"
          ? "Scan timed out. Try again."
          : e instanceof Error
            ? e.message
            : "Unknown error"
      );
      setStatus("error");
    } finally {
      clearTimeout(timer);
    }
  }

  return (
    <div className="identify" dir="rtl">
      <div className="no-print identify-panel">
        <h2>شناسایی با اثر انگشت</h2>

        <button onClick={scan} disabled={status === "scanning"}>
          {status === "scanning" ? "انگشت را روی اسکنر بگذارید..." : "اسکن و چاپ اطلاعات"}
        </button>

        <label className="identify-auto">
          <input
            type="checkbox"
            checked={autoPrint}
            onChange={(e) => setAutoPrint(e.target.checked)}
          />
          چاپ خودکار پس از شناسایی
        </label>

        {status === "notfound" && <p className="identify-warn">این اثر انگشت ثبت نشده است.</p>}
        {status === "error" && <p className="identify-error">{error}</p>}

        {status === "found" && person && (
          <div className="identify-result">
            <p><b>{person.fullName}</b></p>
            <button onClick={() => window.print()}>چاپ دوباره</button>
          </div>
        )}
      </div>

      {/* Only this block is printed on the receipt printer. */}
      {person && (
        <div id="receipt">
          <h3>اطلاعات ثبت‌شده</h3>
          <hr />
          <p>نام: {person.fullName}</p>
          {person.nationalId && <p>کد ملی: {mask(person.nationalId)}</p>}
          {person.phone && <p>تلفن: {person.phone}</p>}
          <p>تاریخ ثبت: {new Date(person.createdAt).toLocaleDateString("fa-IR")}</p>
          <hr />
          <p className="receipt-time">چاپ: {new Date().toLocaleString("fa-IR")}</p>
        </div>
      )}
    </div>
  );
}
