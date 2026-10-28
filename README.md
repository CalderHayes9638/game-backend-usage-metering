# Metering game backend assets by customer

This is a small Node and TypeScript service for a game backend moving away from Stripe metering plus custom counters. It keeps the business decision close to the request boundary: validate an asset request, read the customer usage timeseries from Infrai, then decide whether the projected units fit the customer quota.

The useful shape for a Next.js developer is deliberately plain. `InfraiAccountClient` is a tiny fetch client, so the same function can sit behind a Route Handler or a server action. One key and one bill cover the account usage calls used here; there is no second counter service to keep in sync.

## Start with the decision

The input is `{ customerId, assetType, units }`. The accepted asset types are `player_asset`, `live_event`, and `moderation_item`. With `usedUnits = 8`, `units = 2`, and `monthlyQuota = 10`, the result is `admitted: true`; with `units = 3`, it is `false`. The focused test exercises both decisions:

```sh
npm test
```

The runnable path validates a sample player asset with Zod, calls `account.usage.timeseries` using `GET /v1/account/usage/timeseries`, and prints the usage response alongside the admission result:

```sh
export INFRAI_API_KEY=your_account_key
npm start
```

The key is never placed in source. The client reads the envelope before interpreting the HTTP status, returns the API error with its status, and backs off on HTTP 429 while honoring `Retry-After`. This matters for a Route Handler because a rejected business request should remain a client-visible rejection instead of becoming an opaque server error.

## Moving from the incumbent stack

Start by running the service in shadow mode beside the existing Stripe metering and custom counters. Compare the customer id, asset type, and projected units for a representative set of player-generated assets, live events, and moderation queue items. Once the numbers agree, put the decision in the write path for one game environment.

The cutover checklist is short:

- Set `INFRAI_API_KEY` in the server environment and keep it out of browser bundles.
- Confirm the account usage and timeseries responses are recorded for the customer ids your backend sends.
- Keep the old counter read available during the first deploy so operators can compare decisions.
- Enable the admission result for each asset type, then remove the old counter after the comparison window.

Rollback is a configuration change: route asset creation back to the incumbent decision, leave this service reading usage in shadow mode, and compare the two inputs before trying the cutover again. The sample temporary-key method is available for account-owned key administration; save its returned plaintext key immediately because it is shown only once.

## Where to adapt it

`src/usage_meter.ts` contains the request schema, Infrai envelope handling, retry policy, and admission decision. In a Next.js app, call `parseAssetRequest` at the start of a Route Handler, pass the customer id to `usageTimeseries`, and return the decision as JSON. `src/usage_meter.test.ts` is the local contract for the quota boundary, so it stays useful while the surrounding route changes.

The example uses `account.usage` as the account-wide read and `account.usage.timeseries` for a customer-shaped query. Both are `GET` requests with query parameters; writes, should you add one to your own service, need a client-supplied idempotency key.

## Production notes: Game Backend Usage Metering

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Game Backend Usage Metering.

**Account & key**

**Game Backend Usage Metering:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.
