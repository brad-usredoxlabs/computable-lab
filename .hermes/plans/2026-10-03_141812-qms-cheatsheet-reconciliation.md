# Plan — Reconcile the QMS campaign with the 2026-10-03 signature/revision contract

Plan ID: 2026-10-03_141812
Author: orchestrator
Scope: the QMS campaign running on **lane 1** only.
Status: PROPOSED (no implementation yet)

---

## Goal

Bring the QMS campaign's contract-of-record up to date with the signature/revision
behavior documented in `docs/qms-manual-testing-cheatsheet.md` §"Protocol revisions and
signature integrity (2026-10-03)", so QMS-6/QMS-7 are built against what the server
**actually does now** instead of QMS-1's superseded findings.

---

## Current context / assumptions

Read these before touching anything. Line numbers were true on 2026-10-03.

### The campaign's working environment (lane 1)

| thing | value |
|---|---|
| task list | `~/.hermes/cl/lanes/1/task-list.md` |
| integration trunk | branch `cl/integration-1`, worktree `/mnt/vast/home/brad/git/cl-integration-1` |
| lane stack | backend `:3092`, frontend `:5192` (`/home/brad/.hermes/profiles/orchestrator/scripts/cl-lane-stack.sh 1 start\|stop\|restart\|status`) |
| lane data dir | `/home/brad/.computable-lab-lane1` (NOT `~/.computable-lab`) |
| done | QMS-1, QMS-1A, QMS-2, QMS-3, QMS-4, QMS-5 |
| remaining | QMS-6 (QMS sign-off UI), QMS-7 |

**Never** edit `/mnt/vast/home/brad/git/computable-lab` (Brad's live checkout) or its
`:3001`/`:5174` stack.

### What QMS-1 concluded, and why it is now wrong

QMS-1's decisions doc is `~/.hermes/specs/inbox/qms-integration-contract.md`. Two of its
items are affected:

- **Item (h) — SUPERSEDED.** The doc states at line 18 and again at line 146/150 that a
  stale signature is **accepted** ("Stale signature: … it authorizes the transition …
  Not rejected") and defers enforcement out of the wave ("deferred out of this wave …
  documented in (h), not implemented", line 204). **The server now rejects these.**
- **Item (d) — INCOMPLETE.** Its error-contract list must gain the new codes. It is
  otherwise still correct, including the PUT-not-PATCH verb finding.

### What the cheatsheet adds (the new contract)

From `docs/qms-manual-testing-cheatsheet.md` lines 143-178:

1. `meta.commitSha` is a **legacy repository concurrency token**, not reliably a Git
   commit. New code uses **`meta.contentSha`** for optimistic updates.
2. New signatures carry **`subject.revisionRef`** and **`subject.contentHash`**;
   `subject.gitCommit` is populated **only** after comparing committed file bytes with
   the current source.
3. A signature for an earlier document revision → **`STALE_SIGNATURE`**; a transition
   that also changes content → **`SIGNED_CONTENT_CHANGED`**.
4. Approved/effective content is **locked at both the HTTP and storage layers**.
5. `POST /api/records/:id/draft-copy` creates a new draft (`derivedFromRevisionRef`,
   fresh session authorship, **no inherited** reviewer/approver/signature assignments).
6. Immutable `record-revision` (`REV-`) snapshots: source payload, canonical SHA-256,
   source id/schema, actor/time, verified Git commit where available. Read with
   `GET /api/records/:id/revisions` and `GET /api/records/REV-…`. Not creatable through
   generic CRUD; not updatable/deletable, including via the validation-bypass path.
7. Successful lifecycle audit events **include the applied `signatureRefs`**; a minted
   signature **without** a matching transition event must **not** be displayed as an
   applied approval.
8. A **separate signature is needed for the later (effective) transition.**
9. QMS browser/signoff work **should**: display the snapshot id/hash from new signatures,
   retain legacy signatures as historical evidence, and use draft-copy when editing an
   approved document.
10. **Out of scope** (explicitly): automatic supersession of the original, and a
    revision-management UI.

### Verified in code (not assumed)

The features are real and already merged:

- `server/src/revisions/RecordRevisionService.ts`, `RevisionRoutes.test.ts`,
  `SignatureIntegrity.test.ts`
- `server/src/api/routes.ts:224-226` →
  `GET /records/:id/revisions`, `POST /records/:id/draft-copy`, `POST /records/:id/accept-graph`
- `server/src/api/handlers/RecordHandlers.ts:747` → `409 { error: 'STALE_SIGNATURE', … }`
- `server/src/api/handlers/RecordHandlers.ts:750` → `409 { error: 'SIGNED_CONTENT_CHANGED', … }`
- `server/src/api/handlers/RecordHandlers.ts:753` → `422 { error: 'SIGNATURE_TARGET_MISMATCH', … }`

The client is **partly** ready already:

- `app/src/shared/api/client.ts:87-96` — `SignatureResult` already carries
  `revisionRef` / `contentHash` / `gitCommit?`.
- `app/src/shared/api/client.ts:2305` — draft-copy method exists.
- `app/src/shared/api/client.ts:2309` — revisions method exists.
- `app/src/shared/api/client.ts:2334` — `createSignature` exists (QMS-3).
- `app/src/shared/api/client.ts:117-123` — `isReauthFailure`, the **pattern to copy**.

**The gap:** no code under `app/src` mentions `STALE_SIGNATURE`,
`SIGNED_CONTENT_CHANGED`, or `SIGNATURE_TARGET_MISMATCH`. The UI cannot distinguish
"the document changed after signing" from a generic 409, so it cannot tell the user to
re-sign the current revision.

### Two environment facts that will bite

- **The cheatsheet is untracked in main and absent from lane 1's trunk.** It is invisible
  to the campaign until T1 runs. `cl-lane-sync.sh` does not cover `docs/`.
- **The cheatsheet's data-repo paths apply to Brad's stack, not the lanes.** Its §7 audit
  grep points at `/home/brad/.computable-lab/worktrees/main`; lane 1's data lives in
  `/home/brad/.computable-lab-lane1`.

---

## Architecture / proposed approach

Three parts, in order: (1) make the cheatsheet citable by committing it onto lane 1's
trunk; (2) run a read-only **delta re-grounding** that verifies each cheatsheet claim in
code and records the result in a delta decisions doc that explicitly supersedes QMS-1 (h)
and extends (d); (3) apply the deltas — amend the affected tasks in THE LIST, re-scope
QMS-6 to the cheatsheet's display requirements, and add one small test-first client task
so the two new rejection codes are distinguishable in the UI. No server behavior changes.

---

## Step-by-step tasks

Each task is self-contained. Run commands from the stated directory.

### T1 — Put the cheatsheet on the campaign's trunk (2 min)

```bash
cd /mnt/vast/home/brad/git/cl-integration-1
cp /mnt/vast/home/brad/git/computable-lab/docs/qms-manual-testing-cheatsheet.md docs/
git -c core.fileMode=false add docs/qms-manual-testing-cheatsheet.md
git -c core.fileMode=false commit -m "docs(qms): bring the manual-testing cheatsheet onto the campaign trunk (contract of record for the 2026-10-03 signature/revision changes)"
```

Verify — expect one new commit whose subject starts `docs(qms)`:

```bash
git log --oneline -1
```

### T2 — Extract the deltas into a table (5 min)

Read, in this order:

```bash
sed -n '143,178p' /mnt/vast/home/brad/git/cl-integration-1/docs/qms-manual-testing-cheatsheet.md
sed -n '18p;139,155p;200,206p' /home/brad/.hermes/specs/inbox/qms-integration-contract.md
```

Produce a table with exactly these rows (fill the last column per T3):

| # | QMS-1 said | Cheatsheet says | Verdict |
|---|---|---|---|
| D1 | (h) stale SIG **accepted** | `STALE_SIGNATURE` on earlier revision | QMS-1 (h) SUPERSEDED |
| D2 | — | `SIGNED_CONTENT_CHANGED` when content changes with the transition | new |
| D3 | SIG binds `subject.gitCommit` | SIG binds `subject.revisionRef` + `subject.contentHash`; `gitCommit` only when verifiable | QMS-1 (h) SUPERSEDED |
| D4 | `meta.commitSha` is the Git commit token | legacy token; new code uses `meta.contentSha` | QMS-1 (d)/(h) INCOMPLETE |
| D5 | error list for (d) | add `STALE_SIGNATURE`, `SIGNED_CONTENT_CHANGED`, `SIGNATURE_TARGET_MISMATCH` | QMS-1 (d) INCOMPLETE |
| D6 | editing an approved doc unspecified | `POST /api/records/:id/draft-copy`; content locked at HTTP+storage | QMS-6 scope |
| D7 | signatures displayed per record | join SIG ↔ lifecycle transition event; unapplied SIG ≠ approval | QMS-6 scope |
| D8 | one signature per document | a separate signature per signature-gated transition | QMS-6 scope + lifecycle YAML |
| D9 | — | `record-revision` (REV-) immutable snapshots + read endpoints | QMS-6 scope |

### T3 — Verify each delta in the code (5 min)

Run each command; the expected output is the pass condition. If any differs, STOP and
report — do not write the doc from the cheatsheet alone.

```bash
cd /mnt/vast/home/brad/git/cl-integration-1
grep -n "STALE_SIGNATURE\|SIGNED_CONTENT_CHANGED\|SIGNATURE_TARGET_MISMATCH" server/src/api/handlers/RecordHandlers.ts
```
Expect three hits at ~747, ~750, ~753, each a `reply.status(409|422); return { error: …`.

```bash
grep -n "contentSha\|contentHash" server/src/store/RecordStoreImpl.ts | head
grep -n "revisionRef" server/src/revisions/RecordRevisionService.ts | head
```
Expect non-empty output in both (confirms D3/D4).

```bash
grep -n "draft-copy\|accept-graph\|/revisions" server/src/api/routes.ts
```
Expect lines ~224-226 as listed in "Verified in code" above.

### T4 — Write the delta decisions doc (5 min)

Create `~/.hermes/specs/inbox/qms-integration-contract-2026-10-03-delta.md` containing:

1. A header naming it as the delta to `qms-integration-contract.md`, dated 2026-10-03.
2. The T2 table with T3's verified `path:line` evidence in place of the cheatsheet's prose.
3. One section per affected QMS item:
   - **QMS-1 (h)** — restate the new behavior; state plainly that the old (h) conclusion
     and its "deferred out of this wave" note are **void**.
   - **QMS-1 (d)** — the extended error list, with the exact status codes
     (409 / 409 / 422) and the server's literal messages.
4. A "what the UI must now do" list, quoting cheatsheet items 7-9 verbatim.
5. An explicit "not in scope" note for auto-supersession and the revision-management UI.

No claim goes in without a `path:line` you actually opened (T3).

### T5 — Amend THE LIST (5 min)

File: `~/.hermes/cl/lanes/1/task-list.md`

1. In the QMS-1 block, append to `verified by:`-adjacent prose:
   `SUPERSEDED ITEM: (h) stale-signature behavior — see ~/.hermes/specs/inbox/qms-integration-contract-2026-10-03-delta.md (D1/D3/D4).`
2. In the QMS-6 block, add a `contract deltas:` key with the D6/D7/D8/D9 items, then extend
   `description:` with:
   - display the signature's snapshot id/hash; legacy signatures shown as historical only
   - a minted signature with no matching lifecycle transition event is NOT shown as applied
   - editing an approved/effective document goes through `POST /api/records/:id/draft-copy`
   - a separate signature is required for **each** signature-gated transition
   - handle `STALE_SIGNATURE` / `SIGNED_CONTENT_CHANGED` / `SIGNATURE_TARGET_MISMATCH`
3. Add `QMS-3A` (T6) as a new block with `status: todo` and `deps: QMS-3`.

Verify:

```bash
grep -c '^status: todo' ~/.hermes/cl/lanes/1/task-list.md    # expect the old count + 1
grep -n 'SUPERSEDED ITEM' ~/.hermes/cl/lanes/1/task-list.md  # expect exactly 1
```

### T6 — QMS-3A: distinguish the signature rejections (TDD, 15 min)

**Test first.** Create `app/src/shared/api/client.signatureRejection.test.ts`, copying the
fetch-mock idiom from `app/src/shared/api/client.signature.test.ts:12-44`.

Before writing, confirm the error class shape:

```bash
cd /mnt/vast/home/brad/git/cl-integration-1/app
sed -n '1,60p' src/shared/api/errors.ts
```
Expect an exported `ApiError` with `status`, `code`, `message`, and a constructor you can
call directly. If the constructor differs, adapt the two `ApiError(...)` lines below to
match — do not guess.

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

Run it — expect failure (`isSignatureRejection` is not exported yet):

```bash
npx vitest run src/shared/api/client.signatureRejection.test.ts
```
Expected: `Error: [vitest] No "isSignatureRejection" export is defined on …` / import failure.

**Then implement.** In `app/src/shared/api/client.ts`, immediately after
`isReauthFailure` (ends line 123), add:

```ts
/** The three server rejections that mean "this signature no longer fits this document". */
export type SignatureRejection = 'STALE_SIGNATURE' | 'SIGNED_CONTENT_CHANGED' | 'SIGNATURE_TARGET_MISMATCH'

/**
 * True for a signature/revision rejection. Server truth (RecordHandlers.ts:747,750,753):
 * the wire shape is `{ error: '<TOKEN>', message }` with NO `code` field, so — exactly as
 * with REAUTH_FAILED — the token lands in ApiError.message and code degrades to HTTP_409 /
 * HTTP_422. Both branches are checked so a future server-side `code` also works.
 */
export function isSignatureRejection(error: unknown, token?: SignatureRejection): boolean {
  if (!ApiError.isApiError(error)) return false
  const all: SignatureRejection[] = ['STALE_SIGNATURE', 'SIGNED_CONTENT_CHANGED', 'SIGNATURE_TARGET_MISMATCH']
  return (token ? [token] : all).some(t => error.code === t || error.message.includes(t))
}
```

**Then** run to green:

```bash
npx vitest run src/shared/api/client.signatureRejection.test.ts   # expect: 3 passed
npx vitest run src/shared/api/client.signature.test.ts            # expect: still 12 passed
npm run typecheck -w app 2>&1 | tail -3
```
The typecheck is expected to still fail **only** on the pre-existing
`useAiChat.surfaceContext.test.ts` errors (Brad's unrelated WIP). Any new error naming
`client.ts` is yours to fix.

**Commit:**

```bash
git -c core.fileMode=false add app/src/shared/api/client.ts app/src/shared/api/client.signatureRejection.test.ts
git -c core.fileMode=false commit -m "QMS-3A: distinguish signature/revision rejections in the client (STALE_SIGNATURE, SIGNED_CONTENT_CHANGED, SIGNATURE_TARGET_MISMATCH)"
```

### T7 — Note the stale shape in QMS-3's own test (3 min)

`app/src/shared/api/client.signature.test.ts:24` builds its success fixture with
`subject: { recordId, gitCommit }` only. Per the new contract that is the *legacy/verified*
branch; the primary shape now carries `revisionRef` + `contentHash`. Extend the fixture
with a second case asserting `revisionRef`/`contentHash` survive round-trip, keeping the
existing gitCommit case as the legacy branch.

```bash
cd /mnt/vast/home/brad/git/cl-integration-1/app
npx vitest run src/shared/api/client.signature.test.ts   # expect: 13 passed after the addition
```

### T8 — Re-verify the lane's own gates (3 min)

Because T5/T4 touch docs only and T6 touches `app/`, no YAML changed, so no stack restart
is required. Confirm the lane is healthy before handing off:

```bash
/home/brad/.hermes/profiles/orchestrator/scripts/cl-lane-stack.sh 1 status
```
Expected: `lane 1  backend :3092 http=200  frontend :5192 http=200`.

---

## Tests / validation

- T6 and T7 are strict RED→GREEN: the test file is written and **run to failure** before
  the implementation exists, then run to green. Paste both outputs into the handoff.
- Every claim in T4's delta doc carries a `path:line` produced by T3 in this session.
- The existing `client.signature.test.ts` (12 tests) must still pass — the new predicate is
  additive and must not change `isReauthFailure` behavior.
- `npm run typecheck -w app` must not gain new errors attributable to `client.ts`.

---

## Risks, tradeoffs, and open questions

1. **Is QMS-1 (h) void or merely amended?** The cheatsheet is a *testing* document; the
   authority question ("was enforcement authorized for this wave, having been explicitly
   deferred in QMS-1?") is the architect's to answer. The plan assumes the code is the
   truth and (h) is superseded — flag it if you disagree.
2. **D8 changes the lifecycle YAML, not just the UI.** "A separate signature is needed for
   the later effective transition" implies both `in_review→approved` and
   `approved→effective` must declare a `signatureAction`. Verify that in
   `schema/core/lifecycles/document-controlled-signing.lifecycle.yaml` before QMS-6 builds
   the flow; a missing `signatureAction` fails **closed**, so the effective transition may
   be unusable today. This is the single most likely blocker in this plan.
3. **QMS-6 got bigger.** D6-D9 add snapshot display, audit-event joining, draft-copy, content
   locking, and per-transition signing. QMS-6 may now deserve splitting (e.g. 6a = signature
   display + rejection handling, 6b = draft-copy/edit-locked flow). That is an architect
   call; this plan only records the requirements.
4. **Legacy signatures.** "Retain as historical evidence, but signatures without a verifiable
   snapshot cannot authorize new transitions" — any UI that lists signatures must separate
   *historical* from *authorizing*, or it will imply capability that no longer exists.
5. **Lane/prod divergence.** Lane 1's data dir is `~/.computable-lab-lane1`, so the
   cheatsheet's audit greps and data-repo paths do **not** apply to it. Anyone testing on lane
   1 must substitute the lane path, or the results will look empty and wrong.
6. **Committing the cheatsheet.** T1 commits a document authored outside the campaign onto
   the lane trunk. Low risk (docs only), but it does mean the trunk now carries a file main
   does not have; it will travel with the trunk when the trunk is eventually promoted.
7. **Not covered here.** `POST /api/records/:id/accept-graph` and the protocol-revision
   versioning (`0.1.1`/`1.0.0`/`1.1.0`) in the cheatsheet's earlier paragraphs look
   protocol-pipeline work, not QMS sign-off. Confirm they are out of scope before anyone
   folds them into QMS-6.
