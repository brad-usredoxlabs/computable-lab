# QMS-3A spec — Client distinguishes signature/revision rejections

Campaign: light-qms-records-browser, LANE 1. Task: **QMS-3A** (THE LIST
`~/.hermes/cl/lanes/1/task-list.md`). Deps: QMS-3 (done).
Contract of record: `~/.hermes/specs/inbox/qms-integration-contract-2026-10-03-delta.md` (D5).

## Goal

Make the client able to tell the three signature/revision rejections apart from a generic 409/422,
so the sign-off UI can tell the user *what to do* (re-sign the current revision / save edits first /
wrong transition) instead of showing "something went wrong".

## Why (verified gap)

Nothing under `app/src` references `STALE_SIGNATURE`, `SIGNED_CONTENT_CHANGED`, or
`SIGNATURE_TARGET_MISMATCH`. Verified 2026-10-03.

## Server truth (do not invent)

All three use the shape `{ error: TOKEN, message }` with **NO `code` field**, so the token arrives
in the `ApiError` **message** and `code` degrades to the HTTP code:

- `server/src/api/handlers/RecordHandlers.ts:747` → `409 STALE_SIGNATURE`
  ("The document changed after signing. Sign its current saved revision.")
- `server/src/api/handlers/RecordHandlers.ts:750` → `409 SIGNED_CONTENT_CHANGED`
  ("Save content edits before signing; a signed transition may only change state.")
- `server/src/api/handlers/RecordHandlers.ts:753` → `422 SIGNATURE_TARGET_MISMATCH`
  ("The signature is for a different transition.")

Copy the existing predicate's dual-branch approach: `app/src/shared/api/client.ts:117-123`
(`isReauthFailure`) already handles exactly this "no `code` field" wire reality.

## Scope / file boundaries

EDIT ONLY:
- `app/src/shared/api/client.ts`
- `app/src/shared/api/client.signatureRejection.test.ts` (new)
- `app/src/shared/api/client.signature.test.ts`

Do NOT touch anything else. `QMS-6` owns the UI; this task owns `client.ts` only.
Do NOT commit in the shared main checkout; work in a worktree off `cl/integration-1`.

## Steps (TDD — RED before GREEN)

### 1. RED — write the test

Create `app/src/shared/api/client.signatureRejection.test.ts`. Before writing the `ApiError(...)`
calls, open `app/src/shared/api/errors.ts` and confirm the constructor signature and that
`ApiError.isApiError` exists; adapt the two constructor arguments to match — **do not guess**.

```ts
import { describe, expect, it } from 'vitest'
import { isSignatureRejection } from './client'
import { ApiError } from './errors'

/** Server wire shape (RecordHandlers.ts:747,750,753): { error: TOKEN, message } — NO `code`. */
const wire = (status: number, token: string, message: string) =>
  new ApiError(`${token}: ${message}`, status, undefined as never)

describe('isSignatureRejection', () => {
  it('matches the no-code wire shape for each token', () => {
    expect(isSignatureRejection(wire(409, 'STALE_SIGNATURE', 'The document changed after signing.'))).toBe(true)
    expect(isSignatureRejection(wire(409, 'SIGNED_CONTENT_CHANGED', 'Save content edits before signing.'))).toBe(true)
    expect(isSignatureRejection(wire(422, 'SIGNATURE_TARGET_MISMATCH', 'The signature is for a different transition.'))).toBe(true)
  })

  it('can filter to one token', () => {
    const e = wire(409, 'STALE_SIGNATURE', 'x')
    expect(isSignatureRejection(e, 'STALE_SIGNATURE')).toBe(true)
    expect(isSignatureRejection(e, 'SIGNED_CONTENT_CHANGED')).toBe(false)
  })

  it('does not swallow unrelated failures', () => {
    expect(isSignatureRejection(new Error('STALE_SIGNATURE'))).toBe(false)
    expect(isSignatureRejection(wire(409, 'CONFLICT', 'nope'))).toBe(false)
  })
})
```

Run it and confirm it FAILS because the export does not exist yet:

```
cd <worktree>/app && npx vitest run src/shared/api/client.signatureRejection.test.ts
```

Expected: an import/export failure (`isSignatureRejection` is not exported). Paste this output into
the report — it is the RED evidence.

### 2. GREEN — implement

In `app/src/shared/api/client.ts`, immediately after `isReauthFailure` (ends line 123), add:

```ts
/** The three server rejections that mean "this signature no longer fits this document". */
export type SignatureRejection = 'STALE_SIGNATURE' | 'SIGNED_CONTENT_CHANGED' | 'SIGNATURE_TARGET_MISMATCH'

/**
 * True for a signature/revision rejection. Server truth (RecordHandlers.ts:747,750,753):
 * the wire shape is `{ error: '<TOKEN>', message }` with NO `code` field, so — exactly as with
 * REAUTH_FAILED — the token lands in ApiError.message and code degrades to HTTP_409 / HTTP_422.
 * Both branches are checked so a future server-side `code` also works.
 */
export function isSignatureRejection(error: unknown, token?: SignatureRejection): boolean {
  if (!ApiError.isApiError(error)) return false
  const all: SignatureRejection[] = ['STALE_SIGNATURE', 'SIGNED_CONTENT_CHANGED', 'SIGNATURE_TARGET_MISMATCH']
  return (token ? [token] : all).some(t => error.code === t || error.message.includes(t))
}
```

Run to green:

```
npx vitest run src/shared/api/client.signatureRejection.test.ts   # expect 3 passed
npx vitest run src/shared/api/client.signature.test.ts            # expect 12 passed (unchanged)
```

### 3. Extend the existing success fixture (the legacy-vs-primary shape)

`app/src/shared/api/client.signature.test.ts:24` builds its success fixture as
`subject: { recordId, gitCommit }`. Per the 2026-10-03 contract the **primary** shape carries
`revisionRef` + `contentHash`; `gitCommit` is only populated when a Git commit was verified.
Add a SECOND case asserting `revisionRef` and `contentHash` survive the round-trip, and keep the
existing `gitCommit` case as the legacy branch. Do not delete the existing assertions.

```
npx vitest run src/shared/api/client.signature.test.ts   # expect 13 passed
```

### 4. Typecheck

```
npm run typecheck -w app 2>&1 | tail -5
```

The app typecheck is EXPECTED to still fail on the pre-existing
`src/shared/hooks/useAiChat.surfaceContext.test.ts` errors — those are unrelated WIP and must be
left alone. Any NEW error naming `client.ts` is yours to fix. State the pre-existing failures
explicitly in the report rather than claiming a clean typecheck.

## Acceptance criteria

1. RED output captured before implementation, GREEN after (paste both).
2. `client.signatureRejection.test.ts` 3 passed; `client.signature.test.ts` 13 passed.
3. No new typecheck errors attributable to `client.ts`.
4. Only the three files listed under Scope were changed.
5. `isReauthFailure` behaviour is unchanged (it is additive).

## Report back

- Absolute paths changed + `git diff --stat`.
- The RED command + its failure output; the GREEN command + counts.
- The typecheck output, with the pre-existing failures named as pre-existing.
- Anything that surprised you (do NOT paper over it).
