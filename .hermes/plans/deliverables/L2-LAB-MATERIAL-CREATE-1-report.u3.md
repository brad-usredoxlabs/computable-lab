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

## u3fix4 — advc c2 (MINOR): restore the u3 brief's lines<=200 gate

Single defect from advc c2: the c1 D1 fix (3794d844) made the two owned deliverables 121+80=201
lines, one over the u3 brief's hard `lines <= 200` gate. Fix is comment-only: the two-line WHY at
test.tsx:92-93 folded into one line that keeps the whole reason (whole-row `toContain('NCIT')` is
already satisfied by the rendered CURIE itself). No product logic, testid or assertion changed.
Baseline verified before editing: `wc -l` = 121 + 80 = 201 at b8ff2fb1. After: 120 + 80 = 200.

1. `wc -l app/src/collections/LabMaterialNewPage.test.tsx app/src/collections/LabMaterialNewPage.tsx`:
```
  120 app/src/collections/LabMaterialNewPage.test.tsx
   80 app/src/collections/LabMaterialNewPage.tsx
  200 total
```
   Diff size: `1 file changed, 1 insertion(+), 2 deletions(-)`.

2. `cd app && npx vitest run src/collections/LabMaterialNewPage.test.tsx 2>&1 | tail -n 6`:
```
Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  01:13:03
   Duration  16.46s (transform 277ms, setup 2.04s, collect 2.19s, tests 66ms, environment 10.43s, prepare 934ms)
```
   Matches baseline 4/4 at b8ff2fb1; the anchor at test.tsx:94
   (`getAllByTestId('lab-material-candidate-namespace')`) is untouched and green.

3. `cd app && npx tsc --noEmit; echo EXIT=$?`:
```
EXIT=0
```
   Environment note (not a product change): this worktree had no repo-root `node_modules`, so the
   hoisted deps (`ajv`, `yaml`, `prosemirror-view`, `ajv-formats`) resolved to nothing and tsc
   emitted the same 13 pre-existing module-resolution/`any` errors recorded in the u3 section above
   (none in `LabMaterialNewPage*`). After adding the lane-standard root link
   `ln -s /mnt/vast/home/brad/git/cl-integration-2/node_modules node_modules`
   tsc is clean: `EXIT=0`, 0 errors. The same link reproduces the check; the symlink is untracked
   infra (`.git/info/exclude`, local only — no tracked file touched).

4. `git log -n1 --oneline`:
```
74dfeb09 L2-LAB-MATERIAL-CREATE-1 u3fix4: fold D1 comment to meet 200-line gate
```

Output budget: files touched = 1 owned test file (+ this report); diff = 3 lines (-2/+1).


L2-LAB-MATERIAL-CREATE-1-u3fix4 UNIT unit DONE 74dfeb09045a2a6154d0bdca3982aadc400c42fa
