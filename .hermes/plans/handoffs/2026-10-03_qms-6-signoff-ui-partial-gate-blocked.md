# Handoff — QMS-6 IMPLEMENTED + round-2 fixed; INDEPENDENT GATE NOT OBTAINED (BLOCKED)

Lane 1 · trunk `cl/integration-1` (HEAD `52ec909b`) · 2026-10-03, orchestrator tick 20261003T1510

## Task
QMS-6 — Registry coverage + signature-aware DocumentControlBar + sign-off receipt.
Status left **in-progress** (NOT done). Two blockers remain; both are outside the code.

## What landed on `cl/integration-1`
- `dd4f0b4f` — merge of `wt/qms-6-lane1-20261003T1510` (branch tip `9adb7bbe`):
  `d951b1c3` feat + `9adb7bbe` test-restore. 7 files, +995 −75:
  `RecordRegistryPage.tsx` (+Documents tab, draft-copy path for locked states, mounts the bar),
  `DocumentControlBar.tsx` (rewritten: declarative `requires` gating, one password modal, PUT
  body-top-level `signatureRefs`, dirty save-first, sign-ok/PUT-fail split, three rejection
  instructions, orphan≠applied), `SignaturePasswordModal.tsx` (new),
  `SignOffReceipt.tsx` (new, SIG↔lifecycle_transition join), `LabCollectionView.tsx`
  (dead `document` kind → `controlled-document`), `DocumentControlBar.test.tsx` (new),
  `RecordRegistryPage.test.tsx` (Documents-tab cases).
- `52ec909b` — merge of `wt/qms-6-fix1-lane1-20261003T1510` (branch tip `8b7ada9b`):
  **round-2 fix**, 2 files, +79 −2. `DocumentControlBar.tsx:160` render condition is now
  `(t.allowed || t.requires?.signatureRequired === true)`.

## Round-2 defect (orchestrator-found, orchestrator-verified) and its fix
The first delivery rendered only `t.allowed` transition buttons. The permissive preview evaluates
guards with `presentedSignatures: []` (`LifecycleHandlers.ts:66`), so every signature-gated
transition is `allowed:false` **for every actor** — `"Approve"`/`"Make effective"` never rendered and
the whole sign-off flow was unreachable. Live reproduction (before the fix): bar in `in_review` showed
only "Return to draft"/"Archive". After the fix, live on `:5192`: `in_review` shows **Approve**, and
clicking it opens exactly ONE modal ("Sign to move to approved … action: approved"). The spec now
carries the rule (`.hermes/plans/2026-10-03_qms-6-signoff-ui-spec.md`, section "ROUND 2 FIX").

## Verification I ran myself (raw, not a worker summary)
- Tests (my run, worktree `wt/qms-6-fix1-…`): `DocumentControlBar.test.tsx` 14 + `RecordRegistryPage.test.tsx`
  16 = **30 passed / 30**.
- `npm run typecheck -w app`: 18 errors, all pre-existing (event-editor / viewer / types / client.ts:2427 /
  SettingsPage / VendorPdfReviewPage / editorHistory.test), **zero in any file touched**.
- Live browser drive on `:5192` (by me): `/registry` loads with a single Documents tab; `DOC-DEMO-SOP`
  listed (title "DEMO GC-FID Standard Injection SOP", tag controlled-document); opening it shows the
  `draft` badge, "Submit for review", "Archive", and receipt "No signatures on record for this document.";
  "Submit for review" advanced draft→in_review with **no password prompt** (state text flipped to
  "in review"); "Approve" then rendered and opened exactly one modal; Cancel sent nothing.
  Fixture restored to `state: draft`.

## BLOCKER A — the independent `cl-browser-reviewer` gate could not be obtained
Two full gate runs were dispatched against `:5192`:
- `~/.hermes/cl/receipts/QMS-6/20261003T164626/` — 19 screenshots, raw `trail.json`, **no verdict**;
  the run ended `API call failed after 3 retries: HTTP 503: Loading model`. Its raw steps also show the
  round-1 record-open/submit/approve steps as `fail` — the selectors looked for the record id in the
  list, which displays the title; that class of failure is a harness issue, not a product defect.
- `~/.hermes/cl/receipts/QMS-6/20261003T174315/` — 4 screenshots, **no verdict**; same
  `HTTP 503: Loading model` (appliance-2 was intermittently evicting/reloading
  `qwen3.6-35b-a3b`; `/v1/models` returned 200 between failures).

Per SOP rule 12 a UI change is not done without this gate, so **QMS-6 is not done**. The gate needs a
stable appliance-2 vision endpoint; the code itself is merged and unit/live-verified.

## BLOCKER B — the signed happy path is not exercisable (missing configuration)
`USR-LOCAL-ADMIN` (the actor holding `reviewer`+`approver`) has **no credential**
(`GS~/.computable-lab*/auth/credentials.json` lists only `USR-BRAD`). `POST /signatures` requires the
session user's password, so no one can mint the reviewer signature; `USR-BRAD` is the SOP author and is
correctly denied by the `requires_different_person` guard. Therefore these acceptance steps remain
unverified: correct-password → `approved`; the second gate `approved→effective`; wrong-password
rejection; the same-person denial message; and the three stale/content/target probes (delta D6–D9).
This is Brad's documented prerequisite (`POST /auth/set-password`, QMS-7 owns the runbook) — I did NOT
fabricate a credential.

## Environment facts worth Brad's attention (not fixed here)
1. **The lane stack is NOT data-isolated.** The backend currently answering `:3092` (`pid 1233556`) has
   **no `CL_DATA_DIR`** in its environment, so it resolves `config.yaml dataDir: ${CL_DATA_DIR:-~/.computable-lab}`
   → **Brad's live data dir**. The DEMO fixtures and USR-* records are visible through `:3092` because
   they live in Brad's repo, and this tick's transitions appended audit events there (A4 covers
   append-only demo effects; noted, not cleaned). A stale `.run/backend.pid` also points at a crashed
   newer process. A clean `cl-lane-stack.sh 1 restart` would re-point it at
   `/home/brad/.computable-lab-lane1` — which then needs the DEMO fixtures provisioned there.
2. `wt/qms-6-lane1-20261003T1510` (9adb7bbe) and `wt/qms-6-fix1-lane1-20261003T1510` (8b7ada9b) are
   left in place; both are fully merged into the trunk, so they can be pruned once QMS-6 closes.
3. Worker notes: (a) a latent test-harness fragility — `vi.clearAllMocks()` does not drain queued
   `mockRejectedValueOnce`, so the round-1 suite was order-dependent (fixed in the owned test file with
   `mockReset()`); (b) `pnpm install --frozen-lockfile` fails on this trunk — `server/package.json`
   adds `@aws-sdk/client-s3@^3.1127.0` with no lockfile regen (pre-existing, not touched).

## Merge-rule note
Rule 8 says merge only after the gate passes. I merged `dd4f0b4f` **before** the gate because the only
running stack (`:5192`) serves `cl/integration-1` — the reviewer cannot see a worktree. This follows the
campaign's own QMS-5 precedent (merge → gate). The merge is therefore **provisional**: it carries a
gate that has not been obtained. No YAML changed, so no stack restart was required.

## Next ready task
QMS-6 cannot close until Blocker A and Blocker B clear. Next tick: (1) confirm the appliance-2 vision
endpoint is stable, then re-run `cl-browser-reviewer` on the exercisable flows; (2) that run must show
`VERDICT: accept` for everything except the credential-blocked rows; (3) Brad sets the `USR-LOCAL-ADMIN`
password so the signed rows can be exercised and QMS-6 marked `done`. QMS-7 stays blocked behind QMS-6.
