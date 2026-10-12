# CODER REPORT — SHORTHAND-CORPUS WS6 FIX (lane 2, l2t1325)

Item: SHORTHAND-CORPUS (WS6 repair inside the approved item)
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-12_1325-SHORTHANDCORPUS-ws6-fix-spec.md
Gate defect source: /home/brad/.hermes/cl/receipts/SHORTHAND-CORPUS/2026-10-12_1215-ws6-r4-tier2/REPORT.md (VERDICT: fix; criterion (c) + OBS-1)
Worktree: /mnt/vast/home/brad/git/wt/SHORTHAND-CORPUS-ws6fix-lane2-l2t1325
Branch: cl/SHORTHANDCORPUS-ws6fix-l2t1325 (off cl/integration-2 HEAD dc2dc206)
Status: BOTH defects fixed, RED-first, targeted suites green, zero new tsc errors.

## 0. Worktree setup note (honest, load-bearing)

`git worktree add -b cl/SHORTHANDCORPUS-ws6fix-l2t1325 …` reported "branch already
exists" — the branch existed at exactly the required base (dc2dc206 = cl/integration-2
HEAD) and no worktree was registered for it, so I reused it and registered the
worktree path the dispatch names. Verified: `git worktree list` shows
`…/SHORTHAND-CORPUS-ws6fix-lane2-l2t1325 dc2dc206 [cl/SHORTHANDCORPUS-ws6fix-l2t1325]`.

Two runtime artifacts were created in the worktree and are NOT committed:
- `node_modules` -> /mnt/vast/home/brad/git/computable-lab/node_modules (the same
  symlink pattern every other lane worktree uses; a symlink is not matched by the
  `node_modules/` gitignore rule, so it shows as untracked — deliberately unstaged).
- `server/schema` -> ../schema (+ `server/records`): the trunk checkout carries these
  as untracked runtime links; without them the server corpus suites fail with
  "scientist-intent vocabulary file not found" (proved: 5 failures before the link,
  16/16 pass after). This is environment parity, not a code change.

Lane-exclude parity: the trunk working tree depends on 61 untracked
"synced-from-main" paths listed in /home/brad/.hermes/cl/lanes/2/lane-exclude
(draftChanges.ts, ParameterAnswerInput.tsx, protocolStepText.ts,
shared/surfaces/registry.ts, shared/context/useSurfaceContext.ts,
server/src/ai/materialBinding.ts, …). A fresh worktree lacks them, so a fresh-tree
tsc reports 10 spurious TS2307 "Cannot find module" lines and QuestionsPanel cannot
even load. I copied all 61 from the trunk checkout into the worktree (they remain
untracked and are excluded by the shared excludesFile — `git status` shows none of
them). All baselines below are measured WITH that parity, base and head alike.

## 1. D1 — vendor Exa slash-menu tier gated on the declared integration flag

### First-hand verification before designing (spec requirement)

- `curl http://localhost:3093/api/config` (lane 2 backend, live) returns:
  `integrations.exa = { "enabled": true, "apiKey": "***", "baseUrl": "https://api.exa.ai", … }`
  So GET /api/config DOES carry `enabled`, and apiKey is REDACTED to `***` even
  when a real key is configured. Consequence: `enabled` is the only honest
  client-side signal; a redacted key must NOT be read as "disabled" (the lane's
  13-char placeholder key is what actually 502s, and the client cannot see it).
- Server semantics read first-hand (server/src/integrations/exa.ts:66-80):
  `normalizeConfig` returns null (disabled) iff `!config || config.enabled === false`
  or the trimmed apiKey is empty; `resolveExaConfig` then falls back to
  `EXA_API_KEY` env. Absent config = enabled.
- Client config access read first-hand: `useConfig` (app/src/shared/hooks/useConfig.ts)
  is a per-mount fetch used only by SettingsPage; `SemanticPassModelSection` calls
  `apiClient.getConfig()` directly. There is NO bootstrap config store
  (grep for ConfigProvider/configStore/bootstrapConfig/appConfig: zero hits). So the
  spec's fallback applies: fetch ONCE and cache — never per-query.

### Change

New file `app/src/shared/lib/integrationFlags.ts` (the single justified
config-access file the spec allows): `exaVendorEnabled()` performs ONE
`apiClient.getConfig()` per page load, caches the promise, and returns
`config.integrations?.exa?.enabled !== false` — the server's own rule, quoted in
the file's header, not a locally invented policy. A failed read falls back to
`true` (the server default) so a config outage never silently removes a
capability. `resetIntegrationFlagCacheForTests()` is the test seam.

`app/src/shared/taptab/slashMenu/resolvers.ts` — `appendVendorExaHits` now awaits
the flag before touching `apiClient.searchVendorExa`; disabled or aborted => no
request at all. The three call sites (material catalog tier, labware tier,
equipment tier) are unchanged, so the gate covers every slash-menu vendor path
including the material-clarification picker that fired the r4 502s
(ClarificationPicker.tsx:18 imports these resolvers directly).

Semantics honored: absent config/integrations/exa => today's behavior; only
`enabled: false` skips; enabled/true => byte-identical flow. No vendor Exa was
removed from any UI beyond the flag gate. No per-keystroke fetch (cached promise;
the flag read is shared by all resolvers).

Principle note: this is a capability gate on a declared config flag — the rule
lives in the config data and in the server's own normalizeConfig; the TS only
reads the declared value. No new knob, no second validator, no private table.

### RED-first evidence

`app/src/shared/taptab/slashMenu/resolvers.test.ts` — 3 new tests added BEFORE the
implementation; first run (implementation absent):

    Test Files  1 failed (1)
         Tests  2 failed | 16 passed (18)
    FAIL … integrations.exa.enabled=false: NO vendor search request fires …
    FAIL … integrations.exa.enabled=false: the labware and equipment tiers skip the vendor call too

After the gate: 18/18 pass. The disabled test asserts BOTH halves of the spec:
no `/vendor/exa/search` URL appears in the fetch spy AND the local/ontology
tier (tier-0 canonical-term hit) still streams in via onUpdate. The enabled test
asserts the vendor tier still fires exactly as before (zero behavior change).

`app/src/shared/lib/integrationFlags.test.ts` (new, 5 tests, all pass):
`enabled:false` => false; absent integrations / absent exa / absent enabled /
`enabled:true` => true; redacted apiKey does NOT flip the flag; exactly ONE
getConfig call across repeated reads; failed read => true (server default).

## 2. D2 (OBS-1) — chat-Accept pair carries ALL user turns of the current proposal

### First-hand verification

- Server seam read first-hand (server/src/api/handlers/IntentTrainingPairHandlers.ts:74-79):
  `userLines = [body.userPrompt, …thread user/assistant lines]`; the shorthand
  capture passes `userPrompt: userLines.join('\n')` to
  `captureShorthandPairToLocal` (server/src/corpus/shorthandCorpus.ts). So the
  EXISTING body fields already fold a multi-turn prompt — the client was simply
  sending one turn. Existing server tests already assert the fold
  (IntentTrainingPairHandlers.test.ts:47 + "includes user request + thread").
- Client POST body already supports `thread: Array<{role,content}>`
  (app/src/shared/api/client.ts:4033-4054). No new corpus client, no fork.
- The thread is ALREADY held client-side: chatReducer commits every user turn at
  send time (chatReducer.ts:20-21, useChatThread.ts:178-190) and AiTabPanel keeps
  `messagesRef.current = chat.state.messages` (AiTabPanel.tsx:781-782).

### Change (app/src/event-editor/right-pane/ai/AiTabPanel.tsx)

- New boundary marker `proposalStartIndexRef` (a message-count index, NOT a second
  store): set at every FRESH-proposal start site — `handleSend` when no preview is
  mounted (a send while a preview is mounted is a Revise and continues the current
  proposal), `sendSurfaceContext` (selection→AI seams), the protocol-builder
  `onDraft`, and the Extract-Protocol CTA. Clarification-answer turns
  (`handleClarificationsSubmit`) deliberately do NOT move it: they continue the
  proposal, which is exactly the r4 flow (draft prompt -> clarification answer).
- `captureAcceptedShorthandPair` now reads the user turns from the chat thread
  from that index onward, in order: `userPrompt` = the ORIGINAL drafting turn, and
  the subsequent refinement turns ride the existing `thread` field as
  `{role:'user', content}` entries (conditional spread — a single-turn proposal
  sends no `thread` key at all, byte-identical to before). Assistant turns are not
  part of the pair shape. `shorthandYaml` still rides verbatim; `acceptedGraph`
  still rides as provenance only.

### surfaceContext — honest report (spec: "if the client has none, say so")

The run-chat surface holds NO SurfaceContext for a typed drafting prompt. In
AiTabPanel, SurfaceContext objects exist only at the selection→AI seams
(`pdfSelectionToSurfaceContext`, `stepSelectionToSurfaceContext`, and the
SURFACE_AI_REQUEST_EVENT handler, AiTabPanel.tsx:1057-1109), and each is consumed
by `sendSurfaceContext` to build the prompt — none is retained for the turn that
later produces a shorthand draft. The gate's r4 flow was a typed prompt, so the
pair carries NO surfaceContext and I did not fabricate one. (The seam itself
supports it: TrainingPairBody.surfaceContext -> buildSurfaceContextCorpusEntry.)
If the architect wants surfaceContext on the typed-chat leg, that needs a
client-side surface-context builder for the run-chat surface — a separate,
architect-owned decision, not something I invent here.

### RED-first evidence

`app/src/event-editor/right-pane/ai/AiTabPanel.chatCorpus.test.tsx` — new test
added before the implementation; first run:

    FAIL … WS6 D2 (OBS-1): a two-turn proposal posts the WHOLE user-turn chain …
    AssertionError: expected 'Use [[material:MAT-dmem|DMEM]] for ma…' to be 'add 100uL of DMEM to A1:A12'
          Tests  1 failed | 3 passed (4)

After the fix: 4/4 pass. The test mounts the real thread shape the reducer commits
(drafting user turn, assistant clarification, answer user turn), emits the draft
on the ANSWER turn (as the SSE `done` does), Accepts, and asserts:
`userPrompt === 'add 100uL of DMEM to A1:A12'`,
`thread === [{role:'user', content:'Use [[material:MAT-dmem|DMEM]] for material.'}]`,
`shorthandYaml` verbatim, `commitPreview` once. The three pre-existing WS1 tests
(single-turn pair, no-shorthand captures nothing, failed post never touches
Accept) still pass unchanged — the single-turn case sends no `thread` key.

## 3. Verification (real output)

Targeted app vitest (17 files: resolvers, integrationFlags, AiTabPanel.{chatCorpus,
shorthandClarification,test,runPageSurface,protocolEdit,ledgerTurn,workstate,analysis},
ClarificationPicker, TermPanel, useChatThread.{agentAction,analysis,ledger},
ChangesPanel, QuestionsPanel):

    Test Files  17 passed (17)
         Tests  147 passed (147)
        Errors  1 error

`Errors 1` is PRE-EXISTING unhandled-exception debt, not mine: proven by stash
parity — with all four of my changed files stashed, `ClarificationPicker.test.tsx`
alone still exits with the identical `TypeError: Cannot read properties of
undefined (reading 'then')` at ClarificationPicker.tsx:215 (its own mock returns
undefined from a stubbed resolver) and `Errors 1`. Base and head are identical on
this line.

Wider blast-radius sweep (files that import resolvers / the vendor seam):
slashMenu/, shared/vendor-exa/, AddToDeckDialog.test.tsx, event-editor/material/,
ontologyCopilot/:

    Test Files  10 passed (10)
         Tests  91 passed (91)   (exit 0, no Errors line)

Server side (code UNTOUCHED — evidence only, after the server/schema runtime link):

    ✓ src/corpus/shorthandCorpus.test.ts  (6 tests)
    ✓ src/api/handlers/IntentTrainingPairHandlers.test.ts  (10 tests)
    Test Files  2 passed (2)   Tests  16 passed (16)

App tsc (`tsc --noEmit`), re-measured at MY base and head:

    base (dc2dc206 + lane-exclude parity): 28 error lines, exit 2
    head:                                   28 error lines, exit 2
    diff <(sort base) <(sort head) -> IDENTICAL: zero new error lines

Pin drift vs my memory of older lane pins (36/37 lines at other bases): the
difference is the lane-exclude parity, not my change — a fresh worktree WITHOUT
the 61 synced-from-main files shows 10 extra TS2307/TS7006 lines (missing
draftChanges, ParameterAnswerInput, protocolStepText, surfaces/registry) plus a
stale `useChatThread.deckLayout.test.tsx` onDeckLayout pair and a
`useSurfaceContext.ts` SurfaceId widening. Base and head here are pinned to the
same tree, so the comparison is exact.

## 4. Changed paths (git diff scope)

    app/src/shared/taptab/slashMenu/resolvers.ts                    +42/-16  (D1 gate)
    app/src/shared/taptab/slashMenu/resolvers.test.ts               +109     (D1 RED->GREEN, 3 tests)
    app/src/shared/lib/integrationFlags.ts                          NEW 40   (D1 config access — the single justified file)
    app/src/shared/lib/integrationFlags.test.ts                     NEW 68   (5 tests)
    app/src/event-editor/right-pane/ai/AiTabPanel.tsx               +50      (D2 turn threading + boundary marker)
    app/src/event-editor/right-pane/ai/AiTabPanel.chatCorpus.test.tsx +53    (D2 RED->GREEN, 1 test)

No server file, no schema, no config, no pairs.lane2.jsonl, no receipts touched.
No commit/push to trunk; work committed on the branch only.

## 5. Residual / for the orchestrator

- D1 removes the client-side 502 only when the config DECLARES the integration off.
  The lane's exa apiKey is still a placeholder (orch-verified in the r4 report);
  with `enabled: true` + a bad key the vendor tier still fires and still 502s.
  To make criterion (c) pass on the lane, the orchestrator must either set
  `integrations.exa.enabled: false` in the lane config (the honest switch the gate
  now honors) or supply a real EXA_API_KEY. I did not change any config.
- surfaceContext on the typed run-chat leg remains absent by design (see §2).
- Criterion (c) re-check needs a fresh browser run by cl-browser-reviewer; my pass
  is not the acceptance gate.

WS6FIX DONE <head-sha>
