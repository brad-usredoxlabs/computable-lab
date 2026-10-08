# Realize the convert-ad-hoc-run-to-protocol vision: keep the event graph, gate the run tab on localization

## Goal
Make a bio lab's Monday→Tuesday workflow first-class: an ad-hoc execution run (plate of HepaRG + PPARα agonists/antagonists → GC fatty-acid analysis) can be promoted into a reusable protocol that **keeps its working event graph attached** (so it re-renders on the deck and bootstraps the next edit), and the run-editor Protocol tab offers **only protocols whose steps/labwares are actually localized** — with per-step "localize" prompting (including "reference our cell protocol" answers).

## Current context / verified facts (read the code today)
- **Promote-to-protocol already exists but DROPS the event graph.** `server/src/api/handlers/ProtocolPromotionHandlers.ts`: `POST /protocols/promote-from-run` AI-drafts a protocol from a run's events + deviations; `POST /protocols/create-from-draft` writes `kind: protocol, state: draft, evolvedFrom:[{sourceType:'run', sourceRef:{...execution-run}}]`, but the created `steps[]` are text-only `{stepId, action, ordinal}` — **no `subGraphRef`**, no labwares. The materialized event graph is fetched (`executionRunService.getMaterializedEventGraph(runId)`, line 114) but **never linked** into the protocol.
- **Frontend is wired + mounted.** `app/src/graph/execution/ExecutionView.tsx:251` mounts `PromoteToProtocolModal`; `handlePromoteToProtocol` (line 140) calls client `createProtocolFromDraft` (`app/src/shared/api/protocols.ts`), passing `_runId` (so the backend already has the run + event graph). Pure transformer `app/src/protocols/lib/protocol-from-execution.ts` maps events→text steps.
- **Schema**: `ProtocolStep.subGraphRef` (protocol.schema.yaml:798) currently allows ONLY `type: graph-component-instance` OR `type: event-graph` — it does **not** allow `protocol`/`local-protocol` (the "reference our cell protocol" answer), nor a plain `execution-run`-derived event-graph the promote path naturally produces. `evolvedFrom.sourceType` enum is `[run, event-graph, protocol]` (line 113).
- **Run-tab filter (from earlier this session)**: `server/src/protocol/ProtocolContextService.ts` (approvedUniversal/approvedLocal, lines 156-161) + client `ProtocolSelector.tsx` (`approved` predicate, lines 65-76) gate on `state` (`approved/effective/accepted/superseded`) only — **not** on localization readiness. Drafts are already hidden.
- **Localization reality (riff session conclusion)**: "localized" is a spectrum — a step is localized by (a) an AI-drafted event-graph, (b) a hand-built realization (`subGraphRef` → event-graph), or (c) **a reference to one of your protocols** (`subGraphRef` → protocol, with optional local notes). Universal is swappable lab-to-lab; local carries this-lab specifics (the Thermo incubator by the gas cannisters).

## Architecture / proposed approach
Extend the existing promotion + run-tab in three connected, YAGNI-respectful pieces:
1. **Keep the event graph on promote.** `createProtocolFromDraft` should set the created protocol's step(s) `subGraphRef` to the run's materialized event graph, and the protocol-level `evolvedFrom` should ALSO record the event-graph source. This makes a promoted protocol *pre-localized* and re-renders on the deck.
2. **Allow step→protocol references.** Widen `ProtocolStep.subGraphRef`'s `oneOf` to also accept `type: protocol` / `type: local-protocol` so a step can answer "reference our cell protocol" (concept realized by another protocol).
3. **Gate the run tab on localization readiness** instead of only `state`. A protocol is attachable when `state` is approved-ish AND every step is localized (`subGraphRef` present: event-graph, graph-component-instance, or protocol/local-protocol), OR the protocol has zero steps (a degenerate-but-acceptable case, or explicitly empty = not ready). Expose a computed `localizationReady` on the server context and filter on it client-side.

Phases are independent, each lands green + committed, TDD per task. No schema migration — all adds are additive.

---

## Phase 1 — Keep the event-graph realization on promote (server)
Net-new behavior: a promoted protocol's steps point at the run's materialized event graph.

### Task 1.1 — (RED) test: `createProtocolFromDraft` links `subGraphRef` → the run's event graph
File: `server/src/api/handlers/ProtocolPromotionHandlers.test.ts` (new; none exists — check: `ls server/src/api/handlers/ProtocolPromotionHandlers.test.ts`; if present, extend).
Mock `ExecutionRunService.getMaterializedEventGraph` to return `{ record: { id: 'EVG-run-1', events: [ /* 2 events */ ], labwares: [] } }`. Call `handlers.createProtocolFromDraft({ draft: { protocolName, steps:[{eventId:'e1',originalAction:'Add clofibrate'},{eventId:'e2',originalAction:'Load GC'}] }, derivedFromRunId: 'RUN-1' })`. Assert the created `protocolRecord.steps` have `subGraphRef = { kind:'record', type:'event-graph', id:'EVG-run-1' }` (or the step's realization ref points at the event graph). Run → fail (currently no subGraphRef written).

### Task 1.2 — (GREEN) implement: write `subGraphRef` + keep `evolvedFrom`
File: `server/src/api/handlers/ProtocolPromotionHandlers.ts`, inside `createProtocolFromDraft` (around line 193-218). The `eventGraphResult` is already resolved earlier? — it is NOT in `createProtocolFromDraft` (only in `promoteFromRun`). Resolve it here:
```ts
const eventGraphResult = await executionRunService.getMaterializedEventGraph(derivedFromRunId);
const egId = (eventGraphResult?.record as any)?.id;
```
Then in the steps map, add each step's realization ref:
```ts
steps: draft.steps?.map((step, index) => ({
  stepId: `step-${index + 1}`,
  action: step.correctedAction || step.originalAction,
  ...(step.deviationNote && { description: step.deviationNote }),
  ordinal: index + 1,
  // Concept → realization: the promoted step realizes the run's event graph.
  ...(egId ? { subGraphRef: { kind: 'record', type: 'event-graph', id: egId } } : {}),
})) || [],
```
And extend `evolvedFrom` to also record the event-graph source (keep the run record too):
```ts
...(egId ? [{ sourceType: 'event-graph', sourceRef: { kind:'record', type:'event-graph', id: egId }, reason:'Kept run event graph as the promoted protocol realization', evolvedAt: new Date().toISOString() }] : []),
```
Run Task 1.1 → pass. Verify compile: `cd server && npx tsc --noEmit`. Commit: `feat(protocol-promotion): promoted protocol keeps the run's event graph as subGraphRef realization`.

---

## Phase 2 — Allow a step to reference another protocol (schema add)
Net-new: `subGraphRef` may point at a `protocol` / `local-protocol` (the "reference our cell protocol" answer).

### Task 2.1 — (RED) schema conformance: a step with `subGraphRef → protocol` validates
File: `server/src/schema/CandidateMapperSchemaConformance.test.ts` (already runs the Ajv validator against protocol.schema.yaml). Add:
```ts
it('accepts a step whose subGraphRef points at a protocol (concept realized by another protocol)', () => {
  const result = validator.validate({
    kind: 'protocol', recordId: 'PRT-cellrox', title: 'CellROX',
    steps: [{ stepId: 'st1', label: 'Grow cells', ordinal: 1, kind: 'other',
      subGraphRef: { kind: 'record', type: 'protocol', id: 'PRT-cell-culture' } }],
  }, schemaId);
  expect(result.valid).toBe(true);
});
```
Run → fail (type `protocol` not in subGraphRef oneOf).

### Task 2.2 — (GREEN) widen the schema
File: `schema/workflow/protocol.schema.yaml`, in `ProtocolStep.subGraphRef` oneOf (lines 809-815) add:
```yaml
        oneOf:
        - type: object
          properties:
            type: { const: graph-component-instance }
        - type: object
          properties:
            type: { const: event-graph }
        - type: object
          properties:
            type: { const: protocol }
        - type: object
          properties:
            type: { const: local-protocol }
```
Run Task 2.1 → pass. Re-validate all schemas: `cd /mnt/vast/home/brad/git/computable-lab && node validate-schemas.js` → `protocol.schema.yaml: OK`. Commit: `feat(schema): protocol step subGraphRef may reference a protocol/local-protocol realization`.

---

## Phase 3 — Gate the run-editor Protocol tab on localization readiness
Net-new: attachable = approved-ish AND fully localized (every step has a realization ref), not just approved.

### Task 3.1 — (RED) server: `localizationReady` on the context
File: `server/src/protocol/ProtocolContextService.test.ts` (existing — extend). Add a fixture: an approved protocol with a step that has `subGraphRef` (ready), and an approved protocol whose step has NO `subGraphRef` (not ready). Assert `getContext({...})` returns them with a computed `localizationReady` flag: `true` for the ready one, `false` for the bare one. Run → fail (no such field).

### Task 3.2 — (GREEN) server: compute `localizationReady`
File: `server/src/protocol/ProtocolContextService.ts`. Add a helper + thread onto each returned protocol envelope:
```ts
function isLocalized(record: RecordEnvelope): boolean {
  const p = record.payload as Record<string, unknown> | undefined;
  const steps = (Array.isArray(p?.steps) ? p.steps : []) as Array<Record<string, unknown>>;
  // A protocol with no steps is not a usable localized recipe yet.
  if (steps.length === 0) return false;
  return steps.every((s) => {
    const ref = s.subGraphRef as { type?: string } | undefined;
    return ref && ['graph-component-instance', 'event-graph', 'protocol', 'local-protocol'].includes(ref.type ?? '');
  });
}
```
Map the returned `approvedUniversal`/`approvedLocal`/`projectTemplates`/`experimentProtocols` so each record envelope gains `localizationReady: isLocalized(record)`. (Do NOT change which records are returned — mark the ones returned.) Run Task 3.1 → pass. `cd server && npx tsc --noEmit`. Commit: `feat(protocol-context): mark protocols with every step localized via localizationReady`.
> Note: existing fixtures in ProtocolContextService.test.ts were just set to `state: approved` (this session) — Task 3.1's new fixture must give steps `subGraphRef` to get `localizationReady:true`.

### Task 3.3 — (RED) client: ProtocolSelector shows only `localizationReady`
File: `app/src/event-editor/right-pane/protocol/ProtocolSelector.test.tsx`. Extend the existing `approved-only` test (or add one): context with an approved+localized protocol (`localizationReady:true`) and an approved+bare one (`localizationReady:false`); assert only the localized one renders. Run → fail.

### Task 3.4 — (GREEN) client: filter on `localizationReady`
File: `app/src/event-editor/right-pane/protocol/ProtocolSelector.tsx`, lines 65-76. Replace the `approved` predicate usage with a readiness gate that ALSO requires localization:
```ts
const attachable = (p: { payload?: Record<string, unknown> | null }): boolean => {
  const state = p?.payload?.state as string | undefined
  const approved = state === 'approved' || state === 'effective' || state === 'accepted' || state === 'superseded'
  if (!approved) return false
  return p?.payload?.localizationReady === true
}
```
Use `attachable` in place of `approved` for both `projectProtocols` and `labProtocols`. (Server may drop non-localized ones from context anyway; belt-and-suspenders.) Run Task 3.3 → pass. `cd app && npx tsc --noEmit`. Commit: `feat(protocol-selector): run tab offers only protocols whose steps are localized`.

> Forward-compat: the per-step "localize" prompt (draft-with-AI / reference-a-protocol) is already surfaced by `StepInvestigationPanel` / `ProtocolTabPanel`; Phase 4 wires the *reference-a-protocol* answer into it.

---

## Phase 4 (adjacent, small) — surface "reference a protocol" in the step-localize prompt
Net-new: in the step localization panel, allow the answer "this step is realized by protocol X" (the riff's best answer). Reuse `subGraphRef`.

### Task 4.1 — (RED) test for the reference chooser
File: `app/src/event-editor/right-pane/protocol/StepInvestigationPanel.test.tsx` (exists, 8 tests). Add: rendering the panel with `availableProtocolRefs=[{id:'PRT-cell-culture', title:'Cell Culture'}]` shows a "Reference a protocol" action; picking it calls `onSaveRealization` (or `onCommitStepRef`) with `subGraphRef: { kind:'record', type:'protocol', id:'PRT-cell-culture' }`. Run → fail.

### Task 4.2 — (GREEN) add the reference action
File: `app/src/event-editor/right-pane/protocol/StepInvestigationPanel.tsx`. Add a `ProtocolReferencePicker` (or reuse the existing `ProtocolSelector`/`search` group) that, on pick, commits the step's `subGraphRef = { kind:'record', type:'protocol', id }`. This is the "Reference our cell protocol for this assay" answer — a concept step pointing at a concrete realization protocol. It patches the protocol step's `subGraphRef` (reusing the existing `patchStepSubgraph`-style write path, or a sibling `patchStepRef`). Run Task 4.1 → pass. `cd app && npx tsc --noEmit`. Commit: `feat(protocol-step): localize by referencing an existing protocol as the step realization`.

---

## Phase 5 — Full verification
### Gate
```bash
cd /mnt/vast/home/brad/git/computable-lab/server && npx vitest run src/api/handlers/ProtocolPromotionHandlers.test.ts src/schema/CandidateMapperSchemaConformance.test.ts src/protocol/ProtocolContextService.test.ts
cd /mnt/vast/home/brad/git/computable-lab && npx tsc --noEmit -p server/tsconfig.json
cd app && npx vitest run src/event-editor/right-pane/protocol/ProtocolSelector.test.tsx src/event-editor/right-pane/protocol/StepInvestigationPanel.test.tsx
cd /mnt/vast/home/brad/git/computable-lab && cd app && npx tsc --noEmit
```
Expected: all touched suites green; both typechecks clean.

### Live browser (manual, since extraction is a real LLM / run is real)
- Promote: open an executed run's Execution view → click "Promote to Protocol" → Create → fetch the new `PRT-*` and assert its `steps[].subGraphRef.type === 'event-graph'` and `evolvedFrom` includes the event-graph source. Command: `curl -s -H 'x-user-id: USR-LOCAL-ADMIN' http://127.0.0.1:3001/api/records/<PRT-id>`.
- Run tab: with a localized approved protocol and a bare approved protocol, open the run editor Protocol tab → assert only the localized one lists.

## Tests / validation summary
| Area | Command | Expected |
|---|---|---|
| Promotion keeps event graph | `ProtocolPromotionHandlers.test.ts` | created steps carry `subGraphRef → event-graph` |
| Schema subGraphRef→protocol | `CandidateMapperSchemaConformance.test.ts` | step with `type: protocol` subGraphRef validates |
| localizationReady server | `ProtocolContextService.test.ts` | approved+bare → false; approved+subGraphRef → true |
| Selector filters localized | `ProtocolSelector.test.tsx` | only `localizationReady:true` renders |
| Step references a protocol | `StepInvestigationPanel.test.tsx` | reference pick → `subGraphRef` protocol |
| Typechecks | server + app | clean |

## Risks, tradeoffs, open questions
- **SubGraphRef on a promoted named step:** the promote path produces text steps from raw events; attaching ONE event-graph ref to EACH step is a coarse approximation. If a run realizes multiple conceptual steps, a single per-step event-graph pointer may double-count. For v1 (YAGNI) assign each promoted step the run's whole event-graph ref; refine to per-step event slices later if needed.
- **`localizationReady` semantics for empty steps:** I chose "zero steps ⇒ not ready." If the biologist has a universal with steps but none localized, it's correctly hidden. A promoted protocol (Phase 1) is ready by construction (steps have subGraphRef). Confirm this matches intent: a universal you want to attach-and-localize-in-editor would be HIDDEN — is that desired, or should "bind and localize on the run" be a distinct affordance?
- **`subGraphRef → protocol` widening:** Ajv strict mode — adding two `oneOf` branches requires each to be a `type: object` (the existing two are). Validated by Task 2.1. The `datatypes/ref.schema.yaml` `type` enum may also gate — check whether it enumerates types (if so add `protocol`/`local-protocol` there too; the conformance test will catch it).
- **Two flags (state vs localizationReady):** both must hold. A protocol could be `approved` but not localized (universal recipe) OR localized but not approved. Keep both gates; the server returns the flag, the client filters on it.
- **`getMaterializedEventGraph` availability in `createProtocolFromDraft`:** currently only `promoteFromRun` calls it. Phase 1 resolves it in `createProtocolFromDraft` from `derivedFromRunId` — verify the service method's signature (takes runId) and that the run actually has a materialized graph (if not, `egId` is undefined and subGraphRef is omitted — acceptable, non-blocking).
- **Open question (riff):** should a universal protocol that is NOT yet localized ever be attachable to a run with the intent "and I'll localize it in the editor here"? Your stated preference ("only the ones whose steps and labwares have been localized") says NO for now; this plan implements that. If you later want an explicit "localize on attach" path, it's a separate affordance — flag for follow-up.

## The upfront unknowns (resolved by inspection)
- Event graph is fetched but not linked on promote → confirmed (the gap Phase 1 closes).
- `createProtocolFromDraft` can access the run's materialized graph → yes, it takes `derivedFromRunId` and the service is on `this.executionRunService`.
- `subGraphRef` oneOf is the single choke point for step→protocol refs → confirmed, widen in one place.
- The run-tab gate today is `state`-only → confirmed, and should become state AND localization.