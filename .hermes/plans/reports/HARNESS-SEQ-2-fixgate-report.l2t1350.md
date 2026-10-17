# HARNESS-SEQ-2 — lane-2 browser acceptance gate re-shoot (tier-2) — receipts

Task: HARNESS-SEQ-2 (lane 2) — the chat drives the sequences surface via YAML-declared,
Ajv-validated `agent_action` frames (tab switch + record selection), with the fixed
DEFECT-1 `selectableKinds` gate and the DEFECT-2 guidance strengthening.
Reviewer: cl-browser-reviewer, READ-ONLY on the product tree (no edits, no restarts, no
process kills). All records touched are TEST DATA.

## Served candidate (verified before measuring)

- `git -c core.fileMode=false -C /mnt/vast/home/brad/git/cl-integration-2 merge-base
  --is-ancestor 646cbd38 HEAD` → **rc=0** (the fix1 commit IS an ancestor of HEAD).
  HEAD = `1b2b5ce94d3a3cf6c224e9d171683dfa21413206` ("merge(HARNESS-SEQ-2 fix1)", 2026-10-15 14:17 EDT).
- Served module: `curl http://localhost:5193/src/sequences/applyAgentAction.ts | grep -c selectableKinds`
  → **3** (the fixed client module is what Vite serves).
- frontend `http://localhost:5193/sequences` → 200; backend `http://localhost:3093` → 200.
- **Active AI profile = `qwen3.8-thunderbeast`** (baseUrl `http://thunderbeast:8080/v1`,
  model `qwen3.8-flash-next`) — the expected profile, so no BLOCKED on this ground.
  The chat's own progress prose confirms it ("Drafting on thunderbeast…").
- (raw: `served-revision.txt`; profile + activeProfile also recorded in `trail.json.run`)

## How this was driven

Deterministic Playwright (`node .mjs`, `import { chromium } from
'/mnt/vast/home/brad/git/cl-integration-2/node_modules/playwright/index.mjs'`, run from
`/mnt/vast/home/brad/git/cl-integration-2/app`) — `main.mjs` (run 1, as served),
`run2.mjs`, `run3.mjs` (controlled clean-conversation diagnostics). No `/api/chat`; the
stream is `/api/ai/assist/stream` driven through the real UI (`aside.sequence-chat`
textarea under `<label>Message</label>`, plain **Send** button, log
`.sequence-chat-messages`). **8 sends total** (the budget cap), all recorded.

Surface facts confirmed first-hand and used (NOT the run-page testids):
`[data-testid="Message"]` / `.chat-page__msg` do not exist here; the composer is the
`.sequence-chat textarea`, submit is the plain `Send` button, the log is
`.sequence-chat-messages`, the pane is `.harness-chat-pane`.

## Per-leg results

| leg | criterion | outcome | screenshot | md5 |
|---|---|---|---|---|
| C1 | chat request naming a declared TAB switches the visible tab via an `agent_action` frame, honest action line | **FAIL** (3 attempts: as-served, history=4, clean history=0) | `shots/02-c1-after-analysis-tab.png`, `shots/11-diag-c1-analysis-tab-clean-history.png`, `shots/13-diag-clean-c1-after-analysis-tab.png` | 0cb6531518fb4be1e27626b968f7960d / 839bb12d5acf7f62a390e4652ec8d177 / c9172161fbaa7a78246f7066b45ba563 |
| C2-neg | out-of-kind record → VISIBLE named refusal + ZERO state change | **PASS in a clean conversation; FAIL as served / with history** | PASS `shots/09-diag-c2neg-anr000001-clean-history.png` (2405d813b8d07f9b2ff06299f3bfbde5); FAIL `shots/03-c2-negative-anr000001.png` (5e1725cdaed8a81b8e6392f75420c477) | see cells |
| C2-pos | record that IS selectable (Library) → editor focuses it | **FAIL** (2 attempts, both with history; clean-history untested — budget) | `shots/04-c2-positive-library-seq.png`, `shots/10-diag-c2pos-library-seq-clean-history.png` | 9104f9ecfe10d11f81a59b68f7370c40 / 8b1803c71a15b90ebb7a9623ed9f808d |
| C3 | edit request → proposal for REVIEW, zero writes pre-accept | **PASS** | `shots/05-c3-proposal-for-review.png` | de84dce1c633d734228864f2be95d686 |
| C4 | leave-guard | **CLOSED per orch ruling** (unit pin green first-hand + honest browser observation) | `shots/06-c4-leave-attempt-record-switch.png`, `shots/07-c4-leave-route-navigation.png` | 9363628b1adb21ea59eaad051d0df0a7 / d5cc9abc76e76e9428e0079d66345b70 |

## What the browser actually showed, per leg

### C1 — FAIL (the tab never switches)

Three attempts, all ending with the Editor tab still active:

1. **As served** (`trail.json` step 2, run 1). Loaded `/sequences` fresh: the chat
   hydrated the **persisted** `sequences` thread (16 messages from earlier gates — see
   `shots/01-initial-sequences-open.png`). Sent "switch to the Analysis tab"
   (backend trace `jbxrxc`, `historyLen=16`). Result: the tab stayed **Editor**; the
   assistant replied **"Proposal ready for review in the sequence workspace."** and the
   editor flipped into a **spurious sequence proposal** ("Proposed sequence / oligo",
   Revision 1) carrying a red validation alert `Unrecognized sequence symbol '+' at base
   24. Keep modifications in the oligo specification.` (`shots/02-c1-after-analysis-tab.png`).
   No `agent_action`, no honest navigation line.
2. **With history** (`trail.json` step 11, run 2 clean-history diagnostic, by then
   `historyLen=4`; trace `8cazzo`). Identical failure: Editor active, "Proposal ready for
   review in the sequence workspace." (`shots/11-diag-c1-analysis-tab-clean-history.png`).
3. **Clean conversation** (`trail.json` step 13, run 3; `historyLen=0`; trace `9cqo0l`).
   Here the model DID call the forced tool on turn 1 (`turn 1 finish=stop contentLen=0
   toolCalls=1 [agent_intent]`) and the server **rejected the envelope**:
   `[agent 9cqo0l] done workspace_action compile-rejected MALFORMED_ENVELOPE` —
   chat text: `agent-action envelope rejected by the registered agent-action schema:
   /: Expected type: object`. The Editor tab stayed active; the Analysis panel never
   rendered (`shots/13-diag-clean-c1-after-analysis-tab.png`).

So C1 fails for two distinct reasons at the fixed revision: with any conversation history
the model answers with a `sequence_action` **draft** instead of a navigation intent; with
no history it emits a navigation intent whose envelope fails the registered agent-action
schema (`MALFORMED_ENVELOPE`). The tab-switch path is **never** exercised successfully.

### C2 — the fixed defect

**The fix itself is proven correct where the frame actually arrives.** In the clean
conversation (`trail.json` step 9, trace `4v654u`, `historyLen=0`), the model emitted a
valid focus action — `[agent 4v654u] done workspace_action compiled ok action=focus
target=ANR-000001` — and the client rendered exactly the intended refusal, naming the
kind and the declared kinds, with zero state change:

> `Record "ANR-000001" (kind analysis-run) is not a kind this page can select (it declares sequence, sequence_interval, oligo-spec). Nothing was changed.`

Evidence: `shots/09-diag-c2neg-anr000001-clean-history.png`. Verified in that turn:
Editor tab unchanged, editor showing a pristine empty "New sequence" form (no record id
hint, no selection), `role=alert` count **0**, and **no** `GET /api/sequences/authoring/ANR-000001`
(no authoring fetch — the only authoring GET in the whole session is the one my *manual*
Library click caused, `req-ci`). ✔ DEFECT-1 gate fix confirmed.

**As served, the refusal never happens.** In the as-served run (`trail.json` step 3,
trace `8xk70f`, `historyLen=18`) the same prompt produced **"Proposal ready for review in
the sequence workspace."** and another spurious sequence draft — no named refusal
(`shots/03-c2-negative-anr000001.png`). Same outcome with `historyLen=2`
(run 2 step 10, `shots/10-diag-c2pos-library-seq-clean-history.png` log tail). So the
as-served C2-negative leg FAILS: the user gets no refusal and no explanation, only an
unrelated proposal.

**C2-positive never passed.** "focus on record SEQ-827c4175a52a4ef65916eca5" (the real
Library sequence, 237 residues, label `pUC19 probe`) produced a sequence draft in both
attempts (`shots/04-c2-positive-library-seq.png` run 1 step 4, `shots/10-…` run 2 step 10);
the Editor tab stayed active and no record was focused. (Both attempts carried history; a
clean-history positive control was not run — the 8-send budget was exhausted. This is a
gap, recorded as such, not a pass.)

Note the **manual** path works, so the difference is the agent path, not the surface: a
plain click on the Library entry focuses the record correctly
(`shots/06-c4-leave-attempt-record-switch.png`; hint `SEQ-827c4175a52a4ef65916eca5 ·
Author: USR-BRAD`, focus header `Sequences — Editor · pUC19 probe`).

### C3 — PASS

"save this sequence GGATGCCATAG" landed as a **proposal for REVIEW in the editor**, not
chat prose: `shots/05-c3-proposal-for-review.png` shows legend `Proposed sequence / oligo`,
`Proposed changes Revision 4`, `Accept and save` / `Reject`, name `Untitled sequence
GGATGCCATAG` (proposed), 11 residues, compiler details. No accept was clicked; no
`POST /api/sequences/actions` was ever made (see zero-write proof).

### C4 — closed per the orchestrator ruling

Orchestrator ruling recorded verbatim as the basis: *"canLeave() block is NOT
browser-reachable in the block branch (incomplete only set by 5xx accept failure; a clean
proposal has canLeave()===true; firing the block would require a write fault — forbidden
by propose-never-write). Criterion 4 is satisfied by the EXISTING unit-proven block; the
gate accepts test-proof + honest browser observation for this leg."*

My browser observation (honest): with a pending proposal draft in the editor, a record
switch (click on the Library entry) **proceeded** — no prompt, no dialog, no block; the
draft was replaced and the record loaded (`shots/06-c4-leave-attempt-record-switch.png`).
Route-level navigation away also proceeded with no guard
(`shots/07-c4-leave-route-navigation.png` → `/ingestion/vendor-pdf/VPDF-5256F3288E3C`).
**Block branch not browser-reachable per orch ruling.**

Test proof, verified **first-hand** (not merely quoted): `cd app && npx vitest run
src/sequences/applyAgentAction` → **Test Files 1 passed (1), Tests 19 passed (19)**
(`vitest-applyagent.txt`), including the pinned
`a blocked record switch calls selectRecord anyway (guard INHERITED) and returns the
honest line` and the `canLeave() === false` strictness pin.
*Correction to the brief:* the referenced raw `.hermes/raws/seq2fix-green-applyagent.txt`
is **not present/readable** in the merged tree as of this review (the `raws/` listing shows
only `base-*` files), so I re-ran the suite myself rather than cite the raw.

## Zero-write proof

**No state-mutating write to lab data occurred.** Every non-GET/HEAD/OPTIONS request the
browser made, across all three runs (full list in `trail.json` →
`requests`/`requestsRun2`/`requestsRun3`):

| method | count | url | classification |
|---|---|---|---|
| POST | 8 | `/api/ai/assist/stream` | chat transport (the chat itself) |
| POST | 16 | `/api/ai/threads/sequences` | chat thread persistence (chat transport) |
| POST | 6 | `/api/drafts/compile` | **draft COMPILE** (propose-only; no store write) — caused by the spurious proposals in the failing legs |
| POST | 2 | `/api/ui/schema/…/protocol.schema.yaml/editor-draft` | schema/editor housekeeping on load |
| PUT | 4 | `/api/session` | session document persistence |

`POST /api/sequences/actions` (the write endpoint): **0**. Record writes (`POST/PUT/PATCH
/DELETE /api/records*`): **0**. Honest reading of the brief's `nonGetApiWrites = []`: it is
**not literally empty** — the list above is what the browser actually sent — but there are
no data mutations, and the compile POSTs are themselves a *symptom of the C1/C2 defect*
(the model's spurious proposals drive the editor's draft compile).

**sha-pair (before / after all sends), `GET /api/records/<id>` → `meta.contentSha`:**

| record | before | after |
|---|---|---|
| `SEQ-827c4175a52a4ef65916eca5` | `2e2eedba582b0e11eeec066bc9d792255a041c52` | `2e2eedba582b0e11eeec066bc9d792255a041c52` |
| `ANR-000001` | `23f80fa59fef876c510f34c443dc46be72e2cb4c` | `23f80fa59fef876c510f34c443dc46be72e2cb4c` |

Unchanged — propose-never-write holds.

## Defects

**D1 (C1) — a chat request naming a declared tab never switches the tab. HIGH.**
Where: `/sequences`, chat pane (`.sequence-chat`). Expected: the Analysis panel becomes
visible, `aria-pressed=true` on the Analysis tab, an honest action line in the log.
Actual: Editor stays active in all three attempts; the surface instead produces an
unrelated sequence proposal.
Evidence: `/home/brad/.hermes/cl/receipts/HARNESS-SEQ-2/2026-10-15_1420-fix-gate-tier2/shots/02-c1-after-analysis-tab.png`
(as served, history=16), `.../shots/11-diag-c1-analysis-tab-clean-history.png` (history=4),
`.../shots/13-diag-clean-c1-after-analysis-tab.png` (clean, history=0).
Root cause, split by condition (server traces in `backend-agent-lines.txt`):
 (a) `historyLen>0` → the model answers with prose then a **`sequence_action`** on the
 repair turn, so no navigation intent is ever compiled (traces `jbxrxc`, `8xk70f`,
 `kh52xg`, `evoo16`, `8cazzo`, `i3cp8s` — no `done workspace_action` line for any of them);
 (b) `historyLen=0` → the model DOES emit the navigation intent but the server rejects it:
 `[agent 9cqo0l] done workspace_action compile-rejected MALFORMED_ENVELOPE` with
 `agent-action envelope rejected by the registered agent-action schema: /: Expected type:
 object`. A tab request therefore cannot land even in the best case.

**D2 (C2-positive) — naming a selectable Library record does not focus it. HIGH.**
Where: `/sequences`, chat. Expected: the editor focuses `SEQ-827c4175a52a4ef65916eca5`
(Editor tab, record hint line, focus header `Sequences — Editor · pUC19 probe`).
Actual: a sequence draft is produced; no record is selected; the Editor shows the
proposal form.
Evidence: `.../shots/04-c2-positive-library-seq.png`, `.../shots/10-diag-c2pos-library-seq-clean-history.png`.
(Contrast the working human path: `.../shots/06-c4-leave-attempt-record-switch.png`.)

**D3 (C2-negative as served) — the refusal is not produced; a spurious draft is. HIGH.**
Where: `/sequences`, chat, `focus on record ANR-000001` with any conversation history.
Expected: the named refusal bubble + zero state change. Actual: "Proposal ready for review
in the sequence workspace." and a sequence draft; the red `'+'` validation alert appears
in the as-served run.
Evidence: `.../shots/03-c2-negative-anr000001.png` (as served), `.../shots/10-diag-c2pos-library-seq-clean-history.png` (log tail).
The refusal logic itself is correct — it renders exactly as specified in the clean
conversation (`.../shots/09-diag-c2neg-anr000001-clean-history.png`); the defect is that
it is unreachable once the conversation has history.

**D4 (honesty) — the chat log contradicts itself in the one turn where the fix fired. MEDIUM.**
Same turn (run 2 step 9): the assistant content ends
`Focused on PB-CH-5 review revision — nothing was written.` and the very next bubble is the
client's `Record "ANR-000001" (kind analysis-run) is not a kind this page can select (…).
Nothing was changed.` The server asserts a focus that did not happen; a user cannot tell
which line is true. Evidence: `.../shots/09-diag-c2neg-anr000001-clean-history.png`.

**D5 (narration) — the progress prose names the wrong tool on this surface. LOW.**
Every sequences turn narrates `Skipping compiler preflight; asking AI to call
compile_event_graph_draft directly…` / `waiting for compile_event_graph_draft…`, but the
forced tool on the sequences surface is `agent_intent` (the event-graph draft tool is not
what is called). Evidence: all shots' chat log, e.g. `.../shots/13-diag-clean-c1-after-analysis-tab.png`.

## Trail hygiene notes

- The as-served run loaded a **persisted** `sequences` chat thread (16 messages from
  earlier gates — `shots/01-initial-sequences-open.png`), and the product exposes no
  clear-history control on this surface; that thread is sent as conversation history on
  every turn. Runs 2 and 3 are labelled **controlled diagnostics**: the reviewer fulfilled
  only the `GET /api/ai/threads/sequences` **hydration** request with an empty message list
  (every POST — append and assist stream — was real) to isolate history priming. They are
  NOT the basis of the as-served verdict; the as-served legs are run 1.
- **md5:** 13 screenshots, 12 distinct md5. The one duplicate
  (`3ead4293d8baedb66017a2c23c8af499`) is `shots/08-diag-clean-initial-empty-log.png` and
  `shots/12-diag-clean-c1-before.png` — the *same state* (freshly loaded `/sequences` with
  an empty chat log), captured as the precondition of two separate diagnostic runs. Every
  post-action state is md5-distinct; no two different states share a hash.
- `consoleErrors`: only the two pre-existing React-Router future-flag warnings and the
  Vite/DevTools messages (run 1); `pageErrors`: none. Nothing attributable to these legs.
- No product file, config, process or git state was touched; all helper scripts and
  receipts live under this receipts directory.

## Honesty notes

- Every claim above cites a file in this directory (`trail.json`, `shots/*.png`,
  `backend-agent-lines.txt`, `vitest-applyagent.txt`, `served-revision.txt`, `run*.log`).
- The positive result for the fixed defect (C2-negative in a clean conversation) is
  reported as a PASS for that path and is NOT used to hide the as-served failures.
- The C2-positive clean-history leg was **not run** (8-send budget reached) and is recorded
  as untested, not as a pass.
- I did not seed, create or modify any record; the sha-pair is unchanged.

VERDICT: fix
