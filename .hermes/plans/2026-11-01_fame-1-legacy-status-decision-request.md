# FAME-1 post-gate question — legacy (pre-FAME-1) acquisition packages: silence or declared fallback?

Requested by: lane-1 orchestrator, tick 230TH, 2026-11-01 ~10:10 EST.
Decision path (unique): this file. Reply by appending a "## DECISION" section here.
Not urgent: the retry browser gate excludes legacy arms; FAME-1 acceptance turns on the three live arms.

## Observed (browser-gate attempt 1, receipts /home/brad/.hermes/cl/receipts/FAME-1/20261101T094015, finding F1, shots 02/14)

The run sheet renders attached packages that PREDATE the FAME-1 merge with NO status word at all:
row reads `attached: ACQP-000006  Analyze` and nothing else. ACQP-000006 is
machine1/20201023-WEGMANS-BUTTER.D whose RUN.LOG really says "Method aborted"; ACQP-000008
(ASCII-log) likewise renders nothing. API readbacks (in trail.json) confirm both payloads have
NO acquisitionStatus / acquisitionStatusEvidence — the fields are stamped at REGISTER time. The UI
truthfully renders data that does not exist. This is not a false claim; it is silence.

## The question

Task acceptance says "a package with no parseable log shows UNKNOWN (never completed)".
Is that about (a) registers whose log fails to parse (FAME-1 renders unknown — PROVEN working:
orch probe ACQP-000009 renders path exists, payload acquisitionStatus: unknown), or does it also
obligate (b) packages that were registered BEFORE the field existed to render the declared
fallback `unknown` retroactively?

Options as I see them:
- SILENCE IS LEGITIMATE (my recommendation): the honest reading is (a). Status is register-time
  evidence; a record with no evidence shows no evidence-word. A retroactive 'unknown' would be a
  DERIVED claim computed at render time — imperative policy in TS or a backfill migration. If you
  want legacy packages classified, the clean route is a re-register/backfill DATA action, not UI
  invention. Under this option: FAME-1 gates on the three live arms and closes; legacy rows keep
  rendering `attached: ACQP-…` only.
- RENDER DECLARED FALLBACK: then the fallback must be declared (schema default vs lint rule vs
  projection-side default — where?), because code may not invent policy; that is a FAME-1 fix run
  + re-gate, and the FAME-4/5 artifacts that consume status need the same fallback semantics.
- BACKFILL DATA: a one-time lane (and future main) re-stamp pass via a script/tool against the
  stored packages' own evidence. Separate task, new intake item — not absorbed into FAME-1.

## Constraint reminders
- R8/never-hardcode: a `?? 'unknown'` in GcSectionChrome would be hardcoded policy.
- "Unknown/aborted/stopped = visibly qualified" was FAME-1's shipped contract for packages that
  HAVE the field.
- All records are test data (Brad, standing) — a backfill carries no dataset risk on the lane.

Evidence: FAME-1 spec §acceptance; GcSectionChrome.tsx qualification arm; register handler stamps
status (acquisitionPackageStatus.ts classify at register); receipts above.

## DECISION

Ruled 2026-11-01 by the architect (bounded decision, first-hand reads: acquisition-package.schema.yaml,
acquisitionPackageStatus.ts, GcSectionChrome.tsx:345-363, receipts FAME-1/20261101T094015).

CHOSEN: SILENCE IS LEGITIMATE (option 1), plus a separate BACKFILL-DATA task (option 3) queued as
follow-up work. Option 2 (render declared fallback) is REJECTED.

Reading of the acceptance line. "A package with no parseable log shows UNKNOWN (never completed)"
obligates the REGISTER path, not the renderer: it describes a package whose log was examined and
would not parse — that arm is PROVEN (ACQP-000009: payload acquisitionStatus: unknown, renders
unknown). A pre-FAME-1 package is not "a package with no parseable log"; it is an UNCLASSIFIED
package — no examination ever ran. Its status is not "unknown"; it is ABSENT, and the schema
declares that absence legal on its face: acquisition-package.schema.yaml:173-174 ("ABSENT is legal
(a package registered before FAME-1...)") and :188 ("Absent on packages registered before FAME-1").
The UI renders exactly what the record carries. That is silence, not a false claim, and it is the
contract.

Why option 2 is rejected, not merely unnecessary. There is no honest declarative home for a
retroactive fallback:
- Schema default: a stamped `unknown` without `acquisitionStatusEvidence` would violate the FAME-1
  invariant that every status rides its evidence (ruleset id/version, decode facts, matched lines).
  A field asserting "the log was read and nothing matched" that was NEVER read is a fabricated
  claim — the worst kind of hardcoded policy, because it looks like data.
- Lint rule / render-time `?? 'unknown'`: imperative policy at the wrong layer (R8), and it would
  erase the distinction the schema deliberately keeps: "classified as unknown" vs "never
  classified". A backfill later could not tell which rows it owed.
So: no FAME-1 code change, no re-gate. FAME-1 gates on the three live register arms and closes.

BACKFILL becomes a task (Brad-approved intake item; all lane records are test data — no dataset
risk). One-line scope:
  FAME-1B-BACKFILL — one-time lane-1 data pass: for every acquisition-package record lacking
  acquisitionStatus, re-run the EXISTING classifyAcquisitionPackageStatus against the package's own
  stored RUN.LOG and stamp the field+evidence through the normal record-write path. Reuse only:
  no schema change, no UI change, no new code path, no new vocabulary; results carry the current
  ruleset id/version as their evidence, so retroactive classification is attributable.
Priority note for the orchestrator: this is not cosmetic — ACQP-000006's log really says "Method
aborted" and a scientist at the run sheet gets no warning today. Queue it after FAME-1 closes;
sequence it ahead of FAME-4/5 if those artifacts consume status on legacy rows.

Meanwhile the legacy rows: unchanged. They render `attached: ACQP-…  Analyze` and nothing else.
That row is truthful, attach/Analyze stay available in all cases (bait #10), and the backfill —
when it runs — will make them informative with REAL evidence, not a rendered guess.

(Receipts' F2 — ACQUISITION_PACKAGE_UNKNOWN token shown on an infra 500 — is a pre-existing GC-12
client-mapping observation, out of scope here; the orchestrator may keep it on its minor list.)
