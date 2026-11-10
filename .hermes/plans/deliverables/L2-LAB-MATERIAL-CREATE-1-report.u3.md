# L2-LAB-MATERIAL-CREATE-1 — UNIT u3 Report

## Task
`/lab/materials/new` create surface: ontology search rows (namespace+label), explicit pick mounts
VendorProductBuilderModal, onSave navigates to `/lab/materials`.

## Delivered commits
- `1240cd05` — L2-LAB-MATERIAL-CREATE-1 u3 step 1 (RED): LabMaterialNewPage test — ontology search + namespace/label rows + builder mount + onSave navigate
- `121960a2` — L2-LAB-MATERIAL-CREATE-1 u3 step 2 (GREEN): /lab/materials/new — ontology search rows (namespace+label), explicit pick mounts VendorProductBuilderModal, onSave -> /lab/materials
- `4bbdbd96` — L2-LAB-MATERIAL-CREATE-1 u3 step 3: stay within output budget — compact page+test to <=200 lines, drop reagent nouns from placeholder
- `75013117` — L2-LAB-MATERIAL-CREATE-1 u3 step 4: compact to 199 lines total (budget <=200)

## Verification (GREEN)
Raw output, run in `app/` at 75013117 (command: `cd app && npx vitest run src/collections/LabMaterialNewPage.test.tsx`, exit 0):

```
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

Marker resolvable:

```
$ git cat-file -t 75013117b0beab93b7054a102bf7f1075c458fed
commit
```

## Changed files
`git diff --stat 50cf9331..HEAD -- app`:

```
 app/src/collections/LabMaterialNewPage.test.tsx | 119 ++++++++++++++++++++++++
 app/src/collections/LabMaterialNewPage.tsx      |  75 +++++++++++++--
 2 files changed, 186 insertions(+), 8 deletions(-)
```

## Note
The u3 code was delivered by the prior overflow worker; this run is paperwork only and changes no
product path (`git diff --stat 75013117..HEAD -- app server schema` is empty apart from this report).

## u3fix1 — advc c1 D1/D2 closeout (commit `3794d844`)

D1: test `(b)` now asserts `within(row).getAllByTestId('lab-material-candidate-namespace')`
texts, not whole-row `toContain`; page.tsx:61 carries that testid (no other change).

1. RED (testid absent at 2b75f313), raw:
```
TestingLibraryElementError: Unable to find an element by: [data-testid="lab-material-candidate-namespace"]
 FAIL  src/collections/LabMaterialNewPage.test.tsx > ... > (b) DMEM rows show namespace AND label; nothing is picked without a click
 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
```
2. GREEN after adding the testid: `Tests 4 passed (4)` / `Test Files 1 passed (1)`.
3. Mutation probe M1 (namespace span line deleted), raw:
```
Unable to find an element by: [data-testid="lab-material-candidate-namespace"]
 FAIL  ... > (b) DMEM rows show namespace AND label; nothing is picked without a click
      Tests  1 failed | 3 passed (4)
```
   Probe M1b (span kept, content emptied), raw: `AssertionError: expected [ '' ] to deeply equal [ 'NCIT' ]` — `Tests 1 failed | 3 passed (4)`. Both reverted; suite 4/4 green.
4. `npx vitest run src/collections/LabMaterialNewPage.test.tsx src/collections/LabCollectionView.test.tsx`:
```
 ✓ src/collections/LabMaterialNewPage.test.tsx  (4 tests)
 ✓ src/collections/LabCollectionView.test.tsx  (6 tests)
 Test Files  2 passed (2)
      Tests  10 passed (10)
```
5. `npx tsc --noEmit`: 13 errors before (stashed tree) / 13 after — byte-identical output, 0 new, none in changed files.
6. `git -c core.fileMode=false status --porcelain` pre-commit:
```
 M app/src/collections/LabMaterialNewPage.test.tsx
 M app/src/collections/LabMaterialNewPage.tsx
?? app/node_modules
```

## Markers
The canonical item marker is the final line of this report. The launcher's exit contract for this
closeout run additionally greps for the dispatched item token, recorded here with the same delivered
code sha:

L2-LAB-MATERIAL-CREATE-1-u3closeout UNIT u3closeout DONE 75013117b0beab93b7054a102bf7f1075c458fed

L2-LAB-MATERIAL-CREATE-1 UNIT u3 DONE 75013117b0beab93b7054a102bf7f1075c458fed

L2-LAB-MATERIAL-CREATE-1-u3fix1 UNIT unit DONE 3794d84405267d0f7f4175ed400b82491d9004b1
