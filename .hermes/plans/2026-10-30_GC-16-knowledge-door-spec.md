# GC-16 — Knowledge authoring door (canonical spec)

STATUS: APPROVED (Brad "do both" 2026-10-29 17:2x EDT, architect session; claim edit recorded
in lane-1 task list 2026-10-29 20:15). Spec-of-record basis:
`.hermes/plans/2026-10-30_lane1-gc14-gaps-answer.md` @ e6bb2344 (architect GAP-1 ruling).
Orchestrator-promoted executable spec. SEQUENCING (architect): GC-15 first; GC-16 may run
parallel subject to fleet stagger.

## Goal
Make the knowledge triplet (assertion / claim / evidence) authorable in the browser through the
EXISTING machinery: fix drifted ui.yaml bindings, add the Knowledge registry tab row, and
de-hardcode RecordCreatePanel's kind→schemaId resolution. Unblocks GC-14 leg A7 + S6 clause.

## Work items (architect ruling, binding)
1. UI triplets (pure YAML data):
   - `schema/knowledge/assertion.ui.yaml` currently binds `$.claimId` (:28) and `$.content`
     (:31) — orch verified first-hand; `assertion.schema.yaml` declares claim_ref / statement /
     scope / context_refs / roles / outcome / confidence under unevaluatedProperties:false.
     Rebind to REAL schema fields: claim_ref (ref widget), statement, scope (enum),
     context_refs (ref list), roles, outcome, confidence.
   - Audit `claim.ui.yaml` + `evidence.ui.yaml` for the same drift; fix (evidence form must
     expose supports[], sources[] typed refs, quality{}).
   - After any YAML change: the lane stack does NOT hot-reload YAML — the orchestrator restarts
     :3092/:5192; do not restart the stack yourself.
2. `REGISTRY_TABS` row `{ id: 'knowledge', label: 'Knowledge',
   kinds: ['assertion','claim','evidence'] }` in `app/src/pages/RecordRegistryPage.tsx` —
   tab strip / listing filter / QMS7-5 multi-kind Create picker derive from the data (gc-method
   precedent); extend the tab/kinds test pins the way `…gcmethod.test.tsx` pins its row.
3. De-hardcode `app/src/event-editor/create/RecordCreatePanel.tsx:32-49` (orch verified the
   CreateNodeType + SCHEMA_IDS literals are real): resolve kind→schemaId via the served schema
   registry (GET /api/ui/schemas + POST /ui/schema/:schemaId/editor-draft). An unserved kind
   gets a LOUD named refusal, never "Create undefined". Fix `+ Create → New Claim` to reach the
   working door or remove the dead entry (dead-chrome ban).
   One term per entity: the door uses schema kind names; "Knowledge" is a grouping label
   mirroring schema/knowledge/, not a new term.

## File boundary (hard)
schema/knowledge/*.ui.yaml; app/src/pages/RecordRegistryPage.tsx;
app/src/event-editor/create/RecordCreatePanel.tsx; the global + Create menu component (+ tests).
NO server edits, NO schema/lint edits, NO new route, NO new kinds.

## Acceptance (browser gate will verify — orch-owned; coder self-checks deterministic legs)
- /registry shows a Knowledge tab listing the three kinds.
- Create → assertion renders a schema-backed form; NO SCHEMA_NOT_FOUND / "Create undefined"
  anywhere on a served kind.
- Submitting scope=comparison with no contexts is REFUSED with rule id
  `asn-scoped-assertion-needs-context` visible first attempt.
- A valid claim+assertion+evidence mint end-to-end with GET 200 readbacks.
- /record/new/assertion and the + Create menu no longer render dead forms.
- Existing registry/create suites green with the new row pinned.
- Deterministic verification (report raw excerpts): npx tsc --noEmit -p . (baseline parity),
  vitest targeted suites (registry + create) with baselines recorded, plus lint/schema check
  that the rebound ui.yaml validates against the schema triplet's own test patterns.

## Worktree / branch
Off `cl/integration-1` in /mnt/vast/home/brad/git/wt/gc16-knowledge-door-lane1-l1t2100,
branch cl/gc16-knowledge-door-l1t2100. ALL git via `git -c core.fileMode=false` (NFS mode-bit
noise). ONE commit per logical unit; final marker in report.

## Deliverable (UNIQUE PATH — token l1t2100)
Report: /home/brad/.hermes/cl/lanes/1/gc16-report-l1t2100.md — per-work-item diff summary with
file:line, raw verification excerpts, test counts vs baseline, deviations. End 'STATUS:
complete' then 'GC16 KNOWLEDGE DOOR DONE <full 40-char sha>'.

## Stop boundary
If the de-hardcode requires a SERVER change (editor-draft route can't serve a knowledge kind),
STOP and report 'requires-rescope' with exact evidence. Do not widen the boundary.
