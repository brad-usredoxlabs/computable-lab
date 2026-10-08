# PB-CH-10 — Analysis draft-args grounding (product-side) — CODER REPORT (l2t2120)

Worktree: /mnt/vast/home/brad/git/wt/PB-CH-10-lane2-l2t2120
Branch: pb-ch-10-lane2-l2t2120 off cl/integration-2 @ 973bb2de
Spec: .hermes/plans/2026-10-07_2015-PB-CH-10-analysis-draft-args-grounding.md (promoted spec, read fully)
Status: IMPLEMENTATION COMPLETE — acceptance pending orchestrator gate (orch-owned, out of coder scope)

## What landed (8 files, all in the spec's in-scope list)

1. `config/drafting/analysis-composition.yaml` — added the `grounding:` DATA section
   (`surfaces: [analysis, workspace.deck]`, `maxPerKind: 6`, `title: "ANALYSIS REFERENCES
   (the ONLY records compose_analysis may target):"`) + a header comment explaining it.
   Still loaded per call — NO process cache introduced (analysisCompile.ts:127-130 respected).
2. `server/src/ai/analysisReferenceGrounding.ts` (new, 185 lines) —
   - `loadAnalysisGroundingSection(policyPath?)`: reads the `grounding:` section per call.
     Absent section ⇒ null (feature off). `surfaces` absent or `[]` ⇒ null (push nowhere,
     zero scans). Present-but-malformed (bad cap/title/non-string surfaces) ⇒ throws honestly.
   - `buildAnalysisReferenceBlock(store, scan)`: for each kind in the policy's OWN
     `referenceKinds`, `store.list({ kind })`, sorted by recordId (code-unit ordering —
     byte-deterministic across locales), capped at `maxPerKind`; renders
     `- <kind> | <recordId> | <label>` lines (label = payload name/title/label, else
     recordId — same precedence as analysisCompile.ts:207-210), then appends the rule text
     from the prompt md. Nothing listable ⇒ null (never an empty block).
   - `buildAnalysisReferenceBlockForSurface(store, surface)`: the orchestrator entry —
     grounding section first, surface MEMBERSHIP read from DATA
     (`grounding.surfaces.includes(surface)`), store scan ONLY after the gate passes.
     `referenceKinds` come from the existing authority `loadAnalysisCompositionPolicy`
     (imported, not re-implemented — no second validator).
   - Rule text loaded from `server/prompts/analysis-reference-grounding.md` via a local
     cached loader (same promptCache asymmetry as systemPrompt.ts; systemPrompt.ts is LOCKED
     and its loader is private, so the new module owns its own copy for its own file).
3. `server/prompts/analysis-reference-grounding.md` (new, rule text as DATA) — the four
   spec-ruled rules + ONE shape example mirroring `analysis-intent.schema.yaml` oneOf
   exactly (revision+newRun branch and run branch, `operation: "compose-analysis"`).
4. `server/src/ai/AgentOrchestrator.ts` — ONE push site in `buildPrefixRequest`
   (the shared warm+real prefix path): block computed there and pushed LAST into
   `systemSections` (adjacent to FORCED_DRAFT_TOOL_INSTRUCTION per OQ1 ruling).
   `buildPrefixRequest` became `async` (the store scan is async; the block MUST be
   computed inside the shared prefix path per the warm/real parity bait).
   `run()`'s real path call site got `await` (it was already inside an async function).
5. `server/src/ai/types.ts` — `AgentOrchestrator.buildPrefixRequest?` signature →
   `Promise<Pick<...>>` (mechanical consequence; `WarmTarget.buildPrefix` already accepts
   `Promise<WarmPrefix> | WarmPrefix`, so AIHandlers.warmContext and RunDraftHandlers'
   warm requester needed ZERO changes — verified by reading both call sites).
6. `server/src/ai/AgentOrchestrator.surfaceVocab.test.ts` — mechanical `await` on the 4
   `buildPrefixRequest!` call sites + `async` on the 3 `it` callbacks (the only existing
   test file that calls buildPrefixRequest directly; grep-verified: no other test calls it).
7. `server/src/ai/analysisReferenceGrounding.test.ts` (new, 15 tests) — RED-first oracle.
8. This report.

## RED evidence (first targeted check, before implementation)

```
$ cd server && npx vitest run src/ai/analysisReferenceGrounding
 FAIL  src/ai/analysisReferenceGrounding.test.ts [ ... ]
Error: Failed to load url ./analysisReferenceGrounding.js ... Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```

Intermediate RED after module landed (proved the capture asserts real behavior, not
import success): `Tests 5 failed | 10 passed (15)` — capture arms failed with
"expected '## Current Context…' to contain 'ANALYSIS REFERENCES'" until the YAML
`grounding:` data section landed.

## GREEN

```
$ cd server && npx vitest run src/ai/analysisReferenceGrounding src/ai/attachedProtocol src/ai/AgentOrchestrator.surfaceVocab
 Test Files  3 passed (3)
      Tests  24 passed (24)
```
(15 new + attachedProtocol baseline 6 + surfaceVocab 3, baseline untouched-green.)

Test coverage per the oracle: block content per kind from a stub store; one `list()` call
per referenceKind; cap honored from DATA (maxPerKind: 2 ⇒ third id absent); absent
`grounding:` ⇒ null AND zero store scans; empty store ⇒ null; determinism (shuffled store
⇒ byte-identical block, recordId-sorted within each kind group); label fallback; policy
reader arms (real file present, absent ⇒ null, `surfaces: []` ⇒ null, malformed ⇒ throws);
capture arms: surface=analysis contains title + ANREV-000001/ANR-000001/DREF-L2PBCH5-RCPT1/
AOA-000001 + "NEVER put a raw record id" + "is NOT an analysis target" +
"biologist/knowledge-layer language"; surface=workspace.deck same block; surface=event-editor
⇒ block absent AND `listCalls` length 0; warm/real parity: `buildPrefixRequest` system
message byte-equal to the real `run()` capture; capture-level determinism across two runs.

## Capture-test excerpt (real outbound system message, surface=workspace.deck, stub store)

```
---

ANALYSIS REFERENCES (the ONLY records compose_analysis may target):
- analysis-revision | ANREV-000001 | Mitochondrial ROS assay v1
- analysis-run | ANR-000001 | ROS quantitation run
- data-reference | DREF-L2PBCH5-RCPT1 | Gate receipt plate data

ANALYSIS REFERENCE RULES:
- Target a listed record with {recordId: "..."} exactly as printed above — the compiler store-verifies it. An id you invent is rejected, never projected.
- A `term` is biologist/knowledge-layer language the lab resolver knows (a method, an assay, a concept). NEVER put a raw record id (RUN-, ANR-, ANREV-, DREF-, AOA-...) in a `term` field — a record id is not a term.
- A lab run id (RUN-...) is NOT an analysis target: "analyze this run" = target.revision {recordId: <a listed analysis-revision>} plus newRun {title} naming the run — the lab run itself is not an analysis-run.
- Exactly ONE target branch per proposal (schema oneOf):
  {"operation":"compose-analysis","target":{"revision":{"recordId":"ANREV-000001"},"newRun":{"title":"ROS quantitation on the gate plate"}}}
  {"operation":"compose-analysis","target":{"run":{"recordId":"ANR-000001"}}}
- When nothing listed fits, still call the tool with the closest listed {recordId} — the user reviews the card; nothing is written before Accept.
```
(Block rides after FORCED_DRAFT_TOOL_INSTRUCTION, joined by the existing `\n\n---\n\n`
section join; ids are the stub-store records mirroring real lane-store ids.)

## Pins (verbatim)

### tsc — `npm run typecheck -w server`
- Pristine HEAD (changes stashed via `git stash push -u -m pbch10-verify -- <paths>`):
  26 error lines (`grep -c '^src/'` = 26), 6 files:
  src/ai/AgentOrchestrator.ts, src/api/handlers/ProtocolIntakeHandlers.ts,
  src/api/handlers/RecordHandlers.ts, src/lint/AuthoringGuard.ts,
  src/scripts/bootstrapAdmin.ts, src/store/RecordStoreImpl.ts — matches the pinned
  26-line / 6-file baseline exactly.
- After changes: 26 lines, same 6 files. Position-normalized diff
  (`sed 's/([0-9]*,[0-9]*)//'` + sort, before vs final): EMPTY ⇒ zero new errors.
  Files: /tmp/pbch10-tsc-before.txt, /tmp/pbch10-tsc-final.txt.

### vitest src/ai — failing-FILE set parity
- Before (pristine HEAD): `Test Files 10 failed | 70 passed (80)`, `Tests 21 failed | 599 passed (620)`, 2 uncaught errors (AgentOrchestrator.goldenWithSeeds pre-existing).
- After: `Test Files 10 failed | 71 passed (81)`, `Tests 21 failed | 614 passed (635)`, same 2 pre-existing errors.
- `comm -3` of the FAIL-file sets (grep -oE 'FAIL  src/[^ >]+' | sort -u), before vs final:

```
(empty — identical)
```
Identical 10-file set: AgentOrchestrator.bypass, AgentOrchestratorForwarding,
AgentOrchestrator.golden, AgentOrchestrator.goldenWithSeeds, AgentOrchestrator.tubeGate,
ChatbotCompileDeckSlot, chatbotCompile.e2e, InferenceClient.config, materialFollowUp,
submitSuggestionTool.tubeSchema (all .test.ts). Net: +1 file / +15 tests, all new-green.

### Other checks
- `npx vitest run src/drafts src/analysis` → 11 files / 99 tests PASS (no compile-path change).
- `cd app && npx tsc --noEmit | wc -l` → 47 lines / 24 files BEFORE and AFTER, byte-identical
  output (stash/pop comparison). NOTE: the pinned "34" from the older PB-CH-5 spec does NOT
  match this trunk @ 973bb2de — the pristine-HEAD baseline here is 47/24 (the pin predates
  PB-CH-8 merge content in the lane-synced untracked app files). app/** is untouched by me;
  before/after identity is the meaningful pin. Flagging for the orchestrator.
- `cd app && npx vitest run src/analysis src/event-editor/right-pane/ai src/shared/session`
  → 3 failed files (ParameterAnswerInput, draftChanges, useChatThread.deckLayout — all
  lane-synced untracked scaffolding files with pre-existing tsc errors), 42 passed files,
  300 tests passed, 0 test failures. app untouched; no new failures.
- Lane scaffolding parity: replicated trunk's 95 untracked/ignored entries 1:1 (symlinks as
  symlinks into computable-lab, per the lane pattern); `comm -3` of trunk-vs-worktree
  untracked sets shows only `server/tmp/` (empty dir). server/node_modules is a symlink to
  /mnt/vast/home/brad/git/cl-integration-2/server/node_modules (mirrors
  wt/PB-CH-8-lane2-l2t1405's pattern exactly).

## Hardcode-boundary grep (reviewer bait)

`grep -nE "analysis-run|analysis-revision|data-reference|analysis-output-artifact|workspace\.deck|'analysis'|\"analysis\"" server/src/ai/analysisReferenceGrounding.ts server/src/ai/AgentOrchestrator.ts | grep -v test`
→ the ONLY hit is AgentOrchestrator.ts:2278, a pre-existing PB-CH-5 comment line (not mine).
Zero kind nouns, zero surface literals in the new module and in my orchestrator hunks
(doc comments reworded so even prose carries no literals). All membership/cap/title/kind
data comes from the policy YAML.

## Locked files respected

ONE forced tool untouched; `tool_choice` plumbing untouched; FORCED_DRAFT_TOOL_INSTRUCTION
text UNTOUCHED (verified: my hunks never touch it; the block rides after it);
submitSuggestionTool.ts untouched; analysisCompile.ts untouched (imported only);
every schema/** YAML untouched; buildSurfaceAwarePrompt untouched; app/** untouched;
deriveContextCacheKey untouched; tmp-orch/** never touched; no lane stack restarted;
no writes to receipts/specification/task-list.

## OQ1 status

Not escalated: I cannot run the live model from this worktree, so I cannot produce a real
capture showing the block present yet still no-usable-args. The deterministic capture above
shows the block IS present on both gate surfaces. If the orchestrator's gate run 4 fails
WITH the block verifiably in the prompt (check the `[agent …] promptChars=` jump in
.run/backend.log — expect ~+1KB on analysis/workspace.deck surfaces only), that is
model-side compliance per the run-7 rule and OQ1 escalation territory, not grounding.

## Assumptions recorded

1. `buildPrefixRequest` → async is the mechanical consequence of the spec's own requirement
   that the block be computed inside the shared prefix path (store scan is async). Warm
   callers needed no change (WarmTarget.buildPrefix accepts a Promise). types.ts +
   surfaceVocab.test.ts edits are the ripple of that one design point, both within the
   spec's in-scope file list (AgentOrchestrator.ts is listed; types.ts/surfaceVocab are the
   interface + its only direct caller — flagged for reviewer visibility).
2. `surfaces: []` treated as OFF (null, zero scans) rather than malformed-throw: an empty
   membership list means "push nowhere"; the negative arm pins it.
3. Determinism = recordId-sorted WITHIN each kind group, kind groups follow the policy's
   `referenceKinds` order (the spec's render example shows exactly this grouping).
4. The new module's prompt-md loader is a local copy of the (private, locked) systemPrompt
   loader — same forever-cache semantics; deployed lane stack needs a restart after merge
   for md edits (spec's stated asymmetry).
5. app tsc pin 47/24 at this trunk (vs the older spec's 34) — reported, not "fixed".

## Unresolved / for orchestrator

- Gate run 4 (gate-pbch5-run4.mjs, receipts 2026-10-07_orchgate4/) is orchestrator-owned
  and NOT run here (no lane-stack restart, no tmp-orch writes from the worktree).
- Deployed lane stack needs a restart after merge for the new prompt md to load
  (process-cached md; the YAML hot-reloads per call).
- Browser review: orchestrator dispatch.

## diff --stat vs base (973bb2de)

```
 .hermes/plans/PB-CH-10-report.wip-l2t2120.md       |  49 ++++  (this report; final version committed)
 config/drafting/analysis-composition.yaml          |  13 +
 server/prompts/analysis-reference-grounding.md     |   8 +
 server/src/ai/AgentOrchestrator.surfaceVocab.test.ts |  14 +-
 server/src/ai/AgentOrchestrator.ts                 |  26 +-
 server/src/ai/analysisReferenceGrounding.test.ts   | 303 +++++++++++++++++++++
 server/src/ai/analysisReferenceGrounding.ts        | 185 +++++++++++++
 server/src/ai/types.ts                             |   7 +-
 8 files changed, 593 insertions(+), 12 deletions(-)
```

Final commit hash: 41659c903b8aef7ae9a779b73db43209767bfec7 (branch pb-ch-10-lane2-l2t2120, 8 files, +760/-12 vs base 973bb2de)
