# Handoff — QMS-1 integration-contract spike COMPLETE (light-qms-records-browser)

Date: 2026-10-02 (~23:5x EDT). Orchestrator tick. Campaign:
light-qms-records-browser. Task: QMS-1 (THE LIST `/home/brad/.hermes/cl/task-list.md`).

## Status: DONE and orchestrator-verified

- Spec: `.hermes/plans/2026-10-02_qms-1-integration-contract-spec.md`
- Worker: cl-senior (local Qwen3.8 on thunderbeast), read-only spike — zero product-code
  edits, zero commits, no server restarts. Run ~57 min.
- Deliverable: DECISIONS DOC `/home/brad/.hermes/specs/inbox/qms-integration-contract.md`
  (~28 KB), answering items (a)–(i) with `path:line` citations + per-item outcome status,
  a QMS-2..QMS-7 file-ownership map, and the baseline suite result.

## Orchestrator verification (run myself, not the worker summary)

- `git log --oneline -1` -> HEAD still `2a1102bc` — no commits made.
- `git diff --stat -- app/src/pages/RecordRegistryPage.tsx` -> `0 insertions, 0 deletions`,
  `mode change 100644 => 100755` only. Brad's dirty tree preserved verbatim (not reverted).
- Read the code the doc cites:
  - `server/src/api/routes.ts:230` = `fastify.put('/records/:id')`; no records PATCH route
    (only `/me` :268, `/config` :846). CONFIRMED: the doc's PUT-not-PATCH correction is real.
  - `RecordHandlers.ts:59-61` `UpdateRecordBodyWithSignatures = UpdateRecordRequest & {
    signatureRefs?: string[] }`, consumed from `request.body.signatureRefs` (:635).
    CONFIRMED body-top-level. The three checks (kind / subject.recordId / signedBy, :644-655)
    are the ONLY validation — no gitCommit staleness comparison. CONFIRMED item (h).
  - `LifecycleEngine.ts:5-11` `TransitionInfo = {event,targetState,label,role,allowed}` —
    no guard metadata. CONFIRMED item (g) has no API surface.
  - `EditorProjectionService.ts:225-230,293-307` — `UNSUPPORTED_WIDGETS` (incl. `markdown`)
    is consumed ONLY by the `form.sections` fallback diagnostics; the `uiSpec.editor` path
    (:397-400, `projectSlotsFromEditorConfig`) passes any widget through. CONFIRMED item (a).
- Baseline suite re-run (server workspace, 14 files): **13 passed / 1 failed, 84 passed (98)**,
  exit 1. Sole failure `test/api/settings.test.ts` (pre-hook ENOENT policy-bundles -> 10s hook
  timeout -> `app.close` on undefined at :111). Pre-existing sibling-work noise, attributed,
  not fixed — matches the worker's report exactly.

## Key outcomes

- (a) resolved — controlled-document body uses the `editor:` slot path with `widget: markdown`
  (renders RichTextField/TipTap, HTML string). Do NOT rely on form.sections fallback.
- (b) resolved — registry save path = `PUT /records/:id` via apiClient.updateRecord; dirty
  diff is exec-bit-only; QMS-6 sole writer; normalize mode in its first commit.
- (d) resolved + CORRECTION — record update verb is **PUT** (not PATCH). signatureRefs ride
  body-top-level next to `payload`.
- (e) resolved — lifecycle identity currency is `USR-*`; `PER-*` only via `user.personRef`.
  Danger: putting `PER-*` in `createdBy`/`<role>Ref.id` would silently defeat
  requires_different_person.
- (f) resolved — ONE term: `controlled-document` (`^DOC-…`); `sop` survives only as a docType
  enum value + training-material flavor. `/lab` `document` category is dead chrome.
- (g') resolved — controlled-document is canonical; QMS-2 widens
  `training-record.trainingMaterialRef.type` to `enum: [training-material, controlled-document]`.
- (h) resolved as documented — stale/reused SIGs are ACCEPTED today (no staleness comparison,
  no SIG consumption marking). QMS-6 R3 probe captures this documented behavior; enforcement
  is a future architect call, not absorbed.
- (i) resolved — `POST /records` with caller-supplied `recordId` in the payload.

## ESCALATION — one requires-rescope, back to the architect

Item **(g)**: the declarative source EXISTS in YAML
(`schema/core/lifecycles/document-controlled-signing.lifecycle.yaml:47-59`,
`signatureAction: approved`; fail-closed engine), but **no API surface exposes it**. The only
lifecycle route `GET /lifecycle/:lifecycleId/transitions?recordId=` returns
`TransitionInfo = {event,targetState,label,role,allowed}` with `presentedSignatures: []`, so a
signature-gated transition renders `allowed:false` with no machine-readable reason — the UI
cannot tell "needs signature (action X)" from "lacks role", and cannot show a button. QMS-6 is
forbidden from TS-inference; there is no lifecycle-spec route.

Minimal proposed fix (architect decision, NOT pre-authorized): extend the preview payload
per-transition with guard metadata derived from the loaded YAML
(e.g. `TransitionInfo.requiresSignatureAction?: string`), affecting
`server/src/lifecycle/LifecycleEngine.ts` + `server/src/api/handlers/LifecycleHandlers.ts`
(+tests), and a client typing bump in QMS-3.

**Per the stop-boundary protocol this is NOT absorbed into QMS-3/QMS-6.** Next action belongs
to the architect: decide ownership of the preview-extension (new task, or amend QMS-3/QMS-6
scope) before QMS-3's typed preview wrapper and QMS-6's transition-flow work proceed.

## State / git

- NOT COMMITTED (shared dirty tree with Brad's live session — consistent with the standing
  no-commit-attended rule). Files added by this task:
  - `.hermes/plans/2026-10-02_qms-1-integration-contract-spec.md`
  - `~/.hermes/specs/inbox/qms-integration-contract.md` (outside the repo)
  - this handoff.
- THE LIST updated: QMS-1 -> done (owner cl-senior, spec path linked).

## Next ready item(s)

- **QMS-2** (controlled-document schema triplet) — deps QMS-1 (a, f, g') all resolved -> READY.
- **QMS-3** (client signature plumbing) — deps QMS-1 (d, g); (d) resolved, (g) requires-rescope,
  so only the typed-preview-wrapper portion is gated. The createSignature/PUT-body work is
  unblocked.
- QMS-5/QMS-6 remain dependency-blocked (need QMS-4 / the (g) rescope resolution).

## Open questions carried (from the doc, not silently absorbed)

1. (g) rescope owner (architect).
2. Schema home for the controlled-document triplet (`schema/lab/` vs `schema/core/`).
3. Terminology drift: campaign docs say "PATCH"; the actual route is `PUT /records/:id`.
4. Stale/reused SIG enforcement — deferred out of this wave unless the architect rules otherwise.
5. Exec-bit normalization of `RecordRegistryPage.tsx` — confirm Brad agrees to normalize in QMS-6.
6. `NavLinks.tsx` vs `GlobalNavbar.tsx` as the single QMS nav entry host for QMS-5 — verify.
