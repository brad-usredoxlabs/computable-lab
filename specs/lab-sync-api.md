# Lab-Sync API — interface between test-your-food.com and Computable Lab

Status: v1.0 — the website-side endpoints below are IMPLEMENTED and verified
(sqlite dev mode), except §5 `sample_register.php` / `sample_shipped.php`
(barcode registration UI = wave 2). Until those exist, only
`customer.created` / `order.created` / `order.updated` / `sample.shipped*`
events appear on the stream (*shipped currently minted manually via admin
helper; barcode events arrive with wave 2).

One deviation from the tables below, stated plainly: `order.created` is minted
when the order row is committed (status `pending_payment`) — not at payment
capture. Payment/capture transitions arrive as `order.updated`. Stripe webhook
handling is future work; while `STRIPE_SECRET_KEY` is unset, stub orders are
the norm and status moves only via admin/ingest paths.

Rule: **HTTP synchronizes meaning. Git preserves history.** The website publishes
durable domain events; Computable Lab consumes them, commits YAML records to
Git, and acknowledges. Git is never the wire protocol, and no database is
shared.

## 1. Base URL & auth

- Base: `https://test-your-food.com/api` (prod). Local dev: `http://127.0.0.1:8787`.
- Every request MUST carry header:
  `X-LAB-TOKEN: <shared secret>`
  Website config: `LAB_SYNC_TOKEN` (api/config.local.php / env `TYF_LAB_TOKEN`;
  dev default `dev-lab-token`). Wrong/missing →
  `401 {"ok":false,"error":"unauthorized"}`. HTTPS only in prod.
- All bodies are JSON. All responses JSON. Errors never leak stack traces.

## 2. Outbound: website → Computable Lab

### Event envelope (every event, both directions)

```json
{
  "event_id": "evt_TYF_000123",
  "cursor": 123,
  "type": "order.created",
  "occurred_at": "2026-09-26T17:42:31-04:00",
  "payload": { }
}
```

- `event_id`: globally unique, website-minted (`evt_TYF_000NNN`). Stable across
  re-pulls — the consumer dedupes on it.
- `cursor`: monotonic integer (append-only event table PK). Pull resumes here.
- Stream is APPEND-ONLY. Events are never mutated or deleted within the 7-day
  post-ack retention window.

### GET /api/lab-sync/events?cursor=N&wait=S

Returns up to 200 events with `cursor > N`, oldest first.
- `wait` seconds: 0–60 (default 0). Long-poll: server holds the request until
  at least one event is available or `wait` elapses, then responds. Client
  reconnects immediately on empty response.
- Response: `{"ok":true,"events":[...],"cursor":<max id returned, or N if empty>}`
  If the client passes `cursor` beyond the end, `cursor` returned = N (client
  must not jump ahead).

### POST /api/lab-sync/ack

```json
{ "cursor": 18273 }
```
Means: Computable Lab has DURABLY committed every event with `cursor <= 18273`
(records written, Git committed). Website stamps `acked_at`; acked events are
retained ≥ 7 days (`LAB_ACK_RETENTION_DAYS`) then eligible for cleanup.
Acknowledging a lower cursor than previously acked is a no-op (monotonic).
Response: `{"ok":true,"acked_cursor":18273}`.

### Outbound event types (website mints)

| type | payload | when |
|---|---|---|
| `customer.created` | `{customer:{email,name,address?},source:{system:"test-your-food.com"}}` | first order by an email |
| `customer.updated` | `{customer:{email,changes:{}},source:{...}}` | address/contact change |
| `order.created` | see below | order row committed (paid or stub) |
| `order.updated` | `{order_remote_id, changes:{}, remote_revision}` | any field change incl. status set by website |
| `order.cancel_requested` | `{order_remote_id, reason?, requested_at}` | customer requests cancel |
| `sample.registered` | `{order_remote_id, barcode, customer_sample_description:{type,description,customer_label?}, registered_at}` | customer scan/describe (POST /api/sample_register.php) |
| `sample.shipped` | `{order_remote_id, barcode, shipped_at, carrier?, tracking?}` | customer marks mailed |

`order.created` payload:

```json
{
  "order_remote_id": "tyfored_9f3a21",
  "remote_revision": 1,
  "placed_at": "2026-09-26T17:42:31-04:00",
  "customer": { "email": "jane@example.com", "name": "Jane Smith",
                 "address": { "street": "...", "city": "...", "region": "...",
                               "postal": "...", "country": "US" } },
  "requested_services": [
    { "line_id": "tyforl_1a2b3c", "service": "fatty_acid_profile",
      "matrix": "fat", "sample_count": 2,
      "requested_reporting": { "basis": "percent_total_fatty_acids" } }
  ],
  "total_amount": 250.00, "currency": "USD",
  "affiliate_code": "AA-ANGELACRES"
}
```

Key identity rules:
- `order_remote_id` = the website's stable public order reference
  (`tyfored_*`), stored on the order row; CL stores it as
  `source.remote_id`, never the numeric DB id.
- `matrix` = website sample-type slug (fat, eggs, meat, dairy, vegetable,
  grain, processed).
- `service` = product slug mapped to a service code
  (`fatty-acid-analysis` → `fatty_acid_profile`; `pesticide-screening` →
  `pesticide_panel`). Mapping table lives in api/lib.php, is data not code
  logic branches.
- CL mirrors these into its own `CUST-*` / `ORD-*` records with
  `source: {system: test-your-food.com, remote_id, remote_revision}`.

## 3. Inbound: Computable Lab → website

### POST /api/lab-sync/ingest

```json
{ "events": [
  { "event_id": "evt_CL_008199", "type": "report.released",
    "occurred_at": "2026-09-29T11:04:21-04:00", "payload": {} }
] }
```
- Batch size 1–100. Website dedupes on `event_id` (globally unique,
  CL-minted `evt_CL_*`): duplicate event_ids are SKIPPED, listed in response
  `duplicated`, and the batch is otherwise applied — **safe to retry whole
  batches**.
- Unknown types: stored verbatim (append-only `lab_events` table), never
  dropped, applied=no, listed in response `unknown`.
- Response: `{"ok":true,"applied":[ids],"duplicated":[ids],"unknown":[ids]}`.

### Inbound event types

| type | payload | website effect |
|---|---|---|
| `order.accepted` | `{order_remote_id, contract_review_id?, performed_by?, performed_at}` | status → `awaiting_sample` |
| `order.rejected` | `{order_remote_id, reason:{code,text?}}` | status → `rejected` |
| `sample.received` | `{barcode, received_at, received_by?, condition_acceptable?}` | status → `sample_received`; barcode link confirmed |
| `sample.accessioned` | `{barcode, sample_id, received_at?}` | stores lab `sample_id` against barcode |
| `testing.started` | `{order_remote_id, sample_id?}` | status → `in_testing` |
| `testing.completed` | `{order_remote_id, sample_id?}` | status → `testing_complete` |
| `report.approved` | `{order_remote_id, report_id, revision, approved_by?, approved_at}` | recorded, not customer-visible |
| `report.released` | `{order_remote_id, report_id, revision, released_at, artifact_base64?, artifact_url?}` | status → `reported`; report stored, customer-visible |

Authority rule: the website NEVER decides whether a result is releasable —
`report.released` is the only trigger for customer visibility.

Inbound status transitions only move FORWARD; an event that would move an
order backward is stored but marked `applied:"ignored_stale"` in the response
array as `unknown`-style entry `skipped`.

### Report artifacts

`artifact_base64` = PDF bytes (≤ 5 MB) stored to `api/var/reports/<report_id>_r<revision>.pdf`,
served at `GET /api/report.php?order_id=..&email=..&report_id=..`
(email+order verification, same model as order_status). `artifact_url` =
alternative link only, not fetched by the website.

## 4. Customer-visible order status lifecycle (website side)

```
pending_payment → paid → awaiting_sample → sample_registered → in_transit
   → sample_received → in_testing → testing_complete → reported
terminal alt: rejected | cancelled
```
`order_status.php` labels (existing UI maps): Order received / Kit shipped /
At lab / Reported — extend to show: `awaiting_sample`→"We're preparing your
kit", `sample_registered`→"Sample registered — mail it in",
`in_transit`→"On its way to the lab", `in_testing`/`testing_complete`→"In the
lab", `reported`→"Your report is ready".

## 5. Customer-facing endpoints that mint events

- `POST /api/order.php` — now accepts `requested_services:[{test_slug,
  sample_type_slug, qty}]` (and legacy single-line fields); emits
  `customer.created` (if new) + `order.created` atomically with the order.
- `POST /api/sample_register.php` `{order_id, email, barcode,
  sample_type, description, customer_label?}` — customer scan/describe flow;
  emits `sample.registered`. Barcode format `TYF-[A-Z0-9]{6}`.
- `POST /api/sample_shipped.php` `{order_id, email, barcode}` — emits
  `sample.shipped`.

## 6. Failure model

- Client crash / internet outage: no events lost — stream is durable; worker
  resumes at last acked cursor. Duplicate delivery tolerated via event_id.
- Website never blocks on the lab: ingest is fire-and-respond; outbound events
  queue whether or not CL is online.
- Long-poll holds sockets: cap 60 s; PHP-FPM friendly (no DB transaction held
  during wait — poll in a loop outside transactions).
- Clocks: `occurred_at` is advisory; ordering is by cursor only.

## 7. Reference client

`scripts/fake-lab.mjs` in this repo is the normative example client:
long-poll loop → prints events → acks. Run:
`LAB_URL=http://127.0.0.1:8787 LAB_TOKEN=*** node scripts/fake-lab.mjs`
CL's real sync worker should mirror its control flow (cursor persistence,
dedup by event_id, ack-after-durable-commit, immediate reconnect).
