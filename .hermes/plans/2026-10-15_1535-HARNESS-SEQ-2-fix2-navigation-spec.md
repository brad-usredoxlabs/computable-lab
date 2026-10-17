# HARNESS-SEQ-2 fix2 — navigation-intent reliability on the sequences surface (chat history must not hijack workspace actions)

LANE 2. Item: HARNESS-SEQ-2 (fix cycle 2 after the 2026-10-15_1420 tier-2 gate VERDICT: fix).
Spec by orchestrator l2t1535 directly from the gate report (no fresh recon; the gate report
+ this spec's first-hand cites ARE the orientation).

## Contract header

- Worktree/branch: SAME worktree `/mnt/vast/home/brad/git/wt/HARNESS-SEQ-2-lane2-l2t1045`,
  branch `cl/HARNESS-SEQ-2-lane2-l2t1045` (fix1 commits 62a7b7b5 + 646cbd38 live there and are
  already MERGED into trunk 1b2b5ce9). Before working: `git fetch` is not needed — instead
  verify `git -c core.fileMode=false log --oneline -1` in the worktree contains your fix1
  commits, then rebase-merge CURRENT trunk (the trunk contains your fix via merge 1b2b5ce9;
  if the branch lacks trunk's newer commits, `git -c core.fileMode=false merge cl/integration-2`
  into your branch first). Use `git -c core.fileMode=false` for ALL git (NFS mode noise).
- Base: trunk `cl/integration-2` (tip 01baf049 or newer; fix1 merged at 1b2b5ce9).
- File ownership IN:
  - `server/src/ai/AgentOrchestrator.ts` — ONLY the guidance strings for the sequences surface
    (the block around :1131 that composes the sequences-surface tool guidance), and the
    progress-narration strings named in Defect 5. Do NOT touch refusal branches (g2d merged
    at :2488-2500/:2578+ territory) or compile logic.
  - sequences-surface guidance DATA — whichever YAML/TS data file the guidance is composed
    FROM (find it: fix1 DEFECT-2 646cbd38 says "registry-declared vocabulary ... guidance-text";
    locate the exact data source and strengthen there, not in code).
  - their tests (`compileWorkspaceAction.test.ts` only if you prove a compiler leg is needed —
    default: NOT needed), the guidance-pin test fix1's B4 pin lives in, and new tests per plan.
- OUT (hard): `schema/workflow/agent-action.schema.yaml` (byte-identical — the schema is
  correct; B-1 pin below), `server/src/ai/compileWorkspaceAction.ts` UNLESS the T1 RED probe
  proves the rejection itself is wrong (evidence-hand-back if so), `app/**` (zero app files —
  the client refusal channel already works, proven by the gate's clean-history pass),
  all schema/** and config/** YAML except the guidance DATA file if it is YAML (then it moves,
  disclose it), goldens/MANIFEST.yaml (must NOT move).
- No browser work; the orchestrator owns the gate re-shoot.

## Goal (one line)

On `/sequences`, a chat request naming a declared tab or a record id MUST produce a compiled
`workspace_action` (tab switch / focus) or an honest named refusal — never a spurious
`sequence_action` proposal — EVEN when the conversation thread has prior proposal-heavy
history, and the narration must name the tool actually called.

## Defects from the gate (verbatim summary; full report: .hermes/plans/reports/HARNESS-SEQ-2-fixgate-report.l2t1350.md)

- D1 HIGH: "switch to the Analysis tab" never switches the tab. historyLen>0 → model answers
  with a `sequence_action` DRAFT (traces jbxrxc/8xk70f/kh52xg/evoo16/8cazzo/i3cp8s — no
  `done workspace_action` line at all). historyLen=0 → model emits navigation intent but
  server rejects `MALFORMED_ENVELOPE ... /: Expected type: object` (trace 9cqo0l,
  `done workspace_action compile-rejected MALFORMED_ENVELOPE`).
- D2 HIGH: naming a SELECTABLE Library record (SEQ-827c4175a52a4ef65916eca5) yields a draft,
  not a focus (both attempts had history; clean-history leg untested — budget).
- D3 HIGH: out-of-kind refusal (fix1's own defect) is UNREACHABLE with history — same hijack
  as D1 (refusal renders perfectly in a clean conversation: shots/09).
- D4 MEDIUM: honesty — the assistant bubble asserted "Focused on PB-CH-5 review revision" while
  the client bubble right after reported the ANR refusal. The server must not narrate an action
  it did not perform on the sequences workspace-action turn.
- D5 LOW: narration says "asking AI to call compile_event_graph_draft directly / waiting for
  compile_event_graph_draft" on EVERY sequences turn; the forced tool is `agent_intent`.

## Orchestrator first-hand findings (verified this tick at trunk 01baf049 — start here)

- The schema at `schema/workflow/agent-action.schema.yaml` declares `type: object` at root:
  the clean-history rejection `/` "Expected type: object" means the model sent a NON-OBJECT
  (likely a string-wrapped or array envelope) — an ENVELOPE-SHAPE slip by the model, not a
  schema defect. The guidance must pin the exact envelope; and the rejection message should
  echo the received payload shape honestly (if you touch that, it is a diagnostic-text change
  in compileWorkspaceAction.ts ONLY with T2 evidence; disclose).
- Sequences guidance is composed at `server/src/ai/AgentOrchestrator.ts` ~:1131 ("Use
  agent_intent with intent=sequence_action ...") — NOTE that line pushes the DRAFT channel;
  the navigation/record-selection channel guidance was strengthened by fix1 646cbd38 in DATA.
  THE HIJACK: with proposal-heavy history, "switch to the Analysis tab" reads like another
  drafting request and the model picks `intent=sequence_action`. The fix must make the
  ROUTING RULE data-declared and impossible-to-miss: name a declared tab or a record id →
  `intent=workspace_action`; sequence content change → `intent=sequence_action`. Include a
  negative example drawn from the actual failure ("switch to the Analysis tab" is NEVER a
  drafting request; "focus on record SEQ-…" is NEVER a drafting request). No kind/tab name
  literals beyond what registry data already provides — tab names must ride from the declared
  registry list (same DATA-first discipline as fix1 DEFECT-1; B-2 below).
- D5: locate the narration strings (grep "compile_event_graph_draft" in AgentOrchestrator.ts
  around the forced-tool mode) and make the sequences forced-tool narration name the ACTUAL
  tool (`agent_intent`), data-declared where a constant exists. Do not change other surfaces'
  narration.
- D4: sequences workspace_action turns must not emit assistant prose asserting an action
  before the client confirms application; the existing honest client line is the source of
  truth. Smallest fix: when a workspace_action compiled ok on the sequences surface, the
  assistant text must stay silent or state "Action sent — see the workspace." — NEVER name a
  target/verb the frame did not carry. Find where that prose originates (it came from the
  model's own assistant text in trace 4v654u; if it is model prose riding the stream, the
  honest fix is a guidance/data rule: on sequences workspace_action turns, assistant text
  must not describe workspace effects; the client line reports them).

## RED-first test plan

- T1 (D1b, server unit): feed the sequences surface the clean-history navigation proposal
  shape the model actually sent if recoverable from backend.log, else the minimal object
  envelope `{action:"open-surface", surface:"sequences", target:{kind:"sequence-tab",
  tab:"Analysis"}}` → compileWorkspaceAction compiles ok (this should already pass — if it
  REDs, the rejection leg is the bug; hand back with evidence).
- T2 (D1a, guidance pin): RED test that the sequences-surface composed guidance contains the
  routing rule with BOTH named negative examples and the registry-declared tab list; stash
  the data change → test goes RED (fix1 B4 method).
- T3 (D5): unit pin on the sequences narration strings naming `agent_intent`, not
  `compile_event_graph_draft`.
- T4 (D4): guidance/data pin per the chosen mechanism above.
- LIVE probe (your own, NOT the gate): with the lane-2 backend, drive `/api/ai/assist/stream`
  surface=sequences through the REAL thread mechanism twice: (a) empty history, tab request →
  expect a `done workspace_action compiled ok` line in the lane backend log; (b) history
  primed with a prior sequence_action proposal turn (construct the thread payload directly —
  you may POST to the lane-2 threads API, it is TEST data), same tab request → same expected
  log line. Record raws `shqa`-free prefix: `seq2fix2-*` under `.hermes/raws/`. This is the
  coder-side evidence that the hijack is closed; the browser gate re-proves it visually.
  Cap at 6 sends total; zero-write proof = contentSha pair unchanged for
  SEQ-827c4175a52a4ef65916eca5 + ANR-000001 (GET /api/records, before/after).

## Bait rules (you may NOT)

- B-1: change agent-action.schema.yaml (byte-identical; hash-object before/after in report).
- B-2: hardcode tab names or record kinds in TS guidance strings that are supposed to ride
  registry data (the flip test: mutate surfaces.yaml tabs list in memory in a test → guidance
  follows; if guidance can't, you hardcoded).
- B-3: suppress the model's draft channel entirely — sequence drafting must still work
  (pin: "save this sequence GGATGCCATAG" still produces a sequence_action proposal in T-plan;
  reuse the existing proposal test if one exists, else unit-pin the routing rule text).
- B-4: touch refusal branches merged at b398db03 (g2d) or the selectableKinds client gate
  (fix1) — regressions there fail the re-gate.
- B-5: change app/** (zero app files; cite `git diff --name-only` scope proof).
- B-6: move MANIFEST.yaml (hash-object identical).
- B-7: fix D4 by muting the CLIENT's honest line — the client line is truth; the server prose
  is what changes.

## Verification bars (raws .hermes/raws/ prefixed `seq2fix2-`)

- RED commit (tests only), then GREEN: targeted suites — server compileWorkspaceAction +
  the guidance/orchestrator test files you touched: `npm run test:run -w server` targeted,
  paste counts.
- server failing-FILE-SET equality vs branch base (you have base raws from fix1; recompute if
  the trunk moved under you).
- `npm run typecheck -w server` zero new. `git diff --name-only <base>...HEAD` ⊂ owned set.
- LIVE probe raws + sha-pair evidence (T-probe above).
- Report: `/mnt/vast/home/brad/git/wt/HARNESS-SEQ-2-lane2-l2t1045/.hermes/plans/reports/HARNESS-SEQ-2-fix2-report.l2t1535.md` —
  per-defect D1-D5 table with fix mechanism + evidence, RED/GREEN pairs, bait outcomes, scope
  diff, live-probe log lines. Commit on the branch. END with: `SEQ2FIX2 DONE <sha>`

## Open questions for the orchestrator (rule before coding if load-bearing; otherwise pick the smallest justified in-scope option and record it as an assumption)

- OQ1: D4 mechanism — server-side stream suppression vs guidance-only. Recommended: guidance-
  only (data), since the client honest line already dominates and suppression risks the g2d
  refusal prose. Coder may decide in-scope; record assumption either way.
