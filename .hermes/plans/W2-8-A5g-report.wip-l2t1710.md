# CODER REPORT — W2-8-A5g: bead_beat vocabulary verb (lane 2)

- Item: W2-8-A5g | Lane 2 | Worktree: /mnt/vast/home/brad/git/wt/W2-8-A5g-lane2-l2t1710
- Branch: cl/W2-8-A5g-lane2-l2t1710 | Base: cl/integration-2 @ bb5c6501 | HEAD: 05775644d8b5ffccf053e59ef62fa78834762f9b
- Spec: /mnt/vast/home/brad/git/wt/W2-8-A5g-lane2-l2t1710/.hermes/plans/... (dispatch copy: cl-integration-2/.hermes/plans/2026-10-17_A5g-bead_beat-vocabulary-spec.md)
- Authority: Brad ruling 2026-10-17 "a) yes" (/home/brad/.hermes/cl/lanes/2/decisions/W28-A5-beadbeat-brad-ruling-20261017.md)
- Sequencing followed: GREEN BASELINE FIRST -> data edits -> deliberate mirror/pin updates. No pin was moved before its suite went RED.

## 0. Environment repair found at baseline (pre-existing, disclosed)

The first baseline run of the 14-file suite was RED with 5 suite-LOAD failures:
`Error: Failed to load url ../../ai/materialRefFields.js ... in .../resolutionEngine.ts`.
Diagnosis: `server/src/ai/materialRefFields.ts` is imported by tracked code at bb5c6501
(resolutionEngine.ts:19) but is NOT tracked in git — it is excluded by the lane exclude file
`core.excludesFile = /home/brad/.hermes/cl/lanes/2/lane-exclude-a6fix-l2t0430` (line 90), so the
fresh worktree checkout lacks it while the trunk checkout has it untracked. This is lane-infra
debt, not caused by this item. Repair: copied the trunk file (sha256
0cf0b9784d9ccde36efab7779fef1e5de054a207ebc4ab6690b1d5ed208f7f54, byte-identical to the trunk
working copy) into the worktree; it stays git-ignored (git status clean, not in the commit).
The same exclusion explains the 172-file pre-existing fail-set in the broad sweep (TS2307
missing-module cascade) — identical before and after my edits (set-diff in §5).

## 1. Green baseline (CODER-CAPTURED, before ANY edit)

Raw: /tmp/a5g-baseline-14.txt (after the §0 worktree repair; the pre-repair RED is described above).

```
 ✓ src/registry/VerbActionMapRegistry.synonyms.test.ts  (5 tests) 5ms
 ✓ src/registry/VerbActionMapRegistry.test.ts  (29 tests) 33ms
 ✓ src/compiler/biology/BiologyVerbExpander.test.ts  (35 tests) 15ms
 ✓ src/compiler/pipeline/passes/ChatbotCompilePasses.test.ts  (44 tests) 33ms
 ✓ src/compiler/scientistIntent/vocabularyMirrorDrift.test.ts  (6 tests) 16ms
 ✓ src/compiler/scientistIntent/clarificationContract.test.ts  (15 tests) 309ms
 ✓ src/compiler/scientistIntent/scientistIntentContract.test.ts  (15 tests) 121ms
 ✓ src/compiler/scientistIntent/promptShapeParity.test.ts  (9 tests) 82ms
 ✓ src/compiler/scientistIntent/vocabularyRipOut.test.ts  (8 tests) 130ms
 ✓ src/compiler/scientistIntent/vocabulary.test.ts  (16 tests) 881ms
 ✓ src/compiler/scientistIntent/realizeScientistIntent.test.ts  (18 tests) 679ms
 ✓ src/schema/Wave2QuantitySchema.test.ts  (33 tests) 1460ms
 ✓ src/compiler/scientistIntent/noBypass.test.ts  (7 tests) 2401ms
 ✓ src/schema/Wave2NamingCrosswalk.test.ts  (6 tests) 2418ms
```

```
 Test Files  14 passed (14)
      Tests  246 passed (246)
   Start at  18:41:00
   Duration  3.82s (transform 2.10s, setup 3ms, collect 12.81s, tests 8.58s, environment 4ms, prepare 5.83s)
```

tsc baseline (CODER-CAPTURED): `npx tsc --noEmit` -> 21 error lines, raw /tmp/a5g-tsc-before.txt.
All 21 are pre-existing lane debt: TS2307 missing-module errors for the §0 excluded files plus
AgentOrchestrator implicit-any/exactOptionalPropertyTypes debt. Verbatim:

```
src/ai/AgentOrchestrator.ts(47,60): error TS2307: Cannot find module './materialBinding.js' or its corresponding type declarations.
src/ai/AgentOrchestrator.ts(49,67): error TS2307: Cannot find module './clarificationLoop.js' or its corresponding type declarations.
src/ai/AgentOrchestrator.ts(51,52): error TS2307: Cannot find module './mintLabelFidelity.js' or its corresponding type declarations.
src/ai/AgentOrchestrator.ts(52,47): error TS2307: Cannot find module './recoverInventedMaterialFields.js' or its corresponding type declarations.
src/ai/AgentOrchestrator.ts(53,39): error TS2307: Cannot find module './enrichMaterialDomains.js' or its corresponding type declarations.
src/ai/AgentOrchestrator.ts(3475,29): error TS18048: 'parsed.events' is possibly 'undefined'.
src/ai/AgentOrchestrator.ts(3524,27): error TS7006: Parameter 'b' implicitly has an 'any' type.
src/ai/AgentOrchestrator.ts(3534,48): error TS7006: Parameter 'a' implicitly has an 'any' type.
src/ai/AgentOrchestrator.ts(3620,66): error TS7006: Parameter 'index' implicitly has an 'any' type.
src/ai/AgentOrchestrator.ts(3626,50): error TS2379: Argument of type '{ requestId: string; requirements?: string[]; details: Record<string, unknown>; wells?: unknown[]; well?: string; policy: MaterialClarificationPolicy; layer: MaterialLayer; label: any; }' is not assignable to parameter of type '{ policy: LayerPolicy | undefined; layer: MaterialLayer; label: string; well?: string; wells?: readonly string[]; details: Record<string, unknown>; requirements?: readonly string[] | null; requestId: string; }' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
  Types of property 'wells' are incompatible.
    Type 'unknown[]' is not assignable to type 'readonly string[]'.
      Type 'unknown' is not assignable to type 'string'.
src/ai/forceMaterialClarifications.ts(40,39): error TS2307: Cannot find module './materialIdentity.js' or its corresponding type declarations.
src/api/handlers/ProtocolIntakeHandlers.ts(25,44): error TS2307: Cannot find module '../../protocol-intake/materializeBranchCandidate.js' or its corresponding type declarations.
src/api/handlers/RecordHandlers.ts(37,68): error TS2307: Cannot find module '../../lint/AuthoringGuard.js' or its corresponding type declarations.
src/api/routes.ts(77,42): error TS2307: Cannot find module './labwareDefinitionSearch.js' or its corresponding type declarations.
src/api/routes/run-execution.ts(18,38): error TS2307: Cannot find module '../../readiness/RunStartGateService.js' or its corresponding type declarations.
src/api/routes/run-execution.ts(308,63): error TS7006: Parameter 'c' implicitly has an 'any' type.
src/protocol-intake/ProtocolIntakeService.ts(41,44): error TS2307: Cannot find module './materializeBranchCandidate.js' or its corresponding type declarations.
src/store/RecordStoreImpl.ts(35,8): error TS2307: Cannot find module '../lifecycle/BypassAudit.js' or its corresponding type declarations.```

## 2. Mid-step RED proof (spec "First targeted check")

After ONLY edits 1-2 (vocabulary yaml entry + wire enum append), the mirror+crosswalk pair went
RED with EXACTLY the predicted mirror legs — (a) types.ts set-diff, (b) wire-enum ORDER pin
(vocabulary vs enum order differ until inventory+types move), (e) registry template set-diff, and
the adjudication drift guard. (c)/(d) stayed green as predicted (generated copies).

```
 FAIL  src/schema/Wave2NamingCrosswalk.test.ts > W2-1 naming crosswalk admission check > machine-extracted vocabulary counts match the adjudication file (drift guard)
 FAIL  src/compiler/scientistIntent/vocabularyMirrorDrift.test.ts > scientist-intent-vocabulary.mirror-drift > vocabulary == (a) types.ts union — set diff empty BOTH directions, order pinned
 FAIL  src/compiler/scientistIntent/vocabularyMirrorDrift.test.ts > scientist-intent-vocabulary.mirror-drift > vocabulary == (b) wire-schema enum — set diff empty BOTH directions, order pinned
 FAIL  src/compiler/scientistIntent/vocabularyMirrorDrift.test.ts > scientist-intent-vocabulary.mirror-drift > vocabulary == (e) registry template verb block — set diff empty BOTH directions
```

```
 Test Files  2 failed (2)
      Tests  4 failed | 8 passed (12)
   Start at  18:43:12
   Duration  8.42s (transform 1.46s, setup 1ms, collect 2.57s, tests 5.42s, environment 1ms, prepare 710ms)
```

After mirror edits (a) types.ts, (e) registry template, (f) inventory: mirrorDrift fully green,
only the adjudication drift guard RED (`expected 32 to be 31`):

```
 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 11 passed (12)
   Start at  18:43:46
   Duration  4.03s (transform 407ms, setup 1ms, collect 1.85s, tests 2.33s, environment 1ms, prepare 741ms)
```

After adjudication + verb-action-map data edits, the 14-suite run went RED for EXACTLY the
enumerated golden/pin sites (spec items 9-13) — 8 failures, nothing unplanned:

```
 FAIL  src/registry/VerbActionMapRegistry.synonyms.test.ts > VerbActionMapRegistry — findVerbForToken > every one of the 26 canonical verbs has at least 1 synonym in the seed
 FAIL  src/registry/VerbActionMapRegistry.test.ts > VerbActionMapRegistry > loads and size matches the file (26 verbs)
 FAIL  src/registry/VerbActionMapRegistry.test.ts > VerbActionMapRegistry > list() returns all 26 mappings
 FAIL  src/compiler/scientistIntent/scientistIntentContract.test.ts > verb-inventory > fixture == types.ts union == schema enum == shipped vocabulary == INTENT_ACTIONS, length 31, declaration order
 FAIL  src/compiler/scientistIntent/vocabulary.test.ts > resolver-spec.validation > the shipped vocabulary validates + lints CLEAN (zero findings)
 FAIL  src/compiler/scientistIntent/vocabulary.test.ts > resolver-spec.validation > fixture vocabularies cache per resolved path (bait 2: fixture injection gets its own instance)
 FAIL  src/compiler/scientistIntent/vocabulary.test.ts > current-verb-parity > vocabulary verb set+order == verb-inventory.yaml == 31 (order-aware, bait 10)
 FAIL  src/compiler/scientistIntent/vocabularyRipOut.test.ts > scientist-intent-vocabulary.rip-out > prompt generated from the fixture vocabulary lacks pellet and contains the other 30
```

```
 Test Files  5 failed | 9 passed (14)
      Tests  8 failed | 238 passed (246)
   Start at  18:44:29
   Duration  2.79s (transform 1.73s, setup 1ms, collect 6.76s, tests 6.24s, environment 3ms, prepare 1.70s)
```

## 3. Data edits (mirrors, append LAST everywhere)

Machine re-derived counts from the committed tree (python yaml parse, CODER-CAPTURED):

```
vocab yaml: 32 last bead_beat
wire enum: 32 last bead_beat
inventory: 32 last bead_beat
verb-action-map: 27 last bead_beat
adjudication declared: 32 32 27 10
partition: same_op 3 ps_only 7 enum_only 29
minus-pellet fixture: 31 pellet present: False last bead_beat
```

Partition check: 3 same_operation + 29 enum_only = 32 enum verbs; 3 + 7 = 10 verb-definition
records (records untouched). bead_beat is LAST in vocabulary yaml, wire enum, inventory,
verb-action-map, and the minus-pellet fixture.

Vocabulary entry + fixture + expander diff (spec items 1, 8, 11 fixture):

```
diff --git a/schema/scientist-intent/scientist-intent-vocabulary.yaml b/schema/scientist-intent/scientist-intent-vocabulary.yaml
index 113605d6..e0c678ce 100644
--- a/schema/scientist-intent/scientist-intent-vocabulary.yaml
+++ b/schema/scientist-intent/scientist-intent-vocabulary.yaml
@@ -809,6 +809,29 @@ verbs:
       - name: targetWells
         kind: wells
         required: false
+  - name: bead_beat
+    class: simple
+    policyRef: hint-authority
+    args:
+      - name: labware
+        kind: resolvable
+        required: false
+        domain: labware
+        hintEligible: true
+      - name: material
+        kind: resolvable
+        required: false
+        domain: material
+        hintEligible: true
+      - name: duration
+        kind: scalar
+        required: false
+      - name: temperatureC
+        kind: quantity
+        required: false
+      - name: cycles
+        kind: quantity
+        required: false
 policies:
   strategyOrder:
     - explicit_wells
diff --git a/server/src/compiler/biology/verbs/simpleVerbs.ts b/server/src/compiler/biology/verbs/simpleVerbs.ts
index d66d2e01..2318c341 100644
--- a/server/src/compiler/biology/verbs/simpleVerbs.ts
+++ b/server/src/compiler/biology/verbs/simpleVerbs.ts
@@ -632,6 +632,28 @@ export const shakeExpander: BiologyVerbExpander = {
   },
 };
 
+/**
+ * bead_beat: single mix event (mechanical bead-beating disruption).
+ */
+export const beadBeatExpander: BiologyVerbExpander = {
+  verb: 'bead_beat',
+  expand(input) {
+    const { params } = input;
+    return [{
+      eventId: makeEventId('bead_beat'),
+      event_type: 'mix',
+      details: {
+        mode: 'bead_beating',
+        ...(params.cycles !== undefined ? { cycles: params.cycles as number } : {}),
+        ...(params.temperature !== undefined
+          ? { temperature: params.temperature as number }
+          : {}),
+      },
+      ...(params.labware_id ? { labwareId: params.labware_id as string } : {}),
+    }];
+  },
+};
+
 // Register all expanders at module import time
 registerVerbExpander(seedExpander);
 registerVerbExpander(incubateExpander);
@@ -651,3 +673,4 @@ registerVerbExpander(createContainerExpander);
 registerVerbExpander(readExpander);
 registerVerbExpander(transferExpander);
 registerVerbExpander(shakeExpander);
+registerVerbExpander(beadBeatExpander);
diff --git a/server/src/compiler/scientistIntent/fixtures/vocab-minus-pellet/scientist-intent-vocabulary.yaml b/server/src/compiler/scientistIntent/fixtures/vocab-minus-pellet/scientist-intent-vocabulary.yaml
index 6e0b8bd3..e981d69c 100644
--- a/server/src/compiler/scientistIntent/fixtures/vocab-minus-pellet/scientist-intent-vocabulary.yaml
+++ b/server/src/compiler/scientistIntent/fixtures/vocab-minus-pellet/scientist-intent-vocabulary.yaml
@@ -759,6 +759,29 @@ verbs:
       - name: targetWells
         kind: wells
         required: false
+  - name: bead_beat
+    class: simple
+    policyRef: hint-authority
+    args:
+      - name: labware
+        kind: resolvable
+        required: false
+        domain: labware
+        hintEligible: true
+      - name: material
+        kind: resolvable
+        required: false
+        domain: material
+        hintEligible: true
+      - name: duration
+        kind: scalar
+        required: false
+      - name: temperatureC
+        kind: quantity
+        required: false
+      - name: cycles
+        kind: quantity
+        required: false
 policies:
   strategyOrder:
     - explicit_wells```

Wire enum, inventory, registry template, types.ts union (mirrors (b), (f), (e), (a)); mirrors
(c) tool-schema and (d) intentCompile ALLOWED block verified GENERATED — NO edit made to
intentCompile.ts:

```
diff --git a/schema/registry/prompt-templates/intent.compile.system.yaml b/schema/registry/prompt-templates/intent.compile.system.yaml
index d419cac0..e44b2fa8 100644
--- a/schema/registry/prompt-templates/intent.compile.system.yaml
+++ b/schema/registry/prompt-templates/intent.compile.system.yaml
@@ -27,7 +27,7 @@ content: |
   block | quench | label | transfect | aliquot | wash | elute | harvest |
   passage | freeze | thaw | spin | pellet |
   serial_dilution | media_swap_duplicate_columns |
-  source_wells_to_duplicate_target_columns | repeat_rows
+  source_wells_to_duplicate_target_columns | repeat_rows | bead_beat
 
   PARAMETERS (use only these; natural names, ordinary numbers/strings):
   - source, target, labware: SYMBOLIC labels for a material/plate. NEVER a
diff --git a/schema/workflow/scientist-intent.schema.yaml b/schema/workflow/scientist-intent.schema.yaml
index 39bed59e..c29fd28c 100644
--- a/schema/workflow/scientist-intent.schema.yaml
+++ b/schema/workflow/scientist-intent.schema.yaml
@@ -57,6 +57,7 @@ $defs:
     - media_swap_duplicate_columns
     - source_wells_to_duplicate_target_columns
     - repeat_rows
+    - bead_beat
 
 properties:
   intentId:
diff --git a/server/src/compiler/biology/BiologyVerbExpander.test.ts b/server/src/compiler/biology/BiologyVerbExpander.test.ts
index 55129b3c..ad5d4d7f 100644
--- a/server/src/compiler/biology/BiologyVerbExpander.test.ts
+++ b/server/src/compiler/biology/BiologyVerbExpander.test.ts
@@ -29,6 +29,7 @@ import {
   labelExpander,
   transfectExpander,
   shakeExpander,
+  beadBeatExpander,
 } from './verbs/simpleVerbs.js';
 
 // Allowed event types
@@ -122,6 +123,7 @@ describe('BiologyVerbExpander verb expanders', () => {
     label: labelExpander,
     transfect: transfectExpander,
     shake: shakeExpander,
+    bead_beat: beadBeatExpander,
   };
 
   for (const [verb, expander] of Object.entries(expanderMap)) {
diff --git a/server/src/compiler/scientistIntent/fixtures/verb-inventory.yaml b/server/src/compiler/scientistIntent/fixtures/verb-inventory.yaml
index 98ff81f4..e2a7ccbf 100644
--- a/server/src/compiler/scientistIntent/fixtures/verb-inventory.yaml
+++ b/server/src/compiler/scientistIntent/fixtures/verb-inventory.yaml
@@ -34,3 +34,4 @@ verbs:
 - media_swap_duplicate_columns
 - source_wells_to_duplicate_target_columns
 - repeat_rows
+- bead_beat
diff --git a/server/src/compiler/scientistIntent/types.ts b/server/src/compiler/scientistIntent/types.ts
index f03bf846..1dc0532b 100644
--- a/server/src/compiler/scientistIntent/types.ts
+++ b/server/src/compiler/scientistIntent/types.ts
@@ -52,7 +52,8 @@ export type ScientistIntentActionKind =
   | 'serial_dilution'
   | 'media_swap_duplicate_columns'
   | 'source_wells_to_duplicate_target_columns'
-  | 'repeat_rows';
+  | 'repeat_rows'
+  | 'bead_beat';
 
 export interface ScientistIntentActionValue {
   schema?: unknown;
diff --git a/server/src/registry/VerbActionMapRegistry.synonyms.test.ts b/server/src/registry/VerbActionMapRegistry.synonyms.test.ts
index c4f2b297..29473a82 100644
--- a/server/src/registry/VerbActionMapRegistry.synonyms.test.ts
+++ b/server/src/registry/VerbActionMapRegistry.synonyms.test.ts
@@ -34,9 +34,9 @@ describe('VerbActionMapRegistry — findVerbForToken', () => {
     expect(result).toBeUndefined();
   });
 
-  it('every one of the 26 canonical verbs has at least 1 synonym in the seed', () => {
+  it('every one of the 27 canonical verbs has at least 1 synonym in the seed', () => {
     const allMappings = registry.list();
-    expect(allMappings.length).toBe(26);
+    expect(allMappings.length).toBe(27);
     for (const m of allMappings) {
       expect(m.synonyms).toBeDefined();
       expect(Array.isArray(m.synonyms)).toBe(true);
diff --git a/server/src/registry/VerbActionMapRegistry.test.ts b/server/src/registry/VerbActionMapRegistry.test.ts
index b1fb6b5a..5117ff76 100644
--- a/server/src/registry/VerbActionMapRegistry.test.ts
+++ b/server/src/registry/VerbActionMapRegistry.test.ts
@@ -6,9 +6,9 @@ import { describe, it, expect } from 'vitest';
 import { getVerbActionMap, type VerbMapping } from './VerbActionMapRegistry.js';
 
 describe('VerbActionMapRegistry', () => {
-  it('loads and size matches the file (26 verbs)', () => {
+  it('loads and size matches the file (27 verbs)', () => {
     const registry = getVerbActionMap();
-    expect(registry.size()).toBe(26);
+    expect(registry.size()).toBe(27);
   });
 
   it('lookup("incubate") returns a mapping with at least one of exact_id or obi_id', () => {
@@ -218,10 +218,10 @@ describe('VerbActionMapRegistry', () => {
     expect(mapping).toBeUndefined();
   });
 
-  it('list() returns all 26 mappings', () => {
+  it('list() returns all 27 mappings', () => {
     const registry = getVerbActionMap();
     const all = registry.list();
-    expect(all.length).toBe(26);
+    expect(all.length).toBe(27);
     // Verify all verbs are present — matches the registered verb expanders
     const verbs = all.map((m) => m.verb);
     const expectedVerbs = [```

Adjudication counts, enum_only governance comment, verb-action-map mapping (seed precedent,
NO OBI id invented per OQ1 adjudication), goldens MANIFEST re-bless (§4):

```
diff --git a/schema/registry/verb-action-map.yaml b/schema/registry/verb-action-map.yaml
index ffd1c2ba..3e8bd575 100644
--- a/schema/registry/verb-action-map.yaml
+++ b/schema/registry/verb-action-map.yaml
@@ -110,3 +110,6 @@ mappings:
     obi_id: "OBI:0000293"
     notes: "Move liquid from source to destination wells"
     synonyms: [move]
+  - verb: bead_beat
+    notes: "no canonical mapping"
+    synonyms: [bead-beat, homogenize, bead beat]
diff --git a/schema/registry/wave2-verb-adjudication.yaml b/schema/registry/wave2-verb-adjudication.yaml
index 0fb16eed..92a6aac9 100644
--- a/schema/registry/wave2-verb-adjudication.yaml
+++ b/schema/registry/wave2-verb-adjudication.yaml
@@ -18,9 +18,9 @@ vocabularies:
   scientist_intent_enum:
     source: schema/workflow/scientist-intent.schema.yaml
     path: "$defs/actionVerb"
-    count: 31
+    count: 32
     mirror: schema/scientist-intent/scientist-intent-vocabulary.yaml
-    mirror_count: 31
+    mirror_count: 32
     mirror_rule: "set equality + declaration order (vocabularyMirrorDrift test)"
   verb_definition_records:
     source: records/seed/verb-definition/
@@ -32,7 +32,7 @@ vocabularies:
     note: "third neighboring vocabulary (kind: operation-registry); named, never conflated"
   neighboring_verb_action_map:
     source: schema/registry/verb-action-map.yaml
-    count: 26
+    count: 27
     note: "synonym/ontology map over scientist-intent verbs; 5 enum verbs unmapped (see findings)"
 
 # verb-definition record id <-> scientist-intent action (when they denote the
@@ -72,7 +72,7 @@ mappings:
     - verb_definition_id: VERB-STIR
       canonical: stir
   enum_only:
-    # 28 of the 31 enum verbs have no verb-definition record (31 - 3 mapped above)
+    # 29 of the 32 enum verbs have no verb-definition record (32 - 3 mapped above)
     - seed
     - mix
     - resuspend
@@ -101,6 +101,11 @@ mappings:
     - media_swap_duplicate_columns
     - source_wells_to_duplicate_target_columns
     - repeat_rows
+    # bead_beat: added to the scientist-intent union by Brad ruling 2026-10-17
+    # (W28-A5 bead-beat approval). This supersedes the VERB-SONICATE
+    # protocol_semantic_only POSTURE for the bead-beating operation only; the
+    # VERB-SONICATE/VERB-STIR verb-definition records themselves are untouched.
+    - bead_beat
 
 findings:
   - id: W2-1-F1
diff --git a/server/src/compiler/scientistIntent/goldens/MANIFEST.yaml b/server/src/compiler/scientistIntent/goldens/MANIFEST.yaml
index fbf743ab..9ef5a987 100644
--- a/server/src/compiler/scientistIntent/goldens/MANIFEST.yaml
+++ b/server/src/compiler/scientistIntent/goldens/MANIFEST.yaml
@@ -6,13 +6,17 @@
 suite: spine6-scientist-intent-goldens
 baseCommit: c74c5214
 treeState:
-  # COMP4-REBLESS (this item): vocabulary pin re-hashed once on this item's tip
-  # (composition declared cardinality: many on add_material + seed) and the
+  # COMP4-REBLESS (SHORTHAND-COMP4): vocabulary pin re-hashed once on that item's
+  # tip (composition declared cardinality: many on add_material + seed) and the
   # wire-schema pin re-hashed once (action-level composition property declared
   # with strict items). Pipeline pin unchanged from the SPINE-7 bless.
   # Before/after diff per blessed entry in SHORTHAND-COMP4-report.l2t0910.md.
-  - {path: schema/scientist-intent/scientist-intent-vocabulary.yaml, sha256: 14d779ce050ee5fd306f2d3772efcaae6386b09cb9fef4e5c9ed8ed7b475f9b4}
-  - {path: schema/workflow/scientist-intent.schema.yaml, sha256: cb54cbeded8c6cab7b31b89b68e9476b62d04c737dab4fb2a30a2a14167f09d5}
+  # W2-8-A5g REBLESS (this item): bead_beat appended LAST to the vocabulary
+  # verbs and the wire enum (Brad ruling 2026-10-17); both pins re-hashed once.
+  # Before/after diff recorded in W2-8-A5g-report.wip-l2t1710.md. Golden
+  # fixtures/records unchanged — only the two treeState rule files moved.
+  - {path: schema/scientist-intent/scientist-intent-vocabulary.yaml, sha256: aa57f2e3627ab828d2b7b3180ac04b303cc0989520c6ef087ba3a151ea25a73c}
+  - {path: schema/workflow/scientist-intent.schema.yaml, sha256: a670a50c021037c8e146f4a6c1a27677680d51f6d5dfee72c13f1b35093b1409}
   - {path: schema/registry/compile-pipelines/scientist-intent-compile.yaml, sha256: b47eee0c3bd0f4f334b5070c3bfba2cbf0d0a360bd38af855c10bd012679fbf8}
 fixtures:
   - {name: golden.intent-to-graph.transfer-read, path: fixtures/transfer-read.yaml, sha256: a8556ba41ae2f9ef151948ad4349335ab3fb1ff0992efd07896f46e4d8ceac11}```

## 4. Goldens manifest re-bless (deliberate, disclosed — NOT in the spec's enumerated sweep)

The broad `npx vitest run` sweep caught two failures the spec's grep sweep missed:
`goldens/goldenIntentToGraph.test.ts` and `goldens/goldenProseBlobStrip.test.ts` — both legs
re-hash every treeState-pinned rule file (`manifestHashMismatches`). Editing the vocabulary yaml
and wire enum moved those hashes by design ("rule/spec drift fails LOUD, never silently
re-blessed"). The house precedent for a data item that edits pinned rule files is the
COMP4-REBLESS comment already in MANIFEST.yaml. I re-blessed the two treeState pins ONCE
(verified sha256 of the edited files: aa57f2e3... and a670a50c...) and proved the goldens'
BEHAVIOR is unchanged: all 10 fixtures + 10 blessed records hashes untouched (grep: zero golden
fixture/record mentions bead_beat), and all 4 golden suites replay byte-identical after the
re-bless. RED before re-bless:

```
 Test Files  2 failed (2)
      Tests  2 failed | 4 passed (6)
   Start at  18:49:58
   Duration  1.33s (transform 453ms, setup 0ms, collect 1.40s, tests 127ms, environment 0ms, prepare 197ms)
```

GREEN after re-bless (all 4 golden files, 19 tests):

```
 Test Files  4 passed (4)
      Tests  19 passed (19)
   Start at  18:50:57
   Duration  2.74s (transform 508ms, setup 0ms, collect 2.82s, tests 256ms, environment 1ms, prepare 566ms)
```

## 5. Deliberate pin diffs (every count change, with justification)

Test-file pin sweep diff (spec items 9-14):

```
diff --git a/docs/wave2-naming-crosswalk.md b/docs/wave2-naming-crosswalk.md
index f6239157..dd04d24f 100644
--- a/docs/wave2-naming-crosswalk.md
+++ b/docs/wave2-naming-crosswalk.md
@@ -72,25 +72,25 @@ kind (schema/workflow/equipment-capability.schema.yaml:21) — bead-beater
 ## 5. Verb adjudication — two vocabularies, ONE mapping table, never merged
 
 Machine-extracted counts (parsed from YAML, re-derived by the test):
-- scientist-intent enum ($defs/actionVerb, scientist-intent.schema.yaml:22): **31**
-- scientist-intent-vocabulary.yaml (`verbs:` :12): **31**, set-equal AND
+- scientist-intent enum ($defs/actionVerb, scientist-intent.schema.yaml:22): **32**
+- scientist-intent-vocabulary.yaml (`verbs:` :12): **32**, set-equal AND
   order-equal to the enum (verified by parse; drift-guarded by
   vocabularyMirrorDrift.test.ts)
 - verb-definition seed records (records/seed/verb-definition/): **10**
 - operations.yaml (kind: operation-registry, :1; `operations:` :3): **27** —
   third neighboring vocabulary, named, never conflated
-- verb-action-map.yaml (`mappings:` :2): **26** — synonym/ontology map, a
+- verb-action-map.yaml (`mappings:` :2): **27** — synonym/ontology map, a
   fourth neighboring surface
 
 Mapping (schema/registry/wave2-verb-adjudication.yaml): same_operation =
 VERB-INCUBATE<->incubate, VERB-READ<->read, VERB-SHAKE<->shake (3);
 protocol-semantic-only (no compiler verb) = autoclave, heat, microwave, rock,
-set, sonicate, stir (7); enum-only (no verb-definition) = 28 verbs
+set, sonicate, stir (7); enum-only (no verb-definition) = 29 verbs
 (seed, mix, resuspend, dilute, count, add_material, create_container,
 transfer, stain, fix, permeabilize, block, quench, label, transfect, aliquot,
 wash, elute, harvest, passage, freeze, thaw, spin, pellet, serial_dilution,
 media_swap_duplicate_columns, source_wells_to_duplicate_target_columns,
-repeat_rows). 3+7=10 and 3+28=31 — the table partitions both sets exactly
+repeat_rows, bead_beat). 3+7=10 and 3+29=32 — the table partitions both sets exactly
 (asserted by the test). Zero verbs added to either vocabulary.
 
 ## 6. FINDINGS — genuine collisions TODAY (recorded, NOT resolved)
@@ -106,7 +106,7 @@ repeat_rows). 3+7=10 and 3+28=31 — the table partitions both sets exactly
 - W2-1-F4 `spin`/`pellet` vs `centrifuge`: enum verbs spin (:53) and pellet
   (:54) are operations.yaml ALIASES of `centrifuge` (operations.yaml:66-69),
   and `centrifuge` is not an enum verb.
-- W2-1-F5 coverage gap: verb-action-map.yaml has 26 mappings vs 31 enum verbs;
+- W2-1-F5 coverage gap: verb-action-map.yaml has 27 mappings vs 32 enum verbs;
   unmapped = shake + the 4 pattern macros (class: pattern at
   scientist-intent-vocabulary.yaml:660/698/732/763).
 - W2-1-F6 `warm`: alias `warm` is assigned to TWO distinct operations —
diff --git a/server/src/compiler/scientistIntent/scientistIntentContract.test.ts b/server/src/compiler/scientistIntent/scientistIntentContract.test.ts
index 31e8ae1d..8bb55821 100644
--- a/server/src/compiler/scientistIntent/scientistIntentContract.test.ts
+++ b/server/src/compiler/scientistIntent/scientistIntentContract.test.ts
@@ -157,14 +157,14 @@ describe('verb-inventory', () => {
   const schemaDoc = loadSchemaDocument();
   const schemaEnum = actionEnumFromSchema(schemaDoc);
 
-  it('fixture == types.ts union == schema enum == shipped vocabulary == INTENT_ACTIONS, length 31, declaration order', () => {
+  it('fixture == types.ts union == schema enum == shipped vocabulary == INTENT_ACTIONS, length 32, declaration order', () => {
     // Set equality AND declaration-order equality (bait §8.7: sorted-alphabetical
     // would silently pass a set test yet lose the migration-baseline order).
-    expect(fixtureVerbs).toHaveLength(31);
-    expect(unionVerbs).toHaveLength(31);
-    expect(vocabularyVerbs).toHaveLength(31);
-    expect(schemaEnum).toHaveLength(31);
-    expect([...INTENT_ACTIONS]).toHaveLength(31);
+    expect(fixtureVerbs).toHaveLength(32);
+    expect(unionVerbs).toHaveLength(32);
+    expect(vocabularyVerbs).toHaveLength(32);
+    expect(schemaEnum).toHaveLength(32);
+    expect([...INTENT_ACTIONS]).toHaveLength(32);
 
     expect(fixtureVerbs).toEqual(unionVerbs);
     expect(vocabularyVerbs).toEqual(unionVerbs);
diff --git a/server/src/compiler/scientistIntent/vocabulary.test.ts b/server/src/compiler/scientistIntent/vocabulary.test.ts
index c2d4a84e..48be8f68 100644
--- a/server/src/compiler/scientistIntent/vocabulary.test.ts
+++ b/server/src/compiler/scientistIntent/vocabulary.test.ts
@@ -4,7 +4,7 @@
  * resolver-spec.validation: the shipped vocabulary validates (Ajv) AND lints
  * (P1-P4) CLEAN; each named fixture mutation produces a NAMED failure.
  * current-verb-parity: vocabulary verb set+order == fixtures/verb-inventory.yaml
- * == 31, and every acceptance shape SPINE-1 pinned still parses through the
+ * == 32, and every acceptance shape SPINE-1 pinned still parses through the
  * REAL parseScientistIntent singleton.
  */
 import { describe, expect, it } from 'vitest';
@@ -60,7 +60,7 @@ actions:
 describe('resolver-spec.validation', () => {
   it('the shipped vocabulary validates + lints CLEAN (zero findings)', async () => {
     const vocab = defaultScientistIntentVocabulary();
-    expect(vocab.verbs()).toHaveLength(31);
+    expect(vocab.verbs()).toHaveLength(32);
 
     // The lint spec loads through the repo lint loader with zero load errors
     // for our paths, and the shipped document produces zero violations.
@@ -157,16 +157,16 @@ describe('resolver-spec.validation', () => {
     const shipped = defaultScientistIntentVocabulary();
     expect(a).toBe(b); // cached per path
     expect(a).not.toBe(shipped);
-    expect(a.verbs()).toHaveLength(30);
-    expect(shipped.verbs()).toHaveLength(31);
+    expect(a.verbs()).toHaveLength(31);
+    expect(shipped.verbs()).toHaveLength(32);
   });
 });
 
 describe('current-verb-parity', () => {
-  it('vocabulary verb set+order == verb-inventory.yaml == 31 (order-aware, bait 10)', () => {
+  it('vocabulary verb set+order == verb-inventory.yaml == 32 (order-aware, bait 10)', () => {
     const inventory = (parseYaml(readFileSync(INVENTORY_PATH, 'utf-8')) as { verbs: string[] }).verbs;
     const vocab = defaultScientistIntentVocabulary();
-    expect(inventory).toHaveLength(31);
+    expect(inventory).toHaveLength(32);
     expect([...vocab.verbs()]).toEqual(inventory); // order-aware equality
     expect(new Set(vocab.verbs())).toEqual(new Set(inventory)); // set identity both directions
   });
diff --git a/server/src/compiler/scientistIntent/vocabularyRipOut.test.ts b/server/src/compiler/scientistIntent/vocabularyRipOut.test.ts
index 7d943940..8dbbf7a5 100644
--- a/server/src/compiler/scientistIntent/vocabularyRipOut.test.ts
+++ b/server/src/compiler/scientistIntent/vocabularyRipOut.test.ts
@@ -47,12 +47,12 @@ describe('scientist-intent-vocabulary.rip-out', () => {
     path: join(FIXTURES, 'vocab-minus-pellet', VOCABULARY_DATA_FILE),
   });
 
-  it('fixture vocabulary (copy minus pellet) has 30 verbs and lacks pellet', () => {
-    expect(fixtureVocab.verbs()).toHaveLength(30);
+  it('fixture vocabulary (copy minus pellet) has 31 verbs and lacks pellet', () => {
+    expect(fixtureVocab.verbs()).toHaveLength(31);
     expect(fixtureVocab.has('pellet')).toBe(false);
   });
 
-  it('prompt generated from the fixture vocabulary lacks pellet and contains the other 30', () => {
+  it('prompt generated from the fixture vocabulary lacks pellet and contains the other 31', () => {
     const prompt = intentCompileSystemPrompt(fixtureVocab);
     expect(prompt).not.toMatch(/\bpellet\b/);
     const shipped = defaultScientistIntentVocabulary();```

Justifications, one line each:
- scientistIntentContract.test.ts: five `toHaveLength(31)` -> 32 + title — the union IS 32 now; all five copies re-derive 32.
- vocabulary.test.ts :63 shipped 31->32 — loader leg counts the shipped vocabulary (32).
- vocabulary.test.ts :160/:161 fixture 30->31 / shipped 31->32 — minus-pellet fixture is "shipped minus pellet" by construction; shipped gained bead_beat.
- vocabulary.test.ts :169 inventory 31->32 + title + header comment — inventory gained bead_beat.
- vocabulary.test.ts :131 NOT touched — frozen mutation fixture vocab-plain-verb-no-policyref (31 verbs) does not gain bead_beat; verified still green.
- vocabularyRipOut.test.ts :50-55 30->31 (fixture + "the other 31") — the contains-every-shipped-verb-except-pellet loop goes RED unless the fixture gains bead_beat (OQ2 APPROVED); `/\bpellet\b/` negative stays green.
- VerbActionMapRegistry.test.ts :9/:11 and :221/:224 26->27 — the map file has 27 mappings; expectedVerbs contains-check left as-is per spec.
- VerbActionMapRegistry.synonyms.test.ts :37/:39 26->27 — same map, bead_beat carries 3 synonyms.
- BiologyVerbExpander.test.ts — expanderMap gains bead_beat; verbose run shows `expands 'bead_beat' to valid event types` green (36 tests, was 35).
- wave2-verb-adjudication.yaml hand counts 31->32, 31->32, 26->27 + enum_only append + comment 29 of 32 — hand-maintained numbers the drift guard re-derives.
- docs/wave2-naming-crosswalk.md :75-76 31->32, :82 26->27, :88/:93 28->29 and 3+29=32, :109 27 vs 32 (OQ3 IN SCOPE).

## 6. Final verification (CODER-CAPTURED)

14-file suite, final (raw /tmp/a5g-final-14.txt):

```
 ✓ src/registry/VerbActionMapRegistry.synonyms.test.ts  (5 tests) 7ms
 ✓ src/registry/VerbActionMapRegistry.test.ts  (29 tests) 27ms
 ✓ src/compiler/biology/BiologyVerbExpander.test.ts  (36 tests) 27ms
 ✓ src/compiler/scientistIntent/noBypass.test.ts  (7 tests) 351ms
 ✓ src/compiler/pipeline/passes/ChatbotCompilePasses.test.ts  (44 tests) 36ms
 ✓ src/compiler/scientistIntent/vocabularyMirrorDrift.test.ts  (6 tests) 22ms
 ✓ src/compiler/scientistIntent/scientistIntentContract.test.ts  (15 tests) 125ms
 ✓ src/compiler/scientistIntent/promptShapeParity.test.ts  (9 tests) 62ms
 ✓ src/compiler/scientistIntent/clarificationContract.test.ts  (15 tests) 506ms
 ✓ src/compiler/scientistIntent/vocabularyRipOut.test.ts  (8 tests) 136ms
 ✓ src/compiler/scientistIntent/vocabulary.test.ts  (16 tests) 953ms
 ✓ src/compiler/scientistIntent/realizeScientistIntent.test.ts  (18 tests) 721ms
 ✓ src/schema/Wave2QuantitySchema.test.ts  (33 tests) 1513ms
 ✓ src/schema/Wave2NamingCrosswalk.test.ts  (6 tests) 2124ms
```

```
 Test Files  14 passed (14)
      Tests  247 passed (247)
   Start at  18:53:27
   Duration  2.95s (transform 1.76s, setup 1ms, collect 6.60s, tests 6.61s, environment 4ms, prepare 1.71s)
```

246 -> 247 tests: BiologyVerbExpander 35 -> 36 (the new bead_beat parametric leg). Loader
schema+lint boot leg (`vocabulary.test.ts` 'the shipped vocabulary validates + lints CLEAN')
green with the new triplet — the acceptance criterion. Mirror suite 6/6 green. Crosswalk drift
guard green at declared 32/32/27 with the 3+29=32 partition. Registry suites green at 27.
promptShapeParity untouched and green (9 tests). realizeScientistIntent 'agitate' door-2 leg
green (18 tests).

Broader sweep `npx vitest run` (serialized, one run at a time):

BEFORE (raw /tmp/a5g-sweep-before.txt):
```
 Test Files  172 failed | 555 passed | 9 skipped (736)
      Tests  126 failed | 5283 passed | 68 skipped (5477)
   Start at  18:41:45
   Duration  113.18s (transform 63.55s, setup 366ms, collect 450.60s, tests 498.05s, environment 940ms, prepare 415.38s)
```

AFTER all edits incl. re-bless (raw /tmp/a5g-sweep-after2.txt):
```
 Test Files  172 failed | 555 passed | 9 skipped (736)
      Tests  126 failed | 5284 passed | 68 skipped (5478)
   Start at  18:51:03
   Duration  107.84s (transform 56.70s, setup 201ms, collect 425.78s, tests 468.79s, environment 941ms, prepare 393.74s)
```

Fail-FILE set comparison (same extraction rule `grep -oE '❯[[:space:]]+(src|test)/[^[:space:]]+\.test\.tsx?'` on both raws; lists at /tmp/a5g-sweep-before-fails.txt and /tmp/a5g-sweep-after2-fails.txt, 172 files each):

comm -3 before vs after: the command output is EMPTY — the two 172-line fail-file lists are
identical (raws: /tmp/a5g-sweep-before-fails.txt, /tmp/a5g-sweep-after2-fails.txt).

Zero new failing files. Tests 5283 -> 5284 passed (+1 = the bead_beat expander leg); total 5477 -> 5478 (+1 collected test). The 172-file fail-set is the §0 lane-exclusion debt (TS2307 cascade), identical base->head. An intermediate sweep (/tmp/a5g-sweep-after.txt, 174 failed) showed the two goldens manifest-hash legs RED before the §4 re-bless — disclosed, then repaired.

tsc before/after: `diff /tmp/a5g-tsc-before.txt /tmp/a5g-tsc-after.txt` output is EMPTY — zero
new error lines. 21 lines before, 21 after — identical pre-existing debt.

## 7. Out-of-scope confirmations

- event_type: bead_beat lowers to 'mix' (details.mode 'bead_beating'); NO event-graph enum change; NO app/** changes (diff touches no app/ file).
- registerVerbExpander(beadBeatExpander) appears exactly ONCE (grep count 1; double-add would throw at import).
- VERB-SONICATE / VERB-STIR rows untouched; verb_definition_records.count stays 10.
- resolution frozen fixtures (vocab-shipped-copy/policy-flip/required-flip/domain-flip) left untouched — grep confirms tests load them only against their own flips (nounResolution, resolveNounsPass, spine4Registration), never compared to shipped verb lists.
- scientist-intent-vocabulary.schema.yaml / .lint.yaml untouched; chatbot-compile.precompile template untouched; wave2-naming-crosswalk.yaml untouched; intentCompile.ts untouched (generated block).
- No OBI id invented (OQ1): verb-action-map entry uses the seed precedent `notes: "no canonical mapping"`.
- No stack touched; no data dir written; no pnpm install.

## 8. base..HEAD

- Base: bb5c6501 (cl/integration-2)
- HEAD: 05775644d8b5ffccf053e59ef62fa78834762f9b — feat(vocab): bead_beat as the 32nd scientist-intent verb (W2-8-A5g)
- 17 files changed, 123 insertions(+), 37 deletions(-) (git diff --stat bb5c6501..HEAD)

CODER DONE
