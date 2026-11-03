# FAME-1 SPEC (draft l1t2255) — Acquisition status surfaced honestly from the package (RUN.LOG UTF-16): completed|aborted|stopped-by-user|unknown as DATA

COMPOSER: cl-spec-composer, 2026-10-31, trunk cl/integration-1 @ 0f17c3bb.
STATUS: DRAFT — orchestrator reviews/promotes; NOT dispatchable until promoted.

## Goal

At acquisition-package registration, read the RUN.LOG member (strict UTF-16) and the declared
package-member signals, classify the acquisition as completed|aborted|stopped-by-user|unknown
onto the acquisition-package record as DATA (matched log lines + decode facts + interpretation
source preserved), and make an aborted/stopped/unknown package visibly qualified on the run sheet
while staying attachable (provenance). Closes drive finding F2.

## Item text (verbatim from /home/brad/.hermes/cl/lanes/1/task-list.md:10645-10664)

title: "Acquisition status surfaced honestly from the package (RUN.LOG UTF-16): completed|aborted|stopped-by-user|unknown as DATA"
description: Read acquisition-status evidence (RUN.LOG is UTF-16; signals from package members) at
attach/registration and classify completed|aborted|stopped-by-user|unknown onto the
acquisition-package record as DATA (schema/lint/UI triplet changes; interpretation source
preserved). An aborted/stopped package stays attachable (provenance) but any analysis from it is
visibly qualified run-sheet-side. Campaign rules R1-R8 binding (draft-campaign-list.md).
why: Drive finding F2 (receipt-verified): WEGMANS .D aborted mid-acquisition ("6890 I/O error",
"Method aborted") and the product decoded + analyzed it silently. Closes F2. Reuses the shipped
acquisition-package/attach path + reader; status interpretation lives in lint/UI YAML.
verified by: Live at :5192: attaching machine1/20201023-WEGMANS-BUTTER.D visibly reports the
instrument abort with a link to the RUN.LOG evidence; COUNTRYSIDE-BUTTER shows completed; a
package with no parseable log shows UNKNOWN (never completed). Round-trip receipts (request body
+ rendered warning per ROUND-TRIP-GATE-1). Browser gate on the run-sheet surface.

Standing gates (lane rules, binding): tests green; tsc baseline (no NEW type errors — capture the
baseline fresh at claim, see Verification); adversarial review gate; ROUND-TRIP-GATE-1 browser
gate on the run-sheet surface (request-body artifact + rendered warning pair, zero /api/ai/**
interception); no new vocab where an existing term serves.

Binding campaign rules R1-R8 live in
~/.hermes/specs/intake/2026-10-31_fame-quantitation-chain/draft-campaign-list.md. FAME-1-relevant:
R3 (no filename->sample-identity inference, no domain logic in TS), R6/R7 (WEGMANS + truncated
files are honest-failure fixtures, NEVER the reference), R5 (round trip in every browser gate).

## Grounding (composer-verified first-hand at 0f17c3bb; scout screening was used only for the
## GcAttachPanel pointer, then re-verified)

Registration path:
- POST /acquisition-packages/register is wired at server/src/api/routes.ts:435; handler
  createRunSheetHandlers(...).register at server/src/api/handlers/RunSheetHandlers.ts:114-215
  (factory :91). It calls registerAcquisitionPackage (RunSheetHandlers.ts:170) and then PUTs
  acquisitionPackageRef onto the instrument-sequence-entry (:194-204).
- registerAcquisitionPackage: server/src/storage/acquisitionPackage.ts:356-510. Members are
  enumerated by walkTree (:277-303); RUN.LOG is a declared member role via DEFAULT_ROLE_MAP
  ('RUN.LOG' -> 'run_log', :56-63); REQUIRED_MEMBERS = FID1A.CH + SAMPLE.XML ONLY (:69) —
  a missing RUN.LOG must never fail registration. Per-file DREFs are minted for EVERY walked
  file (:411-438, dataKind binary for non-.CH); the acquisition-package record is created LAST
  (:477-502) — the classification must be computed BEFORE that create and land in packagePayload
  (:480-495). Member bytes are readable server-side via provider.read (pattern already used at
  server/src/storage/acquisition.ts:100 and verifyAcquisitionPackage re-hashing,
  acquisitionPackage.ts:563).
- The register RESPONSE returns packagePayload verbatim (RunSheetHandlers.ts:210-214), so new
  payload fields flow to the client without a response-shape change.

Triplet (schema/knowledge/):
- acquisition-package.schema.yaml — unevaluatedProperties:false (:18), properties end at state
  (:158-161). New OPTIONAL properties are additive; existing ACQP records stay valid.
- acquisition-package.lint.yaml — record-scope only; the header (:3-15) states the LintEngine
  hard limit: the v1 lint DSL cannot open the record store (LintEngine.ts, and ops
  acquisition-package.lint.yaml:14 "any YAML rule claiming 'dangling ref rejected' is a tautology
  or a lie in this DSL"). Available ops confirmed in server/src/lint/types.ts: exists, nonEmpty,
  regex, equals, all, any, not, everyItem (:22-38). Lint therefore CANNOT read file bytes — the
  extraction step is where file evidence becomes record data; lint disciplines the record shape.
- acquisition-package.ui.yaml — editor blocks + slots (editor.blocks :26-53, slots :54-120),
  list columns :122-134. Widget enum is closed at schema/ui/ui-v1.schema.yaml:163-179 (text,
  textarea, number, boolean, date, datetime, ref, array, object, markdown, code, hidden,
  combobox, select, multiselect, checkbox). No new widget.

Pattern-file-as-data precedent (decisive for the declarative boundary):
- config/sequence-analysis/*.yaml (capabilities.yaml, alphabets.yaml, request-fidelity.yaml...)
  are pattern/config data files loaded by CODE generically at
  server/src/sequences/sequenceRuntime.ts:15 (readFile of `config/sequence-analysis/${name}.yaml`).
  The repo's doctrine explicitly permits a data-declared pattern file read by generic code
  (CLAUDE.md "Code never makes policy decisions — it follows the rules declared in data",
  /mnt/vast/home/brad/git/computable-lab/CLAUDE.md:147).

UTF-16 decode:
- Python-side precedent: d_reader._strict_utf16 (decode utf-16 consumes the FF FE BOM; BOM-less
  falls back utf-16-le) at
  server/python-executor-service/src/computable_lab_analysis/d_reader.py:266-274; RUN.LOG
  lossless line parsing at :325-342 (unrecognized lines survive verbatim).
- Server TS today does NOT decode RUN.LOG (no utf refs in server/src/storage/acquisition*.ts —
  verified). Registration only hash-pins it.
- REAL DATA verified by the composer on the device (UTF-16LE + BOM, all confirmed):
  /mnt/vast/gc-fid/machine1/20201023-WEGMANS-BUTTER.D/RUN.LOG (1250 B, BOM feff) contains
  "6890 1 I/O error with 6890 GC" / "Closing signal 1 due to I/O error" /
  "Instrument Error - Method/Sequence stopped" / "Method aborted" (13:19:33 10/23/26).
  20201023-COUNTRYSIDE-BUTTER.D ends "Method completed 15:24:43".
  20201023-KERRYGOLD.D = "Instrument run completed" + "Method stopped by user" -> stopped-by-user.
  20201024-RESTEK-60-RESTEK-H.D = "Instrument run completed" + "Method stopped by user"
  (run finished, sequence stopped) -> stopped-by-user by precedence. The remaining six machine1
  packages incl. RES35077-4.D/RES35077-5.D end "Method completed".
  NOISE FACT (bait): the gate-fixture synthetic logs at
  /mnt/vast/computable-lab-data/lane1-gate-fixtures/L1GATE-6a298b.D/RUN.LOG are PLAIN ASCII
  (verified via file(1)) — a naive utf-16 decode yields mojibake, not a crash; the UNKNOWN arm
  must catch this.

UI / run-sheet seam (where the qualification lands):
- Attach UI: app/src/run/gc/GcAttachPanel.tsx (device select + directoryKey input + "Register .D"
  button :199-223; calls apiClient.registerAcquisitionPackage at :131-135; client.ts:3411-3425).
  testids gc-attach-error-<entryId> / gc-attach-done-<entryId> (:18-19).
- The attached surface: app/src/run/gc/GcSectionChrome.tsx:352-358 renders
  `attached: {e.payload.acquisitionPackageRef?.id}` per entry — this is the run-sheet line the
  qualification must decorate. The entries are fetched by GcRunSheetSection via ONE getRecord per
  linked entry (GcRunSheetSection.tsx:217-234); the mount-fetch accounting FENCE is
  GcRunSheetSection.no-fetch-accounting.test.tsx ("the GC case makes the probe + one getRecord
  per linked entry, each ONCE"). Entry payloads carry only acquisitionPackageRef
  (gcRunSheetModel.ts:56, entryDisplayColumns :201), NOT the package payload — surfacing the
  status REQUIRES reading the ACQP record (see OQ-2, fence extension).
- Evidence-link precedent: GcProvenancePanel.tsx:29 renders
  `<a href={`/record/${id}`}>` anchors to the generic record host (route /record/:recordId,
  app/src/App.tsx:217). "Link to the RUN.LOG evidence" = a /record/<DREF-of-RUN.LOG> anchor
  (there is NO raw-blob serving route for data-references — see OQ-1; the matched lines live on
  the package as DATA precisely so a human reads them without a byte-serving surface).
- Badge precedent on the analysis surface (for vocabulary, NOT for editing): the
  quantitative/uncalibrated badge is data-derived at app/src/analysis/AnalysisPage.tsx:596-602,
  735. AnalysisPage is OUT of scope.

Existing enum precedent: schema/lab/instrument-log.schema.yaml:59 `enum: [ completed, aborted,
error ]`; studies/run.schema.yaml:58 has completed/aborted/failed. The item's four-value
vocabulary (adds stopped-by-user + unknown) is fixed by the acceptance text; see reviewer bait.

Lane fixture availability for the live gate: config.yaml:48-52 already configures device
`gc-fid-nas` -> /mnt/vast/gc-fid (machine1/20201023-WEGMANS-BUTTER.D and
machine1/20201023-COUNTRYSIDE-BUTTER.D both live there, verified on disk); the default device
`vast` -> /mnt/vast/computable-lab-data hosts lane1-gate-fixtures/*.D (ASCII-log = the UNKNOWN
arm). All three live arms need NO new device config.

## Declarative boundary (state it plainly — this is the adversarial target)

CLAUDE.md: "Code makes no policy decisions — it follows the rules declared in data" + "Business
logic lives in lint YAML". The lint DSL provably cannot read file bytes (record-scope hard limit,
acquisition-package.lint.yaml:3-15). The repo's proven alternative is a data-declared pattern
file read by generic code — the config/sequence-analysis precedent. Therefore:

1. DATA (new): config/gc-acquisition-status/log-patterns.yaml — declares, IN ORDER (precedence =
   file order, which is itself data, not a code branch):
   - fallbackStatus: unknown (the never-completed default is DECLARED, not coded);
   - rules[]: each { status: <one of the four enum values>, pattern: <regex over one decoded
     RUN.LOG line>, note }. Expected content (coder authors, review checks against the real
     corpus below): aborted <- /Method\s+Method aborted/ ; stopped-by-user <-
     /Method\s+Method stopped by user/ ; completed <- /Method\s+Method completed/ ; the I/O-error
     and "Method/Sequence stopped" lines may additionally be declared as aborted-corroborating
     rules. Precedence MUST land: WEGMANS -> aborted (it also carries a "...stopped" line),
     KERRYGOLD/RESTEK-60-RESTEK-H -> stopped-by-user (they also carry "Instrument run
     completed" — do NOT declare a pattern matching bare "Instrument run completed" as
     completed), COUNTRYSIDE/RES35077-* -> completed.
   - ruleset id + version fields (recorded into the evidence).
2. CODE (new, generic): server/src/storage/acquisitionPackageStatus.ts — loads that file (same
   readFile/new URL idiom as sequenceRuntime.ts:15), strict-UTF-16-decodes the run_log member
   bytes (mirroring d_reader.py:266-274: utf-16 with BOM, fallback utf-16-le; decode failure ->
   treated as no-parseable-log), applies rules in declared order (first match wins), and RETURNS
   the evidence object. It contains ZERO status regexes and ZERO status literals-with-meaning
   beyond plumbing the declared fallback: no "aborted" string, no "Method" string in TS.
3. CODE (edit): registerAcquisitionPackage calls it for files with role run_log BEFORE creating
   the package record and stamps acquisitionStatus + acquisitionStatusEvidence into
   packagePayload (step 7, acquisitionPackage.ts:480). A package with no run_log member or an
   unparseable/zero-match log gets status = the declared fallback (unknown) — NEVER completed.
4. LINT (record-scope, honest ops only): if acquisitionStatus is aborted|stopped-by-user|unknown,
   acquisitionStatusEvidence.matched or a named no-evidence reason must be nonEmpty (warning or
   error per coder judgment — do NOT claim store-resolution in any rule, header bait stands).
5. UI (data): status slot (widget: text or select readonly) + evidence presentation in
   acquisition-package.ui.yaml + list column; run-sheet chrome renders the word + link from the
   package payload fields. No interpretation in TSX (no `.includes('abort')` — render the DATA).

Payload shape (all optional; additive; coder may refine key names, the semantics are the contract):
  acquisitionStatus: completed | aborted | stopped-by-user | unknown
  acquisitionStatusEvidence:
    ruleset: { id, version, sourceFile }            # interpretation source, preserved
    sourceMember: { relativePath }                   # which member was read (e.g. RUN.LOG)
    decode: { encoding, bomPresent }                 # decode facts
    matched: [ { line (VERBATIM), ruleId, lineIndex } ]  # never rewritten, never dropped
    noEvidenceReason?: (only when matched is empty, e.g. log absent / not decodable / no rule hit)

## Files in scope (ownership list)

Schema/lint/UI + data (all land before code; restart needed after — YAML-reload trap):
- config/gc-acquisition-status/log-patterns.yaml        NEW (declared rules)
- schema/knowledge/acquisition-package.schema.yaml      ADD optional acquisitionStatus + acquisitionStatusEvidence (+ pattern-enforced ruleId shape)
- schema/knowledge/acquisition-package.lint.yaml        ADD record-scope rule(s) above
- schema/knowledge/acquisition-package.ui.yaml          ADD status slot + evidence view + list column
Server:
- server/src/storage/acquisitionPackageStatus.ts        NEW generic extractor (+ NEW acquisitionPackageStatus.test.ts using in-test utf16leBom fixture bytes — the analysisDReader.test.ts:106-129 idiom; do NOT vendor real bytes, the no-bytes invariant test at acquisitionPackage.test.ts pins tmp-tree byte hygiene)
- server/src/storage/acquisitionPackage.ts              classification call + payload stamp ONLY (registration order :346-355 doc-block stands; package record still created LAST)
- server/src/storage/acquisitionPackage.test.ts         +status arms
- server/src/schema/AcquisitionPackageSchemas.test.ts   triplet contract tests (RED first)
App:
- app/src/run/gc/gcRunSheetModel.ts                     EntryPayload/ACQP payload typing (+ maybe a display-column for status if the chrome uses the table)
- app/src/run/gc/GcRunSheetSection.tsx                  fetch the ATTACHED package record (one getRecord per DISTINCT acquisitionPackageRef, mount + after attach) — see OQ-2
- app/src/run/gc/GcRunSheetSection.no-fetch-accounting.test.tsx  EXTEND the fence deliberately: allowed set becomes probe + one getRecord per linked entry + one getRecord per DISTINCT attached ACQP, each ONCE. Update the header comment with the FAME-1 rationale in the SAME commit (fence edits without rationale = reviewer reject).
- app/src/run/gc/GcSectionChrome.tsx                    the qualification arm at :352-358: next to "attached: ACQP-…" render `acquisition status: <word>` + link to /record/<run-log DREF id> + the matched-line evidence readable (title/expand), with testids gc-acqp-status-<entryId> and gc-acqp-status-link-<entryId>. Unknown/aborted/stopped = visibly qualified (non-collapsing warning text, not a tooltip); completed = quiet word. Attachable in ALL cases — attach is NOT blocked (provenance).
- app/src/run/gc/GcSectionChrome.test.tsx               status arms
- app/src/shared/api/client.ts                          only if a typed getRecord payload helper is needed (getRecord already exists — prefer zero diff)

Explicitly OUT of scope:
- app/src/analysis/AnalysisPage.tsx and any /analysis-surface qualification (the item's surface
  is the RUN SHEET; the analysis-run record stays honest via its package ref; FAME-8's walkthrough
  covers the analysis-side narrative).
- Any raw-blob / byte-serving route for data-references (none exists today; do not invent one —
  OQ-1).
- server/python-executor-service (the python d_reader is not the registration path).
- schema/lab/instrument-log.schema.yaml (do not touch another kind's enum).
- FAME-2+ anything; view-spec renderer enum; task list; merges.

## First targeted check (run this BEFORE writing implementation code, RED-first)

Author acquisitionPackageStatus.test.ts first (fixture bytes built in-test via the utf16leBom
idiom, lines copied VERBATIM from the receipts
~/.hermes/cl/receipts/BRAD-GC-DRIVE-20261031/20261031T191154Z/report.md:66-71 + notes.md:173-181
and the composer's on-device verification), then:

  cd /mnt/vast/home/brad/git/cl-integration-1/server && npx vitest run src/storage/acquisitionPackageStatus.test.ts

Expected RED on first run (module missing). Expected GREEN after: every case classifies —
WEGMANS lines -> aborted, COUNTRYSIDE/RES35077 lines -> completed, "Method stopped by user"
(+ run completed) -> stopped-by-user, ASCII-mojibake log -> unknown, empty/no run_log -> unknown,
matched[] carries the verbatim line + ruleId + ruleset id/version. This single file proves the
pattern-file + decode approach before anything else is built.

## Verification commands (complete, with expected output)

0. Baseline capture AT CLAIM (fresh — trunk moves):
   cd /mnt/vast/home/brad/git/cl-integration-1/server && npx tsc --noEmit 2>&1 | grep -c "error TS"
   Composer measured 0 at 0f17c3bb; re-measure at claim and gate on NO NEW errors (record the
   number in the report).
1. New + touched server suites:
   cd /mnt/vast/home/brad/git/cl-integration-1/server && npx vitest run src/storage/acquisitionPackageStatus.test.ts src/storage/acquisitionPackage.test.ts src/schema/AcquisitionPackageSchemas.test.ts src/api/handlers/RunSheetHandlers.test.ts
   Expected: all files passed, 0 failed. Composer baseline at 0f17c3bb: the two pre-existing acqp
   suites = 31/31 (note: acquisitionPackage.test.ts is genuinely ~75 s — tmp-mount hashing; do
   not "optimize" it).
2. Touched app suites:
   cd /mnt/vast/home/brad/git/cl-integration-1/app && npx vitest run src/run/gc/GcSectionChrome.test.tsx src/run/gc/GcRunSheetSection.no-fetch-accounting.test.tsx src/run/gc/GcRunSheetSection.refresh.test.tsx src/run/gc/GcRunSheetSection.test.tsx src/run/gc/gcRunSheetModel.test.ts src/run/gc/GcRunTable.test.tsx
   Expected: all green, 0 failed (the accounting fence passes against its EXTENDED allowed set).
3. Typecheck both workspaces:
   cd /mnt/vast/home/brad/git/cl-integration-1 && npm run typecheck
   Expected: exit 0 / zero errors new vs the step-0 baseline.
4. YAML reload + live server check (restart is MANDATORY after schema/lint/ui/pattern YAML —
   tsx --watch does NOT reload YAML):
   bash <lane-stack-restart per lane rules, i.e. cl-lane-stack.sh 1 restart — inspect it first;
   never pkill patterns; :3092/:5192 only, NEVER :3001/:5174>
   Then register a no-log/ASCII-log package and read the classification back:
   curl -s -X POST localhost:3092/api/acquisition-packages/register -H 'content-type: application/json' -H 'x-user-id: USR-QMS-ADMIN' -d '{"deviceId":"vast","directoryKey":"lane1-gate-fixtures/L1GATE-95dc64.D","entryRef":{"kind":"record","id":"<an ISEN you mint on the lane>","type":"instrument-sequence-entry"}}'
   Expected: 200 with packagePayload.acquisitionStatus:"unknown" (ASCII mojibake = never
   completed) and acquisitionStatusEvidence.ruleset + decode facts. (A fresh synthetic .D with a
   proper UTF-16 BOM log is the completed-arm server-side twin; the real-data arms are the
   browser gate.)
5. Browser gate (post-merge, orchestrator dispatches cl-browser-reviewer): ROUND-TRIP-GATE-1 on
   the run-sheet surface — at :5192, per acceptance: WEGMANS -> visible abort word +
   /record/<DREF> link renders; COUNTRYSIDE -> completed; ASCII-log fixture (or a
   no-parseable-log fixture) -> UNKNOWN. Receipts MUST include the outgoing
   POST /acquisition-packages/register REQUEST BODY artifact paired with the rendered-warning
   screenshot per surface. "Mounted/visible DOM" alone is not accept evidence.

## Worker contract

- Worktree branch off the lane trunk: wt/fame-1-lane1-<ts> (branch off cl/integration-1 at
  claim-time HEAD; record the base sha in the report).
- Worktree: /mnt/vast/home/brad/git/wt/fame-1-lane1-<ts>; node_modules is a SYMLINK to
  /mnt/vast/home/brad/git/computable-lab/node_modules (verified) — NEVER run pnpm install /
  npm install in the worktree (lockfile drift is a known pre-existing trunk failure); use the
  existing node_modules.
- git commits: `git -c core.fileMode=false add ...` / commit with it (mode-bit noise on this
  mount). Never `git add .hermes/plans/handoffs` history churn; touch only the ownership list.
- Lane runtime: :3092 backend / :5192 frontend, lane data dir
  /home/brad/.computable-lab-lane1 (CL_DATA_DIR-resolved; verified isolation). NEVER touch
  :3001/:5174 or Brad's live data. Data repo = embedded git under the data dir — records there
  are TEST DATA but still never hand-forged: use the API.
- Workers mark in-progress on claim, never done. Platform-gap stop-boundary stands: if you find
  the seam genuinely missing (beyond the named OQs), STOP and return requires-rescope.
- Deliverable (unique path): <ORCH-FILL: /home/brad/.hermes/cl/lanes/1/fame-1-report-l1t<ts>.md>
  — report must include: base sha, baseline tsc count, every verification command's real output,
  the pattern-file contents, and the RED-first evidence (failing test output BEFORE the impl).

## Reviewer bait (pre-empt these in the diff and call them out in the report)

1. exactOptionalPropertyTypes (server tsconfig; RunSheetHandlers.ts:45-46 states the pattern):
   every new optional field (acquisitionStatus, evidence sub-fields, sampleRef threading) goes
   through conditional spreads — NEVER `{x: undefined}`. The register handler already models it
   (:161-167, :201).
2. YAML-reload trap: after ANY schema/lint/ui/patterns YAML edit, RESTART the lane stack before
   curl/browser checks — tsx --watch does not reload YAML. A stale-YAML "it doesn't work" is the
   classic false defect.
3. Ontology/vocab: the four status words are fixed by the item; completed/aborted already exist
   as enum values elsewhere (instrument-log.schema.yaml:59, run.schema.yaml:58) — this is the
   SAME words, not new vocab; do NOT touch the other kinds' enums and do NOT mint cf:-terms for
   them. status vs state: schema/knowledge/acquisition-package.schema.yaml:161 pins that
   "state" is lifecycle — the new field is deliberately named acquisitionStatus, never reuse
   state.
4. Hardcode boundary (THE adversarial check): grep the diff — no 'aborted'/'Method'/'stopped'/
   'completed' literals in server TS except as enum-type plumbing of declared values; the
   patterns live ONLY in config/gc-acquisition-status/log-patterns.yaml; the fallback is
   DECLARED (fallbackStatus: unknown) — a code default of completed is a reject. Precedence is
   file order, not an if-chain sorted by a coded notion of severity.
5. UNKNOWN-is-the-floor: no RUN.LOG member, unreadable member, decode failure, zero rule hits,
   ASCII-mojibake log (the real gate-fixture shape) — ALL land on unknown, never completed and
   never a registration failure. Registration MUST still succeed (RUN.LOG is not a
   REQUIRED_MEMBERS member, acquisitionPackage.ts:69).
6. Precedence traps in the real corpus: WEGMANS contains BOTH "Method/Sequence stopped" AND
   "Method aborted" -> aborted wins; KERRYGOLD/RESTEK-60-RESTEK-H contain "Instrument run
   completed" AND "Method stopped by user" -> stopped-by-user wins; a pattern keyed on bare
   "completed" misclassifies BOTH — patterns must be line-anchored like the corpus.
7. Preserve, never throw: matched lines survive VERBATIM (the d_reader lossless doctrine,
   d_reader.py:28 "unrecognized lines survive verbatim"); the DREF of the source member stays in
   files[] untouched; decode facts are recorded, not discarded on failure.
8. Mount-fetch fence: GcRunSheetSection.no-fetch-accounting.test.tsx is a documented pin.
   Extending it is legitimate ONLY with the header-comment rationale in the same commit and the
   extended-set wording; silently relaxing counts, or fetching the package on every re-render,
   is a reject. One getRecord per DISTINCT attached ACQP, deduped, cancel-on-unmount (mirror the
   entry-fetch pattern at GcRunSheetSection.tsx:217-234).
9. No filename inference (R3): status comes from log-content evidence only; the directoryKey
   string ('WEGMANS' etc.) must never steer classification or the UI word.
10. Attach stays available: no code path may refuse/gray-out attach for aborted/unknown
    packages (provenance rule in the item text); qualification = extra visible data, not a gate.
11. Evidence link = /record/<DREF id> anchor (GcProvenancePanel.tsx:29 precedent). Do not link a
    fabricated raw-log route; do not open the byte-less claim with a fake download.

## requires-rescope watch (platform gaps, honestly named)

- If the run sheet must qualify ANALYSIS RUNS individually (not just the attach line) the
  analysis-run record has no per-run warning seam today — that leg would be a gap. This spec
  deliberately scopes qualification to the run-sheet entry/attach surface (the acceptance text
  names the attach flow); if the browser reviewer rejects that reading, STOP -> requires-rescope,
  do not bolt warnings onto AnalysisPage.

## Open questions (composer could not resolve locally)

OQ-1 "Link to the RUN.LOG evidence" reading. There is NO raw-blob route for data-reference
   records (server/src/api/routes.ts has artifact blobs STU/ART-scoped and vendor-pdf only;
   ArtifactBlobHandlers.ts is artifact-kind only). The spec resolves the link to
   /record/<RUN.LOG DREF id> (generic record host, route App.tsx:217, provenance-panel precedent)
   PLUS verbatim matched lines on the package record. If the architect wants literal log TEXT
   served, that is a new blob surface = rescope. Checked: routes.ts greps, ArtifactBlobHandlers,
   dref handler listing.
OQ-2 Mount-fetch fence extension. Surfacing status run-sheet-side needs the ACQP payload
   client-side; the only channel is apiClient.getRecord on the ACQP id, which the documented
   mount-accounting pin currently forbids beyond per-entry gets. The alternative (show status
   only until page reload) fails "visibly qualified" on a fresh mount, so the spec chooses the
   explicit fence extension. Orchestrator should ratify touching that pin (reviewer bait #8).
   Checked: GcRunSheetSection.tsx fetch loop, no-fetch-accounting test header.
OQ-3 Pattern-file home. config/gc-acquisition-status/log-patterns.yaml follows the
   config/sequence-analysis/ loader precedent (sequenceRuntime.ts:15). A schema/ home is
   arguable but schemas are record-shape documents; config/ is where loader-read pattern data
   already lives. If the architect prefers a different home it's a rename-only change. Checked:
   all top-level config/ dirs (corpus-intake, drafting, ingestion, lab-sync, platforms,
   sequence-analysis), registry-kinds (no entry needed — not a record kind).
