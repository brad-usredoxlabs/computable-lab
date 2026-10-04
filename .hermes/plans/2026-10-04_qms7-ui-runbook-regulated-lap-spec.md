# QMS-7 — UI runbook + POL-REGULATED denial lap + full-flow proof (lane 1)

Task: QMS-7 · campaign light-qms-records-browser · lane 1 · spec authored by the lane-1 orchestrator
2026-10-04 (tick 10:20). Status at authoring: **DRAFT — dispatch waits on QMS-6B acceptance.**
Drafting is explicitly permitted earlier (task block: "drafting may run earlier; final claims + the lap
require the accepted build"). Nothing here may be claimed as passing until QMS-6B returns VERDICT: accept.

## Why

Brad's original complaint was "I don't know where to look". The deliverable is the doc that makes the
accepted wave reproducible by a human, plus the LAST unverified policy row of the whole campaign: the
POL-REGULATED denial lap executed from the doc ALONE by an independent reviewer.

## Verified orientation anchors (orchestrator-checked this tick; worker re-verifies before citing)

- **Doc to extend:** `docs/qms-manual-testing-cheatsheet.md` (178 lines). Existing sections: Setup
  (10) · 1) Bundle switching — admin-gated (25) · 2) Bundle strictness (38) · 3) Run-start identity
  binding (47) · 4) Role grants (56) · 5) Lifecycle roles (69) · 6) E-signatures (75) · 7) Audit trail
  (87) · 8) Bypass detector (97) · Ten-minute "everything works" pass (103) · Gotchas (114) ·
  Protocol revisions and signature integrity (125).
- **STALE in the existing doc — do NOT carry forward:** the header says `Backend at :3001`; Setup
  (14-21) and §1 (29-31) and §6 use `USR-LOCAL-ADMIN` / bare `/auth/...` paths. `USR-LOCAL-ADMIN` is the
  bootstrap/fallback identity: its header degrades to `USR-BRAD` and `POST /auth/set-password` refuses
  it (`AuthHandlers.ts:61-66`, `:100-105`). The real actor is **`USR-QMS-ADMIN`** (username `qms-admin`).
- **Policy bundles are data:** `schema/core/policy-bundles/sandbox.policy-bundle.yaml`,
  `tracked.policy-bundle.yaml`, `regulated.policy-bundle.yaml` declare `POL-SANDBOX` / `POL-TRACKED` /
  `POL-REGULATED`.
- **Bundle switch (API):** `PATCH /api/config` (`server/src/api/routes.ts:849`) with body
  `{"lab":{"policyBundleId":"POL-REGULATED"}}`; handler `configHandlers.patchConfig`. Live per-request
  (no restart). Non-admin → `403 POLICY_BUNDLE_CHANGE_FORBIDDEN`; unknown id → `400` (checked before the
  guard). Audited as `policy_bundle_changed {from,to}`.
- **Bundle switch (UI):** `app/src/components/settings/PolicyBundleSelector.tsx` renders the bundle
  catalog (`onClick → onBundleChanged(bundle.id)`), mounted at `app/src/shell/SettingsPage.tsx:285-287`;
  the handler at `SettingsPage.tsx:94-100` calls `apiClient.patchLabSettings({policyBundleId})` and on
  failure shows `alert("Failed to update policy bundle: <message>")` (`:99`). **A JS alert dialog** — a
  browser reviewer must dismiss it and must not mistake it for a product crash.
- **Lane facts:** backend `:3092`, frontend `:5192`; `CL_DATA_DIR=/home/brad/.computable-lab-lane1`
  (`.run/backend.log` prints `Data dir: /home/brad/.computable-lab-lane1`); data repo
  `/home/brad/.computable-lab-lane1/worktrees/main` (embedded git). Brad's live stack is `:3001`/`:5174`
  on `/home/brad/.computable-lab` — state the two side by side so nobody confuses them.
- **Actor matrix:** `docs/qms-actor-matrix.md` — LINK it, do not duplicate it. Reviewer/approver actor =
  `USR-QMS-ADMIN`; `USR-BRAD` holds author only (the under-granted actor for the REGULATED lap).
- **Credential path (corrected mechanism):** `POST /api/auth/set-password` is self-service, body field is
  `password` (min 8), resolves the caller from `x-cl-session`/`x-user-id`; then
  `POST /api/auth/login {username, password}`. The runbook documents THIS path and must NOT carry the
  obsolete "Brad runs POST /auth/set-password for USR-LOCAL-ADMIN" step (`description_correction` in the
  task block; no Brad turn needed).
- **DEMO fixtures (lane):** `PER-DEMO-AUTHOR`, `PER-DEMO-REVIEWER`, `DOC-DEMO-SOP`, `TRM-DEMO-GC`,
  `TRR-DEMO-1`, `EQP-DEMO-GC`, `CAL-DEMO-GC`, `GRANT-DEMO-AUTHOR`, `GRANT-DEMO-REVIEWER`,
  `BUD-DEMO-LANE1`, `USR-QMS-ADMIN`.
- **Pre-isolation demo audit events** remain in the live data dir (A4). State this factually in the doc;
  later evidence uses the lane.
- **Lane-only ACL note the doc may cite:** `ACL-BUD-DEMO-LANE1` grants `{user USR-QMS-ADMIN, editor}`;
  `ACL-DOC-DEMO-SOP` grants `{user USR-QMS-ADMIN, editor}`. Both are lane test data.

## Deliverable (one file)

`docs/qms-manual-testing-cheatsheet.md` — ADD a UI-first section (heading e.g. `## UI-first runbook
(2026-10-04, lane 1)`) that contains, in reviewable order:

1. `/registry` entry point + the one nav entry; the Documents tab / `/lab` Documents pill.
2. Lane isolation facts vs Brad's live-stack facts, side by side (`:3092`/`:5192` +
   `CL_DATA_DIR=/home/brad/.computable-lab-lane1` vs `:3001`/`:5174` + `/home/brad/.computable-lab`).
3. DEMO fixture ids (list above).
4. ACTOR MATRIX — link `docs/qms-actor-matrix.md` (do not duplicate).
5. The corrected set-password prerequisite: the `USR-QMS-ADMIN` own-login path (curl, `/api` prefix,
   body field `password`). Do NOT include the obsolete Brad/LOCAL-ADMIN step.
6. POL-SANDBOX happy path through BOTH signature gates to `effective`, including receipt read-back.
7. Save-edits-first guidance and the THREE integrity rejections with their distinct meanings
   (`STALE_SIGNATURE` = re-sign the current saved revision; `SIGNED_CONTENT_CHANGED` = save edits first;
   `SIGNATURE_TARGET_MISMATCH` = a signature minted for a different transition). Rejections are
   `{error,message}` with NO `code` field; state advance is `PUT /api/records/:id` with body-top-level
   `signatureRefs`, NOT PATCH.
8. Orphan-SIG interpretation (minted, never applied → ORPHAN, never displayed as applied).
9. Locked content + draft-copy behavior (draft copy is a NEW record via
   `POST /api/records/:id/draft-copy`; automatic supersession and a revision-management UI are
   explicitly OUT of scope).
10. POL-REGULATED lap: Settings bundle selector → under-granted actor denied despite a permissive
    preview button → bundle RESTORED (restore verified even if the lap fails).
11. What is NOT automated, stated plainly: competency inference, run-start preconditions, CAPA.
12. Factual note that pre-isolation demo audit events remain in the live data dir (A4); later evidence
    uses the lane.

Optionally add a short "corrections to the 2026-09-27 sections" note pointing at the stale `:3001` /
`USR-LOCAL-ADMIN` references — but do not rewrite the legacy sections; this task EXTENDS the doc.

## Acceptance (verbatim from the task block)

> independent reviewer follows ONLY the doc: sandbox flow to effective reproduced (or explicitly limited
> to what remains unclaimed), SIG/audit records visible via GET /records, regulated denial observed,
> bundle restored; shots qms-regulated-bundle-selected.png, qms-regulated-denial.png,
> qms-bundle-restored.png; VERDICT: accept; doc links QMS-6B receipts.

Reviewer runs against `http://localhost:5192` (lane 1) with API probes on `:3092`. Receipts:
`/home/brad/.hermes/cl/receipts/QMS-7/<runstamp>/`. The doc must link the accepted QMS-6B receipts dir.

## Stop boundary

Unexpected regulated-policy behavior or an unusable selector → architect. Never weaken policy YAML,
never leave the bundle changed, never add revision/protocol descoped features to the doc.
