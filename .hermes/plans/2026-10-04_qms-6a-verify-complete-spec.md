# SPEC — QMS-6A · Verify-and-complete the merged revision/signature UI against the landed integrity contract (delta D6-D9)

Lane 1 · trunk `cl/integration-1` @ `4e41abe7` · worktree `/mnt/vast/home/brad/git/cl-integration-1`
Tick `20261004T012155` · spec authored by the orchestrator.
Deps: **OPS-1 (runtime checks only)** — the audit + code + red-first-test work starts NOW in parallel
(disjoint files), exactly the non-blocking shape the architect used for EDITOR-1, which shipped while
OPS-1 was still blocked. Read-only API probes on `:3092` are permitted; any probe that needs a WRITE
or a credential is BLOCKED (see "API probes") and is carried to QMS-6B.
**Browser acceptance is deferred to QMS-6B by the architect's re-scope** (QMS-6B surface 11:
"Minimal revision readout present and honest"). This task's own gates are: the audit, red-first unit
tests, no regressions, no new type errors, a clean diff.

## Why
W2-D5 — Brad's instruction to incorporate the protocol-versioning / revision-signature-integrity
contract (commit `81454a4e`; delta doc `~/.hermes/specs/inbox/qms-integration-contract-2026-10-03-delta.md`
D6-D9). The server contract is MERGED and enforced. QMS-6 provisionally merged the UI half
(`dd4f0b4f` + round-2 `52ec909b`). This task is the **audit that stops "we think it works" from
becoming "done"**: read the merged code against the word of record, classify each clause, and add
red-first tests + minimal code ONLY for genuine gaps. **Most of it exists — verify, do not rebuild.**

## Your worktree
`/mnt/vast/home/brad/git/wt/qms-6a-lane1-20261004T012155` (branch `wt/qms-6a-lane1-20261004T012155`,
based on `cl/integration-1` @ `4e41abe7`). `node_modules` is symlinked to the main checkout. All your
work happens there. Runtime note: this checkout is on NFS; use `git -c core.fileMode=false` for git
inspection so mode-bit noise does not masquerade as a diff.

## VERIFIED ORIENTATION — orchestrator's own reads of `cl/integration-1` @ `4e41abe7`
(4 `cl-scout` jobs ran concurrently as **screening only**; the findings below are the orchestrator's
own file reads, re-open them and re-derive the classification yourself — see Deliverable 1.)
This is orientation, NOT the answer. If your reads disagree with a line below, trust YOUR reads and
say so in the audit.

### (a) `app/src/shared/api/client.ts` — SATISFIED (client surface complete)
- `SignatureSubject` (:65-69) and `CreateSignatureInput` (:77-84) carry `lifecycleId?` and
  `targetState?`; `createSignature` (:2351-2365) POSTs `/signatures` and serializes
  `subject.targetState` (:2358).
- `updateRecord` (:2373-2387) PUTs `/records/:id` with **body-top-level** `signatureRefs` (:2382).
- `SignatureRejection` type + `isSignatureRejection` (:128-140) match `STALE_SIGNATURE` /
  `SIGNED_CONTENT_CHANGED` / `SIGNATURE_TARGET_MISMATCH` on `error.code` **OR** `error.message`
  (:139) — the server wire shape is `{error, message}` with NO `code`, so the message branch is the
  live one.
- `createDraftCopy` (:2321-2323) → POST `/records/:id/draft-copy`; `listRecordRevisions` (:2325-2326)
  → GET `/records/:id/revisions`.
- Concurrency token: `meta.contentSha` preferred, legacy `meta.commitSha` fallback (:2427).

### (b) `app/src/components/registry/DocumentControlBar.tsx` — SATISFIED
- **One** modal per gated transition: single `signTarget: Transition | null` state (:70);
  `handleTransition` sets it and returns early (:126-136); modal `open={signTarget !== null}` (:190).
- Dirty editor blocks every transition: `disabled={dirty || advancing !== null}` (:164) + visible
  hint `data-testid="save-first-hint"` "Save changes first — transitions apply to the saved revision
  only." (:175-179).
- Distinct per-token instructions: :108-116 → `signatureRejectionInstruction(token)`; the three
  strings live in `SignaturePasswordModal.tsx:39-48` (STALE → "Re-sign its current saved revision.";
  SCC → "Save content edits first …"; TARGET → "belongs to a different transition"). Fallback :115.
  **No "wrong password" path** (:17-18 comment).
- sign-ok / PUT-fail split: :105-121 surfaces the server's ACTUAL rejection and `refetch()` (:120).
- Gated-render predicate :160 `(t.allowed || t.requires?.signatureRequired === true)`.
- Orphan rendering is delegated to `SignOffReceipt` (:187) — not this file.

### (c) `app/src/pages/RecordRegistryPage.tsx` — SATISFIED
- `contentLocked` = edit mode AND payload state `approved|effective` (:185-188).
- Save is REPLACED by a "Create draft revision" button when locked (:319-337).
- `handleCreateDraftRevision` (:190-212) calls `apiClient.createDraftCopy(selectedRecord.recordId, {})`
  (:195) and opens the returned draft (:197-205); comment :182-184.
- `derivedFromRevisionRef` / fresh authorship / no inherited reviewer-approver-signatureRefs are set
  **server-side by the draft-copy endpoint** — NOT the client's job to set. The client must only
  (i) treat the result as a NEW record (it does) and (ii) message it honestly. JUDGE whether the
  current affordance/messaging is adequate for "the copy opens with clear messaging" and, if the
  ONLY missing thing is a short clarifying line, add it (red-first). If it needs a design decision,
  STOP and report.

### (d) `app/src/components/registry/SignOffReceipt.tsx` — SATISFIED
- APPLIED vs ORPHAN join: builds `appliedRefs` from `lifecycle_transition` audit events
  (:54-64), classifies each SIG `status: applied | orphan` (:79), renders
  "Orphan (minted, not an approval)" for orphans (:111-113) — an unapplied SIG is never shown applied.
- New SIGs show snapshot `revisionId` + truncated `contentHash` (:118-122).
- Legacy SIGs (no verifiable snapshot) render "historical evidence only — does not authorize"
  (:123-125).

### (e) Minimal revision visibility — **GAP (the only known missing clause)**
`apiClient.listRecordRevisions` (:2325) exists but has **ZERO consumers anywhere under `app/src`**
(verified by search). Nothing renders a revision count/latest revision near the receipt. This is the
one clause to IMPLEMENT.

## Files you own (edit ONLY these)
- `app/src/components/registry/SignOffReceipt.tsx` (the readout goes here — it already owns the
  receipt surface and receives `recordId` + `refreshKey`)
- `app/src/components/registry/SignOffReceipt.test.tsx` (NEW — this component has no test today)
- `app/src/components/registry/DocumentControlBar.tsx` + `.test.tsx` (ONLY if the (c) messaging fix
  lands here; otherwise leave untouched)
- `app/src/pages/RecordRegistryPage.tsx` + `.test.tsx` (ONLY if the (c) messaging fix lands here)
- `app/src/shared/api/client.ts` — audit only; touch ONLY if a genuine missing method blocks (e).
- Audit + report: `.hermes/plans/worker-reports/qms-6a-lane1-20261004T012155.md` (your unique path)
**NO `server/` edits. NO `schema/` edits. NO lifecycle/lint edits. NO `app/src/editor/**`. NO `docs/`
(QMS-7 owns it). NO revision-management UI, NO supersession, NO protocol-version UI, NO accept-graph
UI (all explicitly descoped).**

## Deliverable 1 — the AUDIT (primary artifact; do this FIRST, before any code)
A clause-by-clause table in your report file. For **every** bullet in (a)-(e) above (and every
sub-bullet in the task description's (a)-(e)), classify **ALREADY-SATISFIED / GAP / BLOCKED** and
give the `path:line` you opened to decide it. Re-derive each classification from the source yourself
— do NOT copy this spec's orientation table into your report as if it were your own finding. If a row
of mine is wrong, correct it and say so.

## Deliverable 2 — red-first tests + minimal code for GAPS only
- **(e) the revision readout** — IMPLEMENT. Requirements:
  - Render a compact, honest readout near the receipt via the EXISTING `apiClient.listRecordRevisions`
    method (do not add a client method unless one is genuinely missing).
  - Shape: `N revisions · newest REV-x` (the revision record ids are shaped `REV-<32 uppercase hex>`,
    `server/src/revisions/RecordRevisionService.ts:65`; `listRecordRevisions` returns
    `{ records: RecordEnvelope[] }`, each `payload.kind === 'record-revision'` with
    `payload.sourceRecordId`, `payload.contentHash`, `payload.createdAt`).
  - The 0-revision case must be HONEST (hide it, or say "no revisions") — never "0 revisions · newest —".
  - It must refresh with the receipt (`refreshKey` already bumps on transition).
  - RED FIRST: write `SignOffReceipt.test.tsx` asserting the readout BEFORE implementing; capture the
    failing run; then implement; then show it green.
- **Any OTHER gap you find**: implement the minimal red-first fix ONLY if it is a clear contract
  violation with an unambiguous fix inside your owned files and needs NO design decision. Otherwise
  STOP and report it as `requires-rescope` — the architect owns the call. Do not absorb scope.

## API probes (best-effort evidence — record exactly what ran)
- READ-only, permitted: `curl -sS http://localhost:3092/api/records/<id>/revisions` for a real lane
  record (e.g. `DOC-DEMO-SOP`) — paste the raw JSON. Confirm the `{records:[...]}` shape your readout
  consumes.
- The locked-PUT / draft-copy / stale-SIG probes in the task's "verified by" need a LOCKED record and
  a live credential. **The lane currently cannot mint signatures (OPS-1 is blocked on the
  USR-LOCAL-ADMIN bootstrap).** Do NOT attempt writes against `:3092`, do NOT forge users, do NOT fall
  back to Brad's live dir. Record those probes as **BLOCKED (carried to QMS-6B)** with the exact
  reason, and instead cite the merged SERVER tests that already prove the contract
  (`server/src/revisions/SignatureIntegrity.test.ts`, `RevisionRoutes.test.ts`) — read them, do not
  re-run-and-claim.

## Acceptance (the orchestrator verifies independently — your summary is not evidence)
1. The audit table exists, covers every clause, and every classification cites a `path:line` you
   opened (spot-checked by the orchestrator against the source).
2. For the (e) gap: a red-first test that FAILED before the fix (RED output pasted) and PASSES after.
3. The readout renders `N revisions · newest REV-x` from `listRecordRevisions` and is honest at 0.
4. `cd app && npx vitest run` green for the touched suites, with NO regressions in:
   `src/components/registry/DocumentControlBar.test.tsx`, `src/components/registry/SignOffReceipt.test.tsx`,
   `src/pages/RecordRegistryPage.test.tsx`.
5. **No new type errors**: `cd app && npx tsc --noEmit` — this trunk has pre-existing TS debt; the bar
   is "the same error set as the pristine trunk, byte-identical" (record the baseline count and diff).
6. Real `git -c core.fileMode=false diff` shows ONLY your owned files.
7. The audit honestly states the BLOCKED credential probes and does not claim them.

## Verification mechanics
- Run tests from the worktree: `cd /mnt/vast/home/brad/git/wt/qms-6a-lane1-20261004T012155/app && npx vitest run <path>`.
- To capture the RED run: write the new test, run it (expect fail), paste the output, THEN implement.
- **Do NOT restart the shared lane stack** (`:3092`/`:5192`) — it is orchestrator-owned and must stay
  up. If you need a live backend, start your OWN from your worktree on a scratch port
  (`APP_BASE_PATH=.. PORT=3098 CL_DATA_DIR=<a temp dir> npx tsx src/server.ts`, backgrounded, then
  kill that EXACT pid) — never a pattern, never `:3001`/`:5174`/`:3092`/`:5192`.
- Do not touch `/mnt/vast/home/brad/git/computable-lab` (Brad's live tree) for anything.

## Stop boundaries (return to the architect — do NOT absorb)
- A genuine gap in (a)-(d) that needs a design decision (new response shape, new policy in TS, a
  widget/UX decision beyond a one-line clarification).
- A server behavior that contradicts the delta doc.
- Anything that tempts a revision-management UI, automatic supersession, protocol-version-allocation
  UI, or accept-graph / STALE_PROTOCOL graph UI — all explicitly descoped.
- A credential/fixture need that OPS-1 has not resolved: report it BLOCKED; never hand-forge users or
  write into Brad's live data.