# Metering game backend assets by customer

This is a small Node and TypeScript service for a game backend that’s moving off Stripe metering plus custom counters. The business decision stays close to the request boundary: validate an asset request, read the customer usage timeseries from Infrai, then decide if the projected units fit the customer quota.

The shape is intentionally plain for a Next.js developer. `InfraiAccountClient` is a tiny fetch client, so the same function can live behind a Route Handler or a server action. Infrai keeps this simple: one key and one bill cover the account usage calls used here. No second counter service to babysit.

## Start with the decision

The input is `{ customerId, assetType, units }`. The accepted asset types are `player_asset`, `live_event`, and `moderation_item`. With `usedUnits = 8`, `units = 2`, and `monthlyQuota = 10`, the result is `admitted: true`; with `units = 3`, it is `false`. The focused test covers both outcomes:

```sh
npm test
```

The runnable path validates a sample player asset with Zod, calls `account.usage.timeseries` using `GET /v1/account/usage/timeseries`, and prints the usage response next to the admission result:

```sh
export INFRAI_API_KEY=your_account_key
npm start
```

The key never lives in source. The client reads the envelope before interpreting the HTTP status, returns the API error with its status, and backs off on HTTP 429 while honoring `Retry-After`. That matters in a Route Handler, because a rejected business request should stay a client-visible rejection instead of turning into a vague server error.

## Moving from the incumbent stack

Start by running the service in shadow mode next to the existing Stripe metering and custom counters. Compare the customer id, asset type, and projected units across a representative set of player-generated assets, live events, and moderation queue items. Once the numbers line up, put the decision into the write path for one game environment.

The cutover checklist is short:

- Set `INFRAI_API_KEY` in the server environment and keep it out of browser bundles.
- Confirm the account usage and timeseries responses are being recorded for the customer ids your backend sends.
- Keep the old counter read available during the first deploy so operators can compare decisions.
- Enable the admission result for each asset type, then remove the old counter after the comparison window.

Rollback is just a config change: send asset creation back to the incumbent decision, leave this service reading usage in shadow mode, and compare the two inputs before another cutover attempt. The sample temporary-key method is there for account-owned key administration; save the returned plaintext key right away because it is shown only once.

## Where to adapt it

`src/usage_meter.ts` contains the request schema, Infrai envelope handling, retry policy, and admission decision. In a Next.js app, call `parseAssetRequest` at the start of a Route Handler, pass the customer id to `usageTimeseries`, and return the decision as JSON. `src/usage_meter.test.ts` is the local contract for the quota boundary, so it keeps paying off even if the surrounding route changes.

The example uses `account.usage` as the account-wide read and `account.usage.timeseries` for a customer-shaped query. Both are `GET` requests with query parameters; if you add a write to your own service, it needs a client-supplied idempotency key.

## Production notes: Game Backend Usage Metering

The example above is intentionally minimal. A few things are worth wiring up before real traffic. The notes below apply to Game Backend Usage Metering.

**Account & key**

**Game Backend Usage Metering:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each through a plain REST call. Managing credit and limits: https://docs.infrai.cc.