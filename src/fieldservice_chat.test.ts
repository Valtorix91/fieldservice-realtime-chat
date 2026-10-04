import { publishChat, validateChatInput } from "./fieldservice_chat.ts";
const valid = { sessionId: "sess-1", channel: "work-order-42", event: "dispatch", workOrderId: "wo-42", technicianId: "tech-7", data: { status: "en_route" }, accountId: "acct-1" };
if (validateChatInput(valid).event !== "dispatch") throw new Error("dispatch event should pass");
try { validateChatInput({ ...valid, event: "unknown" }); throw new Error("invalid event accepted"); } catch (error) { if (!(error instanceof Error) || !error.message.includes("Invalid")) throw error; }
console.log("chat input boundary: dispatch accepted, unknown event rejected");

const originalFetch = globalThis.fetch;
const originalKey = process.env.INFRAI_API_KEY;
const requests: { path: string; body?: Record<string, unknown> }[] = [];
try {
  process.env.INFRAI_API_KEY = "test-key";
  globalThis.fetch = async (url, options) => {
    requests.push({ path: String(url), body: options?.body ? JSON.parse(String(options.body)) : undefined });
    return new Response(JSON.stringify({ ok: true, data: {} }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  await publishChat(valid);
  const publish = requests.find(request => request.path.endsWith("/v1/realtime/publish"));
  if (publish?.body?.idempotency_key !== "wo-42:dispatch:tech-7") throw new Error("publish must include a deterministic idempotency_key");
} finally {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.INFRAI_API_KEY;
  else process.env.INFRAI_API_KEY = originalKey;
}
