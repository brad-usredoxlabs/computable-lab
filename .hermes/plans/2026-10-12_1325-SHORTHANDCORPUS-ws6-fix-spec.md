# SPEC — SHORTHAND-CORPUS WS6 fix run (r4 defects, lane 2)

- Item: SHORTHAND-CORPUS (WS6 repair inside the approved item; gate r4
  receipts/SHORTHAND-CORPUS/2026-10-12_1215-ws6-r4-tier2/REPORT.md, VERDICT: fix).
- Coder: cl-coder, dispatch token l2t1325. Worktree
  /mnt/vast/home/brad/git/wt/SHORTHAND-CORPUS-ws6fix-lane2-l2t1325, branch
  cl/SHORTHANDCORPUS-ws6fix-l2t1325 off trunk cl/integration-2. ALWAYS
  `git -c core.fileMode=false`. NEVER Brad's tree / :3001/:5174 / :3093/:5193 / model services.

## Defects to fix (from gate r4, both orchestrator-verified first-hand)

### D1 [criterion (c)] uncaught 502 console errors from the vendor Exa search
Gate evidence: shots/15-clarification-suggestions.png, trail.json consoleErrors,
backend.log req-1y/req-23: POST /api/vendor/exa/search -> 502 EXA_SEARCH_FAILED
(HTTP 401 Invalid API key). Orch confirmed: lane2-config.yaml and Brad's live
config.yaml carry the SAME 13-char placeholder exa apiKey; ~/.hermes/.env
EXA_API_KEY is commented out. So ANY credential-less deployment deterministically
fails this call, and the browser logs a resource error the app cannot suppress
(client resolvers.ts:258 already .catch()es the rejection — the console line is the
network layer, not an uncaught JS error).

FIX = honest client-side config gate: the slash-menu vendor Exa resolver must not
fire the request when the integration is off, mirroring server
normalizeConfig semantics (server/src/integrations/exa.ts:65-78: disabled iff
`enabled === false`). Requirements:
- The app already loads config with integrations (app/src/types/config.ts:176;
  SettingsPage pattern app/src/shell/SettingsPage.tsx:273). First-hand-check what
  GET /api/config returns for integrations (apiKey redaction? enabled flag
  presence?) in YOUR worktree before designing the gate; do NOT assume.
- Gate `appendVendorExaHits` (app/src/shared/taptab/slashMenu/resolvers.ts:250-258)
  on the resolved exa-enabled state via the app's existing config access (NO new
  parallel config fetch per keystroke; reuse whatever bootstrap-cached config the
  app already holds; if none exists on the run page, fetch ONCE and cache — never
  per-query).
- Semantics: absent config/integrations/exa => behave as today (server defaults
  enabled). Only `enabled: false` (or a redacted-config signal you verify exists)
  skips. Zero behavior change when the integration is enabled.
- RED-first test: with integrations.exa.enabled=false the resolver issues NO
  searchVendorExa call and still yields ontology/local suggestions; enabled
  absent/true => call proceeds.

### D2 [OBS-1, binding pair-shape deviation] captured pair prompt = last turn only
Captured pair (orch jq-verified content): `prompt.user` = ONLY the clarification
answer turn ("Use [[material:...]] for material."), NOT the original instruction
("add 100uL of DMEM to A1:A12"), and NO surfaceContext. BINDING spec shape
(.hermes/plans/2026-10-11_0140-SHORTHAND-CORPUS-spec.md §BINDING): pair =
{ prompt (user turns + SurfaceContext) -> accepted shorthand }.

FIX: the chat-Accept POST (app/src/event-editor/right-pane/ai/AiTabPanel.tsx:862-874)
must carry the ORIGINAL drafting prompt plus the subsequent user turns that
refined it — lastShorthandDraftRef (AiTabPanel.tsx:366, :389) currently stores
only the last turn's prompt. Thread the conversation's user turns for the current
proposal (the thread is already held in chat state — reuse it, do not fork a
second store; the client POST body already supports `thread:
Array<{role,content}>` (client.ts:4033-4034) and the server handler folds
`thread` into userLines (IntentTrainingPairHandlers.ts:74-79) — verify first-hand
how the shorthand seam (shorthandYaml branch) builds the prompt and make the
client pass what's missing. Also attach `surfaceContext` if the panel already
holds it client-side for this surface — check what SurfaceContext the run-chat
surface can honestly provide; if the client has none, say so in the report
(DO NOT fabricate one).
- RED-first test: a two-turn flow (draft prompt + clarification answer) yields a
  POST body whose prompt carries BOTH user turns in order.

## Out of scope
- No server handler redesign; no new corpus client (binding: extend, don't fork).
- No model/profile changes. No edits to pairs.lane2.jsonl or receipts.
- Do not remove vendor Exa from any UI beyond the enabled-gate.

## Verification (orch battery at report time)
- Targeted app vitest suites (resolver test + AiTabPanel shorthand tests) green;
  app tsc no NEW errors vs your base (re-measure; report drift).
- git diff restricted to: resolvers.ts (+ its test), AiTabPanel.tsx (+ its test),
  plus whatever single config-access file the gate legitimately needs (justify in
  report).
Report: .hermes/plans/SHORTHANDCORPUS-ws6fix-report.wip-l2t1325.md, committed.
END MARKER: `WS6FIX DONE <head-sha>` or `WS6FIX PARTIAL <head-sha> BLOCKED <leg-id>`.
