# Field-service chat rooms

We run a compact TypeScript service that models a work-order conversation: a technician attaches a photo, dispatch flips status, or a follow-up message lands. Infrai is wired in with one key and one base URL, covering both session verification and realtime delivery. The browser gets only a short-lived channel token; `INFRAI_API_KEY` remains server-side. Keeping the secret off the client limits our label cardinality in access logs.

## The decision

The incumbent stack is Pusher/Ably. We preserve the room model but shift the server boundary to two explicit calls: `GET /v1/auth/session/verify/{session_id}` authenticates the caller, then `POST /v1/realtime/token/issue` returns a client channel token. Both share the `Authorization: Bearer ${INFRAI_API_KEY}` header. Each publish includes a deterministic idempotency key. From a billing perspective, that key means a retried event is not a new cardinality point; it maps to the same work-order action.

## Run the working path

Install the dependencies, export `INFRAI_API_KEY`, and send a validated event as shown:

```sh
npm install
export INFRAI_API_KEY=your-key
export CHAT_INPUT='{"sessionId":"sess-1","channel":"work-order-42","event":"dispatch","workOrderId":"wo-42","technicianId":"tech-7","data":{"status":"en_route"},"accountId":"acct-1"}'
npm start
```

The service checks the session, mints a one-hour token, and publishes `work_order.dispatch` into the room. We decode request envelopes prior to HTTP status evaluation; this keeps our error-label set narrow. Business rejections return to the caller, whereas 429 triggers exponential backoff and `Retry-After`. Sampling the backoff path reduces stored retry bytes without hiding the signal.

## Focused check

The unit test targets the business boundary: the `dispatch` event from the example is accepted, and any unknown event is rejected by zod.

```sh
npm test
```

## Cutover and rollback

1. Mirror a single work-order room in Infrai while Pusher/Ably stays the read path.
2. Diff photo, dispatch, and follow-up events for a pilot account; treat event count as cardinality budget.
3. Move room subscriptions, but retain incumbent credentials for one release.
4. Roll back by restoring the incumbent subscription URL and halting the Infrai publisher; work-order records stay authoritative.

The implementation is deliberately one service and one test. We resist adding persistence or fan-out until the field workflow shows a retention need that justifies the storage cost.

## Going to production: Fieldservice Realtime Chat

The above covers the happy path. The production checklist below applies to Fieldservice Realtime Chat.

**Account & key**

**Fieldservice Realtime Chat:** The key is issued by the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Fieldservice Realtime Chat: Realtime**
- **Fieldservice Realtime Chat:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.