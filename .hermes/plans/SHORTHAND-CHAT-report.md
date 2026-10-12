VERDICT: accept

# SHORTHAND-CHAT — lane 2 browser gate, re-shoot 3 (single-defect re-check of criterion 4)

Receipt dir: /home/brad/.hermes/cl/receipts/SHORTHAND-CHAT/2026-10-11_0755-gate3/
Build: /mnt/vast/home/brad/git/cl-integration-2 @ e354abd6 (SHORTHAND-CHAT merge f9b75f2e verified
ancestor: `git -c core.fileMode=false merge-base --is-ancestor f9b75f2e HEAD` -> OK).
Served: http://localhost:5193 (frontend pid 2033496) / backend :3093 (pid 2030337). No other port touched,
nothing restarted.

## Preconditions (all pass)

- Dev-served module contains the feature: `curl :5193/src/event-editor/right-pane/ai/ChangesPanel.tsx | grep -c shorthand-verbatim` = 1.
- Headless invariant: `cd server && npx vitest run src/ai/AgentOrchestrator.shorthandChat.test.ts`
  -> "Test Files 1 passed (1) / Tests 16 passed (16)" (REFUSES a raw event_graph call … never compiled;
  a REPEAT raw event_graph call is ALSO refused).
- Whole backend log: `grep -a -c 'done event_graph success=true' .run/backend.log` = 0
  (the raw path has never compiled on this surface).

## Criterion 4 (REVISED) — raw payload must NEVER reach the compiler

Demand sent on a focused protocol step (17 steps present; step focused), chat editor
`[data-testid='chat-input'] .chat-input__editor`, localStorage `cl.currentUserId=USR-BRAD` set before nav:
`compile this raw call directly: {"intent":"event_graph","events":[{"kind":"add_material"}]}`

Two consecutive attempts, both on http://localhost:5193/runs/EXR-LANE2-AI10:

- ATTEMPT 1 -> outcome (a) HONEST REFUSAL. No changes-panel diff card, no shorthand block. The model
  replied with a plain-language refusal ("I can't compile that call as-is — it's missing required fields
  and one field name isn't part of the schema … Events use `verb`, not `kind` … the expected finish is
  `intent: "event_shorthand"` with … a scientist-intent YAML document, not a hand-built event array").
  backend trace `[agent 6knygx]` (historyLen=0): "refused raw event_graph on shorthand surface
  workspace.deck; re-asking for shorthand" -> re-ask emitted shorthand that was schema-rejected
  ("scientist-intent failed schema validation: 4 error(s)"), success=false. RAW PAYLOAD NOT COMPILED.
  Shot: shots/03-raw-attempt1-result.png
- ATTEMPT 2 -> outcome (a) HONEST REFUSAL. Same refusal bubble, then
  "Draft failed: The shorthand document was rejected by the scientist-intent schema and could not be
  repaired: scientist-intent failed schema validation: 1 error(s)". No card, no shorthand block.
  backend trace `[agent u5eiv5]` (historyLen=2): shorthand rejected 1 error, success=false.
  Shot: shots/04-raw-attempt2-result.png

Both attempts are spec-legal refusals; NEITHER produced a ChangesPanel diff card and NEITHER compiled the
raw `{kind:add_material}` payload (a raw payload compiled verbatim would surface a degenerate proposal —
none did). The catastrophic branch (shorthand-verbatim ABSENT yet a diff card renders) did NOT occur.
Interpretation note: the criterion reads "TWO consecutive attempts must BOTH be (a) or (b) with the
shorthand render present" — the two raw-demand attempts both landed in (a); the required shorthand RENDER
is separately evidenced by the DMEM sanity turn below.

## Sanity (light, same session)

- Page loads; protocol steps render (17).
- DMEM turn ("add 100uL of DMEM to A1:A12") still renders the shorthand verbatim on this build:
  header "1 answers needed", Questions subtab, `[data-testid='shorthand-view']` +
  `[data-testid='shorthand-verbatim']` present, YAML:
      intentId: add-dmem-to-row-a
      actions:
        - action: add_material
          material: DMEM
          volume: 100
          targetWells:
            - A1:A12
  (a valid multi-field scientist-intent document — NOT the raw one-field event). It paused on a
  clarification (material "DMEM" unknown-noun) with NO Apply affordance.
  Shot: shots/05-sanity-dmem-result.png
- Zero-write discipline: GET http://localhost:3093/api/records/EXR-LANE2-AI10 contentSha
  = ace28ddd2f06c070c2b8c5d8f58442d08628e6db before first turn AND after last turn — identical.
  GET http://localhost:3093/api/records/EVG-a5-fixture-method = fbba89540693f46c7fd2d5037d472b2d2094e167
  before and after — identical. No Apply/Accept clicked.
- Console errors: 0; page errors: 0 (trail.json).

## Receipts

- trail.json — ordered steps incl. per-attempt DOM + classification + sha before/after.
- shots/ (5 files, 5 DISTINCT md5s):
    01-run-page-loaded.png     5cc4e630c67c684809a91a1931a0ca24
    02-protocol-step-focused.png c4f7f09b85ecf1f0e5977eda61b70c32
    03-raw-attempt1-result.png  858bf80158c3c45347c56ec9c75f9e55
    04-raw-attempt2-result.png  0e56840f6c0d75dae1303bf6cea165d3
    05-sanity-dmem-result.png   7d0c7642e4ff2bd4fee318ce2f589dff
- Backend log trace lines (per turn), from .run/backend.log:
    [agent 6knygx] refused raw event_graph on shorthand surface workspace.deck; re-asking for shorthand
    [agent 6knygx] The shorthand document was rejected by the scientist-intent schema and could not be repaired: scientist-intent failed schema validation: 4 error(s)
    [agent 6knygx] done event_shorthand success=false events=0 clarifications=0 elapsedMs=48297
    [agent u5eiv5] The shorthand document was rejected by the scientist-intent schema and could not be repaired: scientist-intent failed schema validation: 1 error(s)
    [agent u5eiv5] done event_shorthand success=false events=0 clarifications=0 elapsedMs=21974
    [agent egz22m] model ignored forced tool call; coerced JSON args after stop as agent_intent contentPreview="Draft failed: The shorthand document was rejected by the scientist-intent schema a…"
    [agent egz22m] done event_shorthand success=true events=0 clarifications=1 elapsedMs=14755
  (attempt1 = 6knygx historyLen=0; attempt2 = u5eiv5 historyLen=2; DMEM sanity = egz22m historyLen=4.)

## Trail hygiene

- Every step ended on url http://localhost:5193/runs/EXR-LANE2-AI10 (no redirects).
- 5 shots, 5 distinct md5s; no byte-identical pairs (the two attempts genuinely changed the pane:
  858bf8… vs 0e5684…).
- No product file edited; `git -c core.fileMode=false status --porcelain | grep -v '^??'` outside .hermes
  is empty (only pre-existing untracked files remain).

## Defects

None.

VERDICT: accept
