# L2-PROTOCOL-ADOPT-INTAKE-1 / u2finish (CLOSEOUT: verify + report, no product edits)

Worktree /home/brad/cl-wt/L2-PROTOCOL-ADOPT-INTAKE-1-u1docintake-lane2, branch
cl/lane2-protocol-adopt-intake-0102, base = HEAD 0fbb3d269d86bfbe957ca6658e28f74c34356487.
u1docintake code already committed (80a29125 RED test, 208096a3 PDF-arm routing, ac3a5162 IDE
default, 0fbb3d26 WIP fold); branch diff vs 3dea6832 = exactly the 3 owned server files.
WIP fold into a named commit NOT needed: u2finish made zero product edits.
Grounding: .hermes/plans/architect-context-l2.md S2.5 "Proposal != commitment ... a staged draft
never satisfies a committed-record port", owned by GOVERNED-WRITE-ADMISSION-l2-20261113.md; the
adopted seam routes through the ONE shared write path, no second write seam; this unit adds none.

VERIFY 1 (raw) `cd server && npx vitest run src/ingestion/vendor-protocol/VendorProtocolPdfPageMethod.test.ts`:
  Test Files  1 passed (1) | Tests  3 passed (3) | Duration 971ms | exit 0. GREEN on HEAD.
VERIFY 2 (raw) `npx vitest run ZymoCampaignGoldenE2E.test.ts ZymoEventGraphCompile.test.ts StepPdfAnchor.test.ts`:
  Test Files  1 failed | 2 passed (3) | Tests  3 failed | 19 passed (22).
  The 3 failures are exactly the pre-existing set: 'expected 422 to be 405' (G2, line 331),
  'expected needs-clarification to be complete' (G6, line 560), 'expected 0 to be greater than 0'
  (G7, line 635). NO fourth failure appeared.
VERIFY 3 mutation probe (raw): scratch copy kept at /home/brad/.adoptintake-scratch/
  VendorProtocolPdf.ts.pre-mutation; in the worktree I reverted ONLY the PDF arm to the pre-change
  ternary `? await extractPdfLayoutText(buffer)` (no intake seam), ran test 1:
  Test Files  1 failed (1) | Tests  2 failed | 1 passed (3) — "the document must record the
  extraction method per page" fails on pageMethods undefined => RED as required (no method recorded).
  Restore: cp scratch back; sha256 of both = d8013f4b5329c40b5a8fd5944491a6663f9eadefb19f4f34c125c1b57c84774b
  (byte-identical); `git -c core.fileMode=false status --short` = EMPTY (clean) before final commit.
VERIFY 4 (raw) `cd server && npx tsc --noEmit -p .`: exit 0, 0 "error TS" lines (output file 0
  bytes; --diagnostics: Files 2040, no errors). DEVIATION, repo wins: brief expected exactly the 6
  pre-existing FastifyRequest 'parts'/'file' errors; those no longer exist at this base — the
  server typecheck is fully clean, so zero errors in touched files and none introduced. The 6-error
  baseline is STALE at base 0fbb3d26; flagged to orchestrator/reviewer, nothing to fix here.
  (App workspace, for completeness: 1 error in src/editor/taptab/RefCombobox.ontologyref.test.tsx,
  a file this branch does not touch — branch diff is server-only.)

Changed files this unit: the report only (no product changes; no npm install; no history rewrite).
Next actions: none from this unit; browser/reviewer acceptance of the seam is the independent lane.
Exit state: tree clean at exit; no blocker.

---

L2-PROTOCOL-ADOPT-INTAKE-1-u2finish UNIT u2finish DONE 5c3c70f24bf8fb0518fd096d00c2ad059bd67a15
