# QMS-1 spec — Ground the integration contract (stop-boundary spike, NO product code)

Campaign: light-qms-records-browser. Approved THE LIST: `/home/brad/.hermes/cl/task-list.md`
(2026-10-02, revision 2). This is INSPECTION + ONE DECISIONS DOC ONLY. Do not edit any
source file in the repo. Do not commit. Do not restart servers.

## Goal

Pin, with file:line evidence and an explicit per-item outcome
(`resolved` | `blocked` | `requires-rescope`), every integration unknown the downstream
QMS-2..QMS-7 tasks will commit to. Where a genuine platform gap exists, STOP and return
`requires-rescope` — never quietly absorb it into a later task.

## Deliverable

ONE file: `~/.hermes/specs/inbox/qms-integration-contract.md`
containing:
- answers (a)–(i) below, each with concrete `path:line` citations and an outcome status;
- a FILE-OWNERSHIP MAP for QMS-2..QMS-7 (which files each downstream task may touch);
- a baseline test-suite run result (see "Verification baseline");
- ZERO unanswered questions silently converted into assumptions — list open questions
  explicitly.

## Environment facts

- Code repo `/mnt/vast/home/brad/git/computable-lab` (branch main @ 2a1102bc, SHARED DIRTY
  TREE — Brad's live session. READ ONLY for you; never checkout/revert/stash anything).
- Dev app :5174 -> :3001 (LIVE). Do not restart or pkill.
- Data repo `/home/brad/.computable-lab/worktrees/main` (embedded git) — READ ONLY.
- NOTE: task-desc path refs have drift; VERIFY the real path of each symbol before citing
  (e.g. `DocumentControlBar.tsx` is at `app/src/components/registry/DocumentControlBar.tsx`;
  the projection service is under `server/src/ui/EditorProjectionService.ts`, not
  `server/src/projection/`). Cite what you actually find; do not trust the quoted path.
- Governance runtime landed at commit 56740422: `server/src/lifecycle/` (XState engine,
  BypassAudit), role-grants + RoleResolver, `POST /signatures` (routes.ts:599,
  SignatureHandlers.ts), append-only SIG/EVT (405 APPEND_ONLY), policy bundles with
  `enforceTransitionRoles`.

## Items to resolve (each: evidence + outcome status)

(a) **Editable rich-text body contract for a new controlled-document.** The ui-v1 widget
    enum has `markdown` but `EditorProjectionService.ts` (~:229) treats markdown as
    fallback/UNSUPPORTED_WIDGET (`EditorProjectionFallback.test.ts` ~:628); the protocol
    uses a custom widget `protocol-prose-authoring` on `$.humanStepsText`
    (`schema/workflow/protocol.ui.yaml` ~:48-50). Determine whether an EXISTING generic
    widget/projection capability suffices for a new controlled-document body, or a NEW
    generic capability is required (then outcome = `requires-rescope` to the architect —
    do NOT pre-authorize absorbing it into QMS-6).

(b) **RecordRegistryPage real save path.** Quote the CURRENT dirty-tree diff for
    `app/src/pages/RecordRegistryPage.tsx` (`git diff -- app/src/pages/RecordRegistryPage.tsx`)
    and record an ownership/integration agreement (QMS-6 must edit this externally-touched
    file). Quote the diff — do NOT revert or checkout-over it.

(c) **Component chain verification.** Which host(s) render `ProjectionTapTabEditor`
    (trace: is `/record/:recordId` RecordHostPage -> RecordEditPanel, NOT TapTab? plus the
    registry inline path). Name the AUTHORITATIVE editing surface. Trace, do not assume.

(d) **Exact JSON shapes.** `POST /signatures` request AND response (from SignatureHandlers);
    the record PATCH carrying `signatureRefs` — settle body-top-level vs payload from
    RecordHandlers (task note guesses `RecordHandlers.ts` ~:60, :634-665 — verify);
    the REAL error contract (`REAUTH_FAILED`, 403/422 codes) as actually returned. Server
    validates kind=signature, subject.recordId==record, signedBy==acting user; password
    NEVER in the PATCH.

(e) **USR-* <-> PER-* personRef convention** for author/reviewer/approver and
    `requires_different_person` — how a user record links to a person record.

(f) **Naming / canonicalization.** The `/lab` Documents category targets kind `document`
    with NO schema (`LabCollectionView.tsx` ~:33, :157). One canonical term wins
    (`cf:controlled-document` vs `cf:SOP`) — never two local terms. State the single term.

(g) **Declarative source for signature metadata.** Where the UI reads (declaratively, from
    lifecycle YAML / preview response) whether a transition requires a signature, its exact
    `signatureAction`, and which denial means what. Hardcoding in TS is forbidden — confirm a
    data source exists or return `requires-rescope`.

(g') **Canonical SOP <-> training relationship.** `training-record.points at trainingMaterialRef`;
    `training-material.materialType: sop`. Define how the new DOC- kind relates (reference
    target + which is canonical) or explicitly justify two distinct entities.

(h) **Signed-revision integrity AS IMPLEMENTED.** What the SIG's `gitCommit` binding does and
    does not protect against; whether stale/reused signatureRefs are rejected for changed
    content TODAY (observe from code/tests — never invent); how a signed snapshot stays
    reconstructable via git.

(i) **Supported route for creating a new record of an arbitrary kind.** If none exists,
    `requires-rescope`.

## Verification baseline (run, quote real output)

Run the governance/lifecycle/RoleResolver/Signature suites and attribute pre-existing noise:

    cd /mnt/vast/home/brad/git/computable-lab
    npm run test:run -w server   # or: npx vitest run <governance/lifecycle/signature files>

Quote the exit code and per-file pass/fail. Known pre-existing failures from sibling work
(e.g. `test/api/settings.test.ts`) are to be ATTRIBUTED, not fixed.

## Hard constraints

- NO product code edits. NO commits. NO server restarts. Read-only against repo + data repo.
- Never fabricate evidence; every claim carries a `path:line` you actually opened.
- Outcome status per item: `resolved` | `blocked` | `requires-rescope`.
- Do NOT touch the shared working tree; Brad's dirty changes must survive verbatim.

## Report back (to orchestrator)

- Absolute path of the decisions doc.
- Per-item outcome table (a)–(i).
- Any `requires-rescope` items with the exact reason.
- Baseline suite result (exit code + counts).
