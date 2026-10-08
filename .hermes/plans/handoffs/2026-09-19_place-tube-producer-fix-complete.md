# Handoff — place_tube producer fix COMPLETE (issue 1 from 2026-09-18)

Date: 2026-09-19 (~02:20 EDT)
Session: Hermes architect profile architect-q38 (qwen3.8-flash-next @ thunderbeast:8080/v1)
Repo: /mnt/vast/home/brad/git/computable-lab — ALL CHANGES UNCOMMITTED (working tree)
Supersedes: 2026-09-18_surface-context-convergence-complete.md (open issue #1 closed here; #2-#5 unchanged)

## Root cause chain (verified in code + user's lab data)
Agent drafted place_tube details {tubeVolumeClass:'1.5ml'} — vocabulary bleed from
labwareRequirements.tubeVolumeClass enum in the SAME tool definition. Nothing stopped
it: tool schema details was shapeless (additionalProperties:true), parseEvents passes
details verbatim, and the persist gate can't catch it — event-graph.schema.yaml
$defs.PlateEvent.details = additionalProperties:true. plate-event.place-tube.schema.yaml
declared the right contract but NO live validated path referenced it (canonical
datatypes/plate-event oneOf omits tube schemas; known $ref namespace mismatch).

## What landed (3 waves, disjoint file ownership, all parent-verified)
### A. Producer steering
- server/src/ai/submitSuggestionTool.ts — tool schema advertises details.tube
  {sizeLabel, maxVolume_uL(excl. min 0), wellShape enum} (mirrors
  plate-event.place-tube.schema.yaml) + description explicitly forbids
  tubeVolumeClass/flat keys in event details. labwareRequirements.tubeVolumeClass
  PRESERVED (legit labware-selection vocab; guard test pins it).
- server/prompts/event-graph-agent.md — 3-line anti-drift paragraph under the
  place_tube JSON example.
- server/src/ai/submitSuggestionTool.tubeSchema.test.ts — 6 tests.

### B. Deterministic gate (canon: contracts + sizes stay DATA)
- schema/registry/tube-sizes/tube-size-presets.v1.yaml — 7 presets mirroring
  app/src/types/tubeSizes.ts; every tubeVolumeClass enum value is an exact hint.
- server/src/registry/TubeSizeRegistry.ts — zod loader + resolveTubeHint
  (normalizes case/spaces: '1.5 ml'/'1P5ml'/'1.5ml' all hit 1.5 mL preset).
  Note: does NOT reuse createRegistryLoader (mandates id key).
- server/src/ai/tubeEventDetailGate.ts — verb-routed (place/move/remove_tube);
  declared-prop pruning driven by Object.keys(schema.properties) read from the
  schema YAMLs at lazy init (no hardcoded key lists); repair ladder
  (prune tube keys -> tubeVolumeClass via registry -> nest flat sizeLabel) then
  validate via injected Ajv adapter; unrepairable DROPPED with reason, never
  silent. Non-tube verbs pass through untouched.
- Tests: tubeEventDetailGate.tube.test.ts (13) + TubeSizeRegistry.test.ts (6).

### C. Wiring
- server/src/ai/AgentOrchestrator.ts (+24) — AgentOrchestratorDeps gains OPTIONAL
  eventDetailValidator; submit path calls gateTubeEventDetails AFTER
  normalizeDraftMaterialRefs, BEFORE forceMaterialClarifications; dropped events ->
  visible notes "Dropped <verb> event <id>: <reason>". Gate OFF when dep omitted =>
  15 existing orchestrator test files unchanged.
- server/src/server.ts (+7) — placeholderDeps gets eventDetailValidator adapter over
  ctx.validator (single Ajv authority; mirrors RealizationCompileGate pattern in
  protocol-steps.ts).
- server/src/ai/AgentOrchestrator.tubeGate.test.ts — 3 tests: repair-through-full-loop,
  drop+note, gate-off regression guard.

## Live verification (not just tests)
- typecheck -w server exit 0; targeted vitest 28/28 + submitSuggestionTool 18/18.
- AgentOrchestratorForwarding.test.ts case (b) FAILS — PROVEN PRE-EXISTING by parent's
  own git-stash cycle (identical failure without the two production edits).
- Server restarted; boot clean: 159 schemas incl. all three plate-event.*-tube schemas
  in production Ajv.
- LIVE e2e: POST /api/ai/draft-events/stream "Place a 1.5 mL tube into A1 and B1" ->
  model emitted correct details.tube natively, gate passed both events, notes:[]
  (no false drops; fail-closed risk did not materialize).

## Deliberately NOT done (open, by choice)
1. Persist path still loose: event-graph.schema.yaml details=additionalProperties:true.
   Tightening = if/then routing to tube detail schemas AT PERSIST, but then the user's
   existing bad record fails re-save until migrated. Draft-gate covers the producer;
   consider persist-tighten + data migration together later.
2. Lab data still has the bad event:
   /home/brad/.computable-lab/worktrees/main
   records/runs/RUN-2026-09-12-run-9102/event-graphs/EVG-purelink*bd96fae*.yaml
   event evt-ag-mu7o7g0t-1 (tubeVolumeClass:'1.5ml', no at/t_offset — that
   missing-field violation ALSO passed because persist never validates details).
   Frontend resolvePlacedTube tolerates it (2026-09-18 fix). One-record YAML migration
   is trivial whenever the persist gate lands.
3. Lint DSL gap predates this: no per-item conditional predicates ("pending DSL
   support" in event-graph.lint.yaml). Ajv draft-gate was the pragmatic lever.

## Ops facts proven this session
- tsx --watch does NOT restart on touch (content-hash watch) and stays parked
  "Waiting for file changes" if you kill just the child — a genuine content change or
  full ./start-app.sh restart is the reliable lever. Boot takes ~40s.
- Gate module reads schema YAMLs at module-relative paths (../../../schema/...) —
  dist/ builds need schema/ outside server/ (already the layout).
- 2026-09-18 exec-bit noise persists: git diff --raw | awk '$1!=":100644"' is how to
  see real content diffs among the ~2001 mode-only files.
- Untracked pre-existing files NOT from this session (do not attribute here):
  server/src/schema/EventGraphEquipmentSchema.test.ts,
  server/src/surfaces/surfacesAjv.test.ts, the equipment:<kind>
  SUBMIT_SUGGESTION_INSTRUCTION line, app/ equipment+surface files.
- write_file/patch tools intermittently fail with '[Command interrupted]' on this NFS
  mount; python open() writes succeed — fall back to python for file creation here.

## Verification commands (all green at handoff)
    cd /mnt/vast/home/brad/git/computable-lab
    npm run typecheck -w server                                      # exit 0
    cd server && npx vitest run src/ai/tubeEventDetailGate.tube.test.ts \
      src/registry/TubeSizeRegistry.test.ts \
      src/ai/submitSuggestionTool.tubeSchema.test.ts \
      src/ai/AgentOrchestrator.tubeGate.test.ts                      # 28/28
    npx vitest run src/ai/AgentOrchestrator.test.ts                  # 11/11
    curl -s localhost:3001/api/schemas | grep -c 'plate-event.*tube' # 3
