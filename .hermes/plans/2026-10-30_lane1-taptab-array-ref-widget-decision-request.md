# Decision request — taptab array-of-ref authoring gap (GC-16 D2/D3 requires-rescope; gates GC-14 A7)

Requested by: lane-1 orchestrator, tick 179, 2026-10-30 ~04:35 EDT
Item context: GC-16 (knowledge authoring door, approved scope: schema/knowledge/*.ui.yaml +
RecordRegistryPage.tsx + RecordCreatePanel.tsx + Create menu + tests; widget components and
server/ui projection are EXPLICIT stop-boundary).

## The gap (orchestrator-verified first-hand, not worker claim)

The knowledge triplet fields evidence.supports/refutes/assesses and
assertion.context_refs/roles are `type: array` with OBJECT items (datatypes/ref, or
{role_ref,context_ref}). After GC-16's data-leg rebind (reflist -> `widget: array` + typed
item-hint, branch wt/gc16-knowledge-door-lane1-l1t2100 commits 1f7a92fe), the taptab editor
SURFACE still cannot author them:

- app/src/editor/taptab/widgets/ArrayWidget.tsx:85-93 — "+ Add item" commits
  `onCommit([...items, {}])`: an empty object, and renders NO item sub-slot authoring UI.
  A committed `[{}]` is schema-invalid (ref requires kind/id/type; roles entry requires
  role_ref+context_ref) -> server 422.
- server/src/ui/EditorProjectionService.ts:260-261 — 'array' is in UNSUPPORTED_WIDGETS, so the
  projection emits an UNSUPPORTED_WIDGET diagnostic for these slots on the taptab path.
- The repo's WORKING array pattern (`widget: array` + `properties:` sub-fields, e.g.
  schema/workflow/budget.ui.yaml $.lines) is the FORM surface: documentMapper.ts:228 builds
  arraySchema only there. It does not apply to the taptab editor surface RecordCreatePanel uses.
- Proof test in-tree (fails closed, honest): app/src/event-editor/create/
  RecordCreatePanel.gc16-widget-commit.test.tsx — renders the REAL panel + REAL schema, commits
  through the widget, validates with the server's Ajv config: committed `[{}]` rejected;
  hand-carried valid ref arrays pass the SAME schema => gap is the WIDGET, not schema/binding.

## Consequence if nothing changes

GC-16 ships the schema-faithful data binding + loud-but-unfillable fields; GC-14 leg A7
("assertion stands on genuine evidence", browser-minted triplet) stays NOT evidenced —
supports/context_refs cannot be populated in the browser at all. Leaving dead/unfillable
fields also brushes the dead-chrome defect rule.

## Questions (bounded)

Q1 — Authorize a NEW platform item (widget-component scope) to give the taptab ArrayWidget
item authoring: honor the declarative item-hint (sub-slots per item) OR a purpose-built
array-of-ref widget (record-picker per entry, commits {kind,type,id,label?}). Which shape,
inside which files? (Estimate: app/src/editor/taptab/widgets/ArrayWidget.tsx + projection
UNSUPPORTED_WIDGETS handling + tests.)

Q2 — Interim disposition of the five fields until that widget ships, for the data already
shipped by GC-16: (a) keep `widget: array` (renders, unfillable, schema-faithful), (b) revert
to `reflist` (the known stub), or (c) hide the fields (visible: false) with a comment pinning
the platform item. Recommend (c) or (a); pick one — GC-14 A7 re-gate wording depends on it.

Q3 — GC-14 A7 acceptance scope now: re-cut A7 to "triplet minted via API with hand-carried
schema-valid ref arrays + browser READS back the rendered knowledge records" (read path works
today; authoring path waits on Q1), or hold A7 fully until Q1 ships?

## Answer path (write exactly this file)

/mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-30_lane1-taptab-array-ref-widget-decision.md
Fields: R1 (Q1 shape+files or DEFER with reason), R2 (a/b/c), R3 (A7 scope wording).
No answer = no default: lane 1 will keep A7 open and NOT re-gate it as authorable.
