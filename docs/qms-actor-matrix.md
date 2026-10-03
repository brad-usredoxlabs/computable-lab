# QMS Actor Matrix — QMS-4 (campaign light-qms-records-browser)

Generated 2026-10-03T10:10:17 (spec tick) by the QMS-4 seed work against live `main @ dbb5ba3e`,
lab policy `POL-SANDBOX`. QMS-6 and QMS-7 consume this table verbatim. Canonical path (promoted by
the orchestrator after verification): `docs/qms-actor-matrix.md`.

Every "expected" below is derived from the declarative sources, not from code policy:
- lifecycle: `schema/core/lifecycles/document-controlled-signing.lifecycle.yaml` (roles, guards)
- bundles: `schema/core/policy-bundles/sandbox.policy-bundle.yaml` (`enforceTransitionRoles: allow`)
  and `regulated.policy-bundle.yaml` (`enforceTransitionRoles: deny`)
- enforcement shape: `server/src/lifecycle/LifecycleEngine.ts` (`checkEventInSpec`: guards ALWAYS
  run; the transition-role check runs only when `enforceTransitionRoles` resolves to deny) and
  `server/src/lifecycle/lifecycleMiddleware.ts:24-69` (two failure messages, below).

**Reading the table.** Role sufficiency under deny = actor holds the role via a `role-grant`
(`RoleResolver`) OR is the assigned person for that role (`<role>Ref.id` / legacy
`createdBy → author`, `lifecycleMiddleware.ts:80-93`). Guards (`requires_different_person`,
`requires_signature`) bind under BOTH bundles — POL-SANDBOX relaxes roles and readiness checks,
never the YAML guards. Signature-gated transitions additionally require `POST /api/signatures`
re-auth by the acting session user, i.e. a password — see credential state below.

## Actor fixtures (seeded by `scripts/qms-demo-seed.mjs`)

| Session user | Linked person (write-once `USR-*.personRef`) | Effective grants (role + scope) | Credential state | Notes |
|---|---|---|---|---|
| `USR-BRAD` | `PER-DEMO-AUTHOR` | `GRANT-DEMO-AUTHOR`: `author` @ `document-controlled-signing` | **set** (credentials.json) — can `POST /auth/login` and mint signatures | Also the assigned author of `DOC-DEMO-SOP` (`authorRef.id` AND `createdBy` = `USR-BRAD`, so `roleAssignments.author = USR-BRAD`; like-vs-like per QMS-1 (e)). Intentionally UNDER-granted (no reviewer/approver) — the regulated denial actor for QMS-7. |
| `USR-LOCAL-ADMIN` | `PER-DEMO-REVIEWER` | `GRANT-DEMO-REVIEWER`: `reviewer`, `approver` @ `document-controlled-signing` | **NOT set** until Brad runs `POST /auth/set-password` (bootstrap window open at seed time) | Holds both gated roles so ONE identity can complete the lap. While its credential is unset, it CANNOT mint signatures (POST /signatures demands the session user's password) → the two signature-gated rows are blocked for it until Brad sets the password (QMS-7 owns that runbook). `x-user-id: USR-LOCAL-ADMIN` also DEGRADES to `USR-BRAD` once its credential exists (LocalIdentityService) — use a real session after that. |

Fixture doc under test: `DOC-DEMO-SOP` (state `draft`, lifecycle `document-controlled-signing`,
author `USR-BRAD`).

## Transition expectations

Verbatim failure shapes (422 `LIFECYCLE_TRANSITION_DENIED`, `lifecycleMiddleware.ts:63,67`):
- **(M1)** `Transition from '<from>' to '<to>' is not allowed by the document-controlled-signing lifecycle.` — no transition exists for that state pair.
- **(M2)** `You do not have the required role for this transition.` — transition exists but either the deny-mode role check failed OR a guard failed (`requires_different_person`, missing/stale `requires_signature`). The engine cannot distinguish these in the message; the matrix names the actual reason per row.

| Transition (event) | Role required | Guard(s) | `USR-BRAD` @ POL-SANDBOX | `USR-LOCAL-ADMIN` @ POL-SANDBOX | `USR-BRAD` @ POL-REGULATED | `USR-LOCAL-ADMIN` @ POL-REGULATED | Exact expected failure reason for the under-granted actor |
|---|---|---|---|---|---|---|---|
| `draft → in_review` (SUBMIT_FOR_REVIEW) | author | none | **allowed** (role check skipped) | **allowed** (role check skipped) | **allowed** — `author` grant + assigned author | **denied (M2)** — holds no `author` grant and is not the assigned author; role denial: actor lacks role `author` | M2, reason: no `author` grant, `authorRef.id`/`createdBy` ≠ `USR-LOCAL-ADMIN` |
| `in_review → approved` (APPROVE) | reviewer | `requires_different_person(than: author)` + `requires_signature(signatureAction: approved)` | **denied (M2)** — same-person guard: `roleAssignments.author = USR-BRAD = actor` (guard binds even under sandbox; BRAD also lacks a reviewer grant) | **allowed** iff a SIG with action `approved`, subject `DOC-DEMO-SOP`, `signedBy USR-LOCAL-ADMIN` is presented in the PUT body `signatureRefs` — blocked until its credential is set (cannot mint without password) | **denied (M2)** — same reason as sandbox row (guard binds under deny too; no reviewer grant either) | **allowed** with same SIG presentation (`reviewer` grant + different person + signature) | BRAD denial: M2, reason: `requires_different_person` fails (`roleAssignments.author === currentActorId`, `LifecycleEngine.ts:115-117`); missing SIG on the same row would ALSO surface as M2 — distinguish by presenting/removing the SIG, not by message |
| `in_review → draft` (RETURN_TO_DRAFT) | reviewer | none | **allowed** (role check skipped) | **allowed** (role check skipped) | **denied (M2)** — no `reviewer` grant, not assigned via `reviewerRef` | **allowed** (`reviewer` grant) | M2, reason: actor holds neither `reviewer` grant nor the `reviewerRef` assignment |
| `approved → effective` (MAKE_EFFECTIVE) | approver | `requires_signature(signatureAction: approved)` | **allowed** under sandbox iff SIG presented (role check skipped — BRAD needs only the signature; BRAD can mint it: credential set) | **allowed** iff SIG presented (`signedBy USR-LOCAL-ADMIN` required by the guard) — blocked until credential set | **denied (M2)** — no `approver` grant, not the `approverRef` assignee; a SIG would not rescue it (role check is separate from the guard) | **allowed** with SIG presented (`approver` grant + signature) | M2, reason: actor lacks role `approver` (deny-mode role check, independent of the signature guard). Note a SIG minted by BRAD cannot be presented by BRAD-as-non-signer for LOCAL-ADMIN's PUT (`SIGNATURE_SIGNER_MISMATCH`, QMS-1 (d)) |
| `effective → superseded` (SUPERSEDE) | author | none | **allowed** (grant + assignment) | **allowed** under sandbox (role check skipped) | **allowed** (`author` grant) | **denied (M2)** — no `author` grant, not the author assignee | M2, reason: actor lacks role `author` |
| `draft\|in_review\|approved\|effective → archived` (ARCHIVE) | approver | none | **allowed** @ sandbox | **allowed** @ sandbox | **denied (M2)** — no `approver` grant | **allowed** (`approver` grant) | M2, reason: actor lacks role `approver` |

Note on assignments weakening denials: if QMS-6/7 ever PUTs `reviewerRef`/`approverRef` onto
`DOC-DEMO-SOP`, the assigned USR-* satisfies the deny-mode role check via `roleAssignments`
(already-assigned-person path, `LifecycleEngine.ts:94-96`). Do NOT assign `USR-BRAD` to
`reviewerRef`/`approverRef` — it would erase the QMS-7 denial rows. Leave `reviewerRef`/
`approverRef` unset (or assigned to `USR-LOCAL-ADMIN`) to preserve the matrix.

## Which rows each task exercises

- **QMS-6 (sandbox, happy lap + same-person denial):**
  - happy path: `draft→in_review` (BRAD), `in_review→approved` (LOCAL-ADMIN, SIG presented —
    requires Brad to have set the LOCAL-ADMIN password first), `approved→effective`
    (LOCAL-ADMIN, SIG), i.e. rows 1, 2, 4 under POL-SANDBOX.
  - same-person denial: `in_review→approved` as BRAD → 422 M2 (`requires_different_person`
    binds under sandbox because `createdBy`/`authorRef` = `USR-BRAD`).
  - stale/reused-SIG probe rows per QMS-1 (h): documented behavior is SIG *accepted*
    (staleness not compared); receipt captures what the server actually does.
- **QMS-7 (regulated lap):** flip lab policy to `POL-REGULATED` and exercise:
  - authorized success: rows where `USR-LOCAL-ADMIN` @ POL-REGULATED is **allowed** (2, 3, 4, 6).
  - role denial: rows where `USR-BRAD` @ POL-REGULATED is **denied (M2)** (2, 3, 4, 6) —
    BRAD is the deliberately under-granted actor (`GRANT-DEMO-AUTHOR` only).
  - QMS-7 also owns the `POST /auth/set-password` runbook text; LOCAL-ADMIN's credential must
    exist before any signature-gated regulated row can pass.

## Verified-live caveats (read back at seed time, 2026-10-03)

1. `grantedBy = USR-LOCAL-ADMIN` stamped on BOTH grants (server-side `stampActorAs`,
   `schema/identity/role-grant.lint.yaml` — note that lint file is currently UNTRACKED in the
   live checkout; the gate behaves live: `GRANT_FORBIDDEN` for `USR-BRAD`).
2. Role-grant records are privileged reads: `GET /api/records/GRANT-DEMO-*` returns **404 to
   `USR-BRAD`** and 200 to `USR-LOCAL-ADMIN` (access-policy owner semantics). QMS-5/6 UI must not
   expect BRAD to browse grants.
3. `x-user-id: USR-LOCAL-ADMIN` resolves `isSystem: true` ONLY during the credential-less
   bootstrap window; after Brad sets the admin password the header silently degrades to
   `USR-BRAD` — tests must then use `x-cl-session` from a real login.
4. The seed's auth ladder (password env → verified bootstrap header → STOP) is in
   `scripts/qms-demo-seed.mjs` (`resolveAdminActor`); reruns are skip-if-exists and never revert
   a fixture that has advanced its lifecycle.
