# Handoff — Lab-Sync: pulling customer orders from test-your-food.com into Computable Lab

Date: 2026-09-27
Session: architect profile (Hermes)
Commit: `fbeeeb25` — feat(lab-sync): party/request core records + test-your-food sync worker (41 files, +5774)
Parent: `56740422` (sibling session's QMS governance commit — clean lineage, no cross-contamination)

## What this session delivered

The complete CL side of the Lab-Sync integration: Computable Lab can now
long-poll test-your-food.com's durable event stream and turn each customer
order into a graph of schema-validated, Git-committed YAML records — with
correctly layered identity, controlled vocabulary, and forward-only lifecycle.

Governing specs (both now committed with the code):
- `specs/lab-sync-api.md` — the wire protocol (website endpoints, event types). Rule: **HTTP synchronizes meaning, Git preserves history.**
- `specs/computable-lab-party-request-schema-spec.md` — the record model. Core abstraction: **PARTY -> REQUEST -> SAMPLE -> WORK -> RESULT -> REPORT**; customer/order are domain specializations, never core assumptions.

## The record model built (schema-first, all conformance-tested)

Core, `schema/services/` (generic lab-service primitives):
- `party` — person/org/group; contacts, addresses, `source{system,remoteId}` provenance. `PartyShape` $def is the composition unit.
- `request` — "what work has someone asked the lab to perform"; requesterRef, requestedServices[] lines, remoteRevision-guarded source. No commercial fields.
- `requested-service` — first-class line item (never assume 1 request = 1 sample = 1 assay).
- `sample` — physical submission; `identifiers[]` carries external barcodes generically; submittedDescription (customer intent) kept distinct from lab truth; provenance root for downstream materials.
- `sample-receipt` — the LAB scan: custody event, immutable.
- `report` — the REPORTED layer; release is the only customer-visibility trigger.

Domain package, `schema/domains/test-your-food/`:
- `customer` (extends party) — deliberately thin identity, remoteId = `email:<email>` (logged deviation: website has no cus_* handle yet).
- `order` (extends request) — payment/kit as *mirrors*, totalAmount, affiliateCode, cancelRequested; `source.remoteId = tyfored_*`.
- `sample-registration` — the CUSTOMER scan; barcode regex `^TYF-[A-Z0-9]{6}$` enforced here, not in core.

Boundary history, `schema/integration/lab-sync-event` — append-only mirror of every event crossing the wire in either direction (eventId dedupe anchor, cursor, verbatim payload, processing status). This record *is* the Git-preserves-history half of the rule.

Lifecycles (`schema/core/lifecycles/`): `service-request` (generic), `lab-sample` (custody: registered->received->accessioned->...), `tyf-order` (mirrors the website §4 ladder; `reported` reachable ONLY from `testing_complete` — the authority rule made declarative).

Vocabulary bridge: `config/lab-sync/mapping.yaml` — product slug -> service code, matrix slug -> `cf:*` CURIE. **Unknown slug = hard stop** (stored as `unknown_type` with the slug named in the error); the system never invents a term.

## The sync machinery (`server/src/lab-sync/`)

- `LabSyncClient.ts` — events long-poll / ack / ingest; X-LAB-TOKEN from config only (no default baked in; principle §9 honored).
- `translate/inbound.ts` — event -> record mutations. The ONLY place snake_case wire bridges to camelCase records, per-handler explicit field maps. Dedupe on event_id (mirror-first, pending->final status so a crash mid-translation still leaves the inbox durable), revision staleness -> `ignored_stale`, order re-mint idempotent, barcode-per-tube-per-order, cancel_requested never moves status (CL decides).
- `outbound/` — `evt_CL_*` minting (frozen wire-vocabulary set) + retry-safe whole-batch push; report artifact base64 capped at 5 MB decoded, silently omitted when oversize (never faked).
- `cursor.ts` — atomic monotonic cursor at `<dataDir>/var/lab-sync/cursor.json` (machinery state, deliberately outside git records).
- `LabSyncWorker.ts` — pull -> translate -> (RecordStore write = git commit) -> **ack only after the whole page committed** -> persist cursor. Mid-page failure: no ack past the failure; next poll re-pulls and event_id dedupe absorbs the replay. Control flow mirrors `scripts/fake-lab.mjs` per spec §7.
- Routes `/api/lab-sync/{status,poll-once,push-once,start,stop}` (`server/src/api/handlers/LabSyncHandlers.ts`); worker constructed only when `labSync.enabled + token + baseUrl`, auto-starts on boot, stops via fastify onClose. Unconfigured: status returns `{enabled:false}`, mutations return 503 LAB_SYNC_DISABLED.
- Config: `labSync:` block lives in the gitignored local `config.yaml`; token arrives via `${TYF_LAB_TOKEN}` env substitution (loader feature, zero new code). **To go live: export TYF_LAB_TOKEN, set labSync.enabled: true, restart.**

## Verification (real runs, not claims)

- `server/src/schema/ServiceDomainSchemas.test.ts` (5): registry loads all 12 schemas; Ajv accepts spec-shaped payloads and REJECTS: payment-on-customer, numeric event ids, lowercase barcode, order without lifecycleId. Lint rules fire (order past sample_received without sampleRefs). Lifecycle YAML asserts (no back-edges; reported-only-from-testing_complete). mapping.yaml covers the full spec vocabulary.
- `server/src/lab-sync/` suite (43): client 11, translator 7, outbound 14, cursor 6, **E2E 5** — stub website (fake-lab.mjs inverted): full order flow to records + ack + cursor file; replay dedupes; ack never skips an uncommitted event; outbound push + duplicate-tolerant retry.
- `tsc --noEmit -p server/tsconfig.json` clean. Full-suite failure set compared against pre-change baseline worktree: zero new failures (tree's ~79 failing files are the shared sibling session's in-flight work + two files missing at HEAD).

## Where this is headed (next steps, in dependency order)

1. **Go-live against the real website.** Point `labSync.baseUrl` at https://test-your-food.com/api, set the real shared secret via TYF_LAB_TOKEN, enable, watch `GET /api/lab-sync/status` + poll-once against a real order.created. Expect the pending_payment arrival deviation to be visible in prod too (spec header: order.created at row commit, not capture).
2. **Barcode registration events (website wave 2).** `sample.registered` / `sample.shipped` minting is blocked on the website's `sample_register.php`/`sample_shipped.php`; CL-side handling is already implemented and tested against synthetic events — it lights up when the website ships.
3. **Lab-bench receipt UI.** Scan `TYF-*` -> mint `sample-receipt` -> sample registered->received->accessioned -> mint `sample.received`/`sample.accessioned` outbound. The inbound `sample.received` event then closes the loop website-side. (Receipt record + lifecycle are done; the scan surface + outbound triggers are not.)
4. **Order accept/reject flow.** Contract-review decision on an order -> `order.accepted`/`order.rejected` via OutboundMinter -> tyf-order transition. `contract_review_id` slot exists in the spec payload; a CR-* record type is not yet authored.
5. **Report release path.** report.approved -> report.released with `buildReportReleasedPayload` + artifact attachment. Report *generation* (PDF rendering from results) is explicitly out of scope so far and still unbuilt — this is the long pole for a complete customer loop.
6. **UI surfaces.** Orders/samples/queues in the app (the ui.yaml triplet files were intentionally NOT written — forms fall back to auto-generated until someone designs the commercial surfaces).
7. **Sharper edges to revisit:**
   - Same barcode on a different order currently re-mints a sample ("tube-per-order" choice, logged in inbound.ts). A cross-order barcode is arguably a mismatch signal — decide when the lab UI exists.
   - `email:<email>` remoteIds should become real `cus_*` refs if the website ever mints them.
   - Cross-record cardinality ("every order line has a sample") waits on a collection-scope lint engine (LintEngine is record-scope only).

## Session-process notes (for whoever picks up the orchestration thread)

- Executed as architect-designed Wave 0 (schemas/config/contracts, done inline) -> Wave 1 (3 parallel delegate_task children: client / translator / outbound, disjoint file ownership, contracts pinned in prompt) -> Wave 2 (worker + wiring + E2E, parent-side). Children were steered once each (recon drift at ~15 min: "stop exploring, write the RED test now") — both complied and landed green. This wave shape worked; reuse it.
- Two reusable gotchas are recorded in skill `computable-lab-sync-worker`: (1) schema subdirs must $ref common/ref as-if-root-relative or Ajv crashes late with missingRef; (2) core refs to specializable targets must leave `type` unconstrained (core can't enumerate domain kinds).
- Shared-tree caveat remains true: this working tree is shared with the intake/equipment session. Everything here was committed clean on top of their `56740422`; verify `git log` before assuming HEAD is yours.

## Definition of "customer orders are pulled" (acceptance, for the go-live check)

Given one real order on test-your-food.com (placed at status pending_payment):
1. Within pollSeconds, `records/customer/CUST-*.yaml`, `records/order/ORD-*-<year>-*.yaml`, and `records/requested-service/RSVC-*.yaml` exist in the lab worktree, each Git-committed with the event cited in the commit message.
2. Two `records/lab-sync-event/LSYN-*.yaml` mirrors exist with processing.status applied.
3. Website `acked_cursor` == last event cursor; local var/lab-sync/cursor.json matches.
4. Re-running poll-once immediately yields fetched:0 (cursor resume), and a forced cursor rewind yields duplicated:2 with zero new records.
5. A deliberately unknown service slug stores the event with status unknown_type and the slug in the error — no invented vocabulary, no crash.
