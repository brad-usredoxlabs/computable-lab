# QMS-3 spec — Signature plumbing in the frontend API client

Campaign: light-qms-records-browser. THE LIST `/home/brad/.hermes/cl/task-list.md` item QMS-3.
Deps: QMS-1 (d) RESOLVED; QMS-1A now `done` (branch `wt/qms-1a` commit `dbd390f3` adds the
`requires` guard metadata server-side). Decisions doc:
`/home/brad/.hermes/specs/inbox/qms-integration-contract.md` — read §(d) verbatim.

## Goal

There is no way for any UI to satisfy a `requires_signature` transition today: `client.ts` has NO
`/signatures` method at all (verified: `grep -rn signatures app/src` → zero hits), `updateRecord`
cannot carry `signatureRefs`, and the transitions preview type cannot express why a transition is
disallowed. Add exactly those three things — nothing else.

## Verified existing contracts (cite these; do not re-derive)

- `app/src/shared/api/client.ts:4000` — `async getValidTransitions(recordId, lifecycleId, _actorId?)`,
  returning `{ transitions: Array<{ event, targetState, label, role, allowed }> }` (same inline
  literal in the return annotation AND the `request<...>` generic). 404 → `{ transitions: [] }`.
- `app/src/shared/api/client.ts:2249` — `async updateRecord(recordId, payload)` →
  `request<WriteResponse>('/records/'+id, { method: 'PUT', body: JSON.stringify({ payload }) })`.
  (There is NO records PATCH route; the verb is PUT — `server/src/api/routes.ts:230`.)
- `app/src/shared/api/client.ts:1301` — the module-local `request<T>()` helper (use it; do not add a
  second transport path).
- `app/src/shared/api/errors.ts` — `ApiError { status, code, message, details?, validation?, lint? }`
  built from the response body's `error` / `message`; `NetworkError`; `ApiError.isApiError()`.
- Server side, exactly (all from `server/src/api/handlers/SignatureHandlers.ts` / `RecordHandlers.ts`):
  - `POST /signatures` body: `{ subject: { recordId, lifecycleId?, targetState? }, action, statement?, password }`.
  - 200: `{ success: true, signatureId: 'SIG-<16 hex upper>', subject: { recordId, gitCommit? } }`.
  - Errors as actually returned: 401 `UNAUTHENTICATED`; 400 `BAD_REQUEST`; 404 `SUBJECT_NOT_FOUND`;
    **403 `REAUTH_FAILED`** (uniform message, deliberately never says which check failed);
    422 `{ success:false, error, validation?, lint? }`; 500 `INTERNAL_ERROR`.
  - The signer identity ALWAYS comes from the session user; the request body cannot claim one.
  - `PUT /records/:id` body: `{ payload, expectedSha?, message?, signatureRefs?: string[] }` —
    `signatureRefs` is **body-top-level, next to `payload`, NOT inside it**
    (`RecordHandlers.ts:59-61`, read at `:637-639`). Per-ref failures come back 422
    `INVALID_SIGNATURE_REF` / `SIGNATURE_SUBJECT_MISMATCH` / `SIGNATURE_SIGNER_MISMATCH`;
    guard failure → 422 `LIFECYCLE_TRANSITION_DENIED` with the engine message.

## Contract to implement (in `app/src/shared/api/client.ts`, matching its existing style)

1. **Typed request/response interfaces** (exported, near the other interfaces at the top of the file):
   - `SignatureSubject { recordId: string; lifecycleId?: string; targetState?: string }`
   - `CreateSignatureInput { action: string; subjectRecordId: string; lifecycleId?: string; targetState?: string; statement?: string; password: string }`
   - `SignatureResult { success: true; signatureId: string; subject: { recordId: string; gitCommit?: string } }`
2. **`async createSignature(input: CreateSignatureInput): Promise<SignatureResult>`** —
   `request<SignatureResult>('/signatures', { method: 'POST', body: JSON.stringify({ subject: { recordId: input.subjectRecordId, ...(input.lifecycleId ? {lifecycleId: input.lifecycleId} : {}), ...(input.targetState ? {targetState: input.targetState} : {}) }, action: input.action, ...(input.statement ? {statement: input.statement} : {}), password: input.password }) })`.
   - Do NOT send any signer/user id — the server takes the session user.
   - Do NOT catch/convert the errors: let `ApiError` propagate so the caller can read `status`/`code`.
   - **Password hygiene**: the password goes in this one request body only. Do not log it, do not
     stash it on a module-level variable, do not include it in any thrown error message or in a
     `message`/`details` field.
3. **A documented way to tell a reauthentication failure apart from a plain denial.** Add a small
   exported predicate (e.g. `export function isReauthFailure(error: unknown): boolean`) that is true
   exactly when `ApiError.isApiError(error) && error.status === 403 && error.code === 'REAUTH_FAILED'`.
   Ground it in the real server contract above — do not invent codes. (Callers also need the general
   case: a 422 with a lifecycle denial remains a plain `ApiError`; say so in a comment.)
4. **Widen `updateRecord` without breaking its many existing 2-arg callers** (grep shows callers in
   `RecordRegistryPage.tsx`, `DetailPane.tsx`, `SlideOverEditor.tsx`, `RunBudgetTab.tsx`, …):
   `async updateRecord(recordId, payload, options?: { signatureRefs?: string[]; message?: string; expectedSha?: string })`
   — merge the option keys at **body top level** next to `payload`, omitting absent ones
   (`...(options?.signatureRefs ? { signatureRefs: options.signatureRefs } : {})`, same for the other
   two). Existing calls must compile and produce a byte-identical body when `options` is absent.
5. **Type the preview's guard metadata** (QMS-1A landed server-side): add to BOTH inline transition
   types in `getValidTransitions` an optional
   `requires?: { signatureRequired: boolean; signatureAction?: string; differentPersonThan?: string }`.
   Do not change runtime behaviour there (it stays a pass-through of the server payload). No other
   preview-wrapper change is needed — say so explicitly in the report.

## Tests — create `app/src/shared/api/client.signature.test.ts` (NEW file, this exact name)

Vitest with `fetch` mocked (style: `app/src/shared/taptab/slashMenu/resolvers.test.ts` uses
`vi.stubGlobal`; use whatever that file uses). Assertions:
1. `createSignature` POSTs to `/signatures` with the exact body shape above (subject.recordId,
   action, password) and returns the typed success payload.
2. A 403 `{ error: 'REAUTH_FAILED', message: ... }` response surfaces as an `ApiError` with
   `status === 403` and `code === 'REAUTH_FAILED'`, and `isReauthFailure(err) === true`; a 422
   `LIFECYCLE_TRANSITION_DENIED` and a 401 `UNAUTHENTICATED` make it `false` (distinct reasons).
3. `updateRecord(id, payload, { signatureRefs: ['SIG-1'] })` puts `signatureRefs` at the **body top
   level** (parse `JSON.parse(init.body)` and assert `body.signatureRefs` is present AND
   `body.payload.signatureRefs` is undefined); the two-arg call yields a body with no
   `signatureRefs` key at all.
4. **Password containment**: across every fetch call the suite records, the string password appears
   ONLY in the `/signatures` request body — never in the PUT body, never in the URL, never in any
   error `message`/`details`.
5. `getValidTransitions` passes the `requires` object through unchanged on a mocked response.

## Acceptance criteria

1. `cd app && npx vitest run src/shared/api/client.signature.test.ts` — all green (report exit code
   + counts).
2. `cd app && npx tsc --noEmit` (or `npm run typecheck -w app`) — report the baseline vs after error
   counts and confirm NONE of the errors name `client.ts` (this workspace routinely carries
   pre-existing drift; the signal is that your file is absent from the error list, not exit 0).
3. `grep -rn "signatureRefs" app/src` shows the new channel and no duplicates.

## Boundaries

- EDIT (in YOUR worktree only — the shared main checkout is Brad's live tree):
  `app/src/shared/api/client.ts` and the NEW `app/src/shared/api/client.signature.test.ts`.
- MUST NOT touch: `RecordRegistryPage.tsx`, `DocumentControlBar.tsx`, `errors.ts` (read it, do not
  change it — the 403/REAUTH_FAILED path already produces the right `ApiError`), any `server/` file
  (QMS-1A owns `LifecycleEngine.ts`), any schema YAML, `App.tsx`.
- No UI in this task: it is client plumbing only. A browser gate is NOT required for QMS-3; its gate
  is the contract test + typecheck.
- Do NOT commit to `main`; you may commit on your worktree branch.

## Report back (to the path the dispatcher gives you)

- Absolute paths changed + `git diff --stat` and the new file contents.
- Exact test command + observed output (exit code, counts).
- Typecheck baseline-vs-after counts and the confirmation that `client.ts` appears in neither.
- Confirmation that no second signer-identity field and no second transport helper were introduced.
- Any `requires-rescope` surprise — STOP and report rather than absorbing.
