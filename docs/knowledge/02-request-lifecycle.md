---
status: current
last_verified: 2026-07-15
source_of_truth: [src/api/client.ts, src/api/index.ts, src/views/viewer/ExecutiveOverview.vue, src/views/viewer/ViewerReport.vue]
tags: [frontend, requests, idempotency, snapshots]
---

# Request Lifecycle

## Shared Client

`apiRequest` provides the common transport behavior:

- Same-origin cookies and JSON envelopes
- CSRF header for authenticated unsafe methods
- Per-request `AbortController` and timeout
- One retry by default for retryable safe reads
- No automatic retry for `POST`, `PUT`, `PATCH`, or `DELETE`
- `Retry-After` support and normalized `ApiError`
- Global unauthorized events for admin/viewer session recovery

An HTTP abort stops browser tracking only. It does not prove a backend report or remote SML query was cancelled.

## Mutation Safety

- Create idempotency keys at the user confirmation boundary, not during render or draft editing.
- Reuse the same key while recovering an unknown result.
- Prevent double submit with single-flight UI state.
- Do not retry a mutation automatically after timeout; refetch state first when the workflow supports reconciliation.

## Stale-response Safety

Long-lived pages that react to route, tenant, report, period, or run changes must:

1. Abort the previous HTTP request.
2. Increment or replace the local context generation.
3. Apply a response only if tenant, report, period, and generation still match.
4. Stop poll timers on terminal state, route change, and unmount.

## Snapshot and Refresh

- Initial overview/report rendering prefers an authorized snapshot.
- Fresh snapshots do not trigger SML work.
- Stale/missing data may expose explicit revalidation or refresh flows.
- Overview refresh replaces a complete result set atomically; partial output must be labelled and never mixed silently with another period.
- `runId`, `refreshId`, `snapshotRunId`, and `deliveryId` identify resources but are never authorization tokens.
- Delivery routes are read-only snapshot flows.

## LINE/LIFF Entry

- Preserve the intended route through LIFF login.
- Remove invitation/delivery references and transient OAuth parameters from browser history after exchange.
- A valid LINE session does not make an invalid explicit tenant or delivery route valid.
- Session expiry must clear sensitive viewer state before showing recovery UI.
