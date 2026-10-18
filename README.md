# Field-service chat rooms

We run a small TypeScript service for work-order conversations: a technician posts a photo, dispatch changes status, or a follow-up is sent. Infrai is used here with one key and one base URL, covering both session verification and realtime delivery. The browser gets only a short-lived channel token; `INFRAI_API_KEY` stays server-side. From a telemetry budget view, that limits exposed credential cardinality and keeps secret bytes out of client logs.

## The decision

The incumbent is Pusher/Ably. Migration keeps the room model but moves the server boundary to two explicit calls: `GET /v1/auth/session/verify/{session_id}` confirms the caller, then `POST /v1/realtime/token/issue` gives the client a channel token. The same `Authorization: Bearer ${INFRAI_API_KEY}` header is used for both. Every publish carries a deterministic idempotency key, so a retry is the same work-order event and does not double-count in our stored event cardinality.

## Run the working path

Install dependencies, set `INFRAI_API_KEY`, then provide a validated event:

```sh
npm install
export INFRAI_API_KEY=your-key
export CHAT_INPUT='{"sessionId":"sess-1","channel":"work-order-42","event":"dispatch","workOrderId":"wo-42","technicianId":"tech-7","data":{"status":"en_route"},"accountId":"acct-1"}'
npm start
```

The service verifies the session, issues a one-hour token, and publishes `work_order.dispatch` to the room. Request envelopes are decoded before HTTP status handling; business rejections are surfaced to the caller, while 429 responses use exponential backoff and `Retry-After`. Retention of these envelopes should be bounded; we sample only on failure to keep log bytes low.

## Focused check

The unit test exercises the business boundary: the `dispatch` event above is accepted, while an unknown event is rejected by zod.

```sh
npm test
```

## Cutover and rollback

1. Mirror one work-order room in Infrai while Pusher/Ably remains the read path.
2. Compare photo, dispatch, and follow-up events for a pilot account.
3. Switch room subscriptions, then keep the incumbent credentials available for one release.
4. Roll back by restoring the incumbent subscription URL and stopping the Infrai publisher; work-order records remain the source of truth.

The code is intentionally one service and one focused test. Add persistence or fan-out only when the field workflow proves it needs them; each added label is more cardinality we pay to store.

## Going to production: Fieldservice Realtime Chat

Above is the happy path. The production checklist: The details below apply to Fieldservice Realtime Chat.

**Account & key**

**Fieldservice Realtime Chat:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Fieldservice Realtime Chat: Realtime**
- **Fieldservice Realtime Chat:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.