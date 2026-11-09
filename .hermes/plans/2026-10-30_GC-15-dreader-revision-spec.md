# GC-15 — ANREV-DREADER-1: pure-data .D trace revision (canonical spec)

STATUS: APPROVED (Brad "do both" 2026-10-29 17:2x EDT, architect session; claim edit recorded
in lane-1 task list 2026-10-29 20:15). Spec of record basis:
`.hermes/plans/2026-10-30_lane1-gc14-gaps-answer.md` @ e6bb2344 (architect GAP-2 ruling). This
file is the orchestrator-promoted executable spec for the coder run.

## Goal (one sentence)
Mint analysis-revision record `ANREV-DREADER-1` through `POST /analysis-revisions` on the LANE
backend (http://localhost:3092) so that an Analyze run on a real attached `.D` computes a real
signal trace FROM THE .D BYTES via the shipped reader seam — unblocking GC-14 leg A6.

## Hard boundary (pure data)
The ENTIRE deliverable is: one new record + its minted ACL in the LANE DATA REPO
`/home/brad/.computable-lab-lane1/worktrees/main/records/analysis-revision/` (created by the
POST — NEVER hand-forged yaml) + a commit in that embedded data-repo git.
NO edits to: app/, server/, schema/, SDK files, the trunk code repo
(/mnt/vast/home/brad/git/cl-integration-1 — docs/report files under
/home/brad/.hermes/cl/lanes/1/ are the only other writes), :3001/:5174, :3093/:5193,
/mnt/vast/home/brad/git/computable-lab, other worktrees.

## Record shape (orch-verified first-hand 2026-10-29 21:0x)
- POST route exists: server/src/api/routes.ts:1278 (`fastify.post('/analysis-revisions',
  analysisHandlers.createRevision)`).
- Shape precedent: `/home/brad/.computable-lab-lane1/worktrees/main/records/analysis-revision/ANREV-000007__test-gc-11-minimal-peak-table-publisher-lane-gate-fixture.yaml`
  — `entryScript` is a `def run(ctx):` source STRING, `sdkVersion: 0.4.0`, `inputs:` list of
  {name, dataKind, required, description}.
- Engine: `ENG-PYCAL01-L1T2305` (adapter `python-entry-script`) exists in lane data
  (`records/analysis-engine/ENG-PYCAL01-L1T2305__lane-python-entry-script-engine-calibration-gate-oq-5.yaml`).
- Reader seam: `server/python-executor-service/src/computable_lab_analysis/ctx.py`
  `read_signal()` probes the v181 .CH marker and dispatches to `d_reader.read_ch_bytes`;
  d_reader.py ships (GC-6, v181 decoder).
- `analysis-revision.schema.yaml` dataKind enum already contains `signal` — schema unchanged.

## Required content (from the architect ruling, binding)
- `engineRef: ENG-PYCAL01-L1T2305`.
- `inputs: exactly [{name: signal, dataKind: signal, required: true}]`.
- `sdkVersion: 0.4.0`.
- `parentRevisionRef`: none/absent (NOT a GC10A derivative).
- `requiredCapabilities`: OMITTED (do not stretch the frozen enum).
- `entryScript` (record data): read the provisioned signal handle via
  `ctx.get_input('signal').read_signal()` (exact accessor per the SDK the runner uses — verify
  against ctx.py/runner before writing; ANREV-000007 shows `ctx.parameters`; the INPUT accessor
  name must be read from the runner code, not guessed) and
  `ctx.publish('signal_trace', {axis, values, axis_units: 'min', value_units: 'pA'}, kind='signal')`.
  ZERO literals: no filename, no compound, no units beyond what the reader returns; reader meta
  (READER_NAME/VERSION, n_points, format label) rides into the artifact/methodNotes.
- Hygiene: FID1A.CH is ~17k points. The published signal must not blow the S10 <500 kB sweep.
  Either declare a thinned publication as a DECLARED PARAMETER (honest decimation label in the
  artifact naming — never a hardcoded stride) or use the runner's file-publication path if it
  streams large artifacts to storage. VERIFY WHICH MECHANISM THE RUNNER HONORS TODAY (read the
  python executor service runner) and record the evidence in your report.

## Mint + witness
1. POST via curl as an authorized lane actor (check how prior ANREV mints authenticated — see
   prior handoffs / server auth; USR-BRAD or the lane admin token already proven in earlier
   gate runs). Witness the mint-time Ajv+lint pass: the POST must return 2xx and a GET
   /analysis-revisions/ANREV-DREADER-1 (or assigned id) must read back 200. If the id is
   server-assigned numeric rather than honoring `id`, report the actual id — the browser gate
   will target whatever was minted.
2. Commit the minted record + ACL in the data repo (`git -C
   /home/brad/.computable-lab-lane1/worktrees/main -c core.fileMode=false add/commit`; data-repo
   commit only, NEVER the code repo).
3. Negative self-check before finishing: run a dry POST of the SAME payload with a fabricated
   literal check OFF? No — instead: verify entryScript contains zero file/compound literals by
   reading it back. Report the byte size of the minted yaml.
4. Do NOT run the full browser flow (that is the GC-14 close-out re-gate, orch-owned). But DO
   prove the engine executes the script at least once end-to-end via the API if a cheap
   analysis-run POST path exists with an already-attached .D input (ACQP-000004/000005 re-use is
   allowed): if you can mint a run through the API as a smoke witness, capture the run record id
   + artifact dataKind + point count. If the API path is not cheaply reachable, say so — the
   gate leg will drive it in the browser.

## Deliverables (UNIQUE PATHS — token l1t2100)
- Report: /home/brad/.hermes/cl/lanes/1/gc15-report-l1t2100.md
  Sections: mint payload (verbatim entryScript as minted), hygiene mechanism chosen + evidence
  of which mechanism the runner honors, POST/GET raw excerpts, record size, data-repo commit
  sha, engine-run smoke witness (or honest 'not cheaply reachable'), any deviation.
  End with 'STATUS: complete' then 'GC15 DREADER DONE <full sha of data-repo commit>'.
- Log is orch-owned (launcher redirects).

## Stop boundary
If you discover the POST path requires a CODE change (schema gap, route gap, runner gap),
STOP, write the report with 'requires-rescope' + exact evidence, and exit. Do not widen the
boundary.
