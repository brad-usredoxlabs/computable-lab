# Plan — Align CL lab-sync with the website's Customer & Evidence Integration v1 spec

## Goal

Absorb the requirements of `specs/computable-lab-customer-handoff.md` (website agent's v1 spec) into Computable Lab's existing party/request record model and lab-sync machinery — translating each website-side demand into the CL-shaped mechanism (schemas, mirrors, identifiers[], declarative vocab) rather than adopting the website's field names or assumptions.

## Audit verdict first — is the website agent's request "the computable-lab way"?

**Substantially yes, with three translation duties.** The spec respects the canonical boundaries: website owns accounts/orders/registration, lab owns analytical records/receipt/release, release is the only visibility trigger (matches our `report` schema §13-14), identity is separated from transaction snapshots, "never means received" custody precision, immutable revisions. That is exactly our `specs/computable-lab-party-request-schema-spec.md` model seen from the other side of the wire.

Where it is NOT CL-shaped, and the duty it creates for us:

1. **Website vocabulary leakage.** `sample_id`, `customer_id`, `line_id`, `slot` are wire fields named in website terms. CL way (already codified in `schema/services/sample.schema.yaml`): external identifiers go in `identifiers[]` with a `system` tag — the core NEVER gets a domain-named field like `websiteSampleId`. `customer_id` (`tyfcus_*`) resolves via `source`/alias lookup on the customer record — it is NOT stored as a ref on core records. `slot` IS commercial → it belongs on the domain record `sample-registration`, not core `sample`.
2. **The `email:<email>` remoteId deviation is now obsolete.** Our handoff (`2026-09-27_lab-sync-cl-end-complete.md` §7) logged `email:<email>` as the identity *only because the website had no handle*. The website now mints `tyfcus_<32hex>`. The website's instruction — "match the legacy normalized email once, attach the website ID as an alias, retain the existing Git record ID" — is precisely Git-preserves-history. We implement it as `aliases[]` on the customer record (the CUST- recordId never changes; Git history never rewrites). Ambiguous matches → new `needs_review` mirror status (hard stop, operator decides — principle §7's "stop and ask", expressed as data).
3. **Delegated enforcement.** The website explicitly says the lab must enforce redaction before upload ("the website... cannot infer identifying information inside arbitrary scientific files"), and that evidence completeness gates visibility. These become CL-side declarative rules (evidence document schema + redaction config), not polite assumptions.

What we push back on / do NOT adopt:
- No `sample_id` field on core `sample` (use `identifiers[]`, system `tyf-sample-id`).
- No editing the `lab-sample` lifecycle for the website's "accession may precede receipt" tolerance — that edge is CL→website direction; CL is the sole writer of lab truth and chooses its own order (`registered→received→accessioned` stays; the website just agrees not to regress status if we ever vary).
- The evidence document is an immutable *export artifact*, not an editable record type. It gets a validation schema (so Ajv is the authority) but lives outside `records/` — it is materialized per release, uploaded, and referenced by sha256. We do not invent an editable `evidence-export` record kind.
- The standalone viewer is a *build deliverable*, not a schema concern.

## Current context / assumptions

- Repo root: `/mnt/vast/home/brad/git/computable-lab`. HEAD `fbeeeb25` (lab-sync core just landed; verify `git log --oneline -3` first — tree is SHARED with the intake/equipment session, HEAD may have advanced).
- The sync machinery exists and is tested: `server/src/lab-sync/` (client, inbound translator, outbound mint/push/reports, cursor, worker, routes). 43+5 tests green.
- Test invocation: `npm run test:run -w server -- <path>` (vitest once), typecheck `npm run typecheck -w server` (backend has `exactOptionalPropertyTypes: true` — optional means absent, never `undefined`).
- Record store: `records/{kind}/` flat dirs, every write = git commit via `RecordStore.create/update` (returns `{success, error?}`). Kind list filter: `store.list({ kind: 'customer' })`.
- Mirror protocol per inbound event (in `translate/inbound.ts`, do not change): dedupe on `eventId` → create LSYN mirror `pending` → translate → update mirror with final `processing.status`. Statuses today: `pending | applied | duplicated | unknown_type | ignored_stale | pushed | push_failed`.
- Controlled vocab bridge: `config/lab-sync/mapping.yaml`. Unknown slug = hard stop, never an invented term.
- Outbox = outbound LSYN records; `push.ts` re-serializes the stored payload verbatim on every retry — this already gives the website's "byte-equivalent JSON field ordering on retry, retain the original event" for free. Do not build a second payload path.
- The website artifact upload endpoint (`POST /api/lab-sync/artifacts`, init/status/chunk/complete, X-LAB-TOKEN) is implemented website-side; CL is the client.
- The website's sample_id FORMAT is not stated in the spec (`"returns stable sample_id"`). Assumption: opaque string; validate `[A-Za-z0-9_-]{1,64}` (same class the spec uses for artifact ids). Logged as an open question — confirm with the website agent.

## Architecture / proposed approach

Three workstreams in dependency order: (A) **identity & registration alignment** — schema additions (customer `aliases[]`/`verifiedAt`, registration `sampleId`/`lineId`/`slot`, mirror status `needs_review`) plus two new inbound handlers and extended `sample.registered`; (B) **evidence release path** — a declarative evidence-document schema + redaction config, an immutable document builder scoped to one sample, a chunked artifact upload client (stateless resume via the website's `status` offset), and release orchestration that uploads everything *before* minting `report.released`; (C) **standalone viewer** — a Vite library-mode build target inside `app/` exporting `apiVersion` + `mount()`, fixture-driven, no editor/AI/write paths reachable.

Waves for delegation: Wave 1 = A + upload client (disjoint files, contracts pinned below). Wave 2 = document builder + release orchestration (pins Wave 1 outputs). Wave 3 = viewer (independent of 2's internals, pins only the document schema).

---

## Wave 1A — Schema deltas (data first, no TS)

All schema files use the existing conventions: `$id` under `https://computable-lab.com/schema/computable-lab/...`, `unevaluatedProperties: false`, `$ref` into `../../common.schema.yaml#/$defs/FAIRCommon` as-if-root-relative (known crash pitfall if wrong — see skill `computable-lab-sync-worker`).

### Task A1 — customer: aliases + verifiedAt

Edit `schema/domains/test-your-food/customer.schema.yaml`. Inside `properties:` (after `source:`), add:

```yaml
  aliases:
    type: array
    description: >
      Secondary external identities attached without rewriting the record.
      The website mints tyfcus_* handles; legacy email-derived remoteIds stay
      on source.remoteId, the website id arrives here via
      customer.identity_assigned (customer-handoff spec, Identity section).
      The Git recordId never changes regardless of identity churn.
    items:
      type: object
      additionalProperties: false
      required: [system, remoteId]
      properties:
        system: { type: string, minLength: 1 }
        remoteId:
          type: string
          pattern: "^tyfcus_[0-9a-f]{32}$"
          description: "Website public customer handle (never derived from email)."
    uniqueItems: true

  verifiedAt:
    type: string
    format: date-time
    description: "Set once by customer.verified. Website-verified email; absence = unverified, NOT a failure state."
```

Verify (registry picks up schema changes without restart only for tests; the suite loads fresh):

```
npm run test:run -w server -- src/schema/ServiceDomainSchemas.test.ts
```
Expected: existing 5 tests PASS (the new fields are optional; nothing rejects). Then add to `server/src/schema/ServiceDomainSchemas.test.ts` a case: customer payload with `aliases: [{system: "test-your-food.com", remoteId: "tyfcus_" + "0".repeat(32)}]` validates; `remoteId: "email:x@y.z"` inside aliases FAILS (pattern is tyfcus-only). RED first, then GREEN.

### Task A2 — sample-registration: sampleId, lineId, slot

Edit `schema/domains/test-your-food/sample-registration.schema.yaml`. Inside `properties:`, add:

```yaml
  sampleId:
    type: string
    pattern: "^[A-Za-z0-9_-]{1,64}$"
    description: >
      Website minted sample handle (customer-handoff spec §Identity and
      events). External identity — kept here and mirrored onto the lab
      sample's identifiers[] (system tyf-sample-id); core sample has no
      domain-named field.

  lineId:
    type: string
    description: >
      Website order line ref (tyforl_<order>_<ordinal>). Anchors the tube to
      its requested-service line.

  slot:
    type: integer
    minimum: 1
    description: "One-based slot: one purchased kit = one slot (commercial concept — domain-only field)."
```

Verify as A1. Add test: registration with `{sampleId: "smp_1A2b_3", lineId: "tyforl_77_01", slot: 2}` validates; `slot: 0` and `sampleId: "bad id!"` FAIL.

### Task A3 — mirror status: needs_review

Edit `schema/integration/lab-sync-event.schema.yaml`, the `processing.status` enum line 71 becomes:

```yaml
        enum: [pending, applied, duplicated, unknown_type, ignored_stale, needs_review, pushed, push_failed]
```

Add `needs_review` to `ProcessedEventStatus` in `server/src/lab-sync/types.ts` (lines 53-57). This is the ONLY TS type file Wave 1A touches.

Verify: `npm run test:run -w server -- src/lab-sync` → all existing pass.

### Task A4 — mapping: sample-id identifier system

Edit `config/lab-sync/mapping.yaml`, append under `identifiers:`:

```yaml
  tyf-sample-id:
    pattern: "^[A-Za-z0-9_-]{1,64}$"
    label: "Test Your Food website sample handle (tyfsmp_*)"
```

(No TS change: `identifiers:` is already read generically — confirm `translate/mapping.ts` exposes `identifiers`; it does, used by `barcodePattern()`.)

Commit after A1-A4: `git add schema config server/src/lab-sync/types.ts server/src/schema/ServiceDomainSchemas.test.ts && git commit -m "feat(schemas): customer aliases/verifiedAt, registration slot/lineId/sampleId, needs_review status"`.

---

## Wave 1B — Inbound translator (owns `server/src/lab-sync/translate/inbound.ts` + `inbound.test.ts` ONLY)

Contract pinned: schemas from 1A exist as written; `ProcessedEventStatus` includes `needs_review`. Touch no other files.

Test fixture convention (already in `inbound.test.ts`): in-memory RecordStore + mapping fixture; events fed through `translator.process({event_id: 'evt_TYF_1', type, payload, cursor})`.

### Task B1 — customer.identity_assigned (RED test first)

RED: add test "identity_assigned attaches tyfcus alias to the single email-matched customer" —
1. feed `customer.created` for `jane@example.com`;
2. feed `customer.identity_assigned` `{customer_id: "tyfcus_" + "ab".repeat(16), email: "jane@example.com", name: "Jane"}`;
3. assert the ONE `CUST-` record now has `aliases[0].remoteId === that tyfcus`, `recordId` unchanged, no second customer record.
RED second test "ambiguous email = needs_review, zero merges": two `customer.created` events with DIFFERENT emails both normalized-matching is not possible by email; instead simulate: two customers sharing the same normalized email via alias already — simplest defensible setup: customer1 source.remoteId `email:jane@example.com`, customer2 has alias `tyfcus_...` AND contact email `jane@example.com` — the lookup by email finds 2 → status `needs_review`, error names the email, neither record mutated.

Implementation (GREEN), in `inbound.ts`:
- Extend `findCustomerByEmail` → rename `findCustomersByEmail(email): Promise<RecordEnvelope[]>` (returns all matches: match `source.remoteId === email:${normalized}` OR any contact `{channel:'email', value: normalized}` case-insensitively on the local part is NOT required — normalize = `value.trim().toLowerCase()` whole string). Keep old call sites working with `[0]` ONLY where single-match is already guaranteed; otherwise handle 0/many.
- New dispatch case:
```ts
case 'customer.identity_assigned':
  return this.customerIdentityAssigned(event.payload)
```
- Handler: read `customer_id` (validate `/^tyfcus_[0-9a-f]{32}$/`, else HandlerError) and `email`. Normalize email, list matches. 0 matches → `{status:'unknown_type', error: ...}` (never silently mint — same hard-stop class as `customerUpdated`). 2+ matches → `{status:'needs_review', error: \`ambiguous legacy match for ${email}\`}`. 1 match → push alias into `aliases[]` if absent, update store, `{status:'applied', affectedRecordIds:[rec.recordId]}`.
- Normalization helper at module top next to `customerRemoteId`:
```ts
function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}
```

### Task B2 — customer.verified

RED: after identity_assigned, feed `customer.verified` `{customer_id, email}` → customer has `verifiedAt` (ISO). Unknown customer → `unknown_type` mirror.
GREEN: dispatch case + handler: lookup by `customer_id` via aliases/source first, else email; set `verifiedAt` (event `occurred_at` if string, else `this.now()`), idempotent (already set → `applied`, no change).

### Task B3 — order ownership on `order.updated` changes.customer_id

RED: order created pre-verification (customer by email), then `order.updated` with `changes: {customer_id: "tyfcus_..."}` → the order's `customerRef` retargets to the CUST- record whose alias matches; if no alias matches → `needs_review` ("website identity not yet mirrored"), order untouched.
GREEN: in `orderUpdated`, handle `changes.customer_id` BEFORE the generic merge: resolve `findCustomerByWebsiteId(id)` (scans `source.remoteId` and `aliases[].remoteId`); set `p.customerRef = {kind:'record', id, type:'customer'}` and same for `requesterRef` (order.created set both). Note: `customer_id` is then DELETED from `changes` before the passthrough merge so it never lands as a stray field.

### Task B4 — sample.registered extended fields

RED: payload now `{order_remote_id, barcode, sample_id, customer_id, line_id, slot, customer_sample_description, registered_at}` →
- REG- record carries `sampleId`, `lineId`, `slot`;
- minted SMP- carries `identifiers: [{system:'tyf-barcode',value},{system:'tyf-sample-id',value: sample_id}]`;
- if a requested-service record has `lineId === line_id`, nothing else needed (already linked via order) — assert no crash when line absent.
Existing tests (without new fields) must still pass — new fields optional.
GREEN in `sampleRegistered`:
```ts
const sampleId = str(payload.sample_id)
const lineId = str(payload.line_id)
const slot = num(payload.slot)
```
put them on `regPayload` when present (`sampleId`, `lineId`, `slot`), and when minting the sample append `{system:'tyf-sample-id', value: sampleId}` to `identifiers` when `sampleId` present. When the sample already exists (replay/new tube same order) and carries no `tyf-sample-id` identifier but the event has one, update `identifiers` to include it.

### Task B5 — sample.shipped per-tube precision

Current handler moves the ORDER `sample_registered→in_transit` on first shipped tube. Website now ships per tube; website keeps its own per-tube state; CL order lifecycle has one in_transit. RED: two `sample.registered` (TYF-AAAA11, TYF-AAAA22) + `sample.shipped` for the first → order in_transit; shipped for second → `applied`, no mutation (already forward). Assert sample records UNTOUCHED (shipped never means received — sample status stays `registered`). This likely passes as-is; keep it as a pinned regression test.

Commit: `git commit -m "feat(lab-sync): identity_assigned/verified handlers, order ownership, registration sample_id/line/slot"`.

---

## Wave 1C — Artifact upload client (owns `server/src/lab-sync/ArtifactClient.ts` + `ArtifactClient.test.ts` ONLY)

Pure client of the website endpoint — no RecordStore, no git. Constructor takes `{baseUrl, token, fetchImpl?}` same shape as `LabSyncClient` (copy its `request<T>` excerpting/error style; token never in errors).

### Task C1 — protocol methods, TDD against a stub fetch

RED/GREEN pairs in `ArtifactClient.test.ts` (stub fetchImpl recording calls):
1. `init({id, sample_id, size, sha256})` → POST `/api/lab-sync/artifacts` body `{action:'init',...}`; header `X-LAB-TOKEN` present; `{id:'bad id!'}` rejected CLIENT-side before fetch (regex `/^[A-Za-z0-9_-]{1,64}$/` — cheap, prevents a pointless 4xx; size > 100*1024*1024 likewise rejected with `Error('artifact exceeds 100 MiB')`).
2. `status(id)` → `{action:'status',id}` → returns `{offset:number}`.
3. `chunk(id, offset, bytes: Buffer)` → `{action:'chunk',id,offset,data_base64:bytes.toString('base64')}`; caller-side guard: `bytes.length > 1024*1024` → throw before fetch (1 MiB decoded cap).
4. 409 handling: stub responds HTTP 409 with body `{error:'offset_mismatch',expected:4096}` → `uploadFile` (C2) resumes from 4096, not a throw.
5. `complete(id)` → `{action:'complete',id}`; non-2xx → throw with body excerpt.

### Task C2 — `uploadFile(id, bytes)` resumable driver

RED: stub script: init ok; first chunk call throws network error; then `status` returns `{offset: 0}`; uploadFile retries: re-chunks from 0, second attempt succeeds; `complete` called once. Assert chunk boundaries: for 2.5 MiB bytes → calls at offsets 0, 1MiB, 2MiB (last chunk 512 KiB).
GREEN:
```ts
async uploadFile(id: string, bytes: Buffer, opts?: {onProgress?: (sent:number)=>void}): Promise<void>
```
Sequence: validate id/size/sha (sha256 = `createHash('sha256').update(bytes).digest('hex')`) → `init` → loop `{status}` once at start to get durable offset → send chunks at offset, advance by chunk length on success, on 409 re-`status` and continue at `expected` → `complete`. Retry each chunk up to 3 attempts with backoff (use `retry()` helper semantics inline; keep simple). No local state file — the website's `status` offset is the resume anchor (machinery state stays website-side; nothing to leak into git).

Verify: `npm run test:run -w server -- src/lab-sync/ArtifactClient.test.ts` green; `npm run typecheck -w server` clean. Commit `feat(lab-sync): resumable chunked artifact upload client`.

---

## Wave 2 — Evidence document + release orchestration

Pinned contracts from Wave 1: `needs_review` status exists; customers carry `aliases[].remoteId`; samples carry `{system:'tyf-sample-id'}`; ArtifactClient public surface:
```ts
new ArtifactClient({ baseUrl, token, fetchImpl? })
client.uploadFile(id: string, bytes: Buffer): Promise<void>
```

### Task D1 — evidence document schema (data)

Create `schema/domains/test-your-food/evidence-document.schema.yaml` — a validation contract for the exported JSON, mirroring customer-handoff spec §Evidence verbatim (`tyf.evidence/1`, viewer API `1`):

```yaml
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/domains/test-your-food/evidence-document.schema.yaml"
title: "TyfEvidenceDocument"
description: >
  Immutable evidence export: one document per sample x report revision
  (customer-handoff spec). NOT an editable record — materialized per release,
  uploaded, referenced by sha256. Every event/record/artifact must belong to
  the exported sample; shared records enter only as redacted copies.
  Validation schema for the builder, Ajv-authoritative.

type: object
additionalProperties: false
required: [schema_version, viewer_version, sample_id, barcode, events, records, source_revisions, artifacts]

properties:
  schema_version:
    const: "tyf.evidence/1"
  viewer_version:
    const: 1
  sample_id:
    type: string
    pattern: "^[A-Za-z0-9_-]{1,64}$"
  barcode:
    type: string
    pattern: "^TYF-[A-Z0-9]{6}$"
  events:
    type: array
    items:
      type: object
      additionalProperties: false
      required: [id, type, occurred_at, sample_id, record_ids]
      properties:
        id: { type: string }
        type: { type: string }
        occurred_at: { type: string, format: date-time }
        sample_id: { type: string }
        record_ids: { type: array, items: { type: string } }
  records:
    type: array
    items:
      type: object
      additionalProperties: false
      required: [id, type, sample_id, data]
      properties:
        id: { type: string }
        type: { type: string }
        sample_id: { type: string }
        data: { type: object }
  source_revisions:
    type: array
    description: "Git history citations: commit sha + record id, per contributing record revision."
    items:
      type: object
      additionalProperties: false
      required: [record_id, commit]
      properties:
        record_id: { type: string }
        commit: { type: string, pattern: "^[0-9a-f]{7,40}$" }
  artifacts:
    type: array
    minItems: 1
    items:
      type: object
      additionalProperties: false
      required: [id, kind, name, sha256, size]
      properties:
        id: { type: string, pattern: "^[A-Za-z0-9_-]{1,64}$" }
        kind: { type: string, enum: [graph, trace, script, inputs, zip, pdf] }
        name: { type: string }
        sha256: { type: string, pattern: "^[0-9a-f]{64}$" }
        size: { type: integer, minimum: 1 }
```

Test in `ServiceDomainSchemas.test.ts`: fixture doc passes; doc containing a record whose `sample_id` differs FAILS (cross-sample scope rule made machine-checkable).

Note on registry: SchemaLoader walks recursively — no registration code needed. But SCHEMA_IDS in `types.ts` gains `evidenceDocument: '...evidence-document.schema.yaml'` (Wave 2 owns types.ts now; Wave 1B finished).

### Task D2 — redaction config (data)

Create `config/lab-sync/evidence.yaml`:

```yaml
# Evidence export policy (customer-handoff spec: the LAB enforces redaction
# before upload; the website cannot inspect arbitrary scientific files).
# Declarative: the builder reads this; no customer-identity logic in TS.
version: 1

# Record kinds considered "shared batch records" — included only as redacted
# copies with these paths stripped (dot paths into record payload).
shared_kinds:
  - context            # plate-level context may name other requests
  - run
redact_paths:
  - customerRef
  - requesterRef
  - partyRef
  - sampleRefs         # other customers' samples: entire ref list stripped

# Anything referencing another order/customer that is not in the exported
# sample's closure is DROPPED entirely (not redacted): drop_kinds.
drop_kinds:
  - order
  - customer
  - request
```

### Task D3 — evidence builder (TDD; owns `server/src/lab-sync/evidence/build.ts` + tests ONLY)

```ts
export interface EvidenceBundle {
  document: unknown          // validated against evidenceDocument schema
  files: Array<{ id: string; bytes: Buffer }>  // every artifact id -> exact bytes
}
export class EvidenceBuilder {
  constructor(deps: { store: RecordStore; git: GitRepoAdapterLike; mapping: LabSyncMapping; policy: EvidencePolicy })
  async build(sampleRecordId: string, reportRecordId: string, revision: number): Promise<EvidenceBundle>
}
```
Rules to implement (each a test):
1. Sample resolved by recordId; its `tyf-sample-id` identifier value = document `sample_id`; `tyf-barcode` = `barcode`; missing either → throw (incomplete provenance = refuse, never guess).
2. `events[]` = every inbound/outbound LSYN mirror whose payload mentions the barcode or the website sample id (same scan the translator uses — mirror-first dedupe means the LSYN trail IS the relevant history). Each mapped to `{id:eventId, type:eventType, occurred_at, sample_id, record_ids: processing.affectedRecordIds}`.
3. `records[]` = the sample, its registration, its requested-service lines, report (this revision), results/runs linked via report.runRefs — each `{id:recordId, type:kind, sample_id, data:payload}`. Shared kinds from policy → redacted copy (strip `redact_paths`); `drop_kinds` never included. Test: two orders' samples in the data store → doc for sample A contains zero strings of order B's barcode/recordId (assert on `JSON.stringify(doc)` not containing them — the honest cross-leak test).
4. `source_revisions[]`: `git` dep exposes `logForRecord(recordId): Promise<string[]>` (recent commit shas touching the record's file — GitRepoAdapter already does per-record commit messages; use `git log --format=%H -- <recordPath>`; add the thin method to a local adapter interface, do NOT modify GitRepoAdapter itself — injectable, stubbed in tests).
5. `artifacts` + `files`: v1 source of the five required kinds comes from the PERFORMED layer records attached to the report (run/analysis-output-artifact records carry raw data file refs on disk). v1 scope decision (log in code comment as open_issue): the builder READS bytes from paths declared on those records and computes sha256/size itself; it does not generate the zip/graph — analysis pipeline produces them. Missing required kind file → `build()` throws listing exactly which kinds are missing; release orchestration surfaces that as an operator-visible failure (nothing silently omitted).
6. Output document validated against the evidence schema (Ajv via SchemaRegistry dep) BEFORE returning — malformed doc never reaches the wire.

### Task D4 — release orchestration (TDD; owns `server/src/lab-sync/outbound/release.ts`, its test, and edits `reports.ts`)

```ts
export async function releaseReport(deps: {
  store: RecordStore; minter: OutboundMinter; evidence: EvidenceBuilder
  artifacts: ArtifactClient; client: IngestTransport & { pushEvents?... }
}): Promise<{ eventId: string }>
```
Flow (test with stubs, real-sha assertions):
1. `EvidenceBuilder.build(...)` → bundle.
2. For each file: `artifacts.uploadFile(id, bytes)` (id convention `evt_<sample>_<rptRev>_<kind>`; stable across retries — same doc → same sha → identical init is safe per spec).
3. `OutboundMinter.mint('report.released', payload)` where payload = existing `buildReportReleasedPayload` output (order_remote_id, report_id, revision, released_at, optional legacy pdf base64 ≤5MB) PLUS `sample_id`, `barcode`, `evidence: <document>` (customer-handoff §release: "Upload all evidence before release" — upload happens in step 2, mint after).
4. Update `ReportReleasedPayload` type + `buildReportReleasedPayload` in `reports.ts` to accept `sampleId`, `barcode`, `evidence` (snake: `sample_id`, `barcode`, `evidence`). Keep existing pdf-omission behavior and the base64/url mutual-exclusion throw.
5. Pending-retry rule: the website may answer `unknown`/pending while artifacts are incomplete on its side; the outbox already re-pushes the identical payload from the mirror — but pusher marks `unknown` as `pushed`. For `report.released` specifically the website returns it in `unknown` when evidence pending. Test: a release event in `unknown` must be RE-PUSHED until the website returns `applied`. Implement narrowly: in `push.ts`, `report.released` events get `pushed` only on `applied`/`duplicated`; `unknown` → `push_failed` with error `evidence pending website-side`. Pin the event type constant shared from `reports.ts`, not a new literal.

Commit Wave 2: `feat(lab-sync): evidence document builder, upload-before-release, scoped re-push`.

---

## Wave 3 — Standalone viewer (app/; independent of Wave 2 internals, pins only the document schema)

Deliverable contract (customer-handoff §Standalone viewer): self-contained ES module, exports `apiVersion = 1` and `mount(element, {document, resolveArtifact}) -> {destroy()}`. NO editor, AI panel, writes, credentials, or lab-API calls reachable from the entry. Fixture at `tests/fixtures/viewer-v1.mjs` is the website's contract double — ours must satisfy the same interface; the website adapter (`evidence-viewer.ts`, website repo — not ours) mounts via `TYF_VIEWER_URL`.

### Task E1 — library build target
- Create `app/src/viewer/index.ts` (entry: `export const apiVersion = 1; export function mount(...)`), `app/vite.viewer.config.ts` (vite build lib mode, `formats: ['es']`, single file, output `dist-viewer/viewer.js`, `define: process.env.NODE_ENV` prod). Zero imports from `app/src/shared/api/client.ts` or anything that fetches.
- RED (vitest, jsdom): `mount(el, {document: <fixture doc>, resolveArtifact})` renders sample header, event list, then clicking an event shows its linked records (by `record_ids`); `destroy()` empties `el`. Second test: `resolveArtifact` called with an id NOT in the manifest → returns undefined AND viewer renders a disabled state for that artifact (scope enforcement). Third: `document.viewer_version = 99` → fail-closed message + downloads section still rendered, no crash.
- Rendering safety: all `data` fields rendered as text nodes (React handles; ban `dangerouslySetInnerHTML` — lint-grep test or eslint rule in the viewer entry only).
- Fixture: author `server`-independent fixture JSON at `app/src/viewer/__fixtures__/evidence-v1-sample.json` mirroring `tests/fixtures/evidence-v1/` shape (if that website fixture is unreachable from this repo, generate one VALIDATED by the D1 schema — that is the in-repo source of truth).

### Task E2 — provenance stamp
Build script `app/scripts/build-viewer.mjs`: runs the vite lib build, writes `dist-viewer/PROVENANCE.json` `{viewer_version: 1, built_at, git_sha, build_command}`. `npm run build:viewers -w app` script added to `app/package.json`. Deliverable = the `dist-viewer/` dir, copied by deploy into website's `public/lab-viewer/v1/`.

Verify: `npm run build:viewers -w app` produces `viewer.js`; `npm run test:unit -w app -- src/viewer` green; `grep -c "dangerouslySetInnerHTML" -r app/src/viewer` = 0; built `viewer.js` contains no `/api/` fetch strings: `grep -c "/api/" dist-viewer/viewer.js` = 0.

Commit: `feat(viewer): standalone evidence viewer library build`.

---

## Final verification gate (parent-side, after all waves)

1. `npm run test:run -w server -- src/lab-sync src/schema/ServiceDomainSchemas.test.ts` — all green.
2. `npm run test:run -w server` — failure set equal to pre-change baseline (skill `pre-change-baseline` worktree method; the shared tree has ~79 pre-existing failing files — compare, don't chase).
3. `npm run typecheck` (both workspaces) clean.
4. `npm run test:unit -w app -- src/viewer` green; viewer build smoke-checked per E2.
5. Re-run the handoff's acceptance checklist §Definition locally against the fake website (`scripts/fake-lab.mjs` inverted stub, already in the e2e suite) — identity_assigned and extended sample.registered flow included; a real-website go-live remains a separate config step (TYF_LAB_TOKEN etc.), NOT part of this plan.

## Risks, tradeoffs, open questions

- **Open Q1 (blocking for D3 artifact wiring):** where graph/trace/script/inputs bytes physically live today (analysis-output-artifact record fields). The builder interface is pinned so it doesn't block waves 1-3; the concrete path resolution is one function to confirm with Brad against real run records.
- **Open Q2:** website `sample_id` format assumed `[A-Za-z0-9_-]{1,64}` — confirm `tyfsmp_*` prefix with the website agent; adjust mapping pattern only.
- **Open Q3:** per-tube order status — website no longer needs a single order-level `in_transit` trigger; our tyf-order lifecycle keeps first-tube semantics (website tolerates). If per-tube order granularity is ever demanded, that's a lifecycle spec change, not a code change.
- **Risk 1:** D3 redaction is the safety-critical piece — the "JSON contains no other customer's identifiers" test is the contract; if the builder's record-closure walk misses a kind, redaction silently leaks. Mitigation: the drop_kinds-by-default stance (include list, not exclude list) — unknown kinds are EXCLUDED from shared scope.
- **Risk 2:** `push.ts` behavior change for report.released is protocol-adjacent; if the website agent changes the pending answer shape, the narrow constant-pinned check fails loudly (`push_failed` + retry), never silently drops the release.
- **Tradeoff:** evidence doc lives outside `records/` (materialized, uploaded, sha-referenced). Git history still records the release *event* (LSYN mirror stores the full payload incl. evidence manifest, minus uploaded artifact bytes). Acceptable per "HTTP synchronizes meaning, Git preserves history" — the artifact bytes are the sync payload, not the record.
- **Shared-tree caveat:** re-verify `git log`/`git status` before each commit; children get explicit "no state-changing git" instruction (memory: a child's stash once destroyed routes.ts work).

## Delegation wave map (for the architect session)

- Wave 1 (parallel, disjoint): 1A schemas (+types.ts line), 1B inbound.ts+test, 1C ArtifactClient new files. Contracts above are complete; no child may recon the spec — all needed spec text is inlined here.
- Wave 2 (after 1 verifies): D1+D2 (data), then D3 and D4 (D4 after D3's public interface exists; can be same child).
- Wave 3 (parallel with 2): viewer child, owns `app/src/viewer/**`, `app/vite.viewer.config.ts`, `app/scripts/build-viewer.mjs`.
- Parent verifies each wave with targeted test runs + `git status` footprints before starting the next.
