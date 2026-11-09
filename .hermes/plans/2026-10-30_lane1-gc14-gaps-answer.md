# GC-14 release-gate gaps — architect decision + concrete amendments (lane 1)

> Responds to: `.hermes/plans/2026-10-30_lane1-gc14-gaps-amendment-request.md` (160th tick).
> Author: architect (lane 1), local model + first-hand repo reads — this is an
> execution-time amendment, not the initial campaign synthesis, so no paid expert
> call was required or made. Brad unattended; this artifact is the deliverable.
> Reads grounded here (all first-hand, read-only): dossier GAPS appendix; receipts
> report §Defects/GAPS; `app/src/shared/shell/RecordHostPage.tsx`;
> `app/src/event-editor/create/RecordCreatePanel.tsx:32-49` (the hardcoded
> `SCHEMA_IDS`/`CreateNodeType` map — the root of the "Create undefined" render);
> `app/src/pages/RecordRegistryPage.tsx:22-41` (`REGISTRY_TABS` data + the
> "the row IS the feature, no kind-specific code" contract + QMS7-5 multi-kind
> Create picker); `app/src/run/gc/GcSectionChrome.tsx:228-244` (door pins
> `inputs.signal` = file-level DREF only); `server/src/analysis/engineAdapters.ts`
> (shipped adapter table); `server/src/analysis/analysisRunner.ts` (provisionInputs,
> INPUT_IS_DIRECTORY guard, engine gate = resolve/availability/probe — `state:
> draft` engines are executable: the GC-11 TEST run on ENG-PYCAL01 renders
> SUCCEEDED in gate A9); `schema/knowledge/analysis-revision.schema.yaml`
> (inputs.dataKind enum already contains `signal`); `schema/knowledge/assertion.schema.yaml`
> + `assertion.lint.yaml` + `assertion.ui.yaml`; lane data records
> ANREV-GC10A/B/C, ANREV-000008, ENG-PYCAL01-L1T2305, ENG-STUBLIVE01-L1T0130,
> DREF-000074; `server/python-executor-service/src/computable_lab_analysis/`:
> `d_reader.py` (v181 `.CH` decoder, stdlib-only, full failure table, GC-6) and
> `ctx.py` (`DatasetHandle.read_signal()` lines ~49-58 already dispatches `.CH`
> bytes to `read_ch_bytes`; `ctx.publish(..., kind='signal')` exists).
> Knowledge-layer canonical example read as required for GAP 1.

## Ruling summary

- **GAP 2 (A6) — IN-INTENT, pure DATA. No code lane needed.** The "adapter that
  parses FID1A.CH" already exists as *shipped, tested SDK code* (`d_reader.py`,
  GC-6) and the `python-entry-script` adapter + `ENG-PYCAL01-L1T2305` already
  run (proven: the GC-11 calibration TEST run succeeded on that engine in gate
  A9). What is missing is only a **revision record** whose declared input
  contract matches what the Analyze door pins (`signal`) and whose `entryScript`
  *reads the provisioned bytes instead of echoing constants*. Entry scripts are
  record data (ANREV-000008's own docstring: "the AUTHORITATIVE copy lives in
  the analysis-revision RECORD (data repo… never in the code repo)"), so this is
  one new YAML record in the lane data repo. Zero schema edits, zero TS edits,
  zero Python edits. → Amendment **GC-15** below.
- **GAP 1 (A7) — SCOPE CHANGE, hybrid data+code.** The knowledge triplet
  (`assertion.schema.yaml` + `assertion.lint.yaml` + `assertion.ui.yaml`), the
  server editor-draft route (`POST /ui/schema/:schemaId/editor-draft`) and the
  registry's data-driven Create machinery ALL exist; no browser path reaches
  them. Two real defects feed this: (i) no route/tab/picker carries a knowledge
  kind to the create surface, and (ii) `assertion.ui.yaml`'s form paths
  (`$.claimId`, `$.content`) **do not exist in `assertion.schema.yaml`**
  (`unevaluatedProperties: false` declares `claim_ref`, `statement`, `scope`,
  `context_refs`, `roles[]`, `outcome`, `confidence`) — so even a wired door
  would draft a payload the schema rejects. This needs a new task (GC-16), it
  cannot be absorbed into GC-14's docs-only boundary.
- **GAP 3 (D4 vendor-exa 502) — KEEP OUT of GC scope; descope A9's literal
  clause wording, not the standard.** Ruling text under GAP 3 below.
- **GC-14 itself stays `in-progress` with the human blocker** until the two
  failing legs (A6, A7) are re-gated at the browser gate after GC-15/GC-16
  merge. The passed legs (S1-S4, S7-S10, A1-A5, A8-A9 body) stand at tip
  049e5b87 — do NOT re-run them; the close-out re-gate is only A6 + A7 + the
  lint-refusal demo + console inventory delta.

---

## GAP 1 ruling — the knowledge-kind authoring door (declarative surfaces first)

Canonical-example conformance (required reading, done): the authoring door is
for the three **atomic** record kinds the GC honesty clause needs — `claim`
(global atomic triple, ontology-backed subject/predicate/object), `assertion`
(`claim_ref` + `context_refs` + `scope` + `roles` + `outcome` + `evidence_refs`),
`evidence` (post-read bundle, `supports[]` → assertions, `sources[]` typed
result|context|event|publication|file|event_graph). One term per entity: the
door uses the **schema kind names themselves** (`claim` / `assertion` /
`evidence`) — the tab label "Knowledge" is a grouping label mirroring the
`schema/knowledge/` directory, not a new entity term. No new kinds, no local-term
forks.

The declarative surfaces a knowledge-kind authoring door needs, with the repo
state of each:

1. **Schema triplet — exists, one file broken.**
   `schema/knowledge/{claim,assertion,evidence}.{schema,lint,ui}.yaml` all
   exist and serve (204 schemas loaded). **DEFECT:** `assertion.ui.yaml` form
   binds `$.claimId` + `$.content`; the schema's properties are `claim_ref` +
   `statement` (+ `scope` required, `context_refs`, `roles`, `outcome`). Under
   `unevaluatedProperties: false` a draft built from that UI spec cannot pass
   server Ajv. Fix = edit the ui YAML (data). Verify `claim.ui.yaml` /
   `evidence.ui.yaml` the same way against their schemas (evidence form fields
   must expose `supports[]`, `sources[]` with typed refs, `quality{}` — the
   honesty clause's numeric floor stays absent, matching the A8 PASS stance).
2. **Registry tab as data — exists as machinery, missing the row.**
   `RecordRegistryPage.tsx` `REGISTRY_TABS` is the page's declared single source
   for the tab strip, listing filter, and Create affordance ("the row IS the
   feature, no kind-specific code" — the `methods`/gc-method tab is the live
   precedent; QMS7-5 already handles multi-kind tabs with a kinds picker). A new
   row `{ id: 'knowledge', label: 'Knowledge', kinds: ['assertion', 'claim', 'evidence'] }`
   is the smallest door: the inline ProjectionTapTabEditor create already
   resolves `activeTabSchemaId` from the kinds data and the server's
   editor-draft projection — the same path the gc-method tab exercised.
3. **Route registration / create panel — the imperative residue.**
   `RecordCreatePanel.tsx:32-49` hardcodes `CreateNodeType = 'study'|'experiment'|'run'`
   + a literal `SCHEMA_IDS` map; `/record/new/:kind` therefore renders
   "SCHEMA_NOT_FOUND: undefined / Create undefined" for every other kind. The
   rip-out-able shape: resolve kind→schemaId through the served schema registry
   (the same source `GET /api/ui/schemas` / `POST /ui/schema/:schemaId/editor-draft`
   use), falling back to a **loud named refusal** — never a "Create undefined"
   dead form (dead-chrome ban, lane standing rule). Also fix or point the global
   `+ Create → New Claim` affordance at the working door (it currently opens a
   tab with no form — dead chrome).
4. **Lint — exists, becomes reachable.** `asn-scoped-assertion-needs-context`
   lives in `assertion.lint.yaml` and runs server-side on POST; nothing new is
   needed — once the door POSTs, the A7 criterion's "first-attempt lint refusal"
   is exercisable from the browser (submit scope=comparison with no
   `context_refs` → refusal must surface by rule id).
5. **No new route, no new page, no new spec files.** Route `/record/new/:kind`
   already exists (`App.tsx:218`); `/registry` already exists; the triplet
   already exists. The door is data (ui.yaml fixes + tab row) plus the minimal
   de-hardcoding in RecordCreatePanel/the create menu.

## GAP 2 ruling — data, not code, and NOT an engine-record amendment

The smallest compliant shape is **one new `analysis-revision` record** in the
lane data repo. Ruled alternatives and why rejected:
- *New adapter in `engineAdapters.ts`* — code lane, and **unnecessary**:
  `implementation.adapter` is a closed schema enum whose table already ships
  `python-entry-script`, and the `.CH` parser already ships inside that
  adapter's SDK (`d_reader.py` v181 decoder; `ctx.py read_signal()` probes the
  v181 marker and calls `read_ch_bytes`). Adding a second reader would fork one
  reader for one format — violates reuse and "no two local terms" in spirit.
- *Engine-record amendment (edit `ENG-PYCAL01-L1T2305`)* — rejected: engines are
  capability/availability facts, not method facts; the method IS the revision
  (schema description: "An immutable definition of one ANALYSIS METHOD"). Also
  `ANREV-000008` binds the same engine for calibration — mutating the engine
  would perturb a passing fixture.
- *Editing `ANREV-GC10A`* — illegal: revisions are immutable by schema
  (edits create a NEW revision with `parentRevisionRef`).

The record (minted through the shipped `POST /analysis-revisions` gate, NOT
hand-forged into the data repo — the gate's Ajv+lint is part of the evidence):
- `id: ANREV-DREADER-1` (lane id convention), `kind: analysis-revision`,
  title naming it as the .D trace reader revision, `parentRevisionRef`: none
  (it is not a GC10A derivative — GC10A's entryScript is a synthetic
  two-point echo that must never prop a real trace).
- `engineRef: { kind: record, type: analysis-engine, id: ENG-PYCAL01-L1T2305 }`
  (adapter `python-entry-script`, availability true, stdlib-only `packages []`;
  host python 3.14.7 satisfies `>=3.11` — S1 witness; `state: draft` runs fine,
  GC-11 precedent).
- `inputs: [{ name: signal, dataKind: signal, required: true }]` — exactly the
  one pin the door sends (`GcSectionChrome.tsx:241`); the five-table mismatch of
  ANREV-000008 / ANR-000019 cannot recur.
- `sdkVersion: "0.4.0"` (matches the shipped package; the `.D` reader landed at
  0.2.0 per `__init__.py`).
- `entryScript` (record data): read the provisioned signal handle via the SDK's
  existing seam (`ctx` input handle `read_signal()` → `read_ch_bytes`) and
  `ctx.publish('signal_trace', {axis, values, axis_units:'min',
  value_units:'pA', ...}, kind='signal')`. **Zero literals:** no filename, no
  compound, no units hardcoded beyond what the reader itself returns; the
  reader's meta (READER_NAME/VERSION, n_points, format label) rides into the
  artifact/methodNotes so provenance stays honest — this run computes FROM THE
  `.D` BYTES, which is exactly the honesty headline S4 owed.
- `requiredCapabilities`: omit (decoding needs no declared capability; do not
  stretch the frozen enum).
- `parameterSchema`: optional; if a decimation/thinning guard is wanted, declare
  it as a declared parameter, never a hardcoded stride (see hygiene note).

Files/schemas touched: **one new file**
`/home/brad/.computable-lab-lane1/worktrees/main/records/analysis-revision/ANREV-DREADER-1__….yaml`
(created by the POST, committed to the lane data repo) + its minted ACL — that
is the whole diff. `analysis-revision.schema.yaml` unchanged (`signal` already
in the dataKind enum); no app/server/SDK file changes.

Hygiene guard (named, not hand-waved): `FID1A.CH` is 75,846 B / ~17k points;
a 72k-point GC-10 seed artifact already sits at 1.67 MB in the data repo
(pre-existing, excluded). The new revision's published signal record must not
become a multi-MB inline blob — the task must either declare a thinned
publication (declared parameter, honest label in the artifact naming the
decimation) or use the SDK's file-publication path if the runner streams large
artifacts to storage; the coder verifies which mechanism the runner honors
today and the reviewer checks the resulting record size against the S10 sweep
(<500 kB floor it must not blow past silently).

---

## Amendment blocks for Brad (task-ready; queue on his yes)

Both are **lane 1**, trunk `cl/integration-1`, worktree
`/mnt/vast/home/brad/git/cl-integration-1`; data work lands in
`/home/brad/.computable-lab-lane1/worktrees/main`. Neither is absorbed by
GC-14 (docs-only boundary preserved; GC-14 stays in-progress, human blocker at
the dossier).

### GC-15 — `.D` trace revision (pure data) — unblocks A6
- **Description:** Mint `ANREV-DREADER-1` exactly as ruled above through
  `POST /analysis-revisions` on :3092; commit the minted record + ACL to the
  lane data repo; add a vitest/leg or gate-proof witness that the revision
  passes the create gate Ajv+lint at mint time.
- **Why it is needed:** The Analyze door pins `inputs.signal` but every
  revision reachable there binds the `stub-echo` metric-only engine, so
  Compare traces renders "no signal artifacts in this run" and A6/S5 cannot be
  evidenced with real traces. **Reuse made explicit:** the v181 reader
  (`d_reader.py`, GC-6, fully tested), the `read_signal` SDK seam (GC-6 D3.1),
  the shipped `python-entry-script` adapter, engine `ENG-PYCAL01-L1T2305` and
  the door's file-level-signal pin (architect ruling B-amended, GC-12) all
  exist — this task adds only the method record that connects them.
- **How completion is verified (observable):** in-browser at :5192/:3092 as
  USR-BRAD: attach a `.D` (may reuse ACQP-000004/000005 hashes — re-registration
  is the door's normal act), Analyze with revision `ANREV-DREADER-1` →
  execute → analysis-run succeeds with `engineProvenance.adapter =
  python-entry-script` and an output artifact of `dataKind: signal` whose value
  is NOT the synthetic two-point echo (point count = reader n_points for
  FID1A.CH, ~17k or declared-thinned-and-labelled); Compare traces lists real
  signal artifacts for BOTH gate runs, overlay renders, `compare-save` enabled,
  a VSPEC is minted; new AOUT record size disclosed against the hygiene floor.
  The A6 leg of the GC-14 close-out re-gate then runs on this.
- **File boundary:** the new analysis-revision record + ACL in the lane data
  repo ONLY. No app/, server/, schema/, or SDK file.
- **Dependency:** none to start; **GC-14 close-out re-gate (A6) depends on it.**

### GC-16 — Knowledge authoring door (data + minimal de-hardcoding) — unblocks A7
- **Description:**
  1. Fix the knowledge UI triplets to their schemas: `assertion.ui.yaml` form
     must bind real schema fields (`claim_ref` ref-widget, `statement`,
     `scope` enum, `context_refs` ref-list, `roles`, `outcome`, `confidence`);
     audit `claim.ui.yaml` and `evidence.ui.yaml` for the same drift and fix.
     (Pure YAML data.)
  2. Add `REGISTRY_TABS` row `{ id:'knowledge', label:'Knowledge',
     kinds:['assertion','claim','evidence'] }` — the tab strip, listing, and
     QMS7-5 multi-kind Create picker then derive automatically (gc-method
     precedent; extend the tab/kinds test pins the same way `…gcmethod.test.tsx`
     pins its row).
  3. De-hardcode `RecordCreatePanel`: replace the literal `SCHEMA_IDS` map's
     dead-end behavior so ANY served kind resolves kind→schemaId via the server
     schema registry; an unserved kind gets a loud named refusal, never
     "Create undefined". Fix `+ Create → New Claim` to reach the working door
     (or remove the dead entry — dead-chrome ban).
- **Why it is needed:** "assertion stands on genuine evidence" cannot be
  evidenced because nothing in the browser can mint an assertion/claim; the
  S6 honesty clause stays openly NOT CLOSED until this door exists. **Reuse:**
  the schemas, lints, `assertion.ui.yaml` skeleton, the editor-draft server
  route, and the registry's data-driven create machinery already exist and
  serve — the task connects them, it does not build a parallel authoring UI.
  Honors the canonical example's record roles (claim = global atomic triple;
  assertion = claim-in-context, testable prediction; evidence = post-read
  bundle) with zero new kinds and zero new local terms.
- **How completion is verified (observable, browser at :5192/:3092):**
  `/registry` shows a Knowledge tab listing the three kinds; Create →
  assertion renders a schema-backed form (no SCHEMA_NOT_FOUND anywhere, no
  "Create undefined" button on any `/record/new/<served-kind>`); submitting a
  `scope: comparison` assertion with no contexts is refused with rule id
  `asn-scoped-assertion-needs-context` visible in the UI (the A7-named refusal,
  first attempt); a valid claim + assertion + evidence mint end-to-end with
  GET 200 readbacks; `/record/new/assertion` and the `+ Create` menu no longer
  render dead forms (either fully wired or loudly refused); existing registry/
  create test suites green with the new row pinned.
- **File boundary:** `schema/knowledge/assertion.ui.yaml` (+ `claim.ui.yaml`,
  `evidence.ui.yaml` if the audit finds drift);
  `app/src/pages/RecordRegistryPage.tsx` (REGISTRY_TABS row + tests);
  `app/src/event-editor/create/RecordCreatePanel.tsx` (+ tests); the global
  create-menu component (`create-menu`, wherever `+ Create` lives) + tests.
  No server, no schema/lint file edits, no new route.
- **Dependency:** none to start; **GC-14 close-out re-gate (A7 + S6 clause)
  depends on it.** Sequencing note for the orchestrator: GC-15 first (smaller,
  data-only); GC-16 may run parallel; the close-out browser leg re-runs ONLY
  A6, A7, the lint-refusal demo, and a console delta — every other dossier
  section stands at 049e5b87.

### GAP 3 — ruling: KEEP OUT of GC scope; A9 wording amendment (Brad yes/no)
The `POST /api/vendor/exa/search` 502 is pre-existing, run-page-mount-only,
independent of the GC flow (absent on /analysis, /sequences, /claims — receipt
D4). It stays OUT of GC-14. Recommended concrete acceptance-text change for
the close-out re-gate: A9's console clause becomes **"zero console errors
originating from the GC flow; pre-existing named errors (vendor-exa 502,
campaign-noted protocols/steps 400) are inventoried and segregated, not
silenced."** Separately proposed as a small standalone platform task
(GC-17 candidate, NOT queued here): make `useVendorExaSearch` degrade honestly
(config-driven vendor availability — the exa endpoint is configuration; a
missing/unavailable vendor should render a named unavailable state, not a 502
on every mount). That task belongs to whoever owns the vendor surface; it does
not gate GC-14.

## GC-14 close-out protocol (so the orchestrator can execute without re-deriving)
1. Brad rules on GC-15, GC-16, the A9 wording line, and the GAP-3 standalone
   task (yes/no each; silence = none approved, GC-14 stays human-blocked).
2. GC-15 and GC-16 run and merge through the normal lane (coder → adversarial
   review → verification → browser-reviewer gate on their own acceptance text).
3. GC-14 close-out: re-run ONLY legs A6 + A7 + lint-refusal demo + console
   inventory at the new tip; append to the dossier as a dated close-out addendum
   (S5 flips to evidenced with the new ids; S6 honesty line updates to whatever
   the browser then actually proves — stated honestly either way); hygiene sweep
   re-runs against the new window; the gate re-run is the browser-reviewer's,
   never a paper pass.
4. GC-14 is marked done only by that addendum + Brad's review, per its own
   `verified by` line. The architect marks nothing.

ARCH-GC14GAPS-DONE
