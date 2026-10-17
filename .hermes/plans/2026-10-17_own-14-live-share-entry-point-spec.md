# OWN-14 spec — live share entry point + policy-root as ONE server-declared fact

Status: PROMOTED by orchestrator 20261017T1230 (composed from the architect's
Q1 Option-B ruling + orchestrator's own first-hand anchor re-verification at
trunk 7333fe97 this tick).
Approval: Brad 2026-10-17 "approve both" — decisions/L1-wave3-followup-rulings-20261017.md (R1),
scope = Option B of .hermes/plans/2026-10-12_lane1-own12-share-surface-and-own13-fifo-decision.md verbatim.

## Goal

The merged ShareRecordDialog (OWN-12, trunk) has NEVER had a live mount — every one
of its three historical mount chains is dead code. Mount a Share control on the live
record route, delete the dead chains, and collapse the three POLICY_ROOT_KINDS copies
down to the ONE server-declared fact (`isPolicyRoot` on AccessPolicyResponse).

## Orchestrator-verified anchors (trunk 7333fe97, verified this tick — trust these over line numbers)

- Live route: App.tsx `/record/:recordId` -> `app/src/shared/shell/RecordHostPage.tsx`
  (edit mode = `RecordEditPanel`, create mode = `RecordCreatePanel`; file has ZERO share refs).
- `ShareRecordDialog({ recordId, onClose })` in `app/src/shared/sharing/ShareRecordDialog.tsx`;
  its `editable` is ALREADY server-driven: `Boolean(policy?.isPolicyRoot && policy?.canAdmin)`
  (client.ts `getAccessPolicy` at :1999). Props are exactly `{recordId, onClose}`.
- Server live rule: `server/src/api/handlers/IdentityHandlers.ts:311` computes
  `isPolicyRoot = direct || (kind != null && kind !== 'user' && kind !== 'group' && kind !== 'access-policy')`,
  returned at :318.
- Dead chain 1: `app/src/editor/RecordViewer.tsx` + `RecordViewer.test.tsx` — zero importers
  outside themselves (test self-mounts `/records/:recordId`, a route that does NOT exist in App.tsx).
- Dead chain 2: `app/src/browser/` — `BrowserPage` has NO importer outside `browser/`;
  `DetailPane` imported only by `BrowserBody`; `useBrowserState`/`parseQuery` (and their tests)
  have zero outside importers. **SURVIVOR: `app/src/browser/SchemaTree.tsx`** —
  `app/src/pages/RecordRegistryPage.tsx:11-12` imports `deriveSchemaNode` + type `SchemaNode`
  from `../browser/SchemaTree`. Do NOT delete SchemaTree.tsx (its test SchemaTree.test.tsx
  covers it — keep both). Check `ResultsTable.tsx`, `SearchBar.tsx`, `BrowserPage.css`:
  grep showed ResultsTable/useBrowserState/parseQuery have no outside importers; the SearchBar
  hits are OTHER SearchBars (knowledge/browser, shared/shell) — before deleting any file in
  browser/, grep-verify IT has no live importer; files that are only imported by the dying
  chain die with it; SchemaTree stays because RecordRegistryPage lives.
  (`browser/index.ts` self-exports BrowserPage only.)
- Dead chain 3: `app/src/event-editor/projects/ProjectTabStrip.tsx` + `.test.tsx` + `.css` +
  `WorkspaceShareButton.tsx` — ProjectTabStrip imported only by its own test; live strip is
  `shared/shell/WorkspaceTabStrip` (whose CSS/TSX only MENTION ProjectTabStrip in comments —
  do not touch WorkspaceTabStrip).
- Stale vocabulary: `app/src/shared/sharing/policyRoots.ts` — consumers ONLY
  `DetailPane.tsx:20` + `RecordViewer.tsx:11` (both die above) -> delete the file.
  `server/src/security/AuthorizationService.ts:16` `POLICY_ROOT_KINDS` — grep in server/src
  finds NO consumer of the constant itself (file is consumed for other exports; verify
  per-symbol grep before deleting the line, keep the file and its other exports
  `ACCESS_POLICY_SCHEMA_ID` + class `AuthorizationService`).
- `app/src/App.tsx:185` keeps `/browser` -> LegacyModeRedirect (that redirect STAYS; only the
  target components die).

## Scope (exactly the 4 ratified bullets)

1. MOUNT: on `RecordHostPage` EDIT mode with an existing `recordId`, render a Share button
   opening `ShareRecordDialog`. Button visibility gated SOLELY on the server-declared pair
   `isPolicyRoot && canAdmin` from `apiClient.getAccessPolicy(recordId)` — fetch it in the
   page (or a tiny hook in shared/sharing), render NOTHING while loading/unauthorized/create-
   mode. NO new client-side kind list, NO reading `record.payload.kind` against any Set.
   Placement: the button belongs in the record surface's header chrome that RecordEditPanel
   renders — the smallest honest wiring is RecordHostPage-level (it owns AppShell); pick the
   placement that integrates with existing header layout without inventing new chrome.
2. DELETE dead chains (grep-verify per-file no-live-importer before each delete, per the
   survivor rules above): editor/RecordViewer.tsx + test; the browser/ orphan chain MINUS
   SchemaTree.tsx + SchemaTree.test.tsx; event-editor/projects/ProjectTabStrip.tsx +
   .test.tsx + .css + WorkspaceShareButton.tsx (ProjectTabStrip.css: delete only if nothing
   else imports it). `browser/BrowserPage.css` dies with BrowserPage. Shared dialog files
   (ShareRecordDialog.tsx + test) are the MOUNT PAYLOAD — keep.
3. RECONCILE: delete `app/src/shared/sharing/policyRoots.ts` after step 2 removes its last
   consumers; delete the dead `POLICY_ROOT_KINDS` export line in
   `server/src/security/AuthorizationService.ts`. ONE fact remains: IdentityHandlers'
   isPolicyRoot. Do NOT re-sync any Sets. Do NOT extract IdentityHandlers' expression
   anywhere else unless removing the server dead export forces it (it does not — no consumer).
4. RE-GATE: browser gate S1-S7 on live `/record/:recordId` reusing the scenario list from
   `~/.hermes/cl/receipts/OWN-12/20261013T0205/` (project tab STU-saturday-morning-tburg-p-cm9u
   -> record LPR-2026-09-06-run-template-d69ed684 -> Share button -> dialog -> project-members
   preset -> Save -> curl access-policy read-back -> Private-to-me restore + curl). The gate
   also closes OWN-12 (gate-owner watch).

## Tests (RED-first where applicable)

- New/extended RecordHostPage-level test: with a mocked client whose getAccessPolicy returns
  `{isPolicyRoot:true, canAdmin:true}` the Share control appears; `{isPolicyRoot:false}` or
  `canAdmin:false` -> no control; create mode -> no control. (Follow the app test idioms in
  existing shell tests; the dialog itself is already tested.)
- Deletions: delete the dead tests with their files; nothing else references them.
- app tsc baseline 23 error TS lines (AS-ORCH-L1-102): ZERO new, ZERO in touched files.
- app vitest baseline: 61/65-ish failed files/tests, flaky +-1, none introduced in touched
  areas; scoped vitest for shared/sharing + the host-page test green.
- server: `npx tsc --noEmit -p server` = 33-error pre-existing baseline, zero new (you only
  delete one dead export line; per-symbol grep proves no consumer first).

## Hard boundaries

- No changes to ShareRecordDialog.tsx internals (it is accepted code; mount it as-is).
- No new endpoint, no server behavior change beyond the dead-export deletion.
- No changes to WorkspaceTabStrip, AppShell, RecordEditPanel internals, /browser redirect,
  /registry.
- Stop-and-return-to-orchestrator if: the mount cannot be done page-level without touching
  RecordEditPanel internals; or any deletion target turns out to have a live importer you
  cannot resolve within this file set.

## Environment facts (lane 1)

- Worktree you will be dispatched in: /mnt/vast/home/brad/git/wt/OWN-14-lane1-l1t1230
  (branch wt/OWN-14-lane1-l1t1230, off cl/integration-1 @ 7333fe97; node_modules symlinked
  root+app+server). All git commands with `git -c core.fileMode=false` (NFS mode-bit noise).
- Tests: `cd <wt>/app && npx vitest run <files>`; typechecks: `npx tsc --noEmit -p .` in app/
  and server/ from the worktree root as configured. Do NOT run pnpm install (lockfile drift).
- Do NOT restart the lane stack, do NOT touch :3092/:5192/:3001/:5174 — the orchestrator
  restarts and serves the candidate for the gate.
- Report: write your full report to the deliverable path in your dispatch prompt (STATUS:
  complete + diff stat + test/tsc outputs + end-marker `OWN-14 CODER DONE <sha>`).
