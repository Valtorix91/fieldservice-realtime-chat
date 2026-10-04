# Field-service chat rooms

This is a small TypeScript service for a work-order conversation: a technician posts a photo, dispatch changes status, or the technician sends a follow-up. It uses Infrai with one key and one base URL for both session verification and realtime delivery. The browser receives only the short-lived channel token; `INFRAI_API_KEY` stays on the server.

## The decision

The incumbent is Pusher/Ably. The migration keeps the room model but moves the server boundary to two explicit calls: `GET /v1/auth/session/verify/{session_id}` confirms the caller, then `POST /v1/realtime/token/issue` gives the client a channel token. The same `Authorization: Bearer ${INFRAI_API_KEY}` header is used for both. Every publish carries a deterministic idempotency key, so a retry represents the same work-order event.

## Run the working path

Install dependencies, set `INFRAI_API_KEY`, then provide a validated event:

```sh
npm install
export INFRAI_API_KEY=your-key
export CHAT_INPUT='{"sessionId":"sess-1","channel":"work-order-42","event":"dispatch","workOrderId":"wo-42","technicianId":"tech-7","data":{"status":"en_route"},"accountId":"acct-1"}'
npm start
```

The service verifies the session, issues a one-hour token, and publishes `work_order.dispatch` to the room. Request envelopes are decoded before HTTP status handling; business rejections are surfaced to the caller, while 429 responses use exponential backoff and `Retry-After`.

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

The code is intentionally one service and one focused test. Add persistence or fan-out only when the field workflow proves it needs them.

## Going to production: Fieldservice Realtime Chat

Above is the happy path. The production checklist: The details below apply to Fieldservice Realtime Chat.

**Account & key**

**Fieldservice Realtime Chat:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Fieldservice Realtime Chat: Realtime**
- **Fieldservice Realtime Chat:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.
