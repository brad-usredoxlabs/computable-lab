# Lane 1 architect decision — OWN-12 share surface (Q1) + OWN-13 FIFO split (Q2)

Decided by: architect, 2026-10-12, responding to
`.hermes/plans/2026-10-12_lane1-own12-share-surface-and-own13-fifo-decision-request.md`
(orchestrator tick 20261012T2240).

All load-bearing claims re-verified first-hand at trunk @ 36402ae3 (and
wt/OWN-13-lane1-l1t1305 @ e96fec67) with `git -c core.fileMode=false` / direct reads.
Every orchestrator claim checked out; two corrections/refinements below are marked
**[architect addendum]**.

---

## Q1 — OWN-12 dead share surface + POLICY_ROOT_KINDS reconciliation

### Verification (what is actually true)

1. **All three ShareRecordDialog mount chains are dead.** Confirmed:
   - `app/src/editor/RecordViewer.tsx:136` — RecordViewer is imported only by
     `RecordViewer.test.tsx` (which self-mounts `/records/:recordId`, a route that does
     not exist in App.tsx). Live record route is `/record/:recordId` →
     `shared/shell/RecordHostPage` (App.tsx:199), and RecordHostPage (138 lines,
     RecordEditPanel/RecordCreatePanel wrapper) has **zero** share references.
   - `app/src/browser/DetailPane.tsx:178` — DetailPane's only real importer is
     BrowserBody → BrowserPage, and **[architect addendum]** BrowserPage itself has no
     importer at all (only `browser/index.ts` self-export). The chain is *doubly*
     orphaned: `/browser` is a `LegacyModeRedirect` (App.tsx:182) that navigates to `/`.
   - `app/src/event-editor/projects/WorkspaceShareButton.tsx:28` — sole mounter is
     ProjectTabStrip, imported only by its own test (ProjectWorkspacePage mentions it in
     a comment only). Live strip is `shared/shell/WorkspaceTabStrip`.
2. **POLICY_ROOT_KINDS is THREE copies and two of them are stale or dead.** Confirmed:
   - `app/src/shared/sharing/policyRoots.ts:5` (client) — `{study, experiment, run,
     planned-run}`, used *only* by the two dead mount sites (RecordViewer.tsx:129,
     DetailPane.tsx:154) to decide whether to render the button.
   - `server/src/security/AuthorizationService.ts:16` — identical set. **[architect
     addendum]** It is a **dead export**: repo-wide grep in `server/src` finds no
     consumer whatsoever.
   - The server's *live* rule is the inline permissive expression at
     `IdentityHandlers.ts:311` (`direct || kind not in {user, group, access-policy}`),
     returned as `isPolicyRoot` in `AccessPolicyResponse` (client.ts:1939). The
     browser-gate probe result `{kind:local-protocol, isPolicyRoot:true}` is consistent
     with it.
   - Note ShareRecordDialog itself is already server-driven:
     `ShareRecordDialog.tsx:118` gates editability on `policy.isPolicyRoot && policy.canAdmin`.
     The stale client Set is only the *button-visibility* layer inside dead components.
3. OWN-12's merged 2-file preset-row diff is sound (adversarial ACCEPT 0 defects,
   orch-verified) — the defect is the surface it was bolted onto, inherited dead chrome,
   not OWN-12's change.

### RULING: Option B — new task (OWN-14). Not A, not C.

- **A rejected.** Mounting into RecordHostPage is a new live surface + a dead-code
  deletion program + a vocabulary-reconciliation change. That is new product intent,
  not an absorbable fix run; stretching OWN-12's approved 2-file contract to cover it
  also drags the hot RecordHostPage file into a task whose own diff is already accepted.
- **C rejected as written and as spirit.** Routing `RecordViewer` at `/records/:recordId`
  as a canonical second viewer creates a parallel record-viewing surface alongside the
  live RecordHostPage/RecordEditPanel pair — two surfaces for one entity is a defect
  under the same rule that condemns the dead chrome. RecordViewer gets the *delete*
  verdict, not a resurrection.
- **B adopted with specifics.** Suggested task **OWN-14 — "live share entry point +
  policy-root as ONE server-declared fact"**. Exact scope for the eventual fix run
  (subject to Brad approval, see below):
  1. **Mount:** render a Share control on `app/src/shared/shell/RecordHostPage.tsx`
     (edit mode, existing recordId) opening the merged `ShareRecordDialog`. Button
     visibility gated **solely** on the existing `AccessPolicyResponse.isPolicyRoot` +
     `canAdmin` fields from `apiClient` — no new client-side kind list, no reading
     `record.payload.kind` against any Set.
  2. **Kill the three dead chains (delete, not wire):** `editor/RecordViewer.tsx` +
     its test; the `browser/` orphan chain (`DetailPane.tsx`, `BrowserBody.tsx`,
     `BrowserPage.tsx`, `index.ts` — grep-verify no live importer of each before
     deletion, as verified here); `event-editor/projects/ProjectTabStrip.tsx` + test +
     `WorkspaceShareButton.tsx`. Dead chrome is a defect (SOP rule 12).
     `shared/sharing/ShareRecordDialog.tsx` + test are kept — they are OWN-14's mount
     payload.
  3. **Reconcile the vocabulary to one server-declared fact:** delete
     `app/src/shared/sharing/policyRoots.ts` entirely (its only consumers die in step 2),
     and delete the dead export `POLICY_ROOT_KINDS` at `server/src/security/AuthorizationService.ts:16`.
     The single source of truth for "can this be shared" becomes the server's
     `isPolicyRoot` response. **Do not** simply re-sync the two stale Sets to the
     IdentityHandlers rule — that keeps three copies. If the inline expression at
     IdentityHandlers.ts:311 wants extraction, extract it *in place* into one named
     server function/constant; the answer must remain one declaration, not two synced lists.
  4. **Re-gate:** OWN-14 then owns the browser gate exercising S1–S7 end-to-end on the
     live `/record/:recordId` surface (the gate's tier-2 receipts scenario list from
     `~/.hermes/cl/receipts/OWN-12/20261013T0205/` is the ready-made script).

- **OWN-12 disposition:** stays **in-progress** as the gate's owner; its
  `verified-by` ("curl GET .../access-policy proves persistence") was never reachable
  through any live surface. It closes only when OWN-14's gate exercises the merged
  preset row end-to-end. Do not close it on the unit-level accept alone.

- **Brad-approval flag (explicit):** OWN-14 is a **new campaign task and a scope
  change to an approved task (OWN-12)** — it adds a live UI surface and deletes product
  files. **Brad approval is required before OWN-14 is enqueued.** My recommendation is
  an unqualified **approve-OWN-14-as-scoped-above** when it is put to him: the dead-chrome
  deletion is mandated by SOP rule 12, the mount is the only way the already-merged,
  already-approved OWN-12 preset row can ever be used, and the reconciliation deletes
  rather than adds code.

- **FIFO note:** OWN-12 is UI-gated and does not block OLIGO-AI-1; OWN-14 does not
  enter the FIFO ahead of OWN-13/OLIGO-AI-1 — dispatch it after OLIGO-AI-1 unless Brad
  rules otherwise.

---

## Q2 — OWN-13 FIFO split

### Verification

- `wt/OWN-13-lane1-l1t1305` @ e96fec67: `git diff --stat 7b27011b...HEAD` = **exactly
  4 files** (DATA_MODEL.md +55, server/package.json +1, applyOwnershipDefaults.test.ts
  +256, applyOwnershipDefaults.ts +307). The worktree is indeed the sole home of the
  deliverable — **do not prune it** (still true, restated).
- Adversarial gate: ACCEPT, 0 defects (`reviews/own13-advreview-l1t1930.md`).
- Brad's live `computable-lab/CLAUDE.md` md5 re-checked: `cc43d17766d5606ee3d532c5356cbff4`
  — rule 9 still absent. Exact text + position preserved in `own13-report-l1t1900resume.md`
  DEV-1 (after rule 8, before "### The Hard Boundary").

### RULING: SPLIT AUTHORIZED.

Rationale: (a) the FIFO is orchestrator policy and the architect owns policy
sequencing; (b) rule 9 documents a declarative rule that is **already implemented and
merged** (OWN-7's ensureOwnerPolicy stamps defaults from the ownership-policy document)
— merging the tool one doc-line early describes nothing false in code, and the tool
performs zero writes on merge (dry-run by default; the orch dry-run proof runs on a
throwaway copy; `--apply` is never run by the pipeline); (c) the blocker is an
environment/permission wall no agent can cross unattended, and holding a
coder-ready OLIGO-AI-1 behind it indefinitely punishes the lane for a Brad-owned
interactive action.

Conditions (all binding for the merge tick):

1. Verify diff `7b27011b...HEAD` = exactly the 4 files, then `merge --no-ff
   wt/OWN-13-lane1-l1t1305` per the existing tick_status_20261012T1145 recipe —
   **with the CONFIG_PATH correction (reviewer OBS-3) exactly as written**: throwaway
   copy of the lane data repo, throwaway config with `dataDir` → the copy, run
   `apply:ownership-defaults` with `CONFIG_PATH` from the trunk, assert resolved dir is
   the copy and `git status --porcelain records/` empty. Never the live dir; never
   `--apply` anywhere.
2. OWN-13 does **not** go done. Status stays in-progress with an explicit named
   obligation recorded in its task-list block: *"DEV-1 rule-9 append — owner: Brad /
   interactive session; exact text at own13-report-l1t1900resume.md DEV-1; position:
   after rule 8, before '### The Hard Boundary'; on application: md5 must change and
   rule-9 text must match DEV-1 verbatim; task closes then."* The 5-file done-gate
   becomes "4/5 merged + rule-9 applied verbatim" — a re-sequencing of acceptance,
   **not a weakening**: the acceptance criterion still requires rule 9.
3. The FIFO unblocks immediately after the merge + dry-run proof go green: dispatch
   OLIGO-AI-1 next tick.
4. If Brad's interactive session applies rule 9 before then, close it as originally
   specified — the split changes nothing about the text or position.

No Brad approval needed for Q2 (orchestrator-policy sequencing + an already-approved
task's merge order); the rule-9 append itself remains Brad's action regardless.

---

Not touched by this decision: product code, task-list.md, CLAUDE.md, Brad's live tree.
No merges performed.

— architect, 2026-10-12T(EDT)
