# L2-TERM-1 — Vocabulary integrity: never badge a local record or a composition as an Ontology term

CAMPAIGN: universal-chat (approved Brad 2026-10-26). Binding: UC-D4 — local records,
ontology hits, compositions, and mint-tier must be visibly distinct terms. Never two
local terms for one entity; never a local/composite reading as "Ontology".

Base: trunk cl/integration-2 @ dac9f515. Worktree /mnt/vast/home/brad/git/wt/L2-TERM-1-lane2-l2t0035,
branch cl/lane2-l2term1-l2t0035. Deliverable report:
/home/brad/.hermes/cl/lanes/2/deliverables/L2-TERM-1-report.l2t0035.md (write it even if partial; end with STATUS: line).

## Orch-verified anchors (first-hand at dac9f515 — trust these line areas, re-open before editing)
- app/src/shared/taptab/slashMenu/resolvers.ts
  - :445 `badge: c.namespace ? c.namespace.toUpperCase() : 'Ontology'` — ontology-search hits
    (fine; these ARE ontology hits).
  - :759 bare workspace material records render `subtitle: 'Ontology term'` with
    `detail.source: 'Workspace record (this lab)', detail.ontology: 'local'` — THE DEFECT:
    a local workspace record badged/subtitled as an ontology term.
  - :787 `materialBadge(...)` fallback returns `'Ontology'` for plain `material` kind — local
    concept records get an Ontology BADGE.
  - :116 mint reads `badge: 'New'` — keep.
  - :328 vendor hits `badge: 'Web'`, :433 'Canonical', :470 'Labware', :489 'Definition',
    :517 'Equipment', :547 Component/Protocol, :573 'Tube' — leave non-material badges alone
    unless they violate the one-entity-one-term rule.
- app/src/shared/taptab/slashMenu/resolvers.test.ts:~820 — the byte-stability-pin fixture
  literally contains the contradiction (`"badge":"Ontology","subtitle":"Ontology term"` on a
  Workspace-record/local row). Byte-pins you intentionally break MUST be updated in the SAME
  commit with a comment naming L2-TERM-1.
- Composition strings ("Thermo trypsin-EDTA + Thermo DMEM + 10% Thermo FBS + HepG2 cells",
  "DMEM with 10% FBS") resolve through the same resolver surface and currently can carry the
  Ontology badge. A composition is NOT a term under any ontology.

## Required behavior (DATA-first, per repo rule "no hardcode / policy in data")
1. Introduce a badge/vocabulary MAP as data (a const table in the resolver module is
   acceptable IF it is a single declarative table keyed by tier — not string branches scattered
   in render code; if schema/ YAML is the natural home for this map, prefer YAML).
   Tiers, at minimum: Ontology (true ontology hits), Local (workspace record of this lab),
   Composition (composite/composition label), New (mint), plus the existing non-material tiers.
2. A resolved WORKSPACE RECORD (detail.source 'Workspace record (this lab)',
   detail.ontology 'local') must badge Local (subtitle honest, e.g. 'Local record'), never
   Ontology. Bare material concept records: materialBadge fallback must not be 'Ontology' —
   choose the honest tier (Local/Formulation/Instance per kind), never the ontology word.
3. A composition/composite reading must badge Composition. Identify composition rows by the
   resolver's OWN structural signal (multi-part composite parse), not by string-matching a
   particular material name.
4. The record popover/rail vocabulary follows the same map (it shows "Ontology: local" today —
   a vocabulary contradiction).
5. Sweep consumers so ONE entity has ONE local term everywhere:
   ClarificationPicker badge render, QuestionsPanel, slashMenu resolvers,
   ClarificationPanel/ProtocolLocalizationThread, and ProposedGraphModal's
   "Ontology terms (already local)" heading (itself a contradiction — reword per the map,
   e.g. "Local terms already created").

## RED-first acceptance (tests before implementation)
- resolvers.test.ts additions: a workspace-record fixture yields Local (never 'Ontology');
  a composite-label fixture yields 'Composition'; an ontology-tier hit keeps 'Ontology';
  mint keeps 'New'.
- Update every byte-pin you deliberately break IN THE SAME COMMIT, each with a one-line comment
  naming L2-TERM-1 (no silent byte-pin edits).
- `cd app && npx vitest run src/shared/taptab/slashMenu src/event-editor/right-pane/ai/ClarificationPicker.test.tsx` green; app tsc gains ZERO new errors (baseline compared sorted).
- NO server/ changes. NO changes to AiTabPanel's chat/event logic (L2-CHAT-1 owns that zone —
  your app edits stay in the resolver/badge/popover/vocabulary surface; do not touch
  RunWorkspacePage.tsx, useSurfaceChat.ts, useAiChat.ts, ChatPreviewCard.tsx).
- Report: files changed, tiers chosen, byte-pins broken and why, test output tail,
  assumptions block.

## Evidence-debt note
The browser receipt (reviewer resolves "DMEM" on :5193, picker rows read honestly per tier)
is orch-owned AFTER merge — do not attempt the vision gate yourself.
