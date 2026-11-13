# L2-LAB-INVENTORY-CREATE-1 — unit hashwrap (lane 2)

Worktree: /home/brad/cl-wt/L2-LABINV-hashwrap-lane2
Branch: cl/lane2-labinv-hashwrap-0715
Base: d1b375548c313e42d1a40bc6365c82c28338181c
Tier: routine — one CSS declaration + one test leg.

## Why
Gate LABINV-browser-bundle-g4-l2t1857 LEG 1 passed the tall-modal cap but recorded a measured
cosmetic defect on the same surface: the 64-char monospace `reviewHash` in `.lab-modal__result dd`
ran past the panel's right edge instead of wrapping. Same surface this item already owns; one
declaration, no JSX/handler change.

## Decision
Add `overflow-wrap: anywhere;` to the EXISTING shared declaration
`.lab-modal__result dd, .lab-modal__refusal dl dd` inside the component's inline `<style>` block
(MaterialReceivingDoor.tsx:168) — the ONE rule both the accepted-result (:223) and refusal (:247)
hashes render through. No new rule, no `!important`, no `word-break: break-all` (would hyphen-free
break the `dt`/`dd` prose), no edit to `labModalStyles.ts` (its header forbids a second copy of
these rules), no touch to max-height/backdrop/save-cancel classes.

## Changed files (2, 16 added lines)
- `app/src/collections/MaterialReceivingDoor.tsx` — one property added on line 168 of the inline
  `<style>` template literal: `overflow-wrap: anywhere;`. JSX, handlers, API calls untouched.
- `app/src/collections/MaterialReceivingDoor.test.tsx` — ONE new leg "wraps the unbroken
  reviewHash/ids inside the panel…" (16 lines). It renders the door, drives `fillClaim()` + submit
  so `material-receiving-review-hash` renders, joins the RENDERED `<style>` text, extracts the
  declaration block for the shared dd selector list by regex (selector list + braces required, so a
  comment or a stray mention cannot satisfy it), and asserts `overflow-wrap: anywhere`.

Unit-level vs visual proof: jsdom performs no layout, so this pin asserts the DECLARATION in the
rendered stylesheet — it is not, and does not claim to be, a visual result. The VISUAL proof
(`dd.getBoundingClientRect().right <= modal.getBoundingClientRect().right`, value on >1 line, at
1440x900 and 1280x633) belongs to the LABINV g5 browser bundle per AC1; refusal wrapping plus the
no-write invariant per AC2; the g4 LEG 1 invariants per AC3. None of those were run here.

## Verification (raw)
### Step 1 RED (component unmodified)
```
 FAIL  src/collections/MaterialReceivingDoor.test.tsx > MaterialReceivingDoor > wraps the unbroken reviewHash/ids inside the panel: the shared dd rule carries overflow-wrap (hashwrap)
AssertionError: expected '.lab-modal__result dd, .lab-modal__re…' to match /overflow-wrap:\s*anywhere/

- Expected:
/overflow-wrap:\s*anywhere/

+ Received:
".lab-modal__result dd, .lab-modal__refusal dl dd { margin: 0 0 4px; font-family: monospace; font-size: 0.8rem; }"

 Test Files  1 failed (1)
      Tests  1 failed | 13 passed (14)
```
Fails on the missing declaration, not on selector lookup: the rule block was found and printed in
"Received".

### Step 2 GREEN
```
 ✓ src/collections/MaterialReceivingDoor.test.tsx  (14 tests) 309ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
```
(13 baseline + 1 new leg; baseline measured by the composer at base was 13 passed.)

### Mutation probe — property deleted exactly as specified
```
 FAIL  src/collections/MaterialReceivingDoor.test.tsx > MaterialReceivingDoor > wraps the unbroken reviewHash/ids inside the panel: the shared dd rule carries overflow-wrap (hashwrap)
+ Received:
".lab-modal__result dd, .lab-modal__refusal dl dd { margin: 0 0 4px; font-family: monospace; font-size: 0.8rem; }"

 Test Files  1 failed (1)
      Tests  1 failed | 13 passed (14)
```
Restored, re-ran:
```
 ✓ src/collections/MaterialReceivingDoor.test.tsx  (14 tests) 316ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
```
Revert proven: `git -c core.fileMode=false status --short` printed nothing (no product path dirty)
after the restore — the restored file is byte-identical to the committed GREEN state.

### Typecheck
NOT run — no `.ts` signature or type changed (a CSS property plus one test leg). No type touched, so
the pre-existing prosemirror-view/ajv worktree-link errors are neither introduced nor masked here.

### Final tree
`git -c core.fileMode=false status --short` → empty at exit (verified again after the report commits).

## Reviewer-bait self-check
1. Rule lives in the component's inline `<style>`; `labModalStyles.ts` untouched — no second authority.
2. Only `overflow-wrap: anywhere` on the `dd` rule; no `word-break`/`hyphens` on `dt, dd`.
3. No `!important`; no cascade fight.
4. Pin asserts a declaration in the rendered stylesheet; no `getBoundingClientRect`/`scrollWidth`
   fiction. Visual result explicitly NOT claimed — owned by g5 AC1.
5. Regex requires the full selector list plus `{…}` block, so a comment cannot satisfy it; RED run
   shows the found block and the absent property.
6. Shared selector list kept — both :223 and :247 covered by the one declaration.
7. Pure CSS: no new testid, no hash-length/kind-name conditional, no magic string in TS.
8. g4 LEG 1 cosmetics (max-height cap, backdrop, save/cancel classes) untouched.

## Commits
- 6ac442b9 test(hashwrap): pin overflow-wrap on the shared dd rule so the reviewHash wraps (RED)
- 8fb0e45f fix(hashwrap): overflow-wrap anywhere on the shared dd rule so long hashes wrap inside the panel

## Remaining / owner
- AC1/AC2/AC3 acceptance stays with the LABINV g5 browser bundle (independent browser reviewer).
- No blockers.

L2-LAB-INVENTORY-CREATE-1 UNIT 1 DONE 3e09c2a3ccc3d02d25e89f4df73a180f1d3cb1e3
