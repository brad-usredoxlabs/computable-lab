# L2-CLARIFY-TARGET-1 — WELLS-DOOR FIX RUN 2 (adversarial defect closure)

Coder: cl-coder. Tick l2t0410. Worktree /mnt/vast/home/brad/git/wt/L2-CLARIFY-TARGET-1-lane2-l2t1810,
branch cl/lane2-target1-1-l2t1810. Start state: tip a6a71bcb (PRESERVED WIP, unverified), tree CLEAN,
on top of 2018f966 (D1 engine: scalar carried through expandWellTokens at the choke point).

Scope of this run (per orchestrator task + adversarial review l2t0230): PROVE by measurement what the
preserved WIP (a6a71bcb) already closes of D1/D2/D3/D4/D6, finish what it does not, run the full V-set.
Do NOT re-author green code; do NOT re-bless realizationGolden (T1/T2 stay red, tracked).

## Status ledger (updated as each defect closes; commits interleaved)

| defect | status | evidence |
|--------|--------|----------|
| D1 (BLOCKER) transfer/aliquot co-extensivity | CLOSED (proven) | RED-at-base + GREEN-at-head below |
| D2 (MAJOR) once-only prompt render | CLOSED (proven) | RED `expected 2 to be 1` at base; GREEN at head; one predicate copy |
| D3 (MINOR) disabled on wells arm + app tests | CLOSED (proven) | RED at base; GREEN 22/22 at head |
| D4 (MINOR) one address grammar | CLOSED (proven) | 3 regex sources byte-identical; second parser deleted |
| D6 (LOW) proposalRowFacts dead-code deletion | CLOSED | 0 importers; file absent; deletion preserved |
| D7 (LOW) report integrity: tsconfig truth + (b)-arm pin | CLOSED | tsconfig truth stated; (b)-arm pin 17/17 green + probe |

## Log

### 05:1x start
- `git status --short` empty; `git log --oneline -3`: a6a71bcb / 2018f966 / 0a3a4f18. Confirmed.
- Adversarial review read in full; ruling read in full.
- Orch notes applied: manifest re-hash already graded outcome-inert (no re-derivation); read vocab pins at
  tracked path schema/scientist-intent/scientist-intent-vocabulary.yaml (server/schema is a symlink).

## D1 (BLOCKER) — CLOSED, PROVEN by measurement (RED-at-base + GREEN-at-head)

**What the branch already had (verified, not re-authored):** the 2018f966 choke-point carry.
`git diff 9374a681..HEAD -- server/.../normalizeScientistIntent.ts` shows the ENTIRE functional D1 fix
is exactly ONE line (resolutionEngine.ts is byte-IDENTICAL 9374a681..HEAD — the shape-gate SKIP is
unchanged; only the CARRY changed):

    -        event[eventKey] = scalar;                       (9374a681: raw STRING carry)
    +        event[eventKey] = expandWellTokens([scalar]);   (HEAD: EXPANDED array carry, ONE parser)

This is the ruling's "teach the lowering the SAME one-parser expansion" fix direction: the scalar that
is an address literal is carried EXPANDED through `expandWellTokens` (the ONE parser) into the concrete
address array EVERY target-wells expander natively consumes (`params.wells`/`p.wells` as `string[]`).
No second parser, no verb-name table, no expander edit. The `wellsDoorCoextensivity.target1.test.ts`
pin (in HEAD) asserts transfer yields a real address ARRAY (never a string passthrough, never char-split)
and aliquot yields 96 per-well events with real address parts.

**RED (base = string-carry engine 9374a681) — first-hand, /tmp/red-d1 harness**
(HARNESS: server/src hardlinked + HEAD pin; `node_modules`->worktree root, `schema`->worktree schema;
`normalizeScientistIntent.ts` reverted to `git show 9374a681:...` so the carry line is `event[eventKey] = scalar;`.
vocabulary.ts diff 9374a681..HEAD is a single additive `identityCollapse?: {...}` optional field — inert here):

    $ vitest run src/compiler/scientistIntent/wellsDoorCoextensivity.target1.test.ts   (RED)
    FAIL ... transfer targetWells: A1:H12 (scalar) ... never a string passthrough ...
      AssertionError: expected false to be true   (pin :101 expect(Array.isArray(wells)).toBe(true))
    FAIL ... aliquot targetWells: A1:H12 (scalar) ... never single characters ...
      AssertionError: expected 6 to be 96         (pin :126 expect(events.length).toBe(96))
    Test Files  1 failed (1)   Tests  2 failed | 15 passed (17)

    concrete base values (my _redprobe.test.ts on the same RED harness):
      TRANSFER outcome= complete clarifications= [] events= 1 details.wells= "A1:H12"   (STRING)
      ALICOT   outcome= complete events= 6
               srcWells= ["A","1",":","H","1","2"]   dstWells= ["A","1",":","H","1","2"]   (char-split)

  => EXACTLY the reviewer's measured defect (transfer: bare STRING read empty by array-only readers;
     aliquot: six char-split events). The pin is LOAD-BEARING — it fails on the string-carry engine.

**GREEN (HEAD = expanded array carry) — first-hand, worktree:**

    $ npm run test:run -w server -- src/compiler/scientistIntent/wellsDoorCoextensivity.target1.test.ts
      ✓ src/compiler/scientistIntent/wellsDoorCoextensivity.target1.test.ts  (17 tests)
      Test Files  1 passed (1)   Tests  17 passed (17)

**Verdict:** 2018f966's choke-point expansion ALREADY fixes both transfer and aliquot (one parser, no verb
table). The pin proves it (RED at base, GREEN at head). No verb-name table was added. D1 CLOSED.

## D2 (MAJOR) — CLOSED, PROVEN. Single-request clarifyControl turn prints the prompt EXACTLY ONCE

**What the preserved WIP (a6a71bcb) already had (verified, not re-authored):** one extended decision,
`requestRendersOwnedPrompt(request) = request.clarifyControl != null || requestRendersPrompt(request)`,
at ChatLog.tsx:154 — used by BOTH the single-request render guard (:345) AND the bubble-suppression arm
(:475 `typedCardRendersOwnedPrompt` now keys on `requestRendersOwnedPrompt(r)`). ONE copy of the rule; no
second copy of the options/picker check. For every legacy request (no `clarifyControl`) it reduces to
`requestRendersPrompt` — byte-identical behaviour (CARD-1 33/33 proves it below).

**RED (base = 9374a681: guard extended but bubble arm still keyed on the UNCHANGED `requestRendersPrompt`) —
first-hand, /tmp/base-app harness (base app tree + the HEAD WIP test files grafted on):**

    $ vitest run src/agent/ChatClarification.target1.test.tsx   (RED at base)
    ❯ D2: a single-request clarifyControl turn prints its prompt EXACTLY ONCE > the prompt node count is 1
      AssertionError: expected 2 to be 1        <- THE reviewer's probe: EXACT PROMPT NODE COUNT = 2
    Tests  3 failed | 3 passed (6)

  This is the node-COUNT assertion (not a substring): one assistant message whose `content === prompt` +
  one `clarifyControl` request (`options: []`, no picker) => the prompt `<p>` node appears TWICE at base
  (the card/slot renders it AND the bubble keeps printing `message.content`).

**GREEN (HEAD): the SAME pin passes — the count is 1.** (full file: 6/6; below in the app pin run.)

**Verdict:** the bubble-suppression term comes from the SAME extended decision the render guard uses;
the pin asserts a node COUNT (toBe(1)). D2 CLOSED.

## D3 (MINOR) — CLOSED, PROVEN. `disabled` on the wells arm; app tests non-vacuous

**What the WIP already had (verified):** `disabled={disabled}` on the `<ClarifyWellTargetSlot>` arm in
ChatClarificationCard.tsx:200 (the only per-slot surface missing it — now matching chip/picker/options/Submit);
`ClarifyWellTargetSlot` takes `disabled?: boolean` and applies it to the input AND the approve button.
App tests EXIST in HEAD: `app/src/agent/ChatClarification.target1.test.tsx` (6) + `app/src/event-editor/lib/
wellRange.target1.test.ts` (16) — the mount, "never a silent default", the single-request arm, and the
grouped-card disabled arm are all pinned.

**RED (base) — first-hand, /tmp/base-app:**

    $ vitest run src/agent/ChatClarification.target1.test.tsx   (RED at base)
    ❯ D3b: the grouped card passes `disabled` to the TARGET-WELL slot arm > when disabled, ...
      AssertionError: expected false to be true    <- slot input/approve NOT disabled at base
    ❯ D3a/D4: ... never a silent default ... > empty + non-address + loose-column text keep approve DISABLED
      AssertionError: expected false to be true    <- base slot's loose parser enables approve for A99/P99
    $ vitest run src/event-editor/lib/wellRange.target1.test.ts (RED at base)
      whole file fails: `expandWellAddressLiteral` / `WELL_ADDRESS_SHAPE_RE` not exported by base wellRange.ts

  => the tests are NON-VACUOUS: they FAIL if the behaviour regresses (they were red at base by
  construction — 19 of 22 failed there).

**GREEN (HEAD):**

    $ npx vitest run src/agent/ChatClarification.target1.test.tsx src/event-editor/lib/wellRange.target1.test.ts
      ✓ src/event-editor/lib/wellRange.target1.test.ts  (16 tests)
      ✓ src/agent/ChatClarification.target1.test.tsx    (6 tests)
      Test Files  2 passed (2)   Tests  22 passed (22)

**Verdict:** D3a (tests exist and are non-vacuous), D3b (disabled on the wells arm), D4 (slot rejects loose
columns) all CLOSED and pinned.

## D4 (MINOR) — CLOSED, PROVEN. ONE address grammar, parity-pinned to the server

**What the WIP already had (verified):** the slot's second parser (`WELL_RE = /^([A-P])(\d+)$/i` +
`rangeBetween`) is DELETED. The slot now validates via `expandWellAddressLiteral(text)` from the app's one
well-grammar home (`event-editor/lib/wellRange.ts`) = the ONE parser (`expandWellTokens`) + the parity-pinned
bounds, and sends the SCALAR (the server's ONE parser expands it authoritatively — no client-side array mint).

**ONE grammar proven by MEASUREMENT (not just the app's self-pin): the THREE shape-regex sources are
BYTE-IDENTICAL** (first-hand grep at HEAD):

    app    app/src/event-editor/lib/wellRange.ts                  WELL_ADDRESS_SHAPE_RE = /^[A-P](?:[1-9]|1[0-9]|2[0-4])$/
    server server/src/compiler/scientistIntent/normalizeScientistIntent.ts  WELL_ADDRESS_SHAPE_RE = /^[A-P](?:[1-9]|1[0-9]|2[0-4])$/
    server server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts      WELL_RE               = /^[A-P](?:[1-9]|1[0-9]|2[0-4])$/

  => the client can no longer mint a well key the server's own shape test calls a non-address (A99/P99 are
  rejected by all three). The app's own parity pin (`wellRange.target1.test.ts`) additionally asserts
  byte-identity against the canonical `ChatbotCompilePasses.ts` WELL_RE and that the slot carries no
  second `WELL_RE`/`rangeBetween`. D4 CLOSED.

## D6 (LOW) — CLOSED. proposalRowFacts.ts deletion is safe and preserved

    $ ls app/src/agent/proposalRowFacts.ts            -> No such file or directory
    $ grep -rn 'proposalRowFact' app/src              -> (0 matches)
    $ grep -rni 'proposalrowfact' app/                -> (0 matches)
    $ git log --oneline --diff-filter=D -- app/src/agent/proposalRowFacts.ts
      a6a71bcb wip(lane2): TARGET-1 wellsfix fix1 — PRESERVED WIP ...   (the deleter; ancestor of HEAD)

Nothing imports it; the file is absent at HEAD; a6a71bcb (the deletion) is in HEAD's ancestry, so the
deletion is preserved. D6 CLOSED.

## D7 (LOW) — CLOSED. Report integrity: tsconfig truth + honest (b)-arm description, pinned

**(a) tsconfig truth (the predecessor report's "app typecheck (exactOptionalPropertyTypes ON)" is FALSE —
stated correctly here):**

    $ grep -n 'strict\|exactOptional' app/tsconfig.json    -> only "strict": true  (NO exactOptionalPropertyTypes)
    $ grep -n 'strict\|exactOptional' server/tsconfig.json -> "strict": true  +  "exactOptionalPropertyTypes": true  (line 13)

  `exactOptionalPropertyTypes` is a SERVER flag. The app does NOT set it; the app typecheck above (10
  pre-existing errors, zero-new vs base) was run under `strict: true` only.

**(b) the (b)-arm refactor is described HONESTLY (not byte-identical), and PINNED.** `normalizeScientistIntent.ts:880`
now calls `isWellAddressLiteral(claimValue)` where the OLD arm inlined `expandWellTokens([claimValue])
.every(t => WELL_ADDRESS_SHAPE_RE.test(t))` after `claimValue = wellsClaim.value.trim()` (:871). The
standalone predicate adds `.trim()` + `tokens.length > 0`. First-hand probe (server `expandWellTokens`):

    ""            len 1    neverEmpty: true    allShaped(UNtrimmed): false   allShaped(TRIMmed input): false
    "   "         len 1    neverEmpty: true    allShaped(UNtrimmed): false   allShaped(TRIMmed input): false
    "A1"          len 1    neverEmpty: true    allShaped(UNtrimmed): true    allShaped(TRIMmed input): true
    "  A1  "      len 1    neverEmpty: true    allShaped(UNtrimmed): false   allShaped(TRIMmed input): true
    "A1:ZZ99"     len 69498 neverEmpty: true   allShaped(UNtrimmed): false   allShaped(TRIMmed input): false
    "control_well"len 1    neverEmpty: true    allShaped(UNtrimmed): false   allShaped(TRIMmed input): false
    "bogus_role"  len 1    neverEmpty: true    allShaped(UNtrimmed): false   allShaped(TRIMmed input): false
    "A1:H12"      len 96   neverEmpty: true    allShaped(UNtrimmed): true    allShaped(TRIMmed input): true

  MECHANICS: `expandWellTokens` NEVER returns `[]` for a single input (a non-matching token round-trips as
  `[token]`, a range expands to ≥ 1, `""` round-trips as `[""]`) — so the `tokens.length > 0` guard is INERT.
  The `.trim()`: the (b)-arm call site already trims first (:871), so the predicate's internal trim is a
  NO-OP at the arm (on the arm's trimmed-input domain, old inline and new predicate agree for every input).
  AS A STANDALONE the new predicate is a SAFER change (not byte-identical): it correctly accepts a padded
  address `"  A1  "` a raw untrimmed inline would mis-reject, and still bars a padded LABEL either way.

  THE PIN (in HEAD, `wellsDoorCoextensivity.target1.test.ts`, 4 tests): the OLD (b)-arm behaviour
  (trim-at-call-site + the verbatim inline) and the NEW predicate AGREE across the reviewer-required corpus
  `"" | "  A1  " | "A1:ZZ99" | "control_well"` (plus A1/H12/A1:H12/a1/Q1/A25/P24), pinning both sides to the
  expected booleans so future parser/regex drift that re-diverges them fails. GREEN at HEAD (part of the
  17/17 run above). D7 CLOSED.

## V-set (orchestrator VERIFY list) — RAW output, all first-hand this run

    [1] server typecheck: `npx tsc -p server/tsconfig.json --noEmit` -> EXIT=0 (no output).

    [2] dir sweep `src/compiler/resolution src/compiler/scientistIntent`:
        Test Files  1 failed | 50 passed (51)
         Tests  2 failed | 569 passed (571)
        -> ONLY realizationGolden T1/T2 red (see [8]); every other file green.

    [3] two reachability pins, UNEDITED (md5 == reviewer's verified PRE-EDIT values):
        declaredArgumentReachability.test.ts  HEAD md5 = 904a3884fac11a12772c25d24c661d8f  (== reviewer 904a3884)
        shorthandChat.e2eStubHonesty.test.ts  HEAD md5 = 553c549f4768494be5ec23eefcde754e  (== reviewer 553c549f)
        app/e2e/deck-ghost-shorthand.spec.ts  HEAD md5 = 6772375570df4def7dac6003432364bc  (== reviewer 67723755)
        GREEN: declaredArgumentReachability 41/41 + e2eStubHonesty 7/7 (in [4] run).

    [4] named legs GREEN (one run, raw):
        ✓ nounResolution.test.ts (16)   ✓ goldenRolesSeam.test.ts (7)
        ✓ shorthandChat.e2eStubHonesty.test.ts (7)   ✓ declaredArgumentReachability.test.ts (41)
        ✓ rolesSeam.test.ts (20)   -> Test Files 5 passed (5) | Tests 91 passed (91)
        => rolesSeam SPINE-7 20/20 + golden 7/7; nounResolution bogus_role/unknown-address green.

    [5] D1 transfer/aliquot pins GREEN with RED evidence: see the D1 section (RED-at-base harness
        /tmp/red-d1: transfer details.wells STRING + aliquot 6 char-wells; GREEN at HEAD 17/17).

    [6] app typecheck zero-new vs measured base:
        HEAD: `npx tsc -p app/tsconfig.json --noEmit` -> 10 errors (exit 2), files:
          src/event-editor/deck/LawnSurface.moveAcross.test.tsx, src/event-editor/deck/PreviewActionBar.test.tsx,
          src/event-editor/editorHistory.test.ts, src/event-editor/EventEditorContext.tsx,
          src/event-editor/focus/LabwareFocus.instrument.test.tsx, src/event-editor/viewer/ViewerToolbar.tsx,
          src/event-editor/viewer/Viewer.tsx, src/ingestion/components/IngestionUploadModal.tsx,
          src/ingestion/protocol-review/ExtractionProgressPanel.test.tsx   (9 files, 10 errors; NONE in agent/ or event-editor/lib/)
        BASE (clean 9374a681 app, tsconfig byte-identical): 10 errors, SAME 9 files.
        error-file-set diff base-vs-head = EMPTY  => ZERO NEW. (Pre-existing trunk debt only.)

    [7] CARD-1's 33/33 app pins GREEN:
        ✓ ChatLog.grouped.card1.test.tsx (6)   ✓ ChatLog.test.tsx (27)   -> Tests 33 passed (33)
        => the one-copy `requestRendersOwnedPrompt` is byte-identical for legacy (no-clarifyControl) shapes.

    [8] D2 once-only count assertion GREEN: part of `ChatClarification.target1.test.tsx` 6/6 (the
        `expect(countExactPromptNodes(...)).toBe(1)` leg; RED at base = `expected 2 to be 1`, see D2 section).

    [9] D3 app pins (mount / never-a-silent-default / single-request arm) GREEN:
        ChatClarification.target1.test.tsx 6/6 + wellRange.target1.test.ts 16/16 -> 22/22 (RED at base 19/22
        failed; see D3 section).

## Boundaries honoured (this run touched NOTHING but its own report)

- `git diff --name-only a6a71bcb..HEAD` -> ONLY `.hermes/plans/deliverables/L2-CLARIFY-TARGET-1-report.wellsfix-fix2-l2t0410.md`.
  No MANIFEST, no app/src/agent/*, no app/src/event-editor/deck/*, no config/chat/*, no server/**, no YAML.
  (All product work under review was ALREADY committed by 2018f966 + a6a71bcb; this run verified it by
  measurement and added NO code.)
- realizationGolden NOT re-blessed, fixture NOT edited. The two shipped reachability pins + e2eStubHonesty
  remain in their pre-edit STRING form (md5 above) and pass because the ENGINE is right.
- No dev server started/stopped/restarted; no browser gate; no merge/push/rebase/checkout of another worktree.
- A sibling coder is live on app/src/shared, event-editor/deck, config/chat — untouched by this run.

## Golden legs (R6 / ruling §4c) — STAY RED, stated plainly

realizationGolden T1/T2 are RED at HEAD and REMAIN RED:
- T1: `expected 'needs-clarification' to be 'complete'` (realizationGolden.test.ts:263)
- T2: `expected 0 to be greater than 0` (realizationGolden.test.ts:319)
- Root cause (the lowerer gap, NOT the door): the lowerer (`realizeScientistIntent.ts`) emits `add_material`
  with NO `volumeUl` and NO `targetWells`, so Change-4's required-declaration bars `missing-required-argument`
  on both. No door option touches that — it is a separate leg. The ruling §4c forbids re-blessing the golden
  without Brad's explicit approval (blessing a lowerer gap into the golden would hide it) and forbids merging
  on (a)+(b) while (c) is red. Per the hard boundary, I did NOT touch the fixture, did NOT widen the sweep to
  hide them, and did NOT re-bless. They stay red and tracked; the (c) leg is the orchestrator/Brad's call.
  (Orch note applied: the 2018f966 SPINE-6 manifest treeState re-hash was ALREADY graded outcome-inert by the
  orchestrator — not re-derived here, not re-blessed.)

## Unresolved

None in the coder's scope. The ONLY red remaining in the sweep is the realizationGolden T1/T2 lowerer gap,
which is explicitly OUT of this item's door scope (separate leg, Brad's call). All six adversarial defects
(D1 BLOCKER, D2 MAJOR, D3/D4 MINOR, D6/D7 LOW) are closed and proven by base-vs-head measurement.

---

TARGET1-WELLSFIX-FIX2 DONE f9c1857bca4e767963a201025387293ea5a8ec18
