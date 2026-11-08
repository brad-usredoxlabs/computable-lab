# L2-GROUPEDSUBMIT-ARM-ANSWER-1 — unit u3fix2 report (driver-wiring fix cycle, advc c2 FIX-2..FIX-6)

Worktree: /home/brad/cl-wt/wt-L2-GROUPEDSUBMIT-u3fix2
Branch: cl/lane2-groupedsubmit-u3fix2-l2t3230
Base: 9ce41a959340b5ffcdf16927a9982daf3693bfeb
Inputs: reviews/L2-GROUPEDSUBMIT-ARM-ANSWER-1-advc-u3-c2-l2t3140.md (VERDICT: fix, §3 FIX-2..FIX-6)

## 1. What changed

### chrome.cjs (drivers/chrome.cjs) — commit 1
`u3fix2: chrome helpers - picked label read-back + per-slot identity answer map`

- FIX-1 (verify only, already fixed at base): chrome.cjs:165 and :184 now use
  `new RegExp(answerValue, 'i')` — no `searchValue` reference in the
  numbered-options / picker-popover arms. Proven by probe case C below.
- Anchor-2 `picked` read-back: both arms now return the clicked option's own text,
  trimmed: `return { present: true, via: 'option', picked: txt.trim() }` and
  `{ present: true, via: 'picker-popover', picked: txt.trim() }`. Same treatment on
  the other answer surfaces (`typed`, `assumed-chip`, `wells-slot`, `top3-row`,
  `picker-top3`) so every result carries a truthful `picked` label.
- FIX-2 helper: new `identityKind(identityText)` (line 63) classifies the rendered
  slot identity into `concept` / `quantity` / `other`; new `slotIdentity(slot)`
  (line 71) reads `[data-testid="chat-clarification-slot-identity"]`; new
  `slotAnswerValue(slot, identity, answers)` (line 81) resolves the per-slot value
  from the identity (`concept` -> 'Clofibrate', `quantity` -> '1') when given a map.
- `answerAllSlots(page, answerValue)` (line 273) is BACKWARD COMPATIBLE: a scalar
  still means "same value for every slot"; an object map
  (`{ concept, quantity, ... }`) selects per slot by rendered identity. It calls
  `answerSlotBySurface(page, i, value)` per slot and returns
  `{ present, via, picked, slotIndex, identity, answerValue }` per result (never
  throws on a non-drivable slot; reports `present:false, unanswered:true`).
- Identity derivation REUSES the existing anchor-3 pattern
  (`[data-testid="chat-clarification-slot-identity"]`), no parallel resolver.

### leg4.cjs — commit 2
`u3fix2: leg4 per-slot answers, quantity located by identity, receipt truth`

- FIX-2: `const results = await chrome.answerAllSlots(page, { concept: 'Clofibrate', quantity: '1' })`
  (was scalar `'1'` for every slot, which could never answer a concept slot).
- FIX-3: quantity is located by rendered identity, never by index:
  `results.find((r) => r.present && kindOf(r) === 'quantity')`; `slots[1]` is gone.
  A 1-slot concept card now reports `quantity: { present: false, unanswered: true }`
  explicitly instead of silently projecting `slots[1]`.
- FIX-4a: `out.answer.identity = { present: true, picked: identitySlot.picked, via: identitySlot.via, identity: identitySlot.identity }`
  — `picked` is the option label read back from the click, `via` keeps the surface name.
- The `answer-all` step receipt now logs per slot
  `{ identity, answerValue, picked, via }`, so the receipt states what was driven
  and what was read back instead of a bare count.

### app/src/agent/ChatClarification.groupedSubmit.test.tsx — commit 3
`u3fix2: grouped submit pins exit 0 + restore dropped coverage`

- FIX-4b: the propagation pin no longer leaves a process-level unhandled rejection.
  It owns the `unhandledRejection` channel for the duration of the click
  (`process.listeners` -> `removeAllListeners` -> capture handler), restores the
  runner's handlers in a `finally`, then asserts `rejections` has exactly one
  entry and that it IS the thrown error. Teeth are intact: a swallowed throw
  produces zero rejections -> red (mutation control below). Why not
  `expect(...).rejects`: the throw happens inside the picker's floating async
  pick IIFE (ClarificationPicker.tsx:702 path), so no promise is returned to the
  test; capturing the channel is the only leak-free way to assert propagation.
- FIX-6: both dropped pins restored and adapted to u2 semantics —
  `transport failure falls back to the ontology answer, not a catch` and
  `pick completes and enables submit when typed path succeeds`. Both now mock the
  TRANSPORT (`apiClient.groundOntologyMaterial`) instead of the old
  `../lib/groundMaterialRef` module (wrong path; groundMaterialRef catches its own
  transport error and returns the original ref), and both assert the emitted
  answer's `ref` bytes, not merely "submit enabled":
  ontology ref `{kind:'ontology', id:'CHEBI:17790'}` on transport failure,
  record ref `{kind:'record', id:'M-1'}` on transport success.
- Result: `grep -rln groundOntologyMaterial app/src --include=*.test.tsx` is
  non-empty again (see §2.6).

Diff vs base: 3 files, +207 / -56 (263 changed lines; over the 150-line budget —
the FIX-6 restore bodies are ~90 of those lines and were explicitly required by
the brief, the rest is the exit-0 pin rewrite plus the header comment).

## 2. Verify transcripts

### 2.1 syntax
```
$ cd drivers && node --check chrome.cjs && node --check leg4.cjs && echo SYNTAX_OK_BOTH
SYNTAX_OK_BOTH
```

### 2.2 stub-page probe (VERIFY step 2, advc FIX-1 + FIX-2 contract)
Probe source: /tmp/u3fix2-probe.cjs (no browser; fake locator tree; inlined below).
```
$ node /tmp/u3fix2-probe.cjs
A results [{"present":true,"via":"option","picked":"Clofibrate","slotIndex":0,"identity":"identity","answerValue":"Clofibrate"},{"present":true,"via":"assumed-chip","picked":"1","slotIndex":1,"identity":"quantity","answerValue":"1"}]
A driven  ["option:Clofibrate","chip-fill:1","chip-approve"]
B results [{"present":true,"via":"option","picked":"DMSO","slotIndex":0,"identity":"identity","answerValue":"DMSO"}]
C results [{"present":true,"via":"option","picked":"Clofibrate","slotIndex":0,"identity":"identity","answerValue":"Clofibrate"}]
PROBE_OK
PROBE_EXIT=0
```
- A: identity map drives concept slot with 'Clofibrate' (option arm, picked label)
  and quantity slot with '1' (chip arm) — FIX-2.
- B: scalar `'DMSO'` still means "same value for all slots" — backward compatibility.
- C: option-only slot, the historical advc FIX-1 case — no `ReferenceError`,
  result carries `{present, via, picked}`.

Probe script (reproducible; ~60 lines):
```js
const path = require('node:path')
const chrome = require(path.join('<drivers-dir>', 'chrome.cjs'))
const log = []
const list = (items) => ({ count: async () => items.length, nth: (i) => items[i] })
const opt = (text) => ({ innerText: async () => text, click: async () => { log.push(`option:${text}`) } })
const identitySlot = () => ({ locator(sel) {
  if (sel.includes('slot-identity')) return { count: async () => 1, innerText: async () => 'identity' }
  if (sel.startsWith('[data-testid^="chat-clarification-option-"]')) return list([opt('Clofibrate'), opt('DMSO')])
  return list([]) } })
const quantitySlot = () => ({ locator(sel) {
  if (sel.includes('slot-identity')) return { count: async () => 1, innerText: async () => 'quantity' }
  if (sel === '[data-testid="clarify-assumed-chip"]') return { count: async () => 1, locator(s) {
    if (s === '[data-testid="clarify-assumed-value"]') return { fill: async (v) => { log.push(`chip-fill:${v}`) } }
    if (s === '[data-testid="clarify-assumed-approve"]') return { isEnabled: async () => true, click: async () => { log.push('chip-approve') } }
    return list([]) } }
  return list([]) } })
const page = (slots) => ({ locator(sel) {
  if (sel === '[data-testid="chat-clarification-slot"]') return list(slots)
  return list([]) }, waitForTimeout: async () => {} })
```
(assertions: A -> 2 results with the identities/values/picked shown above; B -> scalar
contract; C -> option-only slot does not throw.)

### 2.3 grouped-submit pins (VERIFY step 3) — BAR MET
Baseline at 9ce41a95 (advc cycle 2): `Tests 2 passed (2)` + `Errors 1 error`, VITEST_EXIT=1.
```
$ cd app && npx vitest run src/agent/ChatClarification.groupedSubmit.test.tsx
 ✓ src/agent/ChatClarification.groupedSubmit.test.tsx  (4 tests) 1023ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
VITEST_EXIT=0
```
No `Errors` line, exit 0, 4 tests (>= 4 after the FIX-6 restores).

### 2.4 mutation control (VERIFY step 4)
Mutation applied to a scratch copy of the product file (backed up to
/tmp/ClarificationPicker.tsx.orig, restored byte-identical afterwards; the file is
NOT part of this unit's diff — `git status` shows only the test file):
`onPick(resolved, request)` re-wrapped as `try { onPick(...) } catch { /* u1 broad catch */ }`.
RED transcript:
```
$ npx vitest run src/agent/ChatClarification.groupedSubmit.test.tsx -t 'onPick throw propagates'
FAIL  src/agent/ChatClarification.groupedSubmit.test.tsx > u3driverwiring pinned tests > onPick throw propagates — not swallowed by catch
AssertionError: expected [] to have a length of 1 but got +0
 ❯ src/agent/ChatClarification.groupedSubmit.test.tsx:132:24
    132|     expect(rejections).toHaveLength(1)
 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
VITEST_EXIT=1
```
Restore + GREEN transcript:
```
$ cp /tmp/ClarificationPicker.tsx.orig .../ClarificationPicker.tsx
$ git status --short
M app/src/agent/ChatClarification.groupedSubmit.test.tsx     # only the owned test file
$ npx vitest run src/agent/ChatClarification.groupedSubmit.test.tsx
 ✓ src/agent/ChatClarification.groupedSubmit.test.tsx  (4 tests) 1026ms
 Test Files  1 passed (1)   Tests  4 passed (4)
VITEST_EXIT=0
```
Conclusion: the pin still fails if the picker swallows the onPick throw again
(teeth preserved) and passes with the merged u2 semantics.

### 2.5 typecheck (VERIFY step 5)
```
$ cd app && npx tsc --noEmit | grep -c 'error TS'
10
$ grep -c 'groupedSubmit.test' /tmp/u3fix2-tsc.txt
0
```
Same 10 trunk-baseline errors (EventEditorContext, editorHistory.test, viewer,
IngestionUploadModal, ...); 0 in owned files.

### 2.6 picker regression suite + FIX-6 grep (VERIFY step 6)
```
$ cd app && npx vitest run src/event-editor/right-pane/ai/ClarificationPicker.test.tsx
 ✓ src/event-editor/right-pane/ai/ClarificationPicker.test.tsx  (20 tests) 2009ms
 Test Files  1 passed (1)   Tests  20 passed (20)
VITEST_EXIT=0

$ grep -rln groundOntologyMaterial app/src --include=*.test.tsx
app/src/agent/ChatClarification.groupedSubmit.test.tsx
```

## 3. Commits (commit-per-step)
```
u3fix2: chrome helpers - picked label read-back + per-slot identity answer map
u3fix2: leg4 per-slot answers, quantity located by identity, receipt truth
173a6134 u3fix2: grouped submit pins exit 0 + restore dropped coverage
u3fix2: report + verify transcripts
```

## 4. Open items / next actions (not owned by this unit)
- LIVE drive of leg4 against the lane stack was not run here: the two driver files
  are Playwright scripts that need the authorized lane stack and a real
  clarification card. Implementation is complete and unit-verified; the browser
  reviewer owns the live acceptance drive (chrome.cjs/leg4.cjs need no YAML reload,
  no schema/lint/ui triplet touched).
- No product file was edited. The mutation in §2.4 was reverted and is not in the diff.

Verification commands (re-run from the worktree):
```
cd .hermes/plans/deliverables/PROMPT2-REGATE-DRIVERS-REBASELINE-1/u6status/drivers && node --check chrome.cjs && node --check leg4.cjs
node /tmp/u3fix2-probe.cjs
cd app && npx vitest run src/agent/ChatClarification.groupedSubmit.test.tsx; echo EXIT=$?
cd app && npx tsc --noEmit | grep -c 'error TS'
cd app && npx vitest run src/event-editor/right-pane/ai/ClarificationPicker.test.tsx
```
