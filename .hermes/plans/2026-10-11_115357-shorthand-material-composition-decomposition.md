# Plan: the shorthand chat must decompose a mixture into components — one material entry per component, one composition material-spec for the mixture

> **READ ORDER (updated 2026-10-11, after the third attempt).** The plan now has four parts, and the order below is the order to ship them:
> **PART III (Tasks 14-18) — silent data loss.** The shorthand `add_material` drops the declared volume, the compact well range, and the mixture, reporting success. Cheapest fixes, worst behavior. Start here.
> **PART IV (Tasks 19-23) — the ghosting regression.** The SHORTHAND-CHAT switch removed the two keys the deck ghosts on (`details.wells` + a labware id), so nothing appears in the wells and the tooltip is empty. Depends on Part III Task 15 for the wells.
> **PART II (Tasks 8-13) — the contract is enforced but never disclosed.** The model cannot see the verb vocabulary or the field list, so it burns turns guessing `verb:` vs `action:` vs `count`, and never reaches the composition question. Also the `params`-dropping lift bug that would erase Part I's work (and the corpus target).
> **PART I (Tasks 1-7) — the original composition problem** (one prose-blob material instead of components + a composition spec). Stage B (contract promotion) carries the MANIFEST re-bless.
>
> R7b answers "where is `count`?": it ships as the W2-2 `Quantity` datatype on **lane 2** and is wired to the realization gate, not to the small-model wire contract.


Plan file: `.hermes/plans/2026-10-11_115357-shorthand-material-composition-decomposition.md`
Target repo/worktree: a NEW worktree off `cl/integration-2` (`/mnt/vast/home/brad/git/cl-integration-2`, trunk tip `d6d2c689`)
Surface under test: `http://computable:5193/runs` (lane 2 stack: frontend 5193 → backend 3093)
Campaign: lane 2 / SHORTHAND (follow-on to SHORTHAND-CHAT + SHORTHAND-CORPUS)

---

## Goal (one sentence)

When a biologist describes a mixture ("50 µL of 50% trypsin-EDTA / 50% DMEM + 10% FBS containing 200 HepG2 cells per µL"), the shorthand draft must carry **four components** — trypsin-EDTA, DMEM, FBS, HepG2 cells — and the compiler must mint **one material record per component** plus **one composition material-spec** for the mixture, instead of one prose-blob "material".

---

## Current context / assumptions

### The two prompts Brad typed (both fail the same way)

```
"Add 50uL of 50% Thermo trypsin-EDTA / 50% Thermo DMEM with 10% FBS containing 200 HepG2 cells per uL to each well."
"I just trypsinized cells in a flask with Thermo brand trypsin-EDTA. Then I quenched that reaction with an equal
 volume of Thermo DMEM which had previously had 10% Thermo FBS added to it. I did a cell count and there are
 200 HepG2 cells per uL. I need to seed each well with 10,000 HepG2 cells."
```

Both came back as ONE action with a prose blob:

```yaml
intentId: seed-hepg2-10000-cells-per-well
actions:
  - action: add_material
    material: "HepG2 cells in 50% Thermo trypsin-EDTA / 50% Thermo DMEM + 10% FBS (200 cells/uL)"
    volume: { value: 50, unit: "uL" }
    targetWells: "A1:H12"
```

### Diagnosis — verified by reading the code at `d6d2c689` (every claim below is path:line)

**The run-chat surface drafts through the SHORTHAND path**, and that path is a *different* code path from the legacy raw-event path:

| Step | Raw-event path | Shorthand path (what runs on `:5193/runs`) |
|---|---|---|
| Model output | `event_graph` events | `event_shorthand` scientist-intent YAML |
| Material part-splitting / composition | `enrichAddMaterialRefs` — `server/src/ai/materialRefLabels.ts:617`, called at `server/src/ai/AgentOrchestrator.ts:2843` | **NEVER CALLED** |
| Compiled events | — | `compileShorthandDeterministically` → `shorthandResultFromCompile` → returned directly (`AgentOrchestrator.ts:2153-2181`) |
| Composition → spec/instance minting | `normalizeEventGraphMaterialUsage` at event-graph write (`server/src/api/handlers/RecordHandlers.ts:504`, `:946`) | runs at write, **but the events carry no `composition_snapshot`, so it no-ops** |

The shorthand branch returns `shResult` with **zero** material normalization between the compiler and the client (`AgentOrchestrator.ts:2172-2181`).

**The machinery Brad is asking for already exists and is proven — on the raw path only:**

1. `materialRefLabels.ts:563` `trySplitMixedBiologicalAdd` — splits "cells + medium" into a cells event carrying `count` (volume deleted) and a medium event carrying `composition_snapshot` + `formulation_kind: complex_composition`.
2. `materialRefLabels.ts:649-657` — `refs.map(...)` writes **one `composition_snapshot` entry per component** so "a mixture stops collapsing onto one line".
3. `materialRefLabels.ts:405-420` `toMaterialRef` — a free-text component label becomes `{kind:'draft', id:'mint:<label>', label}`.
4. `server/src/materials/AddMaterialSupport.ts:390-407` `normalizeCompositionMaterialRefs` — grounds each `component_ref` via `ensureLocalMaterialRef` → `ensureLocalMaterialForDraft` (`server/src/materials/MaterialGrounding.ts:199`), which **mints a real `MAT-…` material record per component** (dedup by case-insensitive name, idempotent). ← *"each material should have its own material entry"*
5. `AddMaterialSupport.ts:205-256` `upsertProposedMaterialSpecFromComposition` — when `composition_snapshot.length >= 2`, mints ONE `material-spec` with `formulation_kind: complex_composition` and `formulation.composition = <the grounded entries>`, then stamps `material_spec_ref` onto the event. ← *"a composition material instance using the four material components"*
6. That whole chain runs at event-graph write: `normalizeEventGraphMaterialUsage` (`AddMaterialSupport.ts:607`) → `normalizeAddMaterialDetailsMaterialRefs` (`:448-450`).

**What is actually missing is only the bridge:** the shorthand wire contract has no composition form, the shorthand prompt never asks for components, and `addMaterialExpander` never emits `composition_snapshot`.

### Contract facts (verified)

- `add_material`'s declared vocabulary args are `source, target, labware, material, source_name, volumeUl, volume` (`schema/scientist-intent/scientist-intent-vocabulary.yaml`, verb `add_material`).
- The action object is `additionalProperties: false` **but** declares `params: { type: object, additionalProperties: true }` (`schema/workflow/scientist-intent.schema.yaml`, the `params` property) — so `params.composition` is **schema-valid today, with no schema change**.
- `normalizeScientistIntent.ts:269-273` carries open `params.*` keys onto the candidate event; `ChatbotCompilePasses.ts:1091` (`const { verb, ...params } = cand`) hands the whole candidate to the expander as `params`. **So `params.composition` reaches `addMaterialExpander` with zero plumbing.**
- `addMaterialExpander` is `server/src/compiler/biology/verbs/simpleVerbs.ts:326`; it emits `details: { well, material, materialKind, volumeUl, volume }` and nothing else.
- The `add_material` **event** schema already declares both `composition_snapshot` (`schema/workflow/events/plate-event.add-material.schema.yaml:114`) and `count` (`:120`) + `counter_density` (`:157`) — no event-schema change needed.
- `material-spec.schema.yaml` already has `formulation_kind: [single_active, defined_composition, complex_composition, biological_preparation]` and `formulation.composition[]` of `composition-entry` (`component_ref` + `role` + `concentration`). No schema change needed.
- **Pinned invariant to respect:** `server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` pins `sha256` of the vocabulary YAML, `schema/workflow/scientist-intent.schema.yaml`, and `scientist-intent-compile.yaml` (`goldens/replayKernel.ts:379-384` re-hashes them; drift fails LOUD). Lane 2's in-flight W2-89 authority decision states verbatim: *"MANIFEST blob 58c447eb frozen; no compiler/scientistIntent files touched."* **Stage A below therefore changes NO pinned file and adds NO golden fixture** (new tests live in their own file outside `goldens/`).

### What is being coded right now in the other lanes (READ THIS BEFORE TOUCHING ANYTHING)

**LANE 1 — `cl/integration-1` @ `49d964ef`, stack `:5192`→`:3092`.** Campaign `lab-ownership-and-sharing-policy`, wave 3. In flight: **OWN-7** (`ensureOwnerPolicy` stamps declared defaults) — coder done in worktree `/mnt/vast/home/brad/git/wt/OWN-7-lane1-l1t1000` @ `8653588c`, adversarial review running (report `~/.hermes/cl/lanes/1/reviews/own7-advreview-l1t1140.md`). Queued: OWN-8 (creation-time filing), OWN-9 (`GET/PUT /settings/ownership-policy`), OWN-10..13.
**Lane 1 hot files — DO NOT TOUCH:** `server/src/security/AuthorizationService.ts`, `server/src/security/*`, `server/src/server.ts`, `server/src/api/routes.ts`, `server/src/api/handlers/LabSettingsHandlers.ts`, `OwnershipPolicyService.ts`, `records/seed/identity/*`. This plan touches none of them.

**LANE 2 — `cl/integration-2` @ `d6d2c689`, stack `:5193`→`:3093`.** In flight:
- **W2-89 write-wall, cycle 3** — worktree `/mnt/vast/home/brad/git/wt/W2-89-fix-lane2-l2t0230`, adversarial review running now (`~/.hermes/cl/lanes/2/reviews/advc-W289-c3-l2t1155.md`). Hot: `server/src/ai/AgentOrchestrator.ts` (the `askWall` region `:1225-1246` and the smuggle closure `:1246`) and **`config/drafting/review-write-wall.yaml` (the ONLY YAML it may touch)**.
- **SHORTHAND-CORPUS** — just merged (`d6d2c689`). Its remaining work is the chat-panel Accept wiring + JSONL→corpus replay (mostly `app/src/event-editor/right-pane/ai/*`, `server/src/api/handlers/IntentTrainingPairHandlers.ts`, `server/src/corpus/*`).
- **W2-8-SAID-MEANT-SURFACE / W2-9-REVIEW-AI-PANEL** (in-progress) — protocol-review host + AI panel; `app/src/event-editor/right-pane/ai/*`, `server/src/ai/review*`.
**Lane 2 hot files for THIS plan — minimize and re-anchor at dispatch:** `server/src/ai/AgentOrchestrator.ts` (the forced-draft prompt constant at `:505-521` and the shorthand branch `:2079-2182`), `server/src/ai/shorthandChat.ts`, `server/src/ai/materialRefLabels.ts`, `server/src/materials/AddMaterialSupport.ts`, `server/src/compiler/scientistIntent/*`.

**Sequencing rule (non-negotiable):** land this in a **fresh worktree off the `cl/integration-2` tip**; never work in `/mnt/vast/home/brad/git/cl-integration-2` (its own dev stack is live there). Before merging, confirm W2-89's review packet has landed and re-check `MANIFEST.yaml` is still blob `58c447eb…` (Stage A must leave it byte-identical). Stage B (vocabulary/schema change) requires the orchestrator to schedule the MANIFEST re-bless with lane 2 — do not bundle it.

### Assumptions

- The run-chat surface id is `workspace.deck` and it is the ONLY surface on the shorthand path (`config/drafting/shorthand-drafting.yaml: surfaces: [workspace.deck]`).
- Accepting a shorthand draft persists an **event-graph** record (that is the only thing `normalizeEventGraphMaterialUsage` normalizes). **Task 1 verifies this first-hand; if accept writes individual plate-event records instead, the minting must be invoked at that seam and Task 5 changes shape.**
- `exactOptionalPropertyTypes` is ON (backend). Never assign `undefined` to an optional field; compose with `??` / spread-guards.
- Test runner: `cd server && npx vitest run <path>`. Never restart the lane stack; never curl :3001/:5174/:3092/:5192/:3093/:5193. `git -c core.fileMode=false` everywhere (NFS mode-bit noise).

---

## Architecture / proposed approach

Teach the shorthand contract a **composition form that already rides an open schema slot** (`params.composition: [{material, role, fraction?, concentration?, count?, counterDensity?}]`) so no pinned schema/vocabulary file moves; emit it in `addMaterialExpander` as `details.composition_snapshot` (+ `count`/`counter_density` for a cells component); and let the **existing** store-write normalization (`normalizeEventGraphMaterialUsage` → `normalizeCompositionMaterialRefs` → `upsertProposedMaterialSpecFromComposition`) mint one `MAT-…` material record per component plus the one `complex_composition` material-spec. Stage B promotes `composition` to a declared vocabulary arg (engine-bound, per-component 422 bar) and pays the MANIFEST re-bless deliberately.

---

## Step-by-step tasks

### Task 0 — Worktree, branch, baseline (do this first; ~10 min)

```bash
TS=$(date +%Y%m%dT%H%M)
git -C /mnt/vast/home/brad/git/cl-integration-2 worktree add \
  /mnt/vast/home/brad/git/wt/SHORTHAND-COMPOSITION-lane2-${TS} \
  -b cl/SHORTHAND-COMPOSITION-lane2-${TS} cl/integration-2
cd /mnt/vast/home/brad/git/wt/SHORTHAND-COMPOSITION-lane2-${TS}
git -c core.fileMode=false log -1 --format='%H %s'      # expect d6d2c689…
```

Capture the baselines (paste the numbers into your report; "zero-NEW" is the gate, exit-0 claims are forbidden):

```bash
cd server && npx tsc --noEmit 2>&1 | grep -c "error TS"        # record the count (19 at W2-89's base)
cd ../app && npx tsc --noEmit 2>&1 | grep -c "error TS"        # record the count (34 at W2-89's base)
cd .. && git -c core.fileMode=false hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml
# MUST print 58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35 — Stage A must leave this byte-identical
```

**Verification task (do not skip):** confirm the accept path writes an event-graph record.

```bash
grep -rn "event-graph" app/src/event-editor/right-pane/ai/ChangesPanel.tsx | head
grep -rn "schemaId" server/src/ai/AgentOrchestrator.ts | grep -i "event-graph" | head
```
Expected: the accepted draft is written as an `event-graph` payload (schema id `https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml`). **If it is not, STOP and report** — the minting seam is different and the orchestrator must re-scope Task 5.

---

### Task 1 — RED: the normalizer must carry the declared components (TDD)

Create `server/src/compiler/scientistIntent/compositionDecomposition.test.ts` (NOT inside `goldens/` — that suite is MANIFEST-pinned):

```ts
/**
 * Composition decomposition on the SHORTHAND path.
 *
 * A mixture the scientist names ("50% trypsin-EDTA / 50% DMEM + 10% FBS with
 * 200 HepG2 cells per uL") must reach the compiler as its COMPONENTS, never as
 * one prose blob: the expander emits one composition_snapshot entry per
 * component and the store-write normalization mints one material record per
 * component plus one complex_composition material-spec for the mixture.
 */
import { describe, expect, it } from 'vitest';
import { parseScientistIntent } from './parseScientistIntent.js';
import { normalizeScientistIntent } from './normalizeScientistIntent.js';

const MIXTURE = `
intentId: seed-hepg2-composite
actions:
  - action: add_material
    labware: plate
    volumeUl: 50
    targetWells: [A1]
    params:
      composition:
        - { material: "Thermo trypsin-EDTA", role: solvent, fraction: "50%" }
        - { material: "Thermo DMEM", role: buffer_component, fraction: "50%" }
        - { material: "Thermo FBS", role: additive, fraction: "10%" }
        - { material: "HepG2 cells", role: cells, count: 10000, counterDensity: { value: 200, unit: "cells/uL" } }
`;

describe('shorthand composition decomposition', () => {
  it('carries the declared components onto the candidate event', () => {
    const normalized = normalizeScientistIntent(parseScientistIntent(MIXTURE));
    const add = normalized.candidateEvents.find((e) => e.verb === 'add_material');
    expect(add).toBeDefined();
    expect(Array.isArray(add!.composition)).toBe(true);
    expect((add!.composition as unknown[]).length).toBe(4);
  });

  it('rejects a malformed composition entry at the schema door', () => {
    const bad = MIXTURE.replace('role: solvent, fraction: "50%"', 'role: 42');
    expect(() => parseScientistIntent(bad)).toThrow();
  });
});
```

Run it:

```bash
cd /mnt/vast/home/brad/git/wt/SHORTHAND-COMPOSITION-lane2-<TS>/server
npx vitest run src/compiler/scientistIntent/compositionDecomposition.test.ts
```
Expected: **PASS** on the first assertion already (the open-`params` carry at `normalizeScientistIntent.ts:269-273` does the work) — if it fails, `params.composition` is being dropped and Task 2 fixes the carry. The second test pins that a malformed entry cannot reach the compiler. Record the actual result; if test 1 is already green this is a *characterization* pin, not a RED — say so in the report rather than claiming RED.

### Task 2 — RED: the expander must emit `composition_snapshot`

Append to the same test file:

```ts
import { getExpander } from '../biology/BiologyVerbExpander.js';
import '../biology/verbs/simpleVerbs.js';

describe('add_material expander emits a composition snapshot', () => {
  const components = [
    { material: 'Thermo trypsin-EDTA', role: 'solvent', fraction: '50%' },
    { material: 'Thermo DMEM', role: 'buffer_component', fraction: '50%' },
    { material: 'Thermo FBS', role: 'additive', fraction: '10%' },
    { material: 'HepG2 cells', role: 'cells', count: 10000, counterDensity: { value: 200, unit: 'cells/uL' } },
  ];

  it('writes one entry per component, with the cells count kept as a count', () => {
    const [event] = getExpander('add_material')!.expand({
      verb: 'add_material',
      params: { labware_id: 'plate', wells: ['A1'], volume_uL: 50, composition: components },
    });
    const details = event!.details as Record<string, unknown>;
    const snapshot = details['composition_snapshot'] as Array<Record<string, unknown>>;
    expect(snapshot).toHaveLength(4);
    expect(details['formulation_kind']).toBe('complex_composition');
    expect((snapshot[3]!['component_ref'] as Record<string, unknown>)['label']).toBe('HepG2 cells');
    // The count NEVER collapses into a volume (the HepG2 forcing function).
    expect(details['count']).toBe(10000);
    expect((details['counter_density'] as Record<string, unknown>)['value']).toBe(200);
  });

  it('leaves a plain single-material add untouched', () => {
    const [event] = getExpander('add_material')!.expand({
      verb: 'add_material',
      params: { labware_id: 'plate', wells: ['A1'], volume_uL: 100, material: 'DMEM' },
    });
    expect((event!.details as Record<string, unknown>)['composition_snapshot']).toBeUndefined();
  });
});
```

```bash
npx vitest run src/compiler/scientistIntent/compositionDecomposition.test.ts
```
Expected: **FAIL** — `expected undefined to be 4` / `expected undefined to be 'complex_composition'`. Paste the RED output into your report.

### Task 3 — GREEN: emit the snapshot in `addMaterialExpander`

Edit `server/src/compiler/biology/verbs/simpleVerbs.ts`. Add this helper directly above `addMaterialExpander` (currently `:326`):

```ts
/**
 * A mixture the scientist names arrives as params.composition — one entry per
 * component. Emit it as the event's `composition_snapshot` (one ledger line per
 * component; the store-write normalization in AddMaterialSupport mints a
 * material record per component and one complex_composition material-spec for
 * the mixture). A `cells` component carries a COUNT, never a volume.
 */
function compositionSnapshotFromParams(
  composition: unknown,
): { snapshot: Record<string, unknown>[]; count?: number; counterDensity?: Record<string, unknown>; formulationKind: string } | null {
  if (!Array.isArray(composition) || composition.length < 2) return null;
  const snapshot: Record<string, unknown>[] = [];
  let count: number | undefined;
  let counterDensity: Record<string, unknown> | undefined;
  for (const raw of composition) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const label = typeof entry.material === 'string' ? entry.material.trim() : '';
    if (!label) continue;
    const role = typeof entry.role === 'string' && entry.role.trim() ? entry.role.trim() : 'other';
    // A component with no CURIE is a DRAFT ref — the exact shape
    // MaterialGrounding.ensureLocalMaterialForDraft mints into a MAT- record.
    const componentRef: Record<string, unknown> = { kind: 'draft', id: `mint:${label}`, label };
    snapshot.push({
      component_ref: componentRef,
      role,
      ...(entry.concentration !== undefined ? { concentration: entry.concentration } : {}),
      ...(typeof entry.fraction === 'string' ? { source: `${entry.fraction} of the mixture` } : {}),
    });
    if (role === 'cells') {
      if (typeof entry.count === 'number' && Number.isFinite(entry.count)) count = entry.count;
      const density = entry.counterDensity;
      if (density && typeof density === 'object' && !Array.isArray(density)) {
        counterDensity = density as Record<string, unknown>;
      }
    }
  }
  if (snapshot.length < 2) return null;
  return {
    snapshot,
    ...(count !== undefined ? { count } : {}),
    ...(counterDensity ? { counterDensity } : {}),
    formulationKind: 'complex_composition',
  };
}
```

Then, inside `addMaterialExpander.expand`, after the `volumeUl` computation (currently ending `:342`) add:

```ts
    const composition = compositionSnapshotFromParams(params.composition);
```

and add these keys to **both** emitted `details` objects (the legacy `wells`-array branch at `:352-358` and the modern branch at `:367+`):

```ts
            ...(composition
              ? {
                  composition_snapshot: composition.snapshot,
                  formulation_kind: composition.formulationKind,
                  ...(composition.count !== undefined ? { count: composition.count } : {}),
                  ...(composition.counterDensity ? { counter_density: composition.counterDensity } : {}),
                }
              : {}),
```

Re-run:

```bash
npx vitest run src/compiler/scientistIntent/compositionDecomposition.test.ts
```
Expected: **PASS** (4 tests). Then prove nothing else moved:

```bash
npx vitest run src/compiler/scientistIntent/ src/compiler/biology/
npx tsc --noEmit 2>&1 | grep -c "error TS"    # must equal the Task 0 baseline
git -c core.fileMode=false hash-object src/compiler/scientistIntent/goldens/MANIFEST.yaml   # still 58c447eb…
```

Commit:

```bash
cd .. && git -c core.fileMode=false add server/src/compiler/biology/verbs/simpleVerbs.ts server/src/compiler/scientistIntent/compositionDecomposition.test.ts
git -c core.fileMode=false commit -m "feat(shorthand): add_material emits a composition_snapshot from declared components (one entry per component; cells count stays a count)"
```

### Task 4 — RED→GREEN: the mixture mints one material per component + one composition spec

This is the acceptance proof of Brad's sentence. Add to the same test file:

```ts
// (MemoryRecordStore is defined locally in this file — see the store note above.)
import { normalizeEventGraphMaterialUsage } from '../../materials/AddMaterialSupport.js';
```

**Store note (verified):** there is no shared in-memory store module. Every test file defines its own local `MemoryRecordStore implements RecordStore` — copy the one at `server/src/materials/AddMaterialSupport.test.ts:9-45` into this test file verbatim (it implements `get`, `getByPath`, `getWithValidation`, `list`, `create`, `update`, …). Its `list()` ignores arguments, so **filter components by payload kind in the assertion**, not by passing `schemaId` to `list`.

const EVENT_GRAPH_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml';
const MATERIAL_SPEC_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml';
const MATERIAL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material.schema.yaml';

describe('the mixture becomes components + a composition spec', () => {
  it('mints one material per component and one complex_composition spec', async () => {
    const store = new MemoryRecordStore();
    const [event] = getExpander('add_material')!.expand({
      verb: 'add_material',
      params: { labware_id: 'plate', wells: ['A1'], volume_uL: 50, composition: [
        { material: 'Thermo trypsin-EDTA', role: 'solvent', fraction: '50%' },
        { material: 'Thermo DMEM', role: 'buffer_component', fraction: '50%' },
        { material: 'Thermo FBS', role: 'additive', fraction: '10%' },
        { material: 'HepG2 cells', role: 'cells', count: 10000, counterDensity: { value: 200, unit: 'cells/uL' } },
      ] },
    });
    const payload = {
      kind: 'event-graph',
      id: 'EG-COMPOSITION-TEST',
      events: [{ ...event, details: { ...(event!.details as Record<string, unknown>),
        material_ref: { kind: 'draft', id: 'mint:HepG2 cell suspension', label: 'HepG2 cell suspension' } } }],
    };
    const out = await normalizeEventGraphMaterialUsage(store, EVENT_GRAPH_SCHEMA_ID, payload) as Record<string, unknown>;
    const details = ((out['events'] as Array<Record<string, unknown>>)[0]!['details']) as Record<string, unknown>;

    const specRef = details['material_spec_ref'] as Record<string, unknown>;
    expect(specRef).toBeDefined();
    const spec = await store.get(String(specRef['id']));
    expect(spec).not.toBeNull();
    expect((spec!.payload as Record<string, unknown>)['formulation_kind']).toBe('complex_composition');
    const composition = ((spec!.payload as Record<string, unknown>)['formulation'] as Record<string, unknown>)['composition'] as Array<Record<string, unknown>>;
    expect(composition).toHaveLength(4);

    // ONE material record per component, all real records in the store.
    const all = await store.list();
    const components = all.filter((env) => (env.payload as Record<string, unknown>)['kind'] === 'material');
    expect(components.length).toBe(4);
    for (const entry of composition) {
      const ref = entry['component_ref'] as Record<string, unknown>;
      expect(ref['kind']).toBe('record');
      expect(await store.get(String(ref['id']))).not.toBeNull();
    }
  });
});
```

```bash
npx vitest run src/compiler/scientistIntent/compositionDecomposition.test.ts
```

Expected: **GREEN with no production change** — the chain at `AddMaterialSupport.ts:390-407` / `:205-256` already does the minting. If it fails, read the failure before editing anything; the likely causes are (a) the draft-ref shape not matching `normalizeGroundableRef` (fix the *test input*, not the production code), or (b) the `<2 entries` guard. Do **not** add a second minting implementation — reuse is the point of this task. If the real blocker is a production defect in the existing chain, STOP and report it as a finding (it would be a pre-existing bug in the raw path too).

Record the actual component records (ids + names) in the report — that is the evidence for "each material should have its own material entry".

Commit the test:

```bash
git -c core.fileMode=false add server/src/compiler/scientistIntent/compositionDecomposition.test.ts
git -c core.fileMode=false commit -m "test(shorthand): a declared mixture mints one material per component + one complex_composition material-spec (reuses AddMaterialSupport)"
```

### Task 5 — The model must be told the form (prompt DATA, not TypeScript)

Edit `server/prompts/material-system-rules.md` (loaded into the system prompt by `server/src/ai/systemPrompt.ts:475`). Append a new section:

```markdown
## Mixtures: name the components, never a blob

A material that is a MIXTURE is never one material. When the scientist names a
mixture — a ratio, a percent, a "in" clause, a medium plus additives, cells in a
suspension — carry EVERY component separately in the action's `params.composition`
array, one entry per component:

```yaml
- action: add_material
  labware: plate
  volumeUl: 50
  targetWells: [A1]
  params:
    composition:
      - { material: "Thermo trypsin-EDTA", role: solvent, fraction: "50%" }
      - { material: "Thermo DMEM", role: buffer_component, fraction: "50%" }
      - { material: "Thermo FBS", role: additive, fraction: "10%" }
      - { material: "HepG2 cells", role: cells, count: 10000, counterDensity: { value: 200, unit: "cells/uL" } }
```

Rules:
- `material` is the component's own name, in the scientist's words, one per entry.
- `role` is one of `solute | solvent | buffer_component | additive | activity_source | cells | other`.
- `fraction` is the volume fraction of the mixture when the scientist stated one ("50%").
- A `cells` component carries a COUNT (`count`), never a volume. If the scientist
  gave a density ("200 cells per uL") and a volume, `count = density × volume`;
  carry both the `count` and the `counterDensity` so the arithmetic is auditable.
- `material` (the single-material field) names the MIXTURE itself, or is omitted.
  NEVER put a mixture sentence in `material` — a blob is not a material and it
  cannot bind to anything in the lab.
- Do not invent components the scientist did not name. Do not invent percentages.
```

Verification (the prompt is data; assert it is actually composed in):

```bash
cd server && npx vitest run src/ai/promptBudget.test.ts
grep -c "params.composition" prompts/material-system-rules.md     # expect >= 1
```

Commit:

```bash
cd .. && git -c core.fileMode=false add server/prompts/material-system-rules.md
git -c core.fileMode=false commit -m "docs(prompt): mixtures must be carried as params.composition components, never a prose blob"
```

### Task 6 — Wire the one-line model prompt for the run-chat surface

`FORCED_DRAFT_TOOL_INSTRUCTION` (`server/src/ai/AgentOrchestrator.ts:505-521`) is the forced-tool prompt for the run chat. Add ONE bullet after the "ALWAYS carry the actions for an add-materials request…" bullet (`:516`):

```ts
  '- A MIXTURE is never one material: when the scientist names a ratio, a percent, a medium plus additives, or cells in a suspension, carry every component in the action\'s `params.composition` array (one entry per component: material + role, plus fraction/count as stated). Never put a mixture sentence in `material`.',
```

Check the guard test that pins this constant still passes (it pins the equipment bullet):

```bash
grep -rn "FORCED_DRAFT_TOOL_INSTRUCTION" server/src --include=*.test.ts | head
npx vitest run src/ai/  2>&1 | tail -20
```

Commit:

```bash
cd .. && git -c core.fileMode=false add server/src/ai/AgentOrchestrator.ts
git -c core.fileMode=false commit -m "feat(shorthand-chat): forced-draft prompt asks for composition components instead of a mixture blob"
```

**Merge-order note for the report:** `AgentOrchestrator.ts` is hot in W2-89 (the `askWall`/smuggle region at `:1225-1246`) — this edit is at `:516`, a different region, but state the rebase risk and the W2-89 review status you observed at dispatch.

### Task 7 — Live proof on the lane stack (after the orchestrator restarts it)

Do **not** restart the stack yourself. Ask the orchestrator to restart lane 2 (`/mnt/vast/home/brad/git/computable-lab/cl-lane-stack.sh 2 restart` — orchestrator/Brad only), then in the run chat at `http://computable:5193/runs`:

1. Paste prompt 1 verbatim: `Add 50uL of 50% Thermo trypsin-EDTA / 50% Thermo DMEM with 10% FBS containing 200 HepG2 cells per uL to each well.`
2. Expect the shorthand panel to show FOUR components in `params.composition` (not a blob).
3. Accept the draft; then verify the minted records:

```bash
curl -s "http://localhost:3093/api/records?kind=material-spec" | head -c 800
curl -s "http://localhost:3093/api/records?kind=material" | head -c 800
```
Expected: one `material-spec` with `formulation_kind: complex_composition` and four `formulation.composition` entries; four `material` records named after the components (trypsin-EDTA, DMEM, FBS, HepG2 cells — reused, not duplicated, on a second accept).

4. Repeat with prompt 2 (`…200 HepG2 cells per uL. I need to seed each well with 10,000 HepG2 cells.`) — expect a `cells` component carrying `count: 10000` + `counter_density {value: 200, unit: "cells/uL"}`, and **no** conversion of the count into a volume.

Browser receipt (SOP rule 12 — a UI change is not done without a browser check): capture the shorthand panel + the minted records. Reuse the lane-2 receipt flow (`~/.hermes/cl/browser-receipts.md`, receipts under `~/.hermes/cl/receipts/`).

---

## Stage B (schedule separately — do NOT bundle)

Promote `composition` from an open `params` slot to a **declared** vocabulary arg so the resolution engine binds each component and bars atomically (422) on an unresolvable component, instead of the components only being grounded at store write.

1. `schema/scientist-intent/scientist-intent-vocabulary.yaml`: add to `add_material` (and `seed`):
   ```yaml
      - name: composition
        kind: resolvable
        required: false
        domain: material
        cardinality: many
   ```
   (add `cardinality` to `scientist-intent-vocabulary.schema.yaml`'s arg properties; extend `vocabulary.ts`'s arg-contract reader; teach `resolveNounsPass` to iterate a `many` resolvable arg and emit one clarification per unresolved component.)
2. `schema/workflow/scientist-intent.schema.yaml`: declare `composition` as an array of `{material, role, fraction?, concentration?, count?, counterDensity?}` (mirroring the `params` shape so both forms validate during the transition).
3. **Re-bless `goldens/MANIFEST.yaml` in the same commit** (the treeState sha256s for the vocabulary + schema change; the manifest blob hash `58c447eb…` is superseded) and add ONE new golden fixture + record for the mixture document.
4. Re-run the golden suite (`npx vitest run src/compiler/scientistIntent/goldens/`) and report the new manifest hash.
**Prerequisite:** the orchestrator must confirm lane 2 has no in-flight acceptance battery pinning `58c447eb` (W2-89 cycle 3, SHORTHAND-CORPUS) at the moment of the re-bless.

## Stage C (optional; only after A and B are green and observed)

The honest bar: a mixture-shaped `material` label with **no** declared components should bar with a clarification naming the components, never mint a prose-blob material. Implement as DATA (a cue list — `"/"`, `" + "`, `" in "`, `"%"` — in a new `config/drafting/*.yaml`), consumed by the existing clarification channel; no cue literals in TypeScript. Skip if Stage A+B already prevent blobs in practice — YAGNI.

---

## Tests / validation (the gate)

| Check | Command (from the new worktree) | Expected |
|---|---|---|
| New suite | `cd server && npx vitest run src/compiler/scientistIntent/compositionDecomposition.test.ts` | all green; 4 components; 4 material records; 1 complex_composition spec |
| Compiler regression | `cd server && npx vitest run src/compiler/scientistIntent/ src/compiler/biology/` | green, no new failures |
| Golden pin intact | `git -c core.fileMode=false hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` | `58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35` (Stage A only) |
| Prompt composed | `cd server && npx vitest run src/ai/promptBudget.test.ts` | green |
| Server types | `cd server && npx tsc --noEmit 2>&1 \| grep -c "error TS"` | equal to the Task 0 baseline (zero NEW) |
| App types | `cd app && npx tsc --noEmit 2>&1 \| grep -c "error TS"` | equal to the Task 0 baseline |
| Diff hygiene | `git -c core.fileMode=false diff --name-only d6d2c689..HEAD` | Stage A: `simpleVerbs.ts`, `compositionDecomposition.test.ts`, `material-system-rules.md`, `AgentOrchestrator.ts` — **no YAML except none; no `goldens/`; no lane-1 files** |
| Live | Task 7 steps 3-4 | one spec + four component materials; count not converted to volume |

TDD order per task: write the test → run it (paste RED) → implement minimally → run it (GREEN) → commit with the exact `git add` paths above. Never `git add -A`.

---

## Risks, tradeoffs, open questions

- **`params` is an undeclared slot (Stage A).** It works today with no pinned-file change, but it is a *hidden* contract: nothing validates a malformed entry beyond `additionalProperties: true`, and the resolution engine cannot bar an unresolvable component. Stage B is the honest fix; Stage A is the fast, low-conflict one. Do not let Stage A become permanent by accident.
- **Cells handling differs from the raw path.** The raw path SPLITS cells+medium into two events (`trySplitMixedBiologicalAdd`, `materialRefLabels.ts:563`); Stage A keeps one event carrying both `count` and the snapshot (the event schema allows it). If the well-state renderer needs the split, reuse `trySplitMixedBiologicalAdd` (export it) rather than writing a second splitter — open question for the browser receipt to settle.
- **Two grounding routes now exist for a component label** (engine `resolve_nouns` for declared args; `ensureLocalMaterialForDraft` at store write). Stage B makes them agree; until then a component may be bound by the store-write route only.
- **The MANIFEST is a cross-lane lock.** Any change to the vocabulary/schema (Stage B) or a new golden fixture breaks lane 2's in-flight pins (`58c447eb`). Coordinate the re-bless; never sneak it in with a feature commit.
- **`AgentOrchestrator.ts` and `shorthandChat.ts` are lane-2 hot.** This plan deliberately keeps the orchestrator edit to one prompt bullet at `:516` and touches neither `askWall` (`:1225-1246`) nor `config/drafting/review-write-wall.yaml`.
- **Merge-order:** this work branches off `cl/integration-2` @ `d6d2c689`; if W2-89 cycle 3 or the SHORTHAND-CORPUS remainder lands first, rebase and re-anchor every line number quoted here before coding.
- **Arithmetic honesty (open question):** should the compiler VERIFY `count ≈ density × volume` (and bar on a mismatch) using the W2-2 constraint vocabulary? Today the plan carries both numbers so a later read/check can verify them; auto-verification is a follow-up, not part of this change.
- **Not in scope:** the run-editor UI beyond the browser receipt, the corpus/training side (a corpus pair recorded from the accepted composition is automatic once Accept is wired by SHORTHAND-CORPUS), any lane-1 file, `review-write-wall.yaml`.

## Acceptance criteria (Brad's sentence, made checkable)

1. Given a prompt naming a mixture, the shorthand document carries **one entry per component** in `params.composition` — trypsin-EDTA, DMEM, FBS, HepG2 cells — not one prose blob.
2. After accept, the store holds **one material record per component** (four `MAT-…` records, reused on re-accept) and **one `material-spec`** with `formulation_kind: complex_composition` and four `formulation.composition` entries.
3. A `cells` component carries `count` (+ `counter_density`); the count is never converted into a volume (the HepG2 forcing function).
4. The SPINE-6 golden MANIFEST is byte-identical after Stage A; the compiler, prompt-budget and typecheck baselines show zero NEW failures.

---

# PART II — the SECOND observed failure (2026-10-11 retry): the contract is ENFORCED but never DISCLOSED

Added after Brad's second attempt, which failed differently and worse: the model never reached the composition question because it could not find the *contract*. Same plan, new failure class, higher priority — **Part II Tasks 8-12 should land BEFORE Part I Tasks 1-7**, because a model that does not know the vocabulary cannot use any composition form we teach it.

## What the transcript actually shows

Brad's transcript is the model's raw reasoning, verbatim. Read it as evidence:

- *"Actions vocabulary — closed scientist-intent vocabulary. I need to use verbs like 'seed_cells' or 'add_material'. **Hmm, I don't know the exact closed vocabulary.**"* → then it guessed: *"Common verbs: add_material, transfer, seed, etc."* … *"Given uncertainty, I'll use 'add_material'"* … *"maybe 'seed_cells'… But I don't know."*
- It wrote `verb: add_material` and got rejected: *"The schema requires `action` field, not `verb`."* (rejection #1)
- It wrote `notes:` and `count: 10000` and got rejected: *"The error says unknown property 'count' — so count isn't allowed. Hmm… maybe the field is `amount` or `number`. Hmm, risky."* … *"Let me try `cells: 10000`?"* … *"Ugh, another rejection?"* (rejection #2, and more guessing after)
- It flip-flopped on the material form: *"HepG2 is in resolved context: mesh:D056945… So I can use {curie:"mesh:D056945"}."* ↔ *"But the shorthand uses natural-language noun labels, not CURIEs."*
- It collapsed the mixture in its own words: *"The cell suspension is a mixture — HepG2 cells in DMEM with FBS. **But the primary material is HepG2 cells.**"*
- It leaked all of the above into the user-visible turn.

So the model spent its entire turn reverse-engineering a contract that the server holds and never showed it. That is a product defect, not a model defect — and it has a **precedent in this campaign**: `PB-CH-4b` (`~/.hermes/cl/lanes/2/task-list.md`, status done, commit `e629b0c6`) — *"the model cannot see WHICH surface ids exist … the model's menu and the compiler's membership check can never drift"* — fixed by injecting the declared ids into the tool definition FROM the registry. Same defect class, same fix pattern, new surface.

## Root causes (each verified first-hand at `d6d2c689`)

**R1 — the run-chat prompt ships NO scientist-intent vocabulary.**
`vocabulary.ts:202/225` has `promptVerbBlock()` — *"the ALLOWED ACTIONS block rendered for the system prompt"* — and its ONLY consumer is `intentCompile.ts:88`, the **headless** `/intent/compile` route. The run-chat prompt is built by `buildSystemPrompt` (`systemPrompt.ts:470-485`) from `prompts/material-system-rules.md` + `prompts/event-graph-agent.md` + `FORCED_DRAFT_TOOL_INSTRUCTION` (`AgentOrchestrator.ts:505-521`). None of those contains a single scientist-intent verb.

**R2 — the enum is enforced on that path anyway.**
`parseScientistIntent.ts:47-48` injects `vocabulary.toolActionEnum()` into the schema's `$defs/actionVerb.enum` before `addSchema`, and `AgentOrchestrator.ts:2133` calls `parseScientistIntent(shorthandYaml)` on the model's raw YAML. Enforced, never disclosed.

**R3 — the prompt's `{{VOCAB_PACK}}` is the LEGACY event vocabulary, and it misleads.**
`event-graph-agent.md:88-89` renders `formatVocabPack` (`systemPrompt.ts:114-124`) = `liquid-handling/v1` + the **event-model** verb list. That is why the model reasoned about event verbs instead of scientist-intent actions. (The template line `2. Generate events using only verbs from the active vocabulary pack.` is raw-event guidance on a shorthand-only surface.)

**R4 — the lifter that absorbs exactly these mistakes is not wired on this path.**
`liftScientistIntent` (`liftScientistIntent.ts:186`) already normalizes: `verb:` → `action:` (`liftAction:120-127`), the verb-as-map-key shape (`:127-140`), OpenAI-style `parameters:` nesting (`:114-117`), snake_case aliases (`PARAM_ALIASES:71-83`), numeric-string coercion (`:157-160`), junk `ratio` noise (`:163`). Its call sites are `intentCompile.ts:281/287/316` (headless) and `corpus/shorthandCorpus.ts:61` (corpus capture) — **not** the run-chat turn. Brad's `verb:` rejection would not have happened on the headless route.
Corollary: **the corpus captures the LIFTED document as the training target** (`shorthandCorpus.ts:61-62`), so any field the lift drops is dropped from the training data as well.

**R5 — the repair prompt carries no contract either.**
`malformedShorthandRepairPrompt` (`shorthandChat.ts:261-277`) quotes the rejected document and three lines of prose ("a closed-vocabulary list of high-level biology verbs") — no verb list, no per-verb fields, no valid example. So the re-ask is another guess. That is why one rejection became three.

**R6 — two contract shapes exist, and the only example the codebase teaches is one the run-chat schema REJECTS.**
`intentCompile.ts:68-85` (the headless system prompt, mirrored as DATA in `schema/registry/prompt-templates/intent.compile.system.yaml` and drift-gated by `vocabularyMirrorDrift.test.ts`) teaches:
```
actions:
  - add_material:            # verb IS the map key
      material: "Lysis Solution"
      volumeUl: 550
```
and says verbatim: *"NEVER write a literal 'action:' key. The verb IS the map key."*
But the run-chat schema requires `action` (`schema/workflow/scientist-intent.schema.yaml`, `actions.items.required: [action]`, `additionalProperties: false`). A model nudged by the one example it can find writes a document the other surface rejects.

**R7 — a cell count has no valid wire home in the SHORTHAND CONTRACT, and the lift would silently eat it.**
The action schema's numeric properties are exactly `factor, points, replicates, ratio, volume, volumeUl, cycles, duration, temperatureC, rpm` — **no count**. `count` exists on the EVENTS (`plate-event.add-material.schema.yaml:120`) and in `ScientistIntentActionValue` only via `params` (`types.ts:98`). Meanwhile `liftAction`'s whitelist (`ALLOWED_PARAM_KEYS`, `liftScientistIntent.ts:60-68`) excludes `count` and **explicitly skips `params`** (`:157`: `if (canonicalKey === 'params' || canonicalKey === 'parameters') continue;`) — so `params.composition` from Part I is **erased** on any lifting path, including the corpus training target. This is a direct, must-fix interaction with Part I.

**R7b — correction (Brad's hunch was right, with one lane off): `count` ALREADY EXISTS as a shipped, first-class dimensioned datatype — on LANE 2, not lane 1.** Do not re-invent it; adopt it. Verified:

| Thing | Where | Status |
|---|---|---|
| `Quantity` = `{value, unit, dimension}`, `dimension: [count, volume, mass, molar]`, count's closed units `[cells, beads, wells, organisms, worms, CFU, colonies]`, `qualifier: [exact, approximately_zero]`, `value: minimum 0` | `schema/core/datatypes/quantity.schema.yaml` — commit **`d83f8be6`** (W2-2-QUANTITY-CONSTRAINTS, status done on lane 2) | **present in `cl-integration-2`** — the tree you are running on `:5193` |
| Its consumers today | `schema/registry/constraint-vocabulary/constraint.schema.yaml:51` (`$ref`), `schema/registry/wave2-naming-crosswalk.yaml:256-300`, and — the "being wired in" you remember — **`server/src/compiler/scientistIntent/realizeScientistIntent.ts:254` + `:423`**, where the W2-7 realization gate validates a policy-bound answer against `QUANTITY_ID` and fails loudly with *"Dimension collapse (e.g. a volume unit on a count) is a schema error, never a guess"* | WIRED on the **emission** leg |
| `QuantityRatio` = `{numerator: Quantity, denominator: Quantity}` — the doc's own example is *5 beads per well*, and it explicitly allows cross-dimension pairs *"(e.g. cells over uL)"* | `schema/core/datatypes/quantity-ratio.schema.yaml` | present on lane 2 |
| **Not** in `main` and **not** in `cl-integration-1` (lane 1's tree has no `quantity.schema.yaml` at all — only `amount.schema.yaml`) | — | so nothing on lane 1 is involved |

**Why it is not "already in place here" — the answer is in the repo's own words.** `quantity.schema.yaml`'s header records the W2-2 ruling: *"amount/concentration/reference-ratio STAY; Quantity is the genuinely-missing dimensioned datatype. **Migration of existing fields is a later wave.**"* The **realization/emission** side adopted Quantity; the **small-model wire contract** (`schema/workflow/scientist-intent.schema.yaml`, SPINE-1-era) was never migrated — it still carries bare scalars (`volumeUl: number`, `temperatureC: number`, `volume: {}`) and an open `params` slot, and has no `count`. So the gap is planned, not accidental; this plan is that later wave, scoped to the shorthand contract.

**Naming caution (do not add a bare `count:` field):** the W2-1 crosswalk already found the collision (finding **W2-2-F1**) — the bare word `count` is THREE different things in this repo: the **verb** `count` (one of the 31 scientist-intent actions), the **operation id** `count` (`operations.yaml`), and the **dimension** `count` (Quantity). The crosswalk qualified the dimension noun as `cf:quantity-dimension-count` for exactly this reason. So the wire field must not be named bare `count`; carry a Quantity (or a per-verb `quantity`) whose `dimension: count` says what it is.


**R8 — the model's reasoning was rendered as the assistant turn.** Verify whether the panel is streaming the `reasoning` field (see `AiTabPanel.tsx:830`, the "chat template defaults reasoning ON" note) or the model emitted it as content. Either way, a turn whose visible substance is contract reverse-engineering is a surface defect.

## Tasks — Part II (do these FIRST)

### Task 8 — the lift must not silently drop the open `params` slot (bug fix; tiny)

RED test — add to a new `server/src/compiler/scientistIntent/liftParamsPreservation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { liftScientistIntent } from './liftScientistIntent.js';
import { parseScientistIntent } from './parseScientistIntent.js';

describe('lift preserves the open params slot', () => {
  it('keeps params.composition through the lift and past Ajv', () => {
    const lifted = liftScientistIntent({
      intentId: 'seed-mixture',
      actions: [{
        action: 'add_material',
        material: 'HepG2 cell suspension',
        volumeUl: 50,
        params: { composition: [
          { material: 'Thermo DMEM', role: 'buffer_component', fraction: '50%' },
          { material: 'Thermo FBS', role: 'additive', fraction: '10%' },
        ] },
      }],
    });
    const action = (lifted.actions as Array<Record<string, unknown>>)[0]!;
    expect(action.params).toBeDefined();
    expect(((action.params as Record<string, unknown>).composition as unknown[])).toHaveLength(2);
    expect(() => parseScientistIntent(JSON.stringify(lifted))).not.toThrow();
  });
});
```

```bash
cd server && npx vitest run src/compiler/scientistIntent/liftParamsPreservation.test.ts
```
Expected: **FAIL** (`expected undefined to be defined`). Then in `liftScientistIntent.ts`, replace the skip line in `liftAction` (currently `:157`, `if (canonicalKey === 'params' || canonicalKey === 'parameters') continue;`) with:

```ts
    if (canonicalKey === 'parameters') continue;
    if (canonicalKey === 'params') {
      // The OPEN parameter slot rides through VERBATIM. It carries the declared
      // composition components (material-system-rules.md) and any future
      // extension; dropping it here silently erased a named mixture from both
      // the compiled document AND the corpus training target
      // (corpus/shorthandCorpus.ts:61 lifts before it stores).
      if (value && typeof value === 'object' && !Array.isArray(value)) out['params'] = value;
      continue;
    }
```

Re-run → **PASS**. Also re-run the corpus + headless suites (they are the lift's other consumers):

```bash
npx vitest run src/corpus/ src/compiler/scientistIntent/
```
Expected green — the change is additive (params was previously absent from lifted output; documents that never carried `params` are byte-identical). Commit:

```bash
git -c core.fileMode=false add server/src/compiler/scientistIntent/liftScientistIntent.ts server/src/compiler/scientistIntent/liftParamsPreservation.test.ts
git -c core.fileMode=false commit -m "fix(scientist-intent): the lift must not drop the open params slot (composition survives compile and corpus capture)"
```

### Task 9 — wire the lift into the run-chat turn (before the Ajv door)

The run-chat path must behave like every other consumer: lift, then Ajv. In `server/src/ai/shorthandChat.ts` add an exported helper next to `compileShorthandDeterministically`:

```ts
/**
 * Parse a MODEL-EMITTED shorthand document for the chat turn: lift first (the
 * declarative alias table absorbs `verb:`, the verb-as-map-key shape, nested
 * `parameters:`, snake_case keys — the same door corpus/shorthandCorpus.ts:61
 * and the headless route use), THEN Ajv as the sole validation authority (rule
 * #3). Without the lift, every alias the rest of the system forgives is a hard
 * 422 on this surface, and each 422 costs a model turn spent guessing.
 */
export function parseShorthandForChat(yamlText: string): ScientistIntent {
  const lifted = liftScientistIntent(parseYaml(yamlText) ?? {});
  return parseScientistIntent(JSON.stringify(lifted));
}
```

(imports: `parse as parseYaml` from `yaml` — already imported at `shorthandChat.ts:28`; `liftScientistIntent` from `../compiler/scientistIntent/liftScientistIntent.js`.)

RED test — `server/src/ai/shorthandChat.lift.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseShorthandForChat } from './shorthandChat.js';

describe('chat shorthand parse lifts model aliases', () => {
  it('accepts the legacy `verb:` key', () => {
    const doc = parseShorthandForChat('intentId: seed\nactions:\n  - verb: add_material\n    material: DMEM\n    volumeUl: 100\n');
    expect(doc.actions[0]!.action).toBe('add_material');
  });

  it('accepts the verb-as-map-key shape the headless prompt teaches', () => {
    const doc = parseShorthandForChat('intentId: seed\nactions:\n  - add_material:\n      material: DMEM\n      volumeUl: 100\n');
    expect(doc.actions[0]!.action).toBe('add_material');
  });

  it('still rejects a fabricated verb', () => {
    expect(() => parseShorthandForChat('intentId: x\nactions:\n  - action: seed_cells\n    material: DMEM\n')).toThrow();
  });
});
```

```bash
npx vitest run src/ai/shorthandChat.lift.test.ts
```
Expected: **FAIL** (`parseShorthandForChat` is not a function) → implement → **PASS**.

Then use it at the two call sites in `AgentOrchestrator.ts`: the turn path (`:2133`, currently `shorthandDoc = parseScientistIntent(shorthandYaml)`) and the fold path (`:1181`'s recompile is already canonical, so the lift is idempotent — switch it for symmetry and say so in the report). Keep the `ScientistIntentValidationError` catch and the ONE re-ask budget exactly as they are — the repair loop hedges against a genuinely malformed document, and after the lift it should almost never fire (if it does fire in the live check, that is a finding, not a bug in this task).

```bash
npx vitest run src/ai/ src/compiler/scientistIntent/
```
Commit:

```bash
git -c core.fileMode=false add server/src/ai/shorthandChat.ts server/src/ai/shorthandChat.lift.test.ts server/src/ai/AgentOrchestrator.ts
git -c core.fileMode=false commit -m "fix(shorthand-chat): lift model aliases (verb:, verb-as-key, parameters:, snake_case) before the Ajv door on the run-chat turn"
```

### Task 10 — disclose the contract (DATA, generated from the vocabulary — the PB-CH-4b fix pattern)

10a. Add `contractBlock()` to the vocabulary API (`server/src/compiler/scientistIntent/vocabulary.ts`), generated from the YAML — no hand-written verb list:

```ts
  /** The full SHORTHAND CONTRACT block: every verb with its declared args.
   *  Single source (the vocabulary YAML) so the model's menu and the Ajv gate
   *  cannot drift (the PB-CH-4b precedent: the model's menu must BE the
   *  compiler's membership check). */
  contractBlock(): string;
```
```ts
  const contractBlock = (): string => {
    const lines: string[] = ['ACTIONS (the CLOSED vocabulary — never invent another):'];
    for (const verb of verbsFrozen) {
      const args = entries.get(verb)!.args
        .map((a) => `${a.name}${a.required ? '' : '?'}:${a.kind}${a.domain ? `(${a.domain})` : ''}`)
        .join(', ');
      lines.push(`- ${verb}${args ? ` — ${args}` : ''}`);
    }
    return lines.join('\n');
  };
```
and return it from the object literal (`contractBlock,`).

10b. RED test `server/src/compiler/scientistIntent/vocabularyContractBlock.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defaultScientistIntentVocabulary } from './vocabulary.js';

describe('vocabulary contract block', () => {
  it('lists every verb with its declared args', () => {
    const vocab = defaultScientistIntentVocabulary();
    const block = vocab.contractBlock();
    for (const verb of vocab.verbs()) expect(block).toContain(`- ${verb}`);
    expect(block).toContain('add_material — source?');
    expect(block).toContain('volumeUl?:quantity');
    // The block is generated, so it can never disagree with the enum the parser injects.
    expect(vocab.toolActionEnum().every((v) => block.includes(`- ${v}`))).toBe(true);
  });
});
```
Run → FAIL → implement → PASS.

10c. Inject it where the model will actually read it, generated (never hand-typed):
- `server/src/ai/submitSuggestionTool.ts`: the `shorthand` arg description (`:625-628`) becomes a template that appends the generated block, e.g.
  ```ts
  import { defaultScientistIntentVocabulary } from '../compiler/scientistIntent/vocabulary.js';
  const SHORTHAND_CONTRACT_BLOCK = defaultScientistIntentVocabulary().contractBlock();
  ```
  and append `\n\n${SHORTHAND_CONTRACT_BLOCK}` to the existing prose (keep the prose; add the data).
- `server/src/ai/AgentOrchestrator.ts:505-521`: append `SHORTHAND_CONTRACT_BLOCK` to `FORCED_DRAFT_TOOL_INSTRUCTION` (or add a bullet that interpolates it) — the constant already has a guard test, so run it.
- `server/src/ai/shorthandChat.ts:261-277` (`malformedShorthandRepairPrompt`): append the same block + one **canonical valid minimal example** — this is the line that stops a rejection from becoming three:
  ```yaml
  intentId: <short id>
  actions:
    - action: add_material
      material: "DMEM"
      volumeUl: 100
      targetWells: [A1]
  ```
- Put the worked example (including a mixture example) in DATA, not TS: a new `schema/registry/prompt-templates/shorthand-contract.yaml` following `intent.compile.system.yaml`'s precedent; load it the way the other templates are loaded. If that is too much for this task, inline the example in the same generated block and note the follow-up — but the VERB LIST must be generated.

Tests: assert the built prompt/tool-def actually contains the block:

```ts
// server/src/ai/shorthandContractDisclosure.test.ts
import { AGENT_INTENT_TOOL_DEF } from './submitSuggestionTool.js';
import { FORCED_DRAFT_TOOL_INSTRUCTION } from './AgentOrchestrator.js';
import { malformedShorthandRepairPrompt, ScientistIntentValidationError } from './shorthandChat.js';

it('the tool def and the forced prompt both carry the closed vocabulary', () => {
  const shorthandArg = JSON.stringify(AGENT_INTENT_TOOL_DEF);
  expect(shorthandArg).toContain('add_material');
  expect((FORCED_DRAFT_TOOL_INSTRUCTION as string[]).join('\n')).toContain('add_material');
});

it('the repair prompt re-states the contract instead of re-asking blind', () => {
  const err = new ScientistIntentValidationError('boom', [new Error('unknown property count')]);
  const prompt = malformedShorthandRepairPrompt(err, 'intentId: x\nactions: []\n');
  expect(prompt).toContain('add_material');
  expect(prompt).toContain('volumeUl');
});
```
(Adjust the import for `ScientistIntentValidationError` to its real home — `parseScientistIntent.ts`.) Run → FAIL → wire → PASS. Then run the existing guard test on `FORCED_DRAFT_TOOL_INSTRUCTION` and the prompt-budget test:
```bash
npx vitest run src/ai/ && npx tsc --noEmit 2>&1 | grep -c "error TS"
```
Commit:
```bash
git -c core.fileMode=false add server/src/compiler/scientistIntent/vocabulary.ts server/src/compiler/scientistIntent/vocabularyContractBlock.test.ts server/src/ai/shorthandContractDisclosure.test.ts server/src/ai/submitSuggestionTool.ts server/src/ai/AgentOrchestrator.ts server/src/ai/shorthandChat.ts
git -c core.fileMode=false commit -m "feat(shorthand): disclose the closed vocabulary to the model (generated from the vocabulary YAML) in the tool def, the forced prompt and the repair prompt"
```

### Task 11 — teach ONE shape (the one the schema accepts)

Today the headless prompt teaches the verb-as-map-key shape and forbids `action:` (`intentCompile.ts:85`), while every run-chat schema requires `action`. Pick `action:` as the canonical taught shape (it is what Ajv requires and what `normalizeDocument` reads), keep the map-key form as an accepted INPUT via the lift, and fix the teaching side everywhere:

1. `server/src/compiler/scientistIntent/intentCompile.ts:68-101` — rewrite the example block to use `action:` and delete the "NEVER write a literal 'action:' key" line.
2. `schema/registry/prompt-templates/intent.compile.system.yaml` — the same text (the drift gate `vocabularyMirrorDrift.test.ts` compares them; both must change in one commit).
3. Run `npx vitest run src/compiler/scientistIntent/vocabularyMirrorDrift.test.ts` → must be green.
4. Add a bidirectional pin so this cannot regress: a test asserting that EVERY shape the prompts teach parses through `parseScientistIntent` (extract the YAML example from each prompt template and feed it to `parseShorthandForChat`).
Commit:
```bash
git -c core.fileMode=false add server/src/compiler/scientistIntent/intentCompile.ts schema/registry/prompt-templates/intent.compile.system.yaml server/src/compiler/scientistIntent/promptShapeParity.test.ts
git -c core.fileMode=false commit -m "fix(scientist-intent): the prompts teach the shape the schema accepts (action:), and a parity test pins it"
```
**MANIFEST note:** `intentCompile.ts` and the prompt-template YAML are NOT in the goldens MANIFEST treeState (only the vocabulary YAML, `scientist-intent.schema.yaml` and `scientist-intent-compile.yaml` are) — this task does not disturb the pin. Verify anyway: `git -c core.fileMode=false hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` must still print `58c447eb…`.

### Task 12 — adopt the SHIPPED `Quantity` / `QuantityRatio` datatypes in the wire contract (do not invent a `count:` field)

This replaces an earlier draft that proposed a private `params.count` shape. R7b is the correction: the type exists (`schema/core/datatypes/quantity.schema.yaml`, W2-2 `d83f8be6`), it is already consumed by the W2-7 realization gate (`realizeScientistIntent.ts:254/423`), and the only thing missing is wire adoption. Adopting it means "counts never collapse into volumes" is enforced **by schema** on the chat path too — the same law, the same validator, one implementation.

12a. RED test — extend `server/src/compiler/scientistIntent/compositionDecomposition.test.ts`:

```ts
import { createValidator } from '../../validation/AjvValidator.js';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

const QUANTITY_ID = 'https://computable-lab.com/schema/computable-lab/datatypes/quantity.schema.yaml';

it('a declared cell count is a Quantity, never a bare number and never a volume', () => {
  const schema = parseYaml(readFileSync('schema/core/datatypes/quantity.schema.yaml', 'utf-8')) as Record<string, unknown>;
  const validator = createValidator({ strict: false });
  validator.addSchema(schema as never, QUANTITY_ID);
  // the shipped law: dimension count + a count unit validates …
  expect(validator.validate({ value: 10000, unit: 'cells', dimension: 'count' }, QUANTITY_ID).valid).toBe(true);
  // … and dimension collapse is a SCHEMA error, exactly as the realization gate says
  expect(validator.validate({ value: 50, unit: 'uL', dimension: 'count' }, QUANTITY_ID).valid).toBe(false);
});
```

12b. Wire shape (contract change; this one DOES touch `schema/workflow/scientist-intent.schema.yaml` → the MANIFEST re-bless, so it belongs to **Stage B**, alongside Part I's `composition` arg):

```yaml
  - action: add_material
    labware: plate
    targetWells: [A1]
    quantity: { value: 50, unit: uL, dimension: volume }        # declared arg, kind: quantity
    params:
      composition:
        - { material: "Thermo trypsin-EDTA", role: solvent, fraction: "50%" }
        - { material: "Thermo DMEM", role: buffer_component, fraction: "50%" }
        - { material: "Thermo FBS", role: additive, fraction: "10%" }
        - material: "HepG2 cells"
          role: cells
          quantity: { value: 10000, unit: cells, dimension: count }
          ratio: { numerator: { value: 200, unit: cells, dimension: count },
                   denominator: { value: 1, unit: uL, dimension: volume } }
```

Notes for the implementer:
- "200 cells/uL" is a **QuantityRatio** (`quantity-ratio.schema.yaml` — its doc explicitly blesses cross-dimension pairs "e.g. cells over uL"). Do not model it as a concentration.
- Do **not** name any wire field bare `count` (R7b naming caution). The event's `count` field is the *emission* key; the wire carries a Quantity whose `dimension: count` says what it is.
- Reuse ONE validator: the realization gate's `getQuantityValidator()` pattern (`realizeScientistIntent.ts:256-273`). If that helper is not exported, export it rather than writing a second loader — and say so in the report.
- The Part I expander then maps the wire Quantity onto the event's `count` + `counter_density` — the count is a COUNT at every hop, and no code path ever derives it from (or folds it into) a volume.

12c. Stage-A bridge (only if the Stage-B contract change is deferred): the count may temporarily ride `params.quantity` (Task 8 makes `params` survive the lift), and the expander maps it the same way. The migration to the declared arg is then a one-line vocabulary/schema edit. **Do not** add a bare `count` key to `ALLOWED_PARAM_KEYS`.

Commit (Stage B, bundled with the MANIFEST re-bless in Part I Stage B):
```bash
git -c core.fileMode=false add schema/core/datatypes/quantity.schema.yaml schema/workflow/scientist-intent.schema.yaml schema/scientist-intent/scientist-intent-vocabulary.yaml server/src/compiler/biology/verbs/simpleVerbs.ts server/src/compiler/scientistIntent/compositionDecomposition.test.ts server/prompts/material-system-rules.md server/src/compiler/scientistIntent/goldens/MANIFEST.yaml
git -c core.fileMode=false commit -m "feat(scientist-intent): adopt the shipped Quantity/QuantityRatio datatypes on the wire (a cell count is a count at every hop; dimension collapse is a schema error)"
```

### Task 12b — record the finding for the orchestrator (no code)

Write a 10-line note into the worktree's report (`<REPORT_PATH>`) stating: `count`-as-dimension ships on lane 2 (W2-2 `d83f8be6`) and is wired to the realization gate but NOT to the small-model wire contract; the W2-2 header already rules *"Migration of existing fields is a later wave"*; therefore this task is that migration, scoped to the shorthand contract, and the remaining migration of protocol/material fields is still open. Flag it so the same confusion does not cost another turn.


### Task 13 — verify the reasoning leak and the repair budget (investigation task)

1. Reproduce Brad's turn and capture what the panel renders: is the visible text the model's `reasoning` stream (`AiTabPanel.tsx:830` discusses the chat template's reasoning default) or model content? Record the answer with a screenshot receipt.
2. Count the turns consumed: with Tasks 8-11 landed, the SAME two prompts must complete in ONE model turn each, with **zero** malformed-shorthand re-asks. That is the measurable acceptance for Part II: `grep "malformed-shorthand\|re-ask" <lane-2 server log>` shows no new entries for the two prompts.
3. Report the reasoning-leak finding to the orchestrator as its own item if it is a rendering defect (do not fix it inside this change).

## Part II acceptance criteria

1. The two prompts Brad typed produce a valid shorthand document on the **first** model turn — no `verb:` rejection, no `count` rejection, no field-name hunting. Evidence: lane-2 server log shows zero malformed-shorthand re-asks for those turns.
2. The tool definition, the forced-draft prompt and the repair prompt all carry the closed vocabulary + per-verb args, generated from `schema/scientist-intent/scientist-intent-vocabulary.yaml` (a drift test pins it).
3. No prompt in the repo teaches a document shape the schema rejects (the parity test).
4. `params` (and therefore the Part I composition) survives the lift — pinned by test — so the corpus training target carries the components too.
5. `MANIFEST.yaml` still hashes `58c447eb…` after Tasks 8-12.

---

# PART III — the THIRD observed failure (2026-10-11, third attempt): the shorthand `add_material` SILENTLY DROPS the declared volume, the wells, and the mixture

Brad's trace (prompt: *"Add 50uL of 50:50 Trypsin-EDTA/DMEM to each well."*):

**In** (the shorthand the compiler ran):
```yaml
intentId: add-trypsin-edta-dmem-50-50
actions:
  - action: add_material
    material: Trypsin-EDTA/DMEM (50:50)
    targetWells: A1:H12
    volume: { value: 50, unit: uL }
unresolved: []
```
**Out** (the compiled event):
```json
{ "eventId": "evt-add_material-q8lmv495", "event_type": "add_material",
  "details": { "material": "Trypsin-EDTA/DMEM (50:50)" } }
```
**Three declared facts vanished, and nothing complained:** the 50 µL volume, the A1:H12 wells, and the two-component mixture. What survived is the blob label — and the harness then minted it as a real material (`sourcePrompt: "Use [[material:MAT-trypsin-edta-dmem-50-50-12i0|Trypsin-EDTA/DMEM (50:50)]] for material."`), which is the *inverse* of Brad's ask: one material whose NAME is the recipe.

This is the worst class in the repo's own vocabulary — **silent data loss** (`normalizeScientistIntent.ts:249-254` uses that exact phrase) — and the codebase already bars loudly for the neighbouring case (SPINE-7's `UNREALIZED_WELL_LABEL_REASON` 422 arm, `normalizeScientistIntent.ts:32-33`, `:255-263`).

## Root causes (verified at `d6d2c689`)

**D1 — the mixture is never decomposed → one blob material, then a blob-named record.**
The model emitted `material: "Trypsin-EDTA/DMEM (50:50)"` (no composition form exists yet — Part I). The shorthand path never runs the part-splitting (`enrichAddMaterialRefs`, Part I R-table). Then the grounding door minted the blob as `MAT-trypsin-edta-dmem-50-50-12i0`. This directly contradicts the shipped rule in `server/src/materials/AddMaterialSupport.ts:629-631`: *"A bare concept in a well is never right. Materialize it: a composition or a concept+concentration → a formulation (material-spec)"* — and it inverts the acceptance criterion "one material entry PER COMPONENT plus one composition spec".
*Locate the minting door before touching it:* `grep -rn "MAT-" server/src/ai server/src/materials | grep -i "mint\|ensureLocal"` plus `ensureLocalMaterialForDraft` (`MaterialGrounding.ts:199`) — the blob was grounded somewhere on this surface, and the prompt was rewritten with the mention token so the model would use the record.

**D2 — `addMaterialExpander` never reads the DECLARED `volume` arg.**
`simpleVerbs.ts:335-342` computes `volumeUl` only from `params.volume_uL`, `params.volume_ul`, or `material.volume_uL` (a number), and both emitted branches (`:346-361`, `:362-375`) only write a volume when that number exists. The declared `volume` object arrives on the candidate as `volume` — `normalizeScientistIntent.ts:203` maps `['volume', ['volume']]` — and is discarded. Evidence the omission is specific to this verb: `transferExpander` reads exactly that shape at `:429-430` (`const volume = params.volume as { value: number; unit: string } | undefined;`). So the SAME document that carries a volume for a transfer silently loses it for an add_material.

**D3 — the scalar well range `targetWells: "A1:H12"` reaches no emitted event.**
1. `add_material`'s declared vocabulary args (`schema/scientist-intent/scientist-intent-vocabulary.yaml`) are `source, target, labware, material, source_name, volumeUl, volume` — **no `targetWells`/`sourceWells`**. So `declaredWellsArgs('add_material', vocab)` is ∅ and SPINE-7's scalar-label branch does NOT fire; the value passes through as `event.wells = "A1:H12"` (a plain string).
2. `addMaterialExpander` then gates on `if (wells && Array.isArray(wells))` (`simpleVerbs.ts:346`). A string fails that test, so the per-well branch is skipped; the modern branch writes `...(well ? { well } : {})` with `well === undefined` → **no `well`, no `wells`, nothing**.
3. The raw path expands this exact form with `expandEventWells` (`AgentOrchestrator.ts:2838`, from `server/src/ai/wellRange.ts`) — the shorthand path's two call sites are both in the raw branch, so shorthand never expands a compact range.
Also note: the SPINE-7 scalar-on-a-declared-wells-arg branch treats a scalar as a *symbolic label* to be engine-bound, not as a literal address range — so simply declaring `targetWells` in the vocabulary would be the WRONG fix for `"A1:H12"` (it would ask the lab spine to resolve "A1:H12" as a noun). See the design question below.

**D4 — none of the three drops produces a diagnostic or a clarification.** The document declared everything; the compile reported success; the user sees an event that lost its volume, its wells, and its mixture.

## Tasks — Part III

### Task 14 — `add_material` must honor the declared `volume` (tiny; do this first)

RED test — `server/src/compiler/biology/verbs/addMaterialVolume.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getExpander } from '../BiologyVerbExpander.js';
import '../verbs/simpleVerbs.js';

describe('add_material honors the declared volume', () => {
  it('carries an object-form volume onto the event', () => {
    const [event] = getExpander('add_material')!.expand({
      verb: 'add_material',
      params: { labware_id: 'plate', wells: ['A1'], volume: { value: 50, unit: 'uL' }, material: 'DMEM' },
    });
    const details = event!.details as Record<string, unknown>;
    expect(details['volume']).toEqual({ value: 50, unit: 'uL' });
  });

  it('lets an explicit volume object override the scalar form', () => {
    const [event] = getExpander('add_material')!.expand({
      verb: 'add_material',
      params: { labware_id: 'plate', wells: ['A1'], volume_uL: 10, volume: { value: 50, unit: 'uL' }, material: 'DMEM' },
    });
    expect((event!.details as Record<string, unknown>)['volume']).toEqual({ value: 50, unit: 'uL' });
  });
});
```
Run: `cd server && npx vitest run src/compiler/biology/verbs/addMaterialVolume.test.ts` → **FAIL** (`expected undefined to deeply equal …`).

Implement: read `params.volume` next to the existing `volumeUl` computation (mirror `transferExpander:429-430`) and emit it in BOTH branches:

```ts
    const declaredVolume = params.volume as { value: number; unit: string } | undefined;
    const declaredVolumeUl =
      declaredVolume && typeof declaredVolume.value === 'number' && declaredVolume.unit === 'uL'
        ? declaredVolume.value
        : undefined;
    const resolvedVolumeUl = typeof declaredVolumeUl === 'number' ? declaredVolumeUl : volumeUl;
```
and in both `details` objects replace the volume line with:
```ts
            ...(typeof resolvedVolumeUl === 'number' ? { volumeUl: resolvedVolumeUl, volume: declaredVolume ?? { value: resolvedVolumeUl, unit: 'uL' } } : declaredVolume ? { volume: declaredVolume } : {}),
```
Re-run → **PASS**; then `npx vitest run src/compiler/biology/` and the typecheck baseline count.

**Unit caveat (do not "fix"):** `volumeUl` is only derived when the declared unit is literally `uL`. A `volume: {value: 0.05, unit: mL}` carries `volume` and NO `volumeUl` — the compiler performs no unit conversion (the Quantity datatype has no arithmetic; Task 12b's migration is where unit handling belongs). Note it in the report if a converter gap appears.

Commit:

```bash
git -c core.fileMode=false add server/src/compiler/biology/verbs/simpleVerbs.ts server/src/compiler/biology/verbs/addMaterialVolume.test.ts
git -c core.fileMode=false commit -m "fix(add_material): honor the declared volume arg (object form was silently dropped; transfer already read it)"
```

### Task 15 — a compact well range must reach the event (with the range-vs-label decision stated)

**Design decision (state it in the report; do not guess silently):** `"A1:H12"` is a literal ADDRESS RANGE, not a symbolic labware label. The raw path already makes this distinction with `expandEventWells`/`wellRange.ts`, keyed off the shape of the string. The shorthand path must do the same, and must NOT route it through SPINE-7's symbolic-label branch.

RED test (extend the Task 14 file):

```ts
it('expands a compact well range onto the event', () => {
  const [event] = getExpander('add_material')!.expand({
    verb: 'add_material',
    params: { labware_id: 'plate', wells: 'A1:H12', volume: { value: 50, unit: 'uL' }, material: 'DMEM' },
  });
  const details = event!.details as Record<string, unknown>;
  const wells = details['wells'] as string[];
  expect(Array.isArray(wells)).toBe(true);
  expect(wells).toContain('A1');
  expect(wells).toContain('H12');
  expect(wells.length).toBe(96);
});
```
Run → **FAIL** → implement by making the expander normalize the wells argument before the branch:
```ts
    const rawWells = params.wells as string[] | string | undefined;
    const wells = typeof rawWells === 'string'
      ? expandEventWells({ details: { wells: rawWells } } as never) // reuse server/src/ai/wellRange.ts
      : rawWells;
```
(import `expandEventWells` from `../../ai/wellRange.js` — verify its real signature/export first and adapt; if it only accepts event objects, add a tiny exported `expandWellRangeString(value: string): string[]` in `wellRange.ts` and call that instead — one implementation, no second range parser.)
Then the existing `Array.isArray(wells)` branch emits one event per well with `details.well`. Note in the report which shape you produced (per-well events vs one event with a `wells` array) and why.
Commit:
```bash
git -c core.fileMode=false add server/src/compiler/biology/verbs/simpleVerbs.ts server/src/ai/wellRange.ts server/src/compiler/biology/verbs/addMaterialVolume.test.ts
git -c core.fileMode=false commit -m "fix(add_material): expand a compact well range (A1:H12) instead of silently dropping it"
```

### Task 16 — no silent drops: bar when a declared argument reaches no emitted event

**Class fix, and the highest-value item here.** Today the compile returns success while discarding declared arguments. The repo's doctrine is the opposite: bar atomically with a structured clarification (SPINE-7's `UNREALIZED_WELL_LABEL_REASON`, `normalizeScientistIntent.ts:32-33` / `:255-263`; the compile runner's 422 arm `compileScientistIntent.ts:248-268`).

RED test — `server/src/compiler/scientistIntent/declaredArgumentReachability.test.ts`: for each of `volume` (object form, D2) and a scalar `targetWells` (D3), assert that a document whose declared argument cannot reach any emitted event produces EITHER a populated `clarifications` array (reason naming the argument) OR an emitted `details` that carries it. A document that declares a value which reaches neither is the failure the test names.

Implementation sketch: in `normalizeScientistIntent`'s producer pass (the same place `unrealized` is filled, `:286-289`), after building the candidate event, compare the DECLARED args (from the vocabulary's arg contracts for that verb) against the keys the downstream expander can consume; any declared value that survives neither the candidate nor a consumer becomes a structured clarification exactly like the well-label one:
```ts
    unrealized.push({
      label: `<the declared value>`,
      reason: 'unrealized-declared-argument' as typeof UNREALIZED_WELL_LABEL_REASON,
      actionLocation: { actionIndex, action: verb as ScientistIntentActionKind, argument: key },
    });
```
Keep it DATA-driven (the vocabulary's declared args are the source of truth) and keep the reason code a stable machine code. If a full reachability model is too big for one task, scope it to the two proven-lossy arguments (`volume`, `targetWells`) with a TODO naming the general model — but the test must exist, and it must fail today.
Commit:
```bash
git -c core.fileMode=false add server/src/compiler/scientistIntent/normalizeScientistIntent.ts server/src/compiler/scientistIntent/declaredArgumentReachability.test.ts
git -c core.fileMode=false commit -m "fix(scientist-intent): a declared argument that reaches no emitted event bars with a clarification instead of being dropped"
```

### Task 17 — never mint a blob-named material (the D1 inversion)

Until Part I's composition form lands, a mixture-shaped `material` label must NOT become a single material record. Two acceptable outcomes, in order:
1. Part I Stage A/B: it decomposes into components + a `complex_composition` material-spec.
2. Otherwise (interim, if Part I is deferred): it BARS with a clarification naming the components (Part I Stage C), citing the shipped rule at `AddMaterialSupport.ts:629-631`.
There is no third outcome in which `MAT-trypsin-edta-dmem-50-50-12i0` is a legitimate record.

RED test: a compile of `material: "Trypsin-EDTA/DMEM (50:50)"` (no composition declared) must NOT produce a `details.material` blob AND must not mint a material record — assert either `clarifications.length > 0` or a `material_spec_ref` whose `formulation.composition` has ≥ 2 entries.
Also locate and name the minting door in the report (D1's grep), because that is the code that must refuse to mint a mixture label as one concept.

### Task 18 — re-run Brad's exact prompt end-to-end (the acceptance trace)

After Tasks 14-16 (and Part I/II as available), re-run verbatim: *"Add 50uL of 50:50 Trypsin-EDTA/DMEM to each well."* on `:5193/runs` (orchestrator restarts the lane stack; the worker does not).

Expected compiled event details (the trace is the acceptance evidence):
```json
"details": {
  "well": "A1",                       // …one event per well after range expansion
  "wells": ["A1", "…", "H12"],
  "volume": { "value": 50, "unit": "uL" },
  "volumeUl": 50,
  "material_ref": { "kind": "record", "id": "MAT-…" }        // the COMPOSITION, once Part I lands
  // …plus, once Part I lands: composition_snapshot with TWO entries (Trypsin-EDTA, DMEM)
  //   and material_spec_ref → a material-spec with formulation_kind: complex_composition
}
```
and the store afterwards (`curl -s "http://localhost:3093/api/records?kind=material-spec"`): one spec whose `formulation.composition` has two entries; two component `material` records; **no** record named "Trypsin-EDTA/DMEM (50:50)".

## Part III acceptance criteria

1. A declared `volume: {value, unit}` on an `add_material` reaches `details.volume` (pinned by test).
2. A compact well range reaches the emitted events as an expanded address list (pinned by test).
3. No declared argument is dropped without a structured clarification (pinned by test).
4. A mixture label never becomes a single blob-named material record (pinned by test + the live trace).
5. The live re-run of Brad's prompt shows volume + wells + composition in the compiled event, and the store shows one composition spec + per-component materials.

---

# PART IV — the "not ghosted into the wells anymore" REGRESSION: the shorthand switch dropped the two keys the client ghosts on

Brad: *"events coming back from the compiler are not being ghosted into the wells anymore. That's a regression. The tooltip when I mouseover each well is showing empty."* — with the same payload as Part III: `details: { material: "Trypsin-EDTA/DMEM (50:50)" }`, `labwares: {}`.

## The client contract (verified — these are the ONLY keys that matter)

The deck ghosts a preview event into wells only when it can answer two questions. Both are answered from the event's `details`:

1. **WHICH wells does this event touch?** `getAffectedWells` (`app/src/types/events.ts:450-495`) reads `details.wells`, `details.source_wells`, `details.dest_wells`, `details.source.wells`, `details.target.wells`, `details.mapping`, and the macro/tube arms. **It does NOT read a singular `details.well`.** (The client bridges that: `normalizePreviewEvents` in `app/src/shared/hooks/useAiChat.ts:1193-1204` rewrites `singleWellArray(details.well) ?? arrayField(details.wells)` into `details.wells` for `add_material` — so a singular well CAN work, but only through that bridge.)
2. **WHICH labware does this event belong to?** `collectEventLabwareIds` (`app/src/event-editor/lib/previewProjection.ts:120-134`) reads `details.labwareId`, `details.source_labwareId`, `details.dest_labwareId`, `details.source.labwareId`, `details.target.labwareId`. `buildPreviewWellIndex` (`:31-67`) buckets events **by labware id**; an event with none of those keys lands in **no bucket**.

Brad's event has **neither** a well key nor a labware key. Therefore: `byLabware` is empty → no ghost well, no highlight, and the per-well tooltip has nothing to render → *empty*. The mechanism is fully explained; no guessing required.

## Why it is a regression (and exactly what changed)

The run chat used to draft **raw events**, and the raw prompt puts both keys in the model's hands — `server/prompts/event-graph-agent.md:232-233`: *"For transfer, populate `source_labwareId`, `source_wells`, `dest_labwareId`, and `dest_wells` from the mentions."* / *"**For add_material, use the target mention for `labwareId` and `wells` when available.**"* — with `"labwareId": "plate-1"` in every example (`:403`, `:432`, `:441`). The raw result mapper `compileResultToAgentResult` (`AgentOrchestrator.ts:536`) then carries `compileResult.labwareAdditions` to the client (`:608`), and the compiler's `resolvedLabwares` hint→recordId table feeds the client (consumed at `server/src/ai/runChatbotCompile.ts:416`).

**SHORTHAND-CHAT moved that surface onto the shorthand path** (`shorthandChat.ts` seam: `cfdfc2e9`, `bf40b0e8`, `768083db`, merged `f9b75f2e`). On the new path:
- the model no longer writes events, so nothing writes `labwareId`/`wells` into `details`;
- `add_material`'s declared args have no wells arg (Part III D3) and no labware-id arg — only the symbolic `labware`/`target` hints;
- `resolve_labware` produces a hint→recordId **lookup table** (`resolvedLabwares`, `ChatbotCompilePasses.ts:1592-1697`) that is **never written back onto the events** — `findLabwareTypeForEvent` (`:2264-2275`) only *reads* `details.labwareInstanceId`, defaulting to `96-well-plate`;
- `shorthandResultFromCompile` (`shorthandChat.ts:323-365`) carries **only** `events`/`unresolvedRefs`/`clarificationRequests` — **no `labwareAdditions`**, unlike the raw mapper. Hence `labwares: {}` in Brad's payload.

So the shorthand path has no producer for the two keys the client consumes. That is the regression, and it is a *contract* gap, not a wiring slip.

## Tasks — Part IV

### Task 19 — pin the client contract with a test (do this first; it makes the fix unambiguous)

New test `app/src/event-editor/lib/shorthandPreviewGhosting.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getAffectedWells } from '../../types/events'
import { buildPreviewWellIndex } from './previewProjection'
import type { PlateEvent } from '../../types/events'

/** The exact payload the compiler returned for "Add 50uL of 50:50 Trypsin-EDTA/DMEM to each well." */
const asShipped: PlateEvent = {
  eventId: 'evt-add_material-q8lmv495',
  event_type: 'add_material',
  details: { material: 'Trypsin-EDTA/DMEM (50:50)' },
} as unknown as PlateEvent

describe('the client cannot ghost the shipped shorthand event', () => {
  it('finds no wells (the tooltip is empty for exactly this reason)', () => {
    expect(getAffectedWells(asShipped)).toEqual([])
  })
  it('buckets the event under no labware', () => {
    const index = buildPreviewWellIndex({ previewEvents: [asShipped] } as never)
    expect([...index.byLabware.keys()]).toEqual([])
  })
})

describe('the required shape ghosts', () => {
  const fixed = {
    ...asShipped,
    details: {
      material: 'Trypsin-EDTA/DMEM (50:50)',
      labwareId: 'LBW-96-1',                 // ← requirement 2
      wells: ['A1', 'A2', 'A3'],             // ← requirement 1
    },
  } as unknown as PlateEvent
  it('finds the wells and buckets them under the labware', () => {
    expect(getAffectedWells(fixed)).toEqual(['A1', 'A2', 'A3'])
    const index = buildPreviewWellIndex({ previewEvents: [fixed] } as never)
    expect([...index.byLabware.keys()]).toEqual(['LBW-96-1'])
    expect([...(index.byLabware.get('LBW-96-1') ?? [])]).toEqual(['A1', 'A2', 'A3'])
  })
})
```
Run: `cd app && npx vitest run src/event-editor/lib/shorthandPreviewGhosting.test.ts` → the first two PASS (they *characterize* today's failure — that is the point), the last two PASS too. Commit it as the pinned contract before changing the server:
```bash
git -c core.fileMode=false add app/src/event-editor/lib/shorthandPreviewGhosting.test.ts
git -c core.fileMode=false commit -m "test(preview): pin the ghosting contract — a preview event needs details.wells AND a labware id to reach a well"
```

### Task 20 — the shorthand result mapper must carry the labware additions/characters like the raw mapper

`shorthandResultFromCompile` (`server/src/ai/shorthandChat.ts:323-365`) must carry `compiled.terminalArtifacts.labwareAdditions` (and, if the raw path's client uses it, the `resolvedLabwares` hint→recordId list) onto the `AgentResult`, exactly as `compileResultToAgentResult` does at `AgentOrchestrator.ts:608`.

RED test — `server/src/ai/shorthandChat.labwareResult.test.ts`: compile a document whose labware hint resolves to a record, and assert the `AgentResult` carries `labwareAdditions` (length 1, with `recordId`) — today it is `undefined` while the raw path's mapper carries it.
Implement: widen `shorthandResultFromCompile`'s signature to accept the same compile result fields the raw mapper reads, and add the conditional spread. **DRY check:** if `compileResultToAgentResult` and `shorthandResultFromCompile` now share more than half their body, extract the shared mapper (one producer, two callers) instead of copy-pasting — say which you chose in the report.
Commit:
```bash
git -c core.fileMode=false add server/src/ai/shorthandChat.ts server/src/ai/shorthandChat.labwareResult.test.ts
git -c core.fileMode=false commit -m "fix(shorthand): the shorthand result carries labware additions like the raw mapper (ghosting lost them)"
```

### Task 21 — the emitted event must name the labware it targets (the missing seam)

Decide and implement ONE producer for `details.labwareId` on shorthand-compiled events (state the choice in the report):

- **Option A (preferred, data-driven):** the `resolve_labware` pass writes the bound `recordId` back onto the events whose hint matches, so `details.labwareId` is the real labware-instance record — the same identity the client will accept. The pass already computes `resolvedLabwares` (`ChatbotCompilePasses.ts:1592-1697`); the write-back is a lookup it already has. Keep it in the pass, not in a new TS table.
- **Option B:** the client resolves the symbolic hint through the `resolvedLabwares` table it now receives (Task 20). Acceptable only if the table is guaranteed present; otherwise the event stays unghostable.

RED test (server): compile `{action: add_material, labware: "plate", targetWells: [A1], material: DMEM}` through the real pass with a store that binds "plate" to `LBW-96-1`, and assert the emitted event's `details.labwareId === 'LBW-96-1'`.
Commit:
```bash
git -c core.fileMode=false add server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts server/src/compiler/scientistIntent/labwareIdWriteBack.test.ts
git -c core.fileMode=false commit -m "fix(resolve_labware): write the bound labware instance id back onto the event so the deck can ghost it"
```
**Lane warning:** `ChatbotCompilePasses.ts` is shared with the raw path — the write-back must be a no-op when the event already carries `details.labwareId`/`labwareInstanceId`, and the chatbot pipeline's byte-identity pins must stay green (`npx vitest run src/compiler/`).

### Task 22 — the wells must reach `details.wells` (or the singular bridge must be exercised)

Part III Task 15 makes the wells survive the expander as per-well events (`details.well`, singular). The client's bridge (`useAiChat.ts:1193-1204`) converts a singular well to `wells` for `add_material` — but only on the path that runs `normalizePreviewEvents`. Two checks, both required:
1. Server: assert the emitted event carries `details.well` (covered by Part III Task 15's test) — and add an assertion here that the SAME event satisfies Task 19's required shape once fed through `normalizePreviewEvents`. If the shorthand result reaches the client through a different channel that skips that normalizer, that is the bug — name it.
2. Add the end-to-end case to Task 19's suite: run the real server payload through the client's normalizer and assert `details.wells` is populated.

### Task 23 — regression pin: a browser receipt for ghost + tooltip

**Nothing here is done until a browser shows it (SOP rule 12).** On `:5193/runs` (orchestrator restarts the lane stack; the worker never does), after Part III Tasks 14-15 and Part IV Tasks 20-22:
1. Run *"Add 50uL of 50:50 Trypsin-EDTA/DMEM to each well."*
2. Expect: ghost wells across A1:H12 (dimmed/highlighted), and mouseover on a well shows the pending add (material + 50 µL).
3. Capture the receipt (screenshot + the payload JSON) into the lane-2 receipt path; state in the report the exact event JSON that produced the ghost.
4. Add a Playwright spec (`app/e2e/deck-ghost-shorthand.spec.ts`) that stubs the AI endpoint with the FIXED payload (no model needed) and asserts a ghost class/attribute is present on a well — so this can never silently regress again.
Commit:
```bash
git -c core.fileMode=false add app/e2e/deck-ghost-shorthand.spec.ts
git -c core.fileMode=false commit -m "test(e2e): a shorthand draft ghosts into the wells (pins the regression)"
```

## Part IV acceptance criteria

1. A compiled shorthand `add_material` carries `details.labwareId` (the resolved record) and its wells (Task 19's shape), pinned by unit tests on BOTH sides.
2. `shorthandResultFromCompile` carries `labwareAdditions` like the raw mapper (pinned).
3. Mouseover on a well shows the pending add (browser receipt + the e2e stub spec).
4. The raw path's behavior is unchanged (byte-identity pins green).
5. The report names the ONE seam that produces `details.labwareId` and records why the other option was rejected.


