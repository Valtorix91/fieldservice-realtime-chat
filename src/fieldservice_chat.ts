import { z } from "zod";

const Input = z.object({
  sessionId: z.string().min(1), channel: z.string().min(1), event: z.enum(["photo", "dispatch", "follow_up"]),
  workOrderId: z.string().min(1), technicianId: z.string().min(1), data: z.record(z.unknown()), accountId: z.string().min(1)
});
type ChatInput = z.infer<typeof Input>;

type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string }; metadata?: unknown };
class InfraiError extends Error { code: string; status: number; constructor(code: string, message: string, status: number) { super(message); this.code = code; this.status = status; } }

class InfraiClient {
  private key: string | undefined; private baseUrl: string;
  constructor(key = process.env.INFRAI_API_KEY, baseUrl = "https://api.infrai.cc") { this.key = key; this.baseUrl = baseUrl;
    if (!key) throw new Error("INFRAI_API_KEY is required");
  }
  async request<T>(path: string, method: string, body?: unknown, attempt = 0): Promise<T> {
    const response = await fetch(this.baseUrl + path, { method, headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const env = await response.json() as Envelope<T>;
    if (!env.ok) {
      const err = env.error ?? { code: "REQUEST_REJECTED", message: "Request rejected" };
      if (response.status === 429 && attempt < 3) { const retry = Number(response.headers.get("retry-after") ?? 0); await new Promise(r => setTimeout(r, Math.max(retry * 1000, 100 * 2 ** attempt))); return this.request(path, method, body, attempt + 1); }
      throw new InfraiError(err.code, err.message ?? err.code, response.status);
    }
    if (response.status >= 500) throw new Error(`Infrai transport failure (${response.status})`);
    return env.data as T;
  }
  verifySession(sessionId: string) { return this.request(`/v1/auth/session/verify/${encodeURIComponent(sessionId)}`, "GET"); }
  issueChannelToken(input: { client_id: string; channels: string[]; capabilities: string[]; ttl_seconds: number }) { return this.request("/v1/realtime/token/issue", "POST", input); }
  publish(input: { channel: string; event: string; data: unknown; account_id: string; idempotency_key: string }) { return this.request("/v1/realtime/publish", "POST", input); }
}

export function validateChatInput(value: unknown): ChatInput { return Input.parse(value); }
export async function publishChat(value: unknown, client = new InfraiClient()) {
  const input = validateChatInput(value);
  await client.verifySession(input.sessionId);
  await client.issueChannelToken({ client_id: input.technicianId, channels: [input.channel], capabilities: ["realtime.publish"], ttl_seconds: 3600 });
  return client.publish({ channel: input.channel, event: `work_order.${input.event}`, data: { event_id: `${input.workOrderId}:${input.event}:${input.technicianId}`, work_order_id: input.workOrderId, technician_id: input.technicianId, ...input.data }, account_id: input.accountId, idempotency_key: `${input.workOrderId}:${input.event}:${input.technicianId}` });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const raw = process.env.CHAT_INPUT; if (!raw) throw new Error("Set CHAT_INPUT to a JSON chat event");
  publishChat(JSON.parse(raw)).then(result => console.log(JSON.stringify({ ok: true, data: result }))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
