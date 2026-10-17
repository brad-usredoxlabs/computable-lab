# OWN-1 fix-cycle decision request — two defects inherited from plan §T1
Requested by: lane-1 orchestrator tick 20261011T0415
Item: OWN-1 (ownership-policy schema trio), campaign lab-ownership-and-sharing-policy
Plan of record: .hermes/plans/2026-10-10_192635-lab-ownership-and-sharing-policy.md §T1
Adversarial review (VERDICT: fix, full evidence): /home/brad/.hermes/cl/lanes/1/reviews/own1-advreview-l1t0405.md
Coder worktree/branch: /mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135 @ 9356af30

## Why this is a decision, not a coder fix
Both defects are present in the plan's AUTHORITATIVE verbatim YAML (§T1) that the coder was
pinned to reproduce byte-for-byte (it did, verified). Fixing either one deviates from
Brad-approved plan text, which is out of coder scope.

## DEFECT 1 (critical) — ui.yaml `widget: "json"` is illegal
- ownership-policy.ui.yaml:52 (plan §T1 line 294) uses widget "json".
- UISpecLoader.ts:19-29 VALID_WIDGET_TYPES has no 'json' → the ui spec FAILS to load.
- schema/ui/ui-v1.schema.yaml:165-181 field.widget enum has no 'json' → meta-schema INVALID.
- Reviewer ran both checks (Ajv + loader read); reproduced.
Options:
  (a) Change §T1 widget to an already-legal value. Best fit: "object" (in loader whitelist AND
      ui-v1 enum; renders the kindRules array as a structured object/array editor). "code" is the
      raw-JSON fallback.
  (b) PLATFORM: add "json" to UISpecLoader whitelist + ui-v1 enum. Wider blast radius, new widget
      implementation may not exist app-side (would render blank — the exact EDITOR-3 class defect).

## DEFECT 2 (major) — ../core/common.schema.yaml $ref dangles in $id URL space
- ownership-policy.schema.yaml:13 (plan §T1) mixes in FAIRCommon via "../core/common.schema.yaml#/$defs/FAIRCommon".
- In the registry's URL space (SchemaRegistry.normalizeRef, :27-60), that resolves to
  .../schema/core/common.schema.yaml — NOT a registered $id. Ajv MissingRefError at validate time.
  Reviewer + coder probes both confirm.
- The identity-sibling convention (access-policy.schema.yaml:12) uses "./common.schema.yaml",
  which DOES resolve (registered .../computable-lab/common.schema.yaml).
- Note: extraction-spec and bio/sequence already carry the same dangling ../core/ class (pre-existing).
Option:
  (a) Fix ONLY the new trio: use ./common.schema.yaml like its identity siblings (smallest change,
      restores the mixin's intent, no platform change).
  (b) Register core/common.schema.yaml under the /schema/core/ URL space — fixes the whole
      pre-existing class but is a platform-wide change, out of this wave.

## Recommended
1(a) widget: "object" for the kindRules field (no platform change, legal everywhere).
2(a) ./common.schema.yaml mixin ref (identity convention). Plus record the pre-existing ../core/
class + 'json' widget demand as carried findings for a future platform task.
If you instead choose 1(b)/2(b), say so explicitly and the item routes as requires-rescope.

## Reply format
Write your decision EXACTLY to
/mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-11_own-1-fixcycle-decision.md
with a line "DECISION:" per defect (1 and 2) + one-paragraph rationale each. End with: OWN1DECISION DONE
