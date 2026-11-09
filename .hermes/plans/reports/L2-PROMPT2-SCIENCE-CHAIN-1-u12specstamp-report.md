# L2-PROMPT2-SCIENCE-CHAIN-1 — unit u12specstamp (gate-7 defect D1)

Worktree: /home/brad/cl-wt/wt-SCIENCE-u12specstamp — branch cl/lane2-science-u12specstamp-l2t3065,
base 464aac56.

## Defect
`writeMaterialRef` composition branch replaced the matched `composition_snapshot` entry's
`component_ref` but never wrote the event level, so a formulation-spec pick left
`details.material_spec_ref` absent (gate 7: A2 1 µL arm rendered `solventCells:["—"]`, server
log `fold-path bound 2 material pick(s): event[0].composition_snapshot=MSP-PR9-TEST-CLO-1MM`).

## Fix (one seam)
server/src/ai/materialBinding.ts, composition-branch success path only (after the snapshot
substitution, before the return):

    if (canonicalMaterialField(ref) === 'material_spec_ref') nextDetails.material_spec_ref = ref;

Layer guard: only a formulation-spec layer ref stamps the event level; a bare `type:'material'`
pick stays entry-only. Entry substitution, all other top-level ref fields, and the single-ref
path (:158-165) are untouched. No new imports (`canonicalMaterialField` already imported).

## Test (TDD, additive)
server/src/ai/materialBinding.test.ts, one new `it` after the two-slot composition test:
asserts (i) matched snapshot entry still carries the record ref and the sibling draft entry is
unchanged, (ii) `details.material_spec_ref` matches
`{kind:'record', id:'MSP-API-mu50x5z7', type:'material-spec'}`, mixture `material_ref` untouched,
and (iii) a bare `type:'material'` pick in the same branch stamps no `material_spec_ref`.

## Verification (real runs)
- RED before fix: `cd server && npx vitest run src/ai/materialBinding.test.ts`
  -> Tests 1 failed | 11 passed (12); failure at the (ii) assertion (`expected undefined to
  match object`).
- GREEN after fix: same command -> Tests 12 passed (12). Ran twice (20:32:08, 20:32:12),
  identical result.
- `npx tsc --noEmit` -> one PRE-EXISTING, unrelated error:
  `src/storage/S3StorageProvider.ts(87,33): TS2307 Cannot find module '@aws-sdk/client-s3'`
  (untouched file; optional dep absent in this worktree). No diagnostics in the two edited files.
- `git status --porcelain` empty after the final commit.

## Commits
- ed3ed7f1 RED test
- fd90920d GREEN fix (marker SHA below refers to this verified code commit; report follows it)
- diff 464aac56..fd90920d: 2 files, +41 lines.

## Next actions
Orchestrator: reload the lane stack (YAML untouched) and re-run the gate-7 live arm; browser
review still owns acceptance.

L2-PROMPT2-SCIENCE-CHAIN-1 UNIT u12specstamp DONE fd90920dfd99ddf9cc345159dbd66812061b9e56
