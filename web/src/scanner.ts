// The only scanner-specific file in the frontend.
// If your Suprema agent has a different API, change captureFingerprint() and getScannerStatus() only.

const AGENT_URL: string =
  import.meta.env.VITE_AGENT_URL ?? "http://localhost:8443";
const MOCK_FINGER: string = import.meta.env.VITE_MOCK_FINGER ?? "";

export interface ScanResult {
  templateBase64: string;
  format: string;
}

export type AgentStatus =
  | { state: "unreachable" }
  | { state: "mock" }
  | { state: "disconnected" }
  | { state: "ready"; model?: string };

export async function getScannerStatus(): Promise<AgentStatus> {
  try {
    // TODO: path and response fields for your real agent
    const res = await fetch(`${AGENT_URL}/api/status`);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `اسکنر خطای ${res.status} برگرداند`);
    }
    const data = (await res.json()) as {
      mode: string;
      scannerConnected: boolean;
      model?: string;
    };
    if (data.mode === "mock") return { state: "mock" };
    return data.scannerConnected
      ? { state: "ready", model: data.model }
      : { state: "disconnected" };
  } catch {
    return { state: "unreachable" };
  }
}

export async function captureFingerprint(
  timeoutMs = 20000
): Promise<ScanResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // TODO: path, query and response fields for your real agent
    const query = MOCK_FINGER
      ? `?finger=${encodeURIComponent(MOCK_FINGER)}`
      : "";
    const res = await fetch(`${AGENT_URL}/api/capture${query}`, {
      method: "POST",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`اسکنر خطای ${res.status} برگرداند`);
    const data = (await res.json()) as { template: string; format?: string };
    if (!data.template) throw new Error("اسکنر اثر انگشتی برنگرداند");
    return { templateBase64: data.template, format: data.format ?? "SUPREMA" };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(
        "زمان اسکن تمام شد. انگشت را روی اسکنر بگذارید و دوباره تلاش کنید."
      );
    }
    if (err instanceof TypeError) {
      throw new Error(
        `به سرویس اسکنر (${AGENT_URL}) وصل نشد. مطمئن شوید برنامه اسکنر در حال اجراست.`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
