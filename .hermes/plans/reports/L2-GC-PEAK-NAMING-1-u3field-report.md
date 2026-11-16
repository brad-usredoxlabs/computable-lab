# L2-GC-PEAK-NAMING-1-u3field report (lane 2)

## Unit
L2-GC-PEAK-NAMING-1 unit u3field (k=3, display leg). GC bundle gate r1 finding T2-2: record
MSP-FAME-37-MIX-RESTEK-35077 carries formulation.composition (3 component_ref entries) and a
provenance.note declaring the declaration PARTIAL, but schema/lab/material-spec.ui.yaml declared
no field for either, so the rendered record view showed none of it (baseline at base sha: DOM
probe for /composition|hexanoate/ = false; receipts GC-BUNDLE-r1-20261115T234023Z). Fix: add TWO
readonly display fields to the form spec. NO picker, NO writable control.

## Diff (exact, applied with the patch tool)
```diff
@@ -57,6 +57,16 @@
     - path: "$.formulation.grade"
       widget: "text"
       label: "Grade"
+    - path: "$.formulation.composition"
+      widget: "array"
+      label: "Composition"
+      help: "Declared component materials; see the provenance note for completeness."
+      readonly: true
+    - path: "$.provenance.note"
+      widget: "text"
+      label: "Provenance Note"
+      help: "Why this declaration is partial or how it was sourced."
+      readonly: true
     - path: "$.handling.storage_temperature_C"
       widget: "number"
       label: "Storage Temp (C)"
```

## Changed files
- schema/lab/material-spec.ui.yaml: +10 / -0. Inserted BETWEEN the grade field (verbatim current
  line 59) and the handling field (verbatim current line 60), exactly per the unit's BEDROCK.
- Output budget: 1 file, 10 lines (budget: <= 1 file, <= 12 lines).
- No other file touched: material-spec.schema.yaml, app/**, vendor-product.ui.yaml, records/**,
  server/** all unmodified. Data-schema paths confirmed read-only facts (composition: under
  formulation; provenance.note:), no edits there.

## Verification (as actually run)
- YAML parse: the brief's exact command failed in the worktree with
  `Error: Cannot find module 'js-yaml'` (worktree checkout has no node_modules). Re-ran from repo
  root with NODE_PATH pointing at the main checkout's deps:
  `NODE_PATH=/home/brad/git/computable-lab/server/node_modules node -e "require('js-yaml').load(require('fs').readFileSync('schema/lab/material-spec.ui.yaml','utf8')); console.log('YAML-OK')"`
  -> `YAML-OK` (js-yaml 4.x load succeeded on the final committed content).
- Schema lint: `cd server && npx vitest run src/schema` -> rc 127 (vitest unavailable: worktree
  server/ has no node_modules; npx cannot resolve it). Reported, not chased, per the brief; no
  failure unrelated to this file was investigated.
- Readonly-array idiom copied (not edited) from the proven pattern at
  schema/lab/vendor-product.ui.yaml lines 65-76 (composition_drafts: widget "array", readonly: true).
- Rendering (AC2): no unit pin per the brief — proved at the milestone browser gate (DOM probe
  /hexanoate|octanoate|decanoate|PARTIAL/i expected true on the MSP-FAME-37-MIX-RESTEK-35077
  record view). The generated editor renders the array generically; a record lacking the path
  renders blank (functionality-first, per the brief). ORCHESTRATOR ACTION: the lane stack must be
  reloaded (YAML changed) before live verification.

## AC map
- AC1 (readonly array display for $.formulation.composition; readonly text for $.provenance.note):
  satisfied by the diff above — widget "array" + readonly: true; widget "text" + readonly: true;
  both with help text pointing at the honesty note / completeness.
- AC2 (record view renders composition entries + PARTIAL note): DEFERRED to the milestone
  browser gate; baseline was nothing (gate r1 receipts); no component change permitted here.
- AC3 (YAML parses; no other field changes; no writable control added): YAML-OK above; the diff
  is exactly the inserted block (verified by `git diff --stat`: 1 file, 10 insertions, 0
  deletions); both new fields carry `readonly: true` and no picker widget was added.

## Decisions
- Insertion position between grade and handling verbatim per BEDROCK; field shapes (labels, help
  strings, readonly) verbatim per BEDROCK — no creative latitude taken.
- Marker sequence follows the lane's accepted pattern (see L2-GC-AIA-PARSER-SHAPE-1-u4option):
  report commit, then a marker commit that appends the marker line, because the evidence checker
  (cl-unit-evidence-check.py EV-4) requires the cited SHA to CONTAIN the report file — so the
  cited SHA is the report commit, which is the commit that commits this report.

## Commits
- f263ad03a154537b4e0b16990e7f0c9dd61a34a8 schema(L2-GC-PEAK-NAMING-1-u3field): declare
  composition + provenance.note readonly display fields on material-spec surface (GC bundle gate
  r1 T2-2)
- (this report commit)
- (marker commit: appends the marker line below + marker/L2-GC-PEAK-NAMING-1-u3field.done)

## Remaining blockers / next
None for this unit. AC2 belongs to the milestone browser gate; the lane stack reload (YAML
changed) is the orchestrator's action before live verification.
