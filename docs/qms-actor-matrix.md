# QMS Actor Matrix — QMS-4 (campaign light-qms-records-browser)

Generated 2026-10-03T10:10:17 (spec tick) by the QMS-4 seed work against live `main @ dbb5ba3e`,
lab policy `POL-SANDBOX`. QMS-6 and QMS-7 consume this table verbatim. Canonical path (promoted by
the orchestrator after verification): `docs/qms-actor-matrix.md`.

> **OPS-1 correction (2026-10-04).** The reviewer/approver actor is `USR-QMS-ADMIN`, an ordinary
> login-capable user (username `qms-admin`) — NOT `USR-LOCAL-ADMIN`. `USR-LOCAL-ADMIN` is a
> bootstrap/fallback identity that can never act as a spoofable actor or hold a login (see
> "Bootstrap identity" below). Original rows presenting it as the reviewer were wrong and are
> replaced here.

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
| `USR-QMS-ADMIN` (username `qms-admin`) | `PER-DEMO-REVIEWER` | `GRANT-DEMO-REVIEWER`: `reviewer`, `approver` @ `document-controlled-signing` | **set** — an ordinary user created via `POST /users` (which persists the verifier to `dataDir/auth`); login confirmed live on the lane (`:5192`). Resolves directly from `x-user-id: USR-QMS-ADMIN` with `isSystem:false` (`LocalIdentityService.ts:114-122`) | Holds both gated roles so ONE identity can complete the lap. It can authenticate and mint signatures, **but** signature-gated transitions still demand the acting session user's own password (`POST /api/signatures` re-auth) — the holder of that password must run the signed rows (QMS-7 owns the runbook). Must NOT be `USR-BRAD`: `in_review → approved` carries `requires_different_person(than: author)` (`LifecycleEngine.ts:115-118`) and `DOC-DEMO-SOP`'s author is `USR-BRAD`. |

**Bootstrap identity — the real position of `USR-LOCAL-ADMIN`.** It is NOT a usable actor and
there is no API-reachable "bootstrap window" to open:
- `x-user-id: USR-LOCAL-ADMIN` degrades to the first active non-admin user (`USR-BRAD`) —
  `LocalIdentityService.ts:43-46` (`ensureLocalAdminUser`), asserted by
  `LocalAuthorization.test.ts:157-166`.
- `POST /auth/set-password` is self-service — it writes the verifier for the **resolved** user
  (`AuthHandlers.ts:100-105`), so an admin-header attempt silently sets `USR-BRAD`'s password
  instead; when it does resolve as the true admin, `isSystem === true` and the handler refuses
  with 403 (`AuthHandlers.ts:101`).
- `POST /auth/login` rejects any user with no verifier (`AuthHandlers.ts:61-66`).
  So `USR-LOCAL-ADMIN` cannot set its own password and can never log in. It remains only the
  bootstrap/system actor path the seed uses to MINT role-grants (`resolveAdminActor`,
  grantedBy stamping) — never a fixture actor.

Fixture doc under test: `DOC-DEMO-SOP` (state `draft`, lifecycle `document-controlled-signing`,
author `USR-BRAD`).

## Transition expectations

Verbatim failure shapes (422 `LIFECYCLE_TRANSITION_DENIED`, `lifecycleMiddleware.ts:63,67`):
- **(M1)** `Transition from '<from>' to '<to>' is not allowed by the document-controlled-signing lifecycle.` — no transition exists for that state pair.
- **(M2)** `You do not have the required role for this transition.` — transition exists but the deny-mode role check failed, OR a guard failed WITHOUT a declared YAML `denialMessage` (e.g. missing/stale `requires_signature`). QMS-6F: guards MAY declare a per-guard `denialMessage` in the lifecycle YAML; when such a guard is the FIRST failing guard, the denial is **(M3)** instead.
- **(M3)** (QMS-6F, declarative guard denial) the failing guard's YAML `denialMessage` verbatim — currently only `requires_different_person` declares one, identical wording on all three lifecycles that carry it: `This transition requires a different person than the author. As the author you may not perform it — the document's state did not change.` The engine reports which guard failed first (`TransitionInfo.failedGuard`); the middleware passes its message through untouched. The 422 and the `LIFECYCLE_TRANSITION_DENIED` code are the same for M2 and M3.

| Transition (event) | Role required | Guard(s) | `USR-BRAD` @ POL-SANDBOX | `USR-QMS-ADMIN` @ POL-SANDBOX | `USR-BRAD` @ POL-REGULATED | `USR-QMS-ADMIN` @ POL-REGULATED | Exact expected failure reason for the under-granted actor |
|---|---|---|---|---|---|---|---|
| `draft → in_review` (SUBMIT_FOR_REVIEW) | author | none | **allowed** (role check skipped) | **allowed** (role check skipped) | **allowed** — `author` grant + assigned author | **denied (M2)** — holds no `author` grant and is not the assigned author; role denial: actor lacks role `author` | M2, reason: no `author` grant, `authorRef.id`/`createdBy` ≠ `USR-QMS-ADMIN` |
| `in_review → approved` (APPROVE) | reviewer | `requires_different_person(than: author)` + `requires_signature(signatureAction: approved)` | **denied (M2)** — same-person guard: `roleAssignments.author = USR-BRAD = actor` (guard binds even under sandbox; BRAD also lacks a reviewer grant) | **allowed** iff a SIG with action `approved`, subject `DOC-DEMO-SOP`, `signedBy USR-QMS-ADMIN` is presented in the PUT body `signatureRefs` — mintable (credential set) but the operator needs `qms-admin`'s password for the `POST /signatures` re-auth | **denied (M2)** — same reason as sandbox row (guard binds under deny too; no reviewer grant either) | **allowed** with same SIG presentation (`reviewer` grant + different person + signature) | BRAD denial: M3 (`requires_different_person` fails FIRST in YAML order — `roleAssignments.author === currentActorId`, `LifecycleEngine.ts` different-person case; the guard's YAML `denialMessage` is surfaced verbatim, QMS-6F); a non-author missing the SIG on the same row fails on `requires_signature` instead → M2 (that guard declares no `denialMessage`) |
| `in_review → draft` (RETURN_TO_DRAFT) | reviewer | none | **allowed** (role check skipped) | **allowed** (role check skipped) | **denied (M2)** — no `reviewer` grant, not assigned via `reviewerRef` | **allowed** (`reviewer` grant) | M2, reason: actor holds neither `reviewer` grant nor the `reviewerRef` assignment |
| `approved → effective` (MAKE_EFFECTIVE) | approver | `requires_signature(signatureAction: approved)` | **allowed** under sandbox iff SIG presented (role check skipped — BRAD needs only the signature; BRAD can mint it: credential set) | **allowed** iff SIG presented (`signedBy USR-QMS-ADMIN` required by the guard; mintable — credential set, operator needs the password) | **denied (M2)** — no `approver` grant, not the `approverRef` assignee; a SIG would not rescue it (role check is separate from the guard) | **allowed** with SIG presented (`approver` grant + signature) | M2, reason: actor lacks role `approver` (deny-mode role check, independent of the signature guard). Note a SIG minted by BRAD cannot be presented by BRAD-as-non-signer for QMS-ADMIN's PUT (`SIGNATURE_SIGNER_MISMATCH`, QMS-1 (d)) |
| `effective → superseded` (SUPERSEDE) | author | none | **allowed** (grant + assignment) | **allowed** under sandbox (role check skipped) | **allowed** (`author` grant) | **denied (M2)** — no `author` grant, not the author assignee | M2, reason: actor lacks role `author` |
| `draft\|in_review\|approved\|effective → archived` (ARCHIVE) | approver | none | **allowed** @ sandbox | **allowed** @ sandbox | **denied (M2)** — no `approver` grant | **allowed** (`approver` grant) | M2, reason: actor lacks role `approver` |

Note on assignments weakening denials: if QMS-6/7 ever PUTs `reviewerRef`/`approverRef` onto
`DOC-DEMO-SOP`, the assigned USR-* satisfies the deny-mode role check via `roleAssignments`
(already-assigned-person path, `LifecycleEngine.ts:94-96`). Do NOT assign `USR-BRAD` to
`reviewerRef`/`approverRef` — it would erase the QMS-7 denial rows. Leave `reviewerRef`/
`approverRef` unset (or assigned to `USR-QMS-ADMIN`) to preserve the matrix.

## Which rows each task exercises

- **QMS-6 (sandbox, happy lap + same-person denial):**
  - happy path: `draft→in_review` (BRAD), `in_review→approved` (QMS-ADMIN, SIG presented —
    requires the operator to hold `qms-admin`'s password for the signature re-auth),
    `approved→effective` (QMS-ADMIN, SIG), i.e. rows 1, 2, 4 under POL-SANDBOX.
  - same-person denial: `in_review→approved` as BRAD → 422 with the guard's M3 different-person
    message (QMS-6F; `requires_different_person` binds under sandbox because
    `createdBy`/`authorRef` = `USR-BRAD`).
  - stale/reused-SIG probe rows per QMS-1 (h): documented behavior is SIG *accepted*
    (staleness not compared); receipt captures what the server actually does.
- **QMS-7 (regulated lap):** flip lab policy to `POL-REGULATED` and exercise:
  - authorized success: rows where `USR-QMS-ADMIN` @ POL-REGULATED is **allowed** (2, 3, 4, 6).
  - role denial: rows where `USR-BRAD` @ POL-REGULATED is **denied (M2)** (3, 4, 6 — row 2 denies
    with the M3 different-person message, QMS-6F) —
    BRAD is the deliberately under-granted actor (`GRANT-DEMO-AUTHOR` only).
  - QMS-7 also owns the signed-lap runbook text; the acting user's credential must exist
    before any signature-gated regulated row can pass (it does for `USR-QMS-ADMIN` — see
    fixture table; `POST /signatures` re-auth still needs the operator to supply the password).

## Verified-live caveats (read back at seed time, 2026-10-03; corrected 2026-10-04)

1. `grantedBy = USR-LOCAL-ADMIN` is stamped on BOTH grants when minted through the bootstrap
   actor path (server-side `stampActorAs`, `schema/identity/role-grant.lint.yaml` — the lint
   file is now tracked (`a855de95`); the gate behaves live: `GRANT_FORBIDDEN` for `USR-BRAD`).
   The stamp records the *minting* bootstrap identity, not the grantee: `GRANT-DEMO-REVIEWER`'s
   `userId` is `USR-QMS-ADMIN`.
2. Role-grant records are privileged reads: `GET /api/records/GRANT-DEMO-*` returns **404 to
   `USR-BRAD`**; expect reads only from an admin/system actor. QMS-5/6 UI must not
   expect BRAD to browse grants.
3. `x-user-id: USR-LOCAL-ADMIN` resolves `isSystem: true` ONLY during the credential-less
   bootstrap window; the window cannot be opened (let alone used) through `POST /auth/set-password`
   — that endpoint is self-service and refuses the system identity (403, `AuthHandlers.ts:101`),
   and the header otherwise degrades to `USR-BRAD` (`LocalIdentityService.ts:43-46`).
   `USR-QMS-ADMIN`, being an ordinary user, resolves directly with `isSystem:false`
   (`LocalIdentityService.ts:114-122`); tests acting AS it may use the dev header, but any
   signature-gated row needs a real session (`x-cl-session`) plus the password re-auth.
4. The seed's auth ladder (password env → verified bootstrap header → STOP) is in
   `scripts/qms-demo-seed.mjs` (`resolveAdminActor`); the STOP text names the working paths
   (ordinary-user self-service password, or `POST /users`, which persists the verifier to
   `dataDir/auth`). Reruns are skip-if-exists and never revert a fixture that has advanced its
   lifecycle.
