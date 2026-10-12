# Handoff — QMS-3A: client distinguishes signature/revision rejections (delta D5)

Date: 2026-10-03. Lane 1. Campaign: light-qms-records-browser.

## Status: DONE, orchestrator-verified, merged

- Task: QMS-3A (`~/.hermes/cl/lanes/1/task-list.md`)
- Spec: `.hermes/plans/2026-10-03_qms-3a-signature-rejection-predicates-spec.md`
- Contract of record: `~/.hermes/specs/inbox/qms-integration-contract-2026-10-03-delta.md` (D5)
- Worker: cl-junior, worktree `wt/qms-3a-lane1` (branch off `cl/integration-1`)
- Worker commit: `8d45af76` — merged into `cl/integration-1` as **`70dfa372`**
- 3 files, +81/-1: `app/src/shared/api/client.ts`,
  `app/src/shared/api/client.signatureRejection.test.ts` (new),
  `app/src/shared/api/client.signature.test.ts`

## What was added

`isSignatureRejection(error, token?)` in `app/src/shared/api/client.ts`, plus the
`SignatureRejection` union type, following the `isReauthFailure` dual-branch pattern (matches
`error.code === token` OR `error.message.includes(token)`, because the server's actual wire shape
is `{ error: TOKEN, message }` with no `code` field: `RecordHandlers.ts:747/750/753`).

Tokens covered: `STALE_SIGNATURE` (409), `SIGNED_CONTENT_CHANGED` (409),
`SIGNATURE_TARGET_MISMATCH` (422). The existing success fixture gained the
`revisionRef`/`contentHash` (primary) shape alongside the legacy `gitCommit` case.

## Verification (done by the orchestrator, not taken from the worker's report)

- RED first: `TypeError: isSignatureRejection is not a function` captured before implementation.
- Ran the suites myself in the worktree:
  `npx vitest run src/shared/api/client.signatureRejection.test.ts src/shared/api/client.signature.test.ts`
  → **2 files, 16 tests passed** (3 rejection + 13 signature).
- Diff opened: implementation matches the spec; additive only — `isReauthFailure` unchanged.

## Notes

- API divergence found by the worker: `ApiError`'s real constructor is
  `new ApiError({ status, code, message })`, not the positional form sketched in the spec.
  The worker confirmed against `app/src/shared/api/errors.ts` and adapted — flagging this because
  the same correction applies to any future spec that sketches `ApiError` construction.
- `npm run typecheck -w app` still fails on the pre-existing
  `src/shared/hooks/useAiChat.surfaceContext.test.ts` errors (unrelated WIP, untouched).

## Blocking issue for the NEXT item — needs Brad

QMS-6 remains BLOCKED, and NOT for a reason QMS-6 can fix. See
`.hermes/plans/handoffs/2026-10-03_qms-6-blocked-lane-env-contract-drift.md` from the earlier tick.
Two causes, one now fixed:

1. FIXED (2026-10-03 ~14:5x): the lane data dirs were empty — no users, no credentials, no DEMO
   fixtures — so identity and the actor matrix could not resolve. Each lane's data dir is now a
   faithful copy of `/home/brad/.computable-lab` (its `.git` is a STANDALONE repo — no
   `commondir`/`gitdir` — so a plain copy is self-contained and needs no path rewriting).
   Verified on lane 1: `/api/me` with `x-user-id: USR-BRAD` → 200; `DOC-DEMO-SOP`,
   `PER-DEMO-AUTHOR`, `PER-DEMO-REVIEWER` all → 200; grants present under
   `records/role-grant/GRANT-DEMO-*`.

2. STILL BLOCKING: the lane trunk has no revision/signature-integrity code. In the live checkout
   `server/src/revisions/` is UNTRACKED and `server/src/api/handlers/RecordHandlers.ts` is MODIFIED
   (186 added lines, only ~35 of them signature/revision related). So delta items 6a (snapshot
   id/hash display) and 6c (draft-copy) cannot be built or browser-verified in-lane, and
   `cl-lane-sync.sh` cannot help (it only links untracked files; `RecordHandlers.ts` is a tracked
   file with mixed unrelated WIP).

   Resolution requires a Brad decision: (a) commit that WIP so the lane can merge it, or
   (b) vendor the live-checkout versions of the affected files into the lane trunk, accepting that
   unrelated WIP rides along.

## Next ready item

- **QMS-6** — dependency-ready (QMS-2/3/3A/4/5/1A all done) but blocked on item 2 above.
- **QMS-7** — blocked behind QMS-6.
