# Handoff — QMS-3 client signature plumbing COMPLETE (light-qms-records-browser)

Date: 2026-10-03 (~03:05 EDT). Orchestrator tick. Campaign: light-qms-records-browser.
Task: QMS-3 (THE LIST `/home/brad/.hermes/cl/task-list.md`).

## Status: DONE and orchestrator-verified

- Spec: `.hermes/plans/2026-10-03_qms-3-client-signature-plumbing-spec.md` (written this tick).
- Worker: cl-senior (local Qwen3.8 on thunderbeast), isolated worktree
  `/mnt/vast/home/brad/git/wt/qms-3`, branch `wt/qms-3` off `main @ 2a1102bc`. ~67 min.
- Worker log `/tmp/qms-3-worker.log`; report
  `~/.hermes/cl/worker-reports/2026-10-03_qms-3.20261003-0152.md`.
- **Deliverable (canonical = the worktree commit): `f4abbff6`**
  `feat(app): signature plumbing in the API client (QMS-3)` — 2 files, +413 −2:
  - `app/src/shared/api/client.ts` (+111/−2)
  - NEW `app/src/shared/api/client.signature.test.ts` (302 L, 12 tests)
  Not merged into main (same promotion note as QMS-1A/QMS-2).

## Orchestrator verification (run myself, not the worker summary)

- Read the full `client.ts` diff (`git show f4abbff6 -- app/src/shared/api/client.ts`):
  - exported `SignatureSubject` / `CreateSignatureInput` / `SignatureResult`; `CreateSignatureInput`
    deliberately has NO signer/user field.
  - `apiClient.createSignature()` → `request<SignatureResult>('/signatures', { method:'POST', … })`
    with `{ subject: { recordId, lifecycleId?, targetState? }, action, statement?, password }` —
    exactly the server shape; errors are NOT caught (ApiError propagates).
  - `updateRecord(recordId, payload, options?)` — `signatureRefs`/`message`/`expectedSha` merged at
    the PUT **body top level** with conditional spreads, so two-arg callers produce a byte-identical
    body. No second transport path introduced.
  - `getValidTransitions` — `requires?: { signatureRequired, signatureAction?, differentPersonThan? }`
    added to BOTH inline transition types (return annotation + `request<>` generic); runtime unchanged.
  - `isReauthFailure(error)` — `ApiError.isApiError && status===403 && (code==='REAUTH_FAILED' || message.includes('REAUTH_FAILED'))`.
- Re-ran the new suite myself (`cd app && npx vitest run src/shared/api/client.signature.test.ts`):
  **1 file passed, 12/12 tests, exit 0.**
- **Independently confirmed the worker's S2 finding** (this is the important one):
  `server/src/api/handlers/SignatureHandlers.ts:79-83` returns `403 { error: 'REAUTH_FAILED', message: 'Re-authentication failed' }`
  — **no `code` field**; `app/src/shared/api/errors.ts:70` builds `code: bodyObj?.code || \`HTTP_${status}\``.
  So the spec's literal `error.code === 'REAUTH_FAILED'` test is unmatchable on today's wire and would
  have degraded to `HTTP_403`. The worker's dual-shape predicate is correct, grounded in code, and
  tested both ways. Accepted as-is; the cleaner fix is out of QMS-3's boundaries (see below).
- Mode noise: new test file normalized to `100644`; amended `98e2dea1` → **`f4abbff6`**;
  `git show --summary | grep -c 'mode change'` = 0. Remaining ` M` entries in the worktree are
  mode-only (`git diff --numstat` = `0 0`).

## ⚠ Carried into QMS-6 (do not lose this)

1. **`describeApiError()` in `app/src/shared/api/errors.ts` rewrites EVERY 403** into
   "You don't have edit access here — this project belongs to another user. Switch user…". A
   `REAUTH_FAILED` 403 would therefore be shown to the user as a *permissions* message. QMS-6's
   password modal MUST branch on `isReauthFailure(error)` (or the raw `ApiError`) BEFORE calling
   `describeApiError`, or the required "distinct reason" receipt will be wrong.
2. The clean long-term fix for (1)/(S2) is either a server `code` field on the 403 body or a one-line
   `errors.ts` `body.error` fallback — **an architect call**, deliberately not absorbed by QMS-3.
3. `UpdateRecordRequest` has no credential field: the password can only ever travel in the single
   `/signatures` request. QMS-6's PATCH→PUT carrying `signatureRefs` must never try to attach a password.

## State / git

- Live tree `/mnt/vast/home/brad/git/computable-lab`: untouched (HEAD `2a1102bc`).
- THE LIST updated: QMS-3 -> in-progress -> done.

## Next ready item(s)

None. QMS-4 is now dependency-satisfied but **blocked** on a merge+restart (see QMS-2 handoff) and is
marked `blocked` in THE LIST with that reason; QMS-5/6/7 are transitively blocked behind it.
**The campaign is now merge-gated**: three verified worktree branches are waiting —
`wt/qms-1a` `dbd390f3`, `wt/qms-2` `bb5a2c66`, `wt/qms-3` `f4abbff6`.
