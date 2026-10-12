# SPEC — PROTO-AI-12 §4: shadow-router adapter at the submit-selection site (log-only, zero authority)

Status: DRAFT by orchestrator 2026-10-06T11:52 EDT. Remaining scope of PROTO-AI-12 (§1 serving and §3 telemetry writer are merged at cc5a3004; §2 pre-registration SIGNED by Brad 2026-10-06 — p95 router-pick ≤ 2000 ms appliance-2 CPU, five bullets as written). §4 ONLY is dispatched by this spec.

## Binding decisions (do not re-litigate)
- D5: the tiny model NEVER drafts payloads and NEVER writes records. Log-only shadow, measured spike-gate.
- §2 signed: thresholds are pre-registered; this adapter only accrues the paired corpus. Post-evidence threshold changes = re-registration.
- Kill-switch semantics (already shipped in §3): MISSING config = OFF; `enabled` must be explicitly true; endpoints are DATA.
- No raw prompts, no payloads in telemetry (hard boundary — the §3 writer already enforces via whitelist shape; the adapter must feed it only classification facts).

## Verified orientation (orchestrator, this tick, at trunk — cite in code comments)
- Config: `server/src/config/types.ts:218` `ShadowRouterConfig { enabled?, baseUrl?, model?, timeoutMs? (default 8000), telemetryPath? }`; loaded as `shadowRouter?` on the AI config (:174-178). §3 loader already parses it (`server/src/config/loader.ts`, merged).
- Telemetry writer: `server/src/ai/shadowTelemetry.ts` — `createShadowTelemetryWriter({enabled, eventsPath})`, `shadowTelemetryWriterFromConfig(config)`, `record(ShadowTelemetryInput)` NEVER throws; `ShadowRouterPick = 'event_graph'|'deck_layout'|'create_record'|'protocol_edit'|'timeout'|'parse_failure'|'unreachable'`. `correlationId` = the orchestrator's per-run `tid` — reuse, never re-mint (documented at :55-56).
- Adapter site: `server/src/ai/AgentOrchestrator.ts` — the submit-selection block at :1842-1862 (`selectSubmitCall` → `submitCall` → `onEvent tool_call`), then the intent branches at :1876 (create_record), :1915 (deck_layout), :1954 (protocol_edit); an agent_intent that matches none of these falls through as the event_graph draft path. The AUTHORITATIVE pick is derivable at the point AFTER the branches have chosen their path — the adapter records exactly what the big model did, not what the router wished.
- Serving (merged §1 notes, `.hermes/plans/PROTO-AI-12-serving-notes.md`): llama-server b9450, LFM2.5-350M QAD-Q4_0, CPU, appliance-2 `:8900` (`http://appliance-2:8900/v1`), restored 2026-10-06, /health ok. LFM natively emits bracket-notation calls — the classifier prompt must demand a single intent token and the parser must treat anything else as `parse_failure`.
- Latency budget: §2 signed p95 router-pick ≤ 2000 ms. Adapter timeout default 8000 ms from config; the CLASSIFICATION HTTP call gets `timeoutMs`, but the p95 that matters is measured from the telemetry (`routerLatencyMs`) — do not add a second timer.

## Design (exact)
1. New `server/src/ai/shadowRouterAdapter.ts` (+ sibling test): pure-ish module `classifyWithShadowRouter(deps, turn): Promise<ShadowRouterPick>`:
   - deps: `{ fetch: typeof fetch, config: ResolvedShadowConfig (baseUrl+model resolved, enabled true), telemetry: ShadowTelemetryWriter, bigModel: string }`.
   - Builds a CLASSIFICATION-ONLY prompt: the four intent names + a one-line gloss each, then the user turn text TRUNCATED to a small fixed window. NOTE the hard boundary: the telemetry never carries prompts, but this call SENDS the user text to the local router endpoint — it is the same host-local data path the big model already uses; no external host may be configured (validate baseUrl host is appliance-2/local? NO — do not hardcode hosts in code; the config is DATA and Brad's lane config controls it. Record this as an assumption if you make lane config point at appliance-2.)
   - Calls `{baseUrl}/chat/completions` (OpenAI-compatible, no tools) with `timeoutMs` AbortController; latency measured around it.
   - Parses: trim → lowercase → if it exactly equals or line-starts-with one of the four intent tokens, that pick; bracket-notation forms like `[intent]` accepted by stripping surrounding brackets/quotes; anything else → `parse_failure`; abort/network → `timeout`/`unreachable`.
   - NEVER throws: every failure path resolves to a ShadowRouterPick value.
   - `shadowRouteIfNeeded(...)`: fire-and-forget wrapper — `void classify(...).then(p => telemetry.record({...paired fields}))` — called WITHOUT await from the orchestrator so dispatch never waits on it. Zero write path: the module imports nothing that can mutate records; it is classification-only.
2. Orchestrator wiring at the submit-selection block: AFTER `submitCall` is chosen and the authoritative intent path is determined, call the fire-and-forget wrapper ONCE per turn, guarded by `writer.enabled`. Authoritative pick mapping: whichever branch executed (create_record/deck_layout/protocol_edit) else the event_graph draft path. Pass `bigModelLatencyMs` if the orchestrator already tracks turn latency; otherwise omit the field (exactOptionalPropertyTypes: absent OR value).
   - The wrapper must be positioned so a THROW in router code can never reach the user path: `void ...catch(() => {})` around the whole promise chain, in addition to never-throw internals.
3. Config plumbing: `shadowTelemetryWriterFromConfig` already exists; wire config → writer where AgentOrchestrator is constructed (find the construction site — AIHandlers or DI — and follow the existing config-passing pattern; cite it in code comments).
4. Kill-switch proof requirement: with NO shadowRouter block, ZERO inference calls fire (test spies fetch and asserts zero calls) AND zero telemetry lines. With `enabled:false`, same. With `enabled:true` + fetch failing, the user-visible result is bit-identical and one telemetry line with errorClass lands.

## Files
IN SCOPE: `server/src/ai/shadowRouterAdapter.ts` (+test); `server/src/ai/AgentOrchestrator.ts` (the minimal call-site wiring); the construction/wiring file named by (3); tests. Optional test fixture for a fake router HTTP server (vitest-mocked fetch preferred over a real server).
OUT OF SCOPE: telemetry writer changes, config loader changes (already shipped), prompts/, the schema/lint YAML (none), the client app, ANY change to dispatch logic order, PROTO-AI-13 (verdict tooling is a separate item), the serving deployment itself (already running).

## Acceptance criteria (task list verbatim)
> §4: integration test — correlated pairs logged for all four intents, dispatch behaviour bit-identical with shadow on/off, router timeout/malformed output cannot change user-visible result; kill-switch proof (off -> zero inference calls in log); p95 pick latency <= 2000 ms measured on appliance-2 CPU and logged in the handoff.

## First targeted check
Write `classifyWithShadowRouter` parsing unit tests FIRST (red-first): exact-token, bracket-notation, prose-garbage → parse_failure, abort → timeout, network-fail → unreachable. Then the kill-switch test (no config → fetch spy zero calls). Implement after RED.

## Verification (complete, with expected output)
1. `cd /mnt/vast/home/brad/git/cl-integration-2/server && npx vitest run src/ai/shadowRouterAdapter` → all pass.
2. Orchestrator integration: mocked router fetch resolves each of the 4 intents across 4 scripted turns → telemetry file contains 4 paired lines with correlationId matching the turn `tid`, authoritativePick matching the executed branch; with shadow OFF, the same runs produce byte-identical onEvent streams (capture and diff in-test or via a spy-equality assertion).
3. Real-endpoint p95: with appliance-2 :8900 up, run ≥50 real classification calls from the dev host against the fixture turn set (a short script under /tmp, NOT committed) and record p95 wall ms in the report — expected well under 2000 ms (§1 measured 94 ms per completion). If :8900 is DOWN at execution time, report BLOCKED for that clause only; do NOT fabricate.
4. Full `npx vitest run src/ai`: exactly 10 failed files / 21 failed tests (post-AI-15 baseline) + your new file green.
5. `npm run typecheck -w server` → 33 error lines, zero in new files.
6. Final diff stat: only in-scope files.

## Worker contract
- Worktree `wt/PROTO-AI-12-4-lane2-l2t<HHMM>` off current `cl/integration-2` HEAD; NEVER Brad's live tree. `git -c core.fileMode=false` for all git.
- Report (unique path): `.hermes/plans/PROTO-AI-12-s4-report.wip-l2t<HHMM>.md` — must include: red-first outputs, the bit-identical on/off proof, kill-switch outputs, real p95 number + timestamped evidence, diff stat, and the named construction-site file:line for the wiring.
- exactOptionalPropertyTypes: absent OR value, never undefined. No hardcoded URLs anywhere (config is DATA). One commit.

## Reviewer bait
- S1: ANY await of the router call in the dispatch path = authority leak (FAIL).
- S2: adapter positioned BEFORE the authoritative branch resolves → authoritativePick would be a guess (FAIL).
- S3: raw user text or payload reaching telemetry (FAIL — the writer whitelist helps but check what you pass).
- S4: a new timer/timeout distinct from config timeoutMs (policy belongs in config).
- S5: hardcoded appliance-2 host or port in code (declarative: config supplies it).
- S6: dispatch logic (selectSubmitCall, branch order) touched at all (FAIL — wiring only).

## Open questions
1. Where exactly AgentOrchestrator gets AIConfig (construction site) — worker verifies and cites; if there is NO clean injection seam, the smallest one consistent with existing DI patterns is in scope; if it requires new mutation semantics, STOP and return to orchestrator.
2. Classifier prompt wording: keep ≤ ~300 chars + glosses; no declarative home exists today (it is an adapter-internal technical prompt, not domain policy). If Brad later wants it in YAML, separate item.
