# HARNESS-SEQ-2 fix2 — coder report (l2t1535) — navigation-intent reliability on /sequences

Task: HARNESS-SEQ-2 fix cycle 2 (spec `.hermes/plans/2026-10-15_1535-HARNESS-SEQ-2-fix2-navigation-spec.md`).
Worktree/branch: `/mnt/vast/home/brad/git/wt/HARNESS-SEQ-2-lane2-l2t1045` @ `cl/HARNESS-SEQ-2-lane2-l2t1045`.
Base: trunk `cl/integration-2` tip **b200a669** (merged into the branch first: fix1 tip 646cbd38 was behind trunk; merge commit b200a669 is the branch base — one untracked handoff file identical to trunk's tracked copy was removed to allow the merge, verified byte-identical via diff first).

Commits on the branch (this fix run):
- `db92f237` test(seq2fix2): RED — 5 gate pins fail against head source
- `8de277b4` feat(seq2fix2): GREEN — routing rule DATA + bullet, repair-nudge rule, narration, D4 note
- `98eb09ae` feat(seq2fix2): GREEN-2 — envelope-shape pin split DATA vs registry-driven bullet
- `32a8c6d2` test(seq2fix2): T5b — B-3 draft-channel preservation pin

Scope (`git -c core.fileMode=false diff --name-only b200a669...HEAD`, ⊂ owned set):
```
server/prompts/sequence-authoring.md                    (guidance DATA — the file fix1 646cbd38's guidance rides)
server/src/ai/AgentOrchestrator.ts                      (5 hunks: :1135 guidance bullet, :1438 + :1782 narration, :2037 repair nudge, :2774 D4 note)
server/src/ai/AgentOrchestrator.sequencesAgentAction.test.ts  (fix1's B4 pin file — extended)
```
Zero app/** files. `compileWorkspaceAction.ts` untouched (T1 proved the rejection leg correct). Refusal branches merged at b398db03 (g2d, :2488-2500/:2578-2767 territory) untouched — diff hunk headers above prove every hunk is outside them.

## Root-cause finding (first-hand, drives the mechanism)

The gate's hijack has a **server-side manufacturing leg**: the sequences repair nudge (`AgentOrchestrator.ts:2037`, blame 455232cfd) fired after any prose-stall turn and demanded `intent=sequence_action` **unconditionally**. The gate traces show exactly that shape (jbxrxc: turn 1 prose contentLen=331 toolCalls=0 → turn 2 agent_intent; 8xk70f same). Even when the model hesitated on a tab request, the nudge pushed it into the draft channel. Fixing only the system-prompt guidance would leave that nudge re-manufacturing the hijack on every stalled turn.

D4 first-hand: the bubble "Focused on PB-CH-5 review revision — nothing was written." is **server-generated prose**, not model prose: trace 4v654u logged `turn 1 finish=stop contentLen=0 toolCalls=1` (model emitted zero text) and the string is the note template at `:2772-2774` (blame ded96d73, fix1's own commit), rendered into the assistant bubble via `app/src/shared/hooks/useAiChat.ts:1117` (`done` event → `result.notes`). Guidance-only (OQ1's recommended leg) cannot fix that bubble; the spec's own D4 text pre-authorizes the alternative ("state 'Action sent — see the workspace.'"). Mechanism chosen: **server note replaced with the neutral line on the sequences surface only** (other surfaces byte-unchanged, pinned by `AgentOrchestrator.workspaceAction.test.ts` 'HepG2 Cell'/'unobtainium' legs — green). ASSUMPTION recorded: D4 mechanism = server-side neutral note + DATA prose rule for the model-prose case; NOT client suppression (B-7 respected — client honest line untouched, zero app files).

## Per-defect table

| defect | mechanism | evidence |
|---|---|---|
| **D1a** (history → draft hijack) | (1) Guidance DATA (`sequence-authoring.md`) declares the ROUTING RULE: tab/record-id request → `intent=workspace_action`, content change → `intent=sequence_action`, "chat history full of proposals does not change this rule". (2) The composed bullet (`:1135`) adds the routing rule with **negative examples generated from the registry tabs list** (`declaredTabs.map(tab => "switch to the ${tab} tab")` + `"focus on record SEQ-…"`). (3) The repair nudge (`:2037`) now carries the SAME routing rule instead of demanding `intent=sequence_action`. | RED T2/T5 → GREEN; stash proof re-REDs 5 legs; LIVE probe run3 leg B (historyLen=4 proposal-heavy): `[agent ffsy3j] done workspace_action compiled ok action=open-surface target=Analysis`, zero sequenceProposal |
| **D1b** (clean-history MALFORMED_ENVELOPE `/: Expected type: object`) | T1: `compileWorkspaceAction.test.ts` sequence-tab legs green at base → the rejection leg is correct, compiler untouched. Guidance pins the envelope: DATA rule "ONE JSON object … never a string, never an array" + "envelope carries ALL of its parts (verb + surface + target)"; the bullet carries the exact tab-switch envelope example **only when the registry declares tabs** (generated from `declaredTabs[0]`). | RED T2 → GREEN; probe run1 leg A rejected `UNSUPPORTED_SURFACE` (model omitted `surface`) with an honest named refusal and NO draft; probe run3 leg A (final code): `done workspace_action compiled ok action=open-surface target=Analysis` |
| **D2** (selectable record → draft) | Same routing rule + record-focus envelope example in the bullet (`{kind:"sequence-record", recordId:…}` already fix1-carried; negative example "focus on record SEQ-…" now names the failure). | T2 pin; hijack closure proven live via the tab leg (same routing decision point); record leg is the browser gate's real-model re-probe |
| **D3** (refusal unreachable with history) | Same as D1a — the refusal channel itself was already proven correct (gate shots/09); making the frame arrive with history is the fix. | probe run1 leg B (pre-GREEN-2): turn 3 emitted `agent_intent` **workspace_action** (not a draft) even with proposal-heavy history — hijack closed; run3 leg B compiled ok |
| **D4** (server asserts an unapplied action) | Sequences-surface success note → neutral `'Action sent — see the workspace.'` (`:2774`, surface-scoped conditional); DATA prose rule: "on a workspace_action turn, assistant text must not describe workspace effects". Client honest line untouched. | RED (note pin) → GREEN; probe run3 both legs: `done result notes: ["Action sent — see the workspace."]` + `agent_action` frame carried to the client |
| **D5** (narration names wrong tool) | `:1438` and `:1782` status strings made surface-scoped: sequences → `agent_intent`, other surfaces byte-unchanged (their pin at `AgentOrchestrator.test.ts:146` stays green). | RED T3 → GREEN; probe raws: `Skipping compiler preflight; asking AI to call agent_intent directly…` / `AI request sent to thunderbeast; waiting for agent_intent…` |

## RED/GREEN pairs (raws `.hermes/raws/seq2fix2-*`)

- RED (`seq2fix2-red-targeted.txt`): `Tests 5 failed | 37 passed (42)` — T2, T2-flip, T5, T3, D4-note all fail against head source; `compileWorkspaceAction.test.ts` fully green (T1).
- Stash proof (`seq2fix2-stashproof.txt`): with only `AgentOrchestrator.ts` + `sequence-authoring.md` stashed (tests kept), the same 5 legs fail again → the GREEN depends on the source changes, not test edits.
- GREEN (`seq2fix2-green-targeted3.txt` / `seq2fix2-green-final.txt`): targeted 8-file battery `Test Files 8 passed (8)`, `Tests 134 passed (134)` (133 + T5b).
- GREEN-2 intermediate (`seq2fix2-green-targeted2.txt`): caught a real regression — hardcoding the `sequence-tab` envelope in the DATA file broke fix1's B4 no-tabs leg ("no invented vocabulary"); fixed by moving the exact example into the registry-driven bullet.

## LIVE probe (coder-side, cap 6 sends — used exactly 6: 2+2+2)

Mechanism: `:3093` serves the TRUNK checkout (lacks my unmerged fix), so I ran my own backend from THIS worktree on spare port **3096** (fix1's precedent was a lane-local vite), same lane-2 data dir + lane-2 config + active profile `qwen3.8-thunderbeast` (`model=qwen3.8-flash-next` in every trace line). `:3093`/`:5193` never touched (verified 200 after teardown); 3096 released. Driver `.hermes/raws/seq2fix2-probe.mjs` POSTs `/api/ai/assist/stream` surface=sequences with `history` inline (the real thread mechanism's payload shape; no thread writes).

- run1 (`seq2fix2-probe-run.txt`, pre-GREEN-2): leg A `2lt8va` compile-rejected `UNSUPPORTED_SURFACE` (honest named refusal, zero draft); leg B `zj3nd7` turn 3 `agent_intent` → `compile-rejected UNSUPPORTED_SURFACE` — **workspace_action intent emitted with proposal-heavy history, no draft** (hijack already closed; envelope-shape slip remained).
- run2 (`seq2fix2-probe-run2.txt`): leg B `7a21b3`: **`done workspace_action compiled ok action=open-surface target=Analysis`** with historyLen=4 proposal history; leg A hit a model tool-name hallucination (`workspace_action` as tool name) + upstream `terminated` — model nondeterminism recorded honestly.
- run3 (`seq2fix2-probe-run3.txt`, FINAL code): leg A `pohtse` **`done workspace_action compiled ok action=open-surface target=Analysis`** (agent_intent hallucination self-corrected on the repair turn); leg B `ffsy3j` **same line with proposal-heavy history**. Both legs: `agent_action` frame `{"action":"open-surface","surface":"sequences","target":{"kind":"sequence-tab","tab":"Analysis"}}`, zero diagnostics, zero sequenceProposal, notes `["Action sent — see the workspace."]`.

Zero-write proof (sha-pair before/after all 6 sends, `GET /api/records/<id>` → `meta.contentSha`):
| record | before | after |
|---|---|---|
| SEQ-827c4175a52a4ef65916eca5 | `2e2eedba582b0e11eeec066bc9d792255a041c52` | `2e2eedba582b0e11eeec066bc9d792255a041c52` |
| ANR-000001 | `23f80fa59fef876c510f34c443dc46be72e2cb4c` | `23f80fa59fef876c510f34c443dc46be72e2cb4c` |

## Verification bars

- Targeted suites: RED 5-fail → GREEN 134/134 (pairs above).
- `npm run typecheck -w server`: **1 error, identical to base** (`AgentOrchestrator.ts(345,18) TS2339` — pre-existing trunk drift, present in `seq2fix2-base-server-tsc.txt`); comm of error sets empty → **zero new** (`seq2fix2-head-server-tsc-final.txt`).
- Full server suite failing-FILE-SET: base 90 files (`seq2fix2-base-failfiles.txt`), head-final 92 (`seq2fix2-head-failfiles-final.txt`). Delta = {ZymoCampaignGoldenE2E, W25DraftLifecyclePromotion, Qms6bSchemaDrift}: all three pass STANDALONE (`seq2fix2-flap3-isolated.txt` 25/25; `seq2fix2-green-t5b` run context), and `grep -l` proves none of the delta files reference `AgentOrchestrator`, `sequence-authoring`, or `assist/stream` (zero coupling). Stash-parity run with MY CHANGES STASHED (i.e. base code) failed **93** files (`seq2fix2-stashbase-failfiles.txt`) — strictly more than head — including W25DraftLifecyclePromotion + Qms6bSchemaDrift, and FoundryCoderPatch (fails at base, passes at stashbase with identical code) — direct proof these integration files flap run-to-run independent of my changes. No owned file appears in ANY failing set (base, stashbase, head).
- Scope: `git diff --name-only b200a669...HEAD` = 3 files, all owned (list above).

## Bait audit

- **B-1** `agent-action.schema.yaml` byte-identical: `git hash-object` = `90fcb86857a08ea686f5b5e1b7d4270a8c714bad` before AND after (measured at base and at HEAD).
- **B-2** no hardcoded tab names in guidance: T2-flip test swaps the registry to `['Alpha','Beta']` → guidance emits `"switch to the Alpha tab"`/`"switch to the Beta tab"` and CANNOT contain `"switch to the Analysis tab"`; envelope example uses `declaredTabs[0]`. `surfaces.yaml` untouched (`hash-object 095298d0279d9cd88687695600f488b118e2a1ea`).
- **B-3** draft channel preserved: existing 'REGRESSION (drafting preserved)' leg green + NEW T5b pin (prose-stall repair path still drafts a content-change request: `sequenceProposal {operation:'save_sequence'}`, zero agent_action) + probe legs show zero proposal suppression only for navigation requests.
- **B-4** g2d refusal branches untouched: diff hunks at :1135/:1438/:1782/:2037/:2774 only; `AgentOrchestrator.reviewWriteWall.test.ts` green in the battery.
- **B-5** zero app files (scope diff above).
- **B-6** `goldens/MANIFEST.yaml` hash `fbf743ab1384778de43eeb113da0f0857eef9fce` identical before/after.
- **B-7** client honest line untouched (zero app files); only server prose changed.

## Assumptions

1. D4 mechanism = server-side neutral note (sequences surface only) + DATA prose rule for model prose — chosen in-scope per OQ1 delegation; justified first-hand (trace 4v654u contentLen=0 → the bubble was the server note, so guidance-only could not fix it).
2. The sequences repair nudge is guidance-text (a message string), not a refusal branch — rewriting its text is inside the owned "guidance strings" contract; the g2d refusal branches were not touched.
3. Live probe ran on a self-started worktree backend :3096 (lane-2 data/config) because :3093 serves trunk code without the unmerged fix; :3093/:5193 untouched and verified up after teardown.
4. Model envelope-shape emission is nondeterministic (run1/run2 legs show surface-omission and a tool-name hallucination); the strengthened envelope pin reduced it (run3 both legs clean), but the real-model leg remains the browser gate's.

SEQ2FIX2 DONE
