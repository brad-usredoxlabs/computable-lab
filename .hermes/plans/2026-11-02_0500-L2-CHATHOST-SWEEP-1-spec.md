# L2-CHATHOST-SWEEP-1 — Chat-host inventory as DATA + every chat browser gate sweeps ALL hosts

Lane 2 · claimed 2026-11-02T05:00 EDT (orch l2t0500) · approved by Brad verbatim
("CHATHOST-SWEEP-1: queue and dispatch", decisions/L2-CHAT-UI-1-LEG-G-approval-card.md).
Origin: architect filing 2026-11-01T10:56. One-page spec, orch-authored at claim.

## Defect class (proven by receipts, not theory)
LEG F gate passed honestly on exactly the two surfaces its spec named (/runs/:id,
/deck/:id) while the THIRD chat host — the project-workspace deck tab (page-level
ProjectSurfaceChat mounted ABOVE EventEditorProvider) — was structurally blind to
the editor and nobody tested it: green gate, dead UI. Gates test what the spec
names; until "all chat hosts" is DATA, every future gate can repeat this miss.

## Inventory (orch-verified first-hand at trunk 03581f24, 2026-11-02)
Mount points that register a chat host via SurfaceChatBridge (app/src/shared/shell/
SurfaceChatBridge.tsx, "L2-CHAT-UI-1 LEG C: the universal-chat registrar") or their
own bridge:
  1. run-workspace     — app/src/run/RunWorkspacePage.tsx via app/src/run/RunSurfaceChatBridge.tsx
  2. event-editor      — the event-editor chat pane (surface id 'event-editor'; the
                         AiTabPanel path — locate its registrar mount at claim-time grep)
  3. project-deck-tab  — app/src/event-editor/projects/ProjectWorkspacePage.tsx (page-level
                         ProjectSurfaceChat above EventEditorProvider — the LEG-F survivor)
  4. record-host       — app/src/shared/shell/RecordHostPage.tsx
  5. artifact-host     — app/src/shared/shell/ArtifactHostPage.tsx
  6. registry-host     — app/src/shared/shell/RegistryHostPage.tsx
The coder must enumerate the REAL set from the registrar/bridge wiring (grep
SurfaceChatBridge / RunSurfaceChatBridge / ProjectSurfaceChat / the registrar
call-sites), not trust this list blindly; the list above is the orch's screened
starting point. Each entry names its surface id (the machine contract the server
reads — see config/drafting/shorthand-drafting.yaml's drafting-surface list: that
surface list must remain a SUBSET of the inventory; the existing contract test
enforces subset-of-AiSurface-union, extend the same discipline).

## Change 1 — inventory as DATA
A YAML list under config/ (propose config/chat/chat-hosts.yaml; coder picks the
natural existing config/ neighbourhood, ONE file). One entry per host:
`id` (machine surface id), `mount` (component + file path), `route` (how a browser
reaches it — URL/flow string), plus a `note` on how its context reaches the AI
request. Code may read it (a validator/test that imports it), but NO behaviour
branching is introduced — this item is DECLARATION + gate machinery, zero product
behaviour change. HARD BANNED: server/**, schema/scientist-intent/**.

## Change 2 — the gate runner sweeps the inventory
Extend the EXISTING lane gate machinery (.hermes/plans/harness/l2-trunk-journeys/
run-journeys.py + check-gate.py — read them first; extend its scope axis, build NO
parallel harness): a chat-surface verdict set is graded against the inventory —
a verdict table that is a strict subset of the inventory goes RED (per host: one
live round trip with request-body receipt, or the verdict is not-accept). RED
case is a TEST, not a live drive: drop one host from a verdict fixture -> the
checker exits non-zero (non-vacuous pin).

## Change 3 — shrink-guard
A tick-time check (a lane harness script, importable by check-gate): fails when
the inventory shrinks without a spec citing it (compare against a blessed-sha
manifest of inventory ids the same way the vocabulary golden MANIFEST bless works;
a host deleted is allowed ONLY with a re-bless + a spec path in the bless note).

## verified by
- The inventory YAML names >=3 hosts today (the real grep set will be >=4) and
  each names its mount point; the drafting-surface subset pin extended to
  inventory-subset (YAML-vs-YAML contract test).
- check-gate RED case: a verdict table missing one host exits non-zero; the full
  table exits zero (both shown in report output).
- A live sweep run on :5193 is ORCH-OWNED post-merge (browser gate), NOT the
  coder's; coder makes NO live claims.
- Gates: app vitest touched files green + the contract tests; app tsc baseline
  unchanged (10-error baseline set); server untouched -> server tsc trivially.
- Diff boundary: config/chat/*.yaml (or chosen path) + harness py/md + app test
  files only. Zero product tsx/ts behaviour edits unless the enumeration proves a
  surface id missing from the AiSurface union — if so STOP and report BLOCKED.

## Ownership / base
Worktree wt/L2-CHATHOST-SWEEP-1-lane2 off cl/integration-2 tip at claim.
Depends on nothing; serialize against CARD-1 only if the grep set forces an
AiTabPanel edit (it should not — declaration only).
Report: deliverables/L2-CHATHOST-SWEEP-1-report.l2t<tick>.md.
Marker: `L2-CHATHOST-SWEEP-1 DONE <full sha>`.

## Assumptions recorded at spec time
AS-CHATHOST-INVENTORY-GREP-START: the 6-host starting list is orch-screened from
grep at 03581f24 (mounts listed above); the coder's grep is the authority.
Evidence debt: live sweep receipts on :5193 (orch post-merge) clear it.
