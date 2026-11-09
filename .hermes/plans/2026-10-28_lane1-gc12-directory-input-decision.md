# ARCHITECT RULING — GC-12 browser-gate blocker: directory-kind analysis input (lane 1)

Decided by: architect, 2026-10-28 (decision request:
`2026-10-28_lane1-gc12-directory-input-decision-request.md`; receipts
`/home/brad/.hermes/cl/receipts/GC-12/20261028T2155-regate2/report.md`).
This ruling AMENDS the D3 pinning half of the earlier GC-12 fix-cycle-1 ruling
(OPT-A). The parameter-defaults half of OPT-A stands unchanged; only the
`inputs.package` pin is amended.

## DECISION: composition — (B-amended) as the fix, (A-named-error) as the guard. (C) already exists.

1. **(B, the actual fix)** The GC Analyze handoff (`app/src/run/gc/GcSectionChrome.tsx`,
   `analyze`, ~:206–209) pins run `inputs` to **`{ signal }` only** — the file-level
   data-reference the verify-first `POST /acquisition-packages/:id/analysis-inputs`
   already returns. It stops pinning `package` (the directory-kind manifest DREF) as a
   runner-consumable input.
2. **(A, named error only)** `server/src/analysis/analysisRunner.ts` `provisionInputs`
   gains a NAMED refusal: a data-reference input whose record declares
   `dataKind: 'signal-collection'` fails fast with `INPUT_IS_DIRECTORY` (400-class named
   AnalysisServiceError) before `provider.read(path)` is attempted, instead of the
   relabeled `INTERNAL_ERROR: EISDIR`. **No directory expansion** in this leg.
3. **(C) is NOT new work.** The registration flow ALREADY mints per-member file DREFs
   (`server/src/storage/acquisitionPackage.ts` step 5, ~:411–438: every walked file gets
   an `acquireDataReference`, `dataKind: 'signal'` for `.CH`) and the endpoint already
   selects the engine-readable member by DECLARED ROLE — `DEFAULT_ROLE_MAP`
   (`FID1A.CH -> signal_channel`, ~:56–63) plus the `.CH`-suffix rule in `roleFor`
   (~:141). The handoff never hardcodes a member name; it consumes whatever the
   role-map resolves as `signal`. That stays exactly so.

## Rationale (grounded)

- **The manifest DREF was never an engine consumable.** `acquisitionPackage.ts:441–445`
  says it out loud: the manifest's `contentHash` is a Merkle hash over the per-file
  manifest string, explicitly NOT a hash of the directory, because
  `createReadStream` on a directory would EISDIR. Pinning it into `inputs.package`
  asked `provisionInputs` (which streams EVERY input via `provider.read` and writes
  `<inputDir>/<name>.bin`, ~:221–227 — and would then re-hash it against a
  manifest hash that can never match streamed bytes) to do something the data model
  itself declares impossible. The pin was the defect, not the runner.
- **Engine truth**: the pycal engine consumes a single `.CH` file (DREF-000008,
  ANR-000022 succeeded with a file-dref-only pin and produced a manifest). Nothing
  today reads a directory. Option A's "directory expansion" branch would be building a
  speculative data-plane for a dataKind no engine can read.
- **Provenance is not collapsed and not lost.** The package-level pin remains exactly
  where the provenance hierarchy puts it: `entry.acquisitionPackageRef` -> ACQP record,
  which carries `signalCollectionRef` (the manifest DREF) + the per-member file DREFs.
  The analysis run's `inputs` carries only what the engine actually consumes
  (the member file's signal DREF). concept != formulation != instance != aliquot: the
  package is the packaging of the members, not a substitute input for one.
- **No hardcoded file-name policy**: the member choice stays declarative via the role
  map (data); the runner guard keys off the record's declared `dataKind`, not a
  filename. Both halves survive "remove every hardcoded value".
- **Why keep the endpoint contract (`{signal, package}`)**: `package` is still useful
  verify-first provenance for callers (GC-5 collection semantics); shrinking the
  response is churn. Only the CLIENT-side pin changes.
- The ANREV-000006 `peak_detection` refusal stays correct behaviour — do not "fix" it.

## Coder-leg scope (ONE fix run, fleet slot, staggered, against `cl/integration-1`)

1. `app/src/run/gc/GcSectionChrome.tsx` `analyze`: create the run with
   `inputs: { signal: <inputs.signal> }` only. Update the touched tests
   (`GcSectionChrome.test.tsx` ~:343–370, `GcRunSheetSection.refresh.test.tsx`
   ~:252–257) to assert the package DREF is NOT in `inputs` and (recommended, cheap)
   that the created run's title/note still names the entry.
2. `server/src/analysis/analysisRunner.ts` `provisionInputs`: in the `data-reference`
   branch, after loading the DREF payload and BEFORE `provider.read`, if
   `dataKind === 'signal-collection'` throw
   `AnalysisServiceError('INPUT_IS_DIRECTORY', ...)` — message names the input, the
   DREF id, and says the runner provisions file-kind references only; point at the
   package's member DREFs via `acquisition-package.files`. Add a server test proving a
   directory-kind pin yields the NAMED token, not `INTERNAL_ERROR: EISDIR`.
3. Browser-gate minors IN this leg (same fix run, all client-side, each a few lines):
   - defect 2: `RunCollectionView.tsx:313` loading state while `/api/gc-methods` is in
     flight (never claim "none configured" mid-fetch); `:101` — remove/flag the silent
     `gcMethods[0]` fallback (no method the user never chose).
   - defect 3: style `.gc-results a` as a visible link in the GC sheet CSS.
   - defect 5: clear the stale chrome note when a new action/error begins (one owner
     for the note line).
   - defect 6: the `if (busy) return` no-op must become visible — disabled state with
     reason, or a note ("an action is already in progress") on the ignored click.
4. DEFERRED, not in this leg:
   - defect 4 (column visibility / table width): a layout decision (widen the sheet
     column vs. a column-visibility affordance) — architect task of its own after this
     gate; do not half-solve it here.
   - defect 7 (pre-existing console noise: `NOT_A_PROTOCOL` 400, exa 502): stays carried,
     as at the prior gate.
   - runner directory EXPANSION (full option A): no engine consumes collections today;
     if a future revision needs one, it is a dataKind-materialization contract designed
     as its own task, not smuggled into a fix leg.

## Verification the re-gate must show (V7(f) execute→results)

- GC-created run (attach ACQP -> Analyze) executed against a revision whose declared
  capabilities a lane engine supports (ANREV-000008 / ANREV-GC10A class — NOT
  ANREV-000006): results render (table/view), run status progresses, no EISDIR anywhere.
- Created run's stored `inputs` = `{ signal }` with a FILE dref (GET the ANR record).
- A hand-crafted run pinning DREF-000028 as an input now fails with NAMED
  `INPUT_IS_DIRECTORY` (no `INTERNAL_ERROR: EISDIR`).
- ANREV-000006 still refuses with `ENGINE_CAPABILITY_UNSUPPORTED` (unchanged, correct).
- Minors 2/3/5/6 visibly fixed on the same surface; DNA control (criterion i) stays
  byte-identical.

## Stop boundaries for the coder

- Do NOT edit the GC-4 registration flow (`acquisitionPackage.ts` register/verify — the
  standing OUT-stop) or `packageAnalysisInputs`' response shape.
- Do NOT add directory expansion, member-name hardcoding, or capability declarations.
- Do NOT touch GC-5 re-hash / GC-6 inputMeta semantics beyond the guard's placement.
- No stack restarts, no merges; lane-1 stack :3092/:5192 only.

— architect
