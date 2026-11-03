# FAME-3 W2 forwarding gap — ARCHITECT DECISION (lane 1)

Date: 2026-11-01 (~06:2x -0500), architect, read-only ruling on cl/integration-1 (tip 9f133e9f).
Responds to: `.hermes/plans/2026-11-01_fame-3-w2-forward-decision-request.md`
Question: RATIFY (OPT-A) or DECLINE (OPT-B) one generic shape-only forwarding of the declared
nested `ui.yaml` `slot.properties` member through the editor projection.

## Grounding performed first-hand on shipped trunk (not on the worker sketch)

1. Client mapper, `app/src/editor/taptab/documentMapper.ts`:
   - slot type declares `properties?: Array<{name,...}>` (:222-237, WIDGET-R1 fix-run-3 shape);
   - `slot.widget === 'object' && slot.properties` -> `attrs.objectConfig` (:309-318);
   - `slot.widget === 'array' && slot.properties` -> `attrs.arraySchema` (:320-327) — DEAD attr
     (written, consumed by no widget; coder report W2 §1 is correct);
   - `slot.widget === 'array' && slot.items` -> `attrs.itemHint` (:335-350) — LIVE, consumed
     (ArrayWidget -> ObjectWidget, `ArrayWidget.item-hint.test.tsx`);
   - server-emitted `slot.fields` is read NOWHERE in the mapper (grep-confirmed at trunk).
2. Server projection, `server/src/ui/EditorProjectionService.ts:84-99`: fixed key-set forward
   (help, suggestionProviders, visible, options, refKind, items, fields, props); `properties`
   dropped. `EditorSlot` (`server/src/ui/types.ts` ~:428) and `ProjectionSlot` (~:524) carry
   `items?: FieldHint` and `fields?: FieldHint[]`, NO `properties` member — confirmed.
3. `UISpecLoader.validateEditorSlot` (:484-520) validates only id/path/label/widget and passes
   slot objects through raw — so the worker's forwarded `properties` WOULD land on the wire in the
   YAML's own `{name,...}` spelling, i.e. matching the client's existing branch. The orchestrator's
   "may land inert" uncertainty is resolved: NOT inert for slots that declare `properties:`.
   BUT it is inert FOR FAME-1: cycle-1's D1 fix converted acquisition-package.ui.yaml to `fields:`,
   and the mapper never reads `fields` — the forward alone does not close FAME-1 DEFECT 1.
4. The DATA route is live and proven: the array `items: {widget: object, fields: [...]}` shape is
   forwarded (:96), mapped (:335-350) and rendered end-to-end (FAME-1 reviewer probe A shows the
   matched-array items projecting correctly; the client converts `path`->`name` at
   `mapHintFieldEntry`/`ArrayWidget.mapHintFieldsToObjectFields`). The object `fields` path is the
   dead one; the array `items/fields` path is not.
5. Existing DATA conventions on trunk today: `schema/lab/gc-method.ui.yaml` declares 5 array slots
   via decorative `properties:` (:174, :228, :249, :262, :279); `schema/knowledge/
   acquisition-package.ui.yaml` files-slot (:87) likewise — its header comment (:9-10) cites the
   dead `arraySchema` branch as if it worked. These declarations are currently inert data.

## Ruling and rationale

DECLINE (OPT-B) for this cycle. Reasons, in weight order:

R1 — The dialect problem is real and OPT-A-as-sketched makes it worse, not better. The platform
today carries THREE spellings of "declared nested slot members": ui.yaml `properties` ({name}),
projection `fields` ({path}), and client `properties` ({name}). Forwarding `properties` server-side
without first ruling ONE canonical dialect bolts a fourth variant onto a projection that already
emits `fields` the client ignores — permanent two-terms-one-entity, the exact hard-rule violation.
The reviewer's option (b) (client normalisation of `fields`) and the coder's part 3 (server forward
of `properties`) are two seams of ONE disease; whichever way the platform eventually goes must be
decided as a single named platform item with WIDGET-R1/ARCHD3L1T1440 history attached, not
half-landed from a feature lane mid-shift.

R2 — FAME-3 does not NEED the forward. The W2 goal (typed item authoring + canonical ref picker on
compound_assignments) is reachable through the ALREADY-FORWARDED, ALREADY-CONSUMED `items/fields`
shape (grounding item 4). The coder's part 2 (typed sub-fields via the widget switch, ref-safe
seeding, honest pin updates) is required in BOTH options, so declining the forward costs FAME-3 no
client work — it only relocates the declaration from `properties:` to `items:` in ui.yaml, i.e.
from a decorative shape to the one the platform actually honours. "Things that can be data should
be data" is served by making the declaration land, not by growing the projection to rescue one of
two rival dialects.

R3 — Convergence. FAME-1 fix2 is live RIGHT NOW on the DATA route (flattened readonly siblings +
the `fields/items` projection fix). OPT-A would require mid-flight reconciliation of fix2's YAML
dialect, a documentMapper normalisation outside both lanes' ownership, and a shared-file collision
risk on the very mapper the ROUND-TRIP-GATE-1 receipts depend on. OPT-B has zero file collision
with fix2 (different triplets, different surfaces) and both fix runs land platform-code-free before
the dialect question is taken up at intake.

R4 — Ownership history is genuine: this seam (app/editor + server projection) is the WIDGET-R1
area; fix-run-3's forwards were landed under their own explicit ruling (ARCHD3L1T1440), which is
the PRECEDENT for how a forward should arrive — as a ruled platform item with its own acceptance,
not as a rider on a feature task. That path stays open for OPT-A at next intake.

## Ordering conditions (binding on the resumption)

C1 — FAME-3 W2 resumption is DATA-only on the declaration: gc-method.ui.yaml compound-assignments
slot declares its item sub-fields (incl. the W3 additions assignment_state / provenance /
reporting_basis_ref) via `items: {widget: "object", label: ..., fields: [...]}` in the
already-consumed shape, REPLACING the decorative `properties:` block on that slot — never keeping
both spellings side by side on a touched slot (one noun per entity). W2 parts 1's mapper
properties->itemHint branch is NOT built under this ruling.
C2 — Part 2 (typed sub-field rendering through the WidgetRenderer switch; ref sub-fields seeded
absent, not ''; schema-valid seeds; documented pin updates in
ObjectWidget.nested.test.tsx / ArrayWidget.item-hint.test.tsx) proceeds as in-list W2 work.
C3 — FAME-1 fix2 continues its flattened-sibling route untouched; the orchestrator does not swap
it mid-run on account of this decision.
C4 — The dialect split is raised as a PLATFORM item at next intake (suggest id UI-DIALECT-1):
one canonical spelling for declared nested slot members across ui.yaml -> projection -> client,
covering: retirement or honouring of the decorative `properties:` blocks (gc-method x4 remaining,
acquisition-package files-slot), the dead `arraySchema` branch, `ProjectionSlot.fields`
client-consumption or server-drop, and FAME-1 DEFECT 1's remaining half. No partial forward of
either dialect lands before that item rules. WIDGET-R1 fix-run-3 comments (documentMapper.ts:126-179)
and this decision are the item's history.
C5 — Gates unchanged: W2/W4/W8 editor legs keep their acceptance wording; the picker proof is a
live rendered-surface + request-body round-trip receipt per ROUND-TRIP-GATE-1, never a projection-
layer assertion (DEFECT 2's lesson: assert at the boundary the surface consumes).
C6 — Report honesty: the FAME-3 report must state the route taken (items:-shaped DATA declaration +
in-list part 2), and must not describe the `properties:` forward as pending-but-imminent; it is
DECLINED pending C4.

## What the orchestrator may do now
- Resume the brief-slimmed FAME-3 coder under C1/C2 (no server/ui, no app/types/uiSpec change).
- Queue C4 into the next intake packet (with FAME-1 DEFECT 1 residual folded in).
- Continue W4-API/W5/W6/W7/W8-chat legs (never needed the forward).

DECISION: OPT-B
