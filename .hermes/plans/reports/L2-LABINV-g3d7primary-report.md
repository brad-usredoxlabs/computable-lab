# L2-LAB-INVENTORY-CREATE-1 / unit g3d7primary (gate g3 D7)

Worktree: /home/brad/cl-wt/L2-LABINV-g3d7primary-lane2
Branch: cl/lane2-labinv-g3d7primary-2145
Base verified: 63d1992c741f368349ce935109cce3dabce25ffe (clean on entry)

## Change
- `app/src/collections/MaterialReceivingDoor.tsx`: two CTA `className` literals
  `lab-modal__primary` -> `lab-modal__save` (Accept, Stage draft). Nothing else.
- `app/src/collections/MaterialReceivingDoor.test.tsx`: one new pin appended;
  it renders the door, compiles to surface the Accept CTA, collects the injected
  `<style>` text, and joins every `lab-modal__*` token on the RENDERED
  `.lab-modal` buttons (close, cancel, both CTAs) to a declared `.<token> {`
  rule, then requires the submit CTA's rule to declare
  `background: var(--cl-accent)` and a `:disabled` rule with `opacity: 0.6`.
- `labModalStyles.ts` NOT touched (owned by g3d6scroll); no alias rule added.

Environment note: the pre-placed `app/node_modules` symlink pointed at an empty
`/mnt/vast/.../cl-integration-2/app/node_modules`. The gitignored link was
repointed read-only to the populated `.../computable-lab/app/node_modules`
(same target as sibling lane-2 worktrees). No install, no writes under /mnt/vast,
no tracked-file effect.

## RED (step 1, untouched component)
```
 ❯ src/collections/MaterialReceivingDoor.test.tsx  (13 tests | 1 failed)
   ❯ ... > backs every .lab-modal__* token on the rendered CTAs with one declared rule (gate g3 D7)
     → no declared rule for: lab-modal__primary, lab-modal__primary: expected [ 'lab-modal__primary', …(1) ] to deeply equal []
 Test Files  1 failed (1)
      Tests  1 failed | 12 passed (13)
```
Commit 3deb5632 test(labinv): pin footer CTAs to declared modal classes (RED, g3 D7)

## GREEN (step 2, fix applied)
Diff is exactly two lines (Accept :226, Stage draft :257); testids, `type`,
`disabled`, handlers untouched.
```
 ✓ src/collections/MaterialReceivingDoor.test.tsx  (13 tests) 419ms
 Test Files  1 passed (1)
      Tests  13 passed (13)
```
Commit 79aff84378da2229a06d2afff36fc6d4e46e53c7
fix(labinv): use the declared .lab-modal__save class on the receiving-door CTAs (g3 D7)

## MUTATION PROBE
Reverted the Stage draft site only (`__save` -> `__primary`), ran the pin alone:
```
→ no declared rule for: lab-modal__primary: expected [ 'lab-modal__primary' ] to deeply equal []
 FAIL ... backs every .lab-modal__* token ...
 Test Files  1 failed (1)
      Tests  1 failed | 12 skipped (13)
```
Also probed the Accept site only — same failure, naming the undeclared token.
Both mutations reverted (`git checkout --`), full file re-run: 13 passed.

## Status at exit
```
$ git -c core.fileMode=false status --short
(empty)
$ git rev-parse HEAD
<report commit follows>
```

## Acceptance mapping
- AC1: both CTAs now carry the class whose only declaration is accent fill;
  jsdom can't cascade, so the pin proves rule->token join and the browser gate
  still owns the measured `backgroundColor`.
- AC2: the same class carries `:disabled { opacity: 0.6; cursor: default; }`;
  no inline style added.
- AC3: testids, busy behaviour, Close (`__cancel`), door-local `<style>`, and
  `labModalStyles.ts` unchanged; only two `className` literals moved.

L2-LAB-INVENTORY-CREATE-1 UNIT g3d7primary DONE 79aff84378da2229a06d2afff36fc6d4e46e53c7
