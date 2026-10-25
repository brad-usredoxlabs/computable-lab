# REG-6 — Retire the registry side-rail; provenance docks at the BOTTOM, create form fills the width

Item: REG-6 (lane 1). Spec finalized by the orchestrator 2026-10-19T15:5x from
first-hand inspection of trunk `cl/integration-1` @ 5c77d023 (every path:line below
was opened by the orchestrator this tick — not scout-sourced). Intake: Brad direct
20261019T15:10 (screenshot tmp/screenshot-2026-10-19_15-10-48.png), architect
grounding 15:30.

## Goal (Brad's ruling, binding)

The registry record surface loses its right side-rail entirely. The provenance
carrot moves to the BOTTOM of the record content (full width, `<details>` opening
downward — same component, same content, same REG-4 pins). The create form fills
the pane. No new drag-resize affordance. Dead grey rail column must be gone.

## Orchestrator-verified orientation (verified by ME, treat as fact)

- `app/src/pages/RecordRegistryPage.tsx` — the DocumentShell usage:
  - :729 `railResizable` (registry is the ONLY railResizable consumer in app/ —
    verified by grep: other occurrences are only DocumentShell.tsx itself + its
    test).
  - :775-787 `rail={...}` renders
    `<div className="registry-rail"><RecordProvenanceCard .../>{editorMode !==
    'create' ? <RelatedRecordsCard .../> : null}</div>`.
  - children = `<div className="registry-editor-body"> ... </div>` (closes
    ~:818, just before `</DocumentShell>`).
- `app/src/editor/taptab/DocumentShell.tsx` — rail machinery:
  - `railResizable?: boolean` prop :41, default :56; restore-from-localStorage
    effect :~85-101 (`cl-registry-rail-width` key); ResizeObserver re-clamp effect
    :~110-121; `clampRailWidth` [220px, 40% of body]; `startDrag` :~124-160;
    `nudgeRail` + `onSplitterKeyDown` :~163-190; splitter render
    `{rail && railResizable && !railBelow && (<div role="separator" .../>)}`
    :~193-204; rail `<aside>` render follows (KEEP the plain rail — see below).
- Other DocumentShell `rail` consumers WITHOUT railResizable (their rails STAY —
  do not touch): `app/src/editor/RawRecordEditor.tsx:469` (Diagnostics rail),
  `app/src/components/registry/SlideOverEditor.tsx:131` (RelatedRecordsCard),
  `app/src/event-editor/focus/LabwareFocus.tsx:610` (plateRail).
  => DocumentShell's `rail` + `railBelow` props stay; the OPT-IN RESIZER
  machinery retires (task-list pre-authorized this: "then the opt-in resizer code
  retires too" — grep confirms registry was its only consumer).
- `app/src/editor/taptab/taptab.css`: `--shell-rail-width: 320px` :14,
  `.document-shell__rail` :109-118 (KEEP — other surfaces), the 768px media block
  :122-135 (KEEP — other surfaces use it; task rule: remove only THIS surface's
  dead CSS, don't gut shared media rules), `.document-shell__rail-resizer` +
  `.cl-rail-dragging` rules (RETIRE with the JS — grep shows those identifiers
  live ONLY in taptab.css + DocumentShell.tsx + DocumentShell.test.tsx).
- `app/src/pages/RecordRegistryPage.css:259-265` `.registry-rail` (block to retire;
  footer replaces it).
- `app/src/components/registry/RecordProvenanceCard.tsx` — renders NOTHING
  (returns null) when there is no recordId or no provenance fields (REG-4 pin,
  keep). Its root element is `.provenance`; its `<details>` already opens
  downward. CSS file `.provenance*` classes exist; NO border-top today (the rail
  provided visual separation).
- `app/src/pages/RecordRegistryPage.styling.test.tsx` — REQUIRED array (:8-21)
  includes `.registry-rail`; it reads the TSX/CSS as text. Removing
  `.registry-rail` REQUIRES updating this array in the same commit (remove
  `.registry-rail`, add the new footer class).
- `app/src/editor/taptab/DocumentShell.test.tsx` — rail render tests :115-212
  (KEEP — rail still exists for other surfaces); `describe('DocumentShell
  resizable rail')` block :306+ (RETIRE with the machinery); the beforeEach
  `localStorage.removeItem('cl-registry-rail-width')` :19 (remove with it).

## Changes (worker scope, in this order)

1. RED-FIRST layout test (new file or RecordRegistryPage.test.tsx — own your
   file): select a saved record whose meta carries createdBy/createdAt →
   a provenance container exists, is a SIBLING AFTER `.registry-editor-body`
   (assert DOM order + it is NOT inside any `.document-shell__rail`), and no
   `role="complementary"` / `.document-shell__rail` element renders for the
   registry DocumentShell at all, and no `role="separator"` rail resizer exists.
   Show it failing first; commit RED.
2. `RecordRegistryPage.tsx`: delete `railResizable` (:729) and the entire
   `rail={...}` prop (:775-787). Move the same two cards — verbatim, same props
   and same `editorMode !== 'create'` guard on RelatedRecordsCard — into a
   `<div className="registry-provenance-footer">` rendered inside DocumentShell's
   children, AFTER the `.registry-editor-body` div closes. The footer wrapper
   carries NO border/background/padding chrome (empty wrapper must collapse to
   zero height — an empty grey strip is exactly the defect this item kills).
   Visual separation moves onto the cards themselves: add
   `border-top: 1px solid var(--cl-border); padding-top: ...` on `.provenance`
   (RecordProvenanceCard.css) and keep RelatedRecordsCard's own styling;
   footer wrapper = flex column, gap, token-only CSS.
3. `RecordRegistryPage.css`: retire `.registry-rail`; add `.registry-provenance-footer`.
   Update `RecordRegistryPage.styling.test.tsx` REQUIRED in the same commit.
4. `DocumentShell.tsx`: remove `railResizable` prop, the localStorage restore +
   ResizeObserver re-clamp effects, `clampRailWidth`/`applyRailWidth`/
   `persistRailWidth`/`startDrag`/`nudgeRail`/`onSplitterKeyDown`, the splitter
   render, and the `bodyRef` if nothing else uses it. KEEP `rail`, `railBelow`,
   `width` and everything else. `DocumentShell.test.tsx`: delete the resizable
   describe block + the localStorage beforeEach line; the rail-exists tests stay
   green UNCHANGED (they are the regression proof the machinery still works for
   RawRecordEditor-style consumers).
5. `taptab.css`: delete `.document-shell__rail-resizer*` and `.cl-rail-dragging`
   rules ONLY. Do NOT touch `.document-shell__rail` or the 768px media block.
6. Create-draft behavior: with the footer wrapper chrome-free and the card's
   null-return intact, a create draft renders an empty wrapper = zero height.
   Add a test pin: create draft → no `.provenance` element, footer wrapper
   renders nothing visible (zero-height; assert the wrapper has no border/bg of
   its own via the CSS-token test or DOM).

## Hard constraints

- RecordProvenanceCard.test.tsx 4/4 green UNCHANGED; do not alter the card's
  TSX logic or WHAT it shows (REG-4 pins).
- DocumentShell keeps rail capability for its other three consumers; do not
  "simplify" SlideOverEditor / RawRecordEditor / LabwareFocus.
- No new endpoints, no hardcoded colors (styling test enforces token-only CSS),
  no app-wide CSS rewrites. exactOptionalPropertyTypes on.
- All git via `git -c core.fileMode=false` (NFS mode-bit noise). NEVER touch
  /mnt/vast/home/brad/git/computable-lab.

## Verified by (from the task block, verbatim criteria)

(1) Unit: RecordProvenanceCard.test.tsx existing 4/4 green UNCHANGED; NEW/
    adjusted RecordRegistryPage layout test — provenance container is a sibling
    AFTER the editor body (not inside any .document-shell__rail); no rail element
    rendered for /registry at all (rail and resizer testids/selector absent); a
    create draft renders zero-height footer (no empty grey div).
(2) tsc delta-zero; app vitest registry suites green.
(3) BROWSER GATE (UI change — non-negotiable, async): at :5192/registry,
    (a) click Create — the new-record form fills the pane to full available width
    (no grey column to its right); (b) select a saved record (TRR-DEMO-1) — the
    Provenance disclosure sits BELOW the form fields, spans the content width, and
    opens DOWNWARD revealing Created by/Created/Content/File rows (REG-4 criteria,
    unchanged content); (c) drag evidence: no rail resizer present; (d) at a narrow
    viewport (~1024px and a phone-width pass) the form remains usable, footer
    below, no horizontal overflow. cl-browser-reviewer VERDICT: accept.
    Gate policy update (IB-L1-PERF-1 handoff): NO pre-warm workaround; normal
    waits; report any >5s registry mount as a perf regression.

## Files

app/src/pages/RecordRegistryPage.{tsx,css};
app/src/pages/RecordRegistryPage.styling.test.tsx (+ new layout test);
app/src/components/registry/RecordProvenanceCard.css;
app/src/editor/taptab/DocumentShell.{tsx,css-host taptab.css}.tsx.test.tsx (resizer
retirement only); taptab.css resizer rules.

## Stop boundary

Any consumer other than the registry found passing railResizable (grep-verified
none exist) → stop with evidence. Any existing registry test that CANNOT pass
with the footer placement (beyond the two named-to-update pins) → stop, evidence
to orchestrator. Do not redesign RecordProvenanceCard content.
