# L2-PROMPT2-SCIENCE-CHAIN-1 — u11witness2 (fold-path bind witness, rewrite)

## u11witness2 disposition
- The b6843d84 leg was the wrong shape: ONE `orchestrator.run(...)` with hand-built
  `clarificationAnswers` and no prior turn. The deterministic fold arm needs a HELD intent
  from a first run; with none, the run took the plain model path, returned 0 events, and the
  bind call site `AgentOrchestrator.ts:1646` was never reached. Measured failure was
  `AssertionError: expected 0 to be greater than or equal to 1` at the events-length assert.
- Replaced the leg (:737-782) in full with the proven two-run fold witness (ported from the
  :517 pattern, same `it` title):
  run 1 `add 50 uL of mystery goop to A1` holds the ambiguous intent
  (`first.clarificationRequests?.length > 0`, `model.callCount()===1`);
  run 2 answers with `requestId: first.clarificationRequests![0].id` (content-keyed
  `factRequestId`), `label: 'Test Reagent'`,
  `ref: { id: 'MAT-test-reagent-1', kind: 'record' }`.
  Asserts: `model.callCount()===1` after run 2 (ZERO new model calls = deterministic fold arm
  ran = `:1646` executed), `second.success`, exactly 1 event,
  `details.material_ref.kind === 'record'`, `.id === 'MAT-test-reagent-1'`,
  `String(id)` not `/^mint:/`.
- Commit (test file only): 4e1438ce551599c30c830e861a2e9e6f46073967.

## Verification (raw)
    $ cd server && npx vitest run src/ai/AgentOrchestrator.shorthandChat.test.ts
     ❯ src/ai/AgentOrchestrator.shorthandChat.test.ts  (21 tests | 1 failed) 931ms
       ❯ ... > the ONE forced tool grows exactly one new intent value with one shorthand arg
         → expected [ 'event_graph', 'deck_layout', …(11) ] to deeply equal [ …(10) ]
    Test Files  1 failed (1)
         Tests  1 failed | 20 passed (21)
  Sole failure is the documented pre-existing trunk baseline (tool-list drift: `answer` added to
  the enum; fails identically on trunk cl/integration-2). Our leg is GREEN, and the run log shows
  the fold arm:
    [agent cflko6] shorthand answer folded deterministically onto the held intent (run:RUN-shorthand-test) — no model call
    [agent cflko6] fold-path bound 1 material pick(s): event[0].material_ref=MAT-test-reagent-1 (ref)
    [agent cflko6] done shorthand-fold success=true events=1

    $ cd server && npx vitest run src/ai/AgentOrchestrator.foldbind.test.ts
     ✓ src/ai/AgentOrchestrator.foldbind.test.ts  (3 tests) 107ms
    Test Files  1 passed (1)
         Tests  3 passed (3)

## M1 mutation proof (bindFoldPicksOntoCompile body stubbed to a no-op)
`cp -a server /tmp/u11witness2-scratch`; body replaced with
`return { boundCompiled: compiled, bound: [], unbound: [...(answers ?? [])] };`
(call site `:1646` untouched, so it still RUNS); `config`/`schema` symlinked because the copy
sits outside the repo root. Raw:

    $ cd /tmp/u11witness2-scratch && npx vitest run src/ai/AgentOrchestrator.shorthandChat.test.ts -t "L2-PROMPT2-SCIENCE-CHAIN-1"
     ❯ ... > L2-PROMPT2-SCIENCE-CHAIN-1: fold-path bind drives bindFoldPicksOntoCompile — material_ref carries record ref
       → expected 'MAT-test-material-1' to be 'MAT-test-reagent-1' // Object.is equality
    AssertionError: expected 'MAT-test-material-1' to be 'MAT-test-reagent-1' // Object.is equality
    - Expected
    + Received
    - MAT-test-reagent-1
    + MAT-test-material-1
     ❯ src/ai/AgentOrchestrator.shorthandChat.test.ts:772:23
    stderr: [agent yl7vdx] fold-path 1 clarification answer(s) could not be bound to an event: unresolved-c-5220bb8a7a
    Tests  1 failed | 20 skipped (21)

RED as required (test-only units must fail when binding is disabled). Note the actual RED shape
differs from the brief's prediction ("stays a mint:/unbound"): with binding disabled the event
falls back to the spine-resolved material `MAT-test-material-1` (kind still `'record'`), so the
discriminating assertion is the answered-ref ID equality, not the `mint:` prefix. The bind call
site is still reached — the `unbound` log line is emitted from that path. Scratch removed
(`rm -rf /tmp/u11witness2-scratch /tmp/config /tmp/schema`).

## State
`git -c core.fileMode=false status --short` → only `?? node_modules`. No production file touched.

SCIENCE-U11WITNESS2 DONE 4e1438ce551599c30c830e861a2e9e6f46073967

L2-PROMPT2-SCIENCE-CHAIN-1 UNIT unit DONE 4e1438ce551599c30c830e861a2e9e6f46073967
