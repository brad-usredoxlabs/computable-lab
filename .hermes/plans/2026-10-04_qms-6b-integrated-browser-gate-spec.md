# QMS-6B — Integrated browser gate (lane 1)

Task: QMS-6B · campaign light-qms-records-browser · lane 1 · authored by the orchestrator 2026-10-04
Status at authoring: BLOCKED on OPS-1 (grant retarget to USR-QMS-ADMIN). This spec is written ahead of
dispatch so the gate can start the moment OPS-1 lands. **Do not dispatch the signed rows until the
pre-flight below passes.**

## Goal

One independent Playwright+vision gate that (a) proves the EDITOR-2 platform fix end-to-end in a user's
hands and (b) converts the provisional QMS-6 merges into done by exercising the full signed lifecycle
and the D6-D9 integrity probes against the landed revision/signature contract.

The gate returns exactly one verdict: `VERDICT: accept` | `VERDICT: fix` | `BLOCKED`. `fix` goes back to
the owning coder (`EDITOR-2` vs `QMS-6A` by surface) with reproduced evidence. A NEW platform gap goes
to the architect, never absorbed. Infra/credential failure is `BLOCKED`/inconclusive, never a product
defect.

## Environment (verified by the orchestrator at authoring time)

- Lane trunk `cl/integration-1` in `/mnt/vast/home/brad/git/cl-integration-1`, HEAD `f9528a1f`, clean.
  The **candidate revision is the trunk HEAD at dispatch time** — record it in the report and confirm
  the served checkout contains it before reviewing (frontend dev server runs from this worktree;
  `VITE_CACHE_DIR=/mnt/vast/home/brad/git/cl-integration-1/.run/vite-cache`).
- Lane stack: backend `http://localhost:3092`, frontend `http://localhost:5192` — both HTTP 200.
  Manage with `~/.hermes/profiles/orchestrator/scripts/cl-lane-stack.sh 1 start|stop|restart|status`.
  **tsx --watch does NOT reload YAML** — if any schema/lint/ui/lifecycle YAML changed, restart first.
- Lane data dir: `/home/brad/.computable-lab-lane1` (backend `:3092` runs with
  `CL_DATA_DIR=/home/brad/.computable-lab-lane1` — verified in the running process env). Records repo:
  `/home/brad/.computable-lab-lane1/worktrees/main`.
- `USR-QMS-ADMIN` resolves on the lane: `curl -s -H 'x-user-id: USR-QMS-ADMIN' http://localhost:3092/api/me`
  → `{"userId":"USR-QMS-ADMIN","isSystem":false,...,"username":"qms-admin"}`.
- Brad's live stack `:3001`/`:5174` and live data dir `/home/brad/.computable-lab`: NEVER touched, never
  requested, never restarted. Appliance-2 vision model is shared; stay on the named surfaces.

## PRE-FLIGHT (all must pass before the signed rows)

1. `cl-lane-stack.sh 1 status` → backend `:3092` and frontend `:5192` both 200.
2. Isolation re-verify: `/proc/<pid-of-:3092>/environ` contains
   `CL_DATA_DIR=/home/brad/.computable-lab-lane1`. (OPS-1 proved it; re-confirm, do not assume.)
3. Actor matrix + grants (OPS-1 output):
   `curl -s -H 'x-user-id: USR-QMS-ADMIN' http://localhost:3092/api/records/GRANT-DEMO-REVIEWER`
   → `userId: USR-QMS-ADMIN`, roles `[reviewer, approver]`; and `USR-QMS-ADMIN` carries
   `personRef: PER-DEMO-REVIEWER`. `USR-BRAD` holds `author` only (the under-granted actor for QMS-7).
4. **Credential pre-flight (the reviewer mints the LANE-LOCAL password itself):**
   the pipeline holds no plaintext for `qms-admin`; the lane credential store
   `/home/brad/.computable-lab-lane1/auth/credentials.json` holds a verifier for `USR-QMS-ADMIN`.
   `POST /auth/set-password` is self-service (`AuthHandlers.ts:100-105`) and writes the verifier for the
   **resolved** user, so an ordinary user can set its own password. Do this, then log in:
   ```
   curl -s -X POST -H 'x-user-id: USR-QMS-ADMIN' -H 'content-type: application/json' \
     -d '{"newPassword":"<lane-demo-value>"}' http://localhost:3092/api/auth/set-password
   curl -s -X POST -H 'content-type: application/json' \
     -d '{"username":"qms-admin","password":"<lane-demo-value>"}' http://localhost:3092/api/auth/login
   ```
   (Confirm the real route/field names against `server/src/api/handlers/AuthHandlers.ts` and
   `server/src/api/routes/*.ts` before asserting they work; report the exact observed status codes.)
   This is a LANE-LOCAL demo credential, not Brad's live one; it is a real verifier set through the
   product's own endpoint, never a fabricated value. **A minted test SIG that round-trips proves the
   credential is live** (row 7's precondition). Do NOT record the password value in any receipt; a
   redacted `POST /auth/login -> 200` is the evidence. If set-password or login cannot work even for an
   ordinary user, STOP and report `BLOCKED` with the observed response — do not fall back to
   `USR-LOCAL-ADMIN` (it is the bootstrap identity: its header degrades to `USR-BRAD` and it can never
   log in; `LocalIdentityService.ts:43-46`, `AuthHandlers.ts:61-66`, `:100-105`).

## SURFACES (acceptance criteria, verbatim from the task block)

1. `DOC-DEMO-SOP` editor renders all three sections with fields; body is `RichTextField`;
   edit → save → reload → reopen persists.
2. Budget record renders its sections via the declarative binding (`BUD-DEMO-LANE1`, lane fixture).
3. `CAL-DEMO-GC` fallback regression: still renders all fields, NO lifecycle chrome.
4. `TRR-DEMO-1` no lifecycle chrome (regression keep).
5. Wrong password keeps `in_review`, reauth error shown distinct from role/denial.
6. Same-person approve denied with the DIFFERENT-PERSON reason distinct (not password/role).
7. Correct password (reviewer = `USR-QMS-ADMIN`) → `approved`; receipt shows the applied snapshot
   id/hash + SIG + audit records cross-checked via API.
8. `approved → effective` by the approver with its OWN signature (separate mint,
   `targetState = effective`) and a second receipt row.
9. A live minted-but-unapplied SIG (mint, cancel the PUT) displays as ORPHAN, never applied.
10. Approved doc is editor-locked; draft-copy button → new draft opens with fresh authorship, no
    inherited reviewer/approver, clear messaging; original untouched.
11. Minimal revision readout present and honest.

## API PROBES (sanitized receipts; lane-only drafts where needed)

- Stale SIG → `409 STALE_SIGNATURE` + state unchanged.
- Content-changing signed transition → `409 SIGNED_CONTENT_CHANGED`.
- Cross-transition SIG → `422 SIGNATURE_TARGET_MISMATCH`.
- Rejections are `{error, message}` with **NO `code` field** — do not assume one. State advance is
  `PUT /records/:id` with body-top-level `signatureRefs` (NOT PATCH).

## PRESERVED — accept, do not re-litigate

`/registry` loads + survives reload; Documents tab lists the SOP with its tag; `/lab` Documents pill
resolves; `draft → in_review` shows no password modal; Approve renders in `in_review` with exactly one
modal; Cancel sends nothing. The prior reviewer's `CAL-DEMO-GC` **404 defect was FALSIFIED** — do not
resurrect it.

## REVIEWER RELIABILITY RULES (two prior incidents)

- Every NEGATIVE claim (404 / not-found / blank) MUST be re-verified by the reviewer via an API call or
  a reload BEFORE being reported (one false-positive falsified a CAL-DEMO-GC 404).
- Screenshots only after network settle (a prior accept rested on stale frames; a second incident was a
  false accept on stale screenshots during an outage).
- Infra/credential failure ⇒ `BLOCKED`/inconclusive, never a product defect.
- Appliance-2 is slow on fresh screenshots (~16 s each); scope to the named surfaces, no broad sweeps.

## KNOWN, CARRIED (do not re-litigate; verify if cheap, do not block on)

- `DOC-DEMO-SOP` store/file state divergence carried from EDITOR-2: `:3092` serves `state: in_review`
  (`updatedAt 2026-10-03T22:25:26Z`) while the on-disk lane file says `draft` (`22:36:19Z`). **Do not
  assume the fixture starts at `draft`** — read the live state first. OPS-1 explains the divergence.
- `buildProjectionDocument` (`app/src/editor/taptab/documentMapper.ts:171`) skips blocks with
  `kind !== 'section'`, so the budget `line-items` repeater never renders on the generic
  `/record/:id` page (it renders in `BudgetDocumentSurface`). Expected, not a defect.
- Pre-existing console noise: `WorkspaceTabStrip` React duplicate-key warnings; a stray 422. Not
  EDITOR-2's and not QMS-6A's.

## RECEIPTS

`/home/brad/.hermes/cl/receipts/QMS-6B/<runstamp>/` — `report.md`, `trail.json`, and the named shots:
`editor-controlled-sections.png`, `editor-body-save-reload.png`, `editor-budget-sections.png`,
`editor-calibration-fallback.png`, `qms-wrong-password.png`, `qms-same-person-denial.png`,
`qms-approved-receipt.png`, `qms-effective-second-signature.png`, `qms-orphan-receipt.png`,
`qms-locked-draft-copy.png`, `qms-copy-opened.png`, `qms-revision-readout.png`, plus sanitized API
receipts for the three rejection probes. **No locked record rewound, no audit history fabricated, no
passwords or secrets in any receipt.**

## STOP BOUNDARY

`VERDICT: fix` → back to the owning worker (`EDITOR-2` vs `QMS-6A` by surface) with reproduced evidence
and the absolute screenshot paths. New platform gaps → architect, never absorbed. No reviewer-harness
redesign. Never weaken criteria; never report an untested flow as passing.
