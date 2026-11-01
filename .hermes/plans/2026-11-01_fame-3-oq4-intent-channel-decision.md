# FAME-3 OQ-4 decision — chat intent channel for the peak-assignment proposal
Architect ruling, 2026-11-01, lane 1, trunk fa5628e4. Request: 2026-11-01_fame-3-oq4-intent-channel-decision-request.md. All facts below re-verified first-hand read-only in /mnt/vast/home/brad/git/cl-integration-1.

## Verified ground (beyond the request's list)
- The generic accept loop is CREATE-ONLY: FormDraftService.ts:217-231 creates when !prior, 409s a divergent existing record, skips a content-equal prior. No adapter PUTs through the loop. The only legitimate edit door under EITHER option is an onAccept hook (adapters.ts:32) applying the write via its store param — the receiving already-equal skip shape (adapters.ts:150,:158) is the precedent.
- The hook signature today (writes, acceptNow, store) carries NO intent; an edit arms from the intent, and StagingStore.ts:23 refuses staging an edit as a create. BOTH options therefore need one additive signature widening.
- Target plumbing is generic and shipped: DraftInput.target{recordId,contentHash} (FormDraftService.ts:78-83), authorizedRead + contentHash at compile (:132-134), re-verified over `reads` at accept (:179-182). The edit freshness guard exists; no adapter uses it for edits yet.
- The operations gate is DATA: FormDraftService.ts:73/:184 checks intent.operation against config/drafting/adapters.yaml — 'edit-record' is admitted by adding it to that list.
- AgentOrchestrator.ts:3275-3311 relays the recordDraft envelope VERBATIM and the client (useAiChat.ts:709-712 → AiTabPanel.tsx:884-886, adapter constant 'record-drafting') rides the one compile→card→accept flow. Option A leaves orchestrator, frame, and relay byte-identical.

## Ruling: OPT-A — extend compose_record_draft with operation 'edit-record'
Trust-surface risk does NOT materially diverge: the edit arm stages ZERO writes (kernel 'human-reviewed-create' binding never sees it), hooks no-op on the create arm (byte-identical for sequence/workstate/analysis/receiving/chain), and every trust property is structural — schema+lint on the merged payload at compile, reviewHash, target contentHash re-check, human accept only. Option B instead adds a NEW intent term, a new frame, an AgentOrchestrator branch, a useAiChat dispatch, and panel wiring — a bigger diff for identical protection — and names a domain noun ('peak-assignment') in a registry keyed by capabilities (record-drafting/receiving/chain). Spec §10 W6's "one new registry entry" wording anticipated B; OQ-4 exists to settle this and the bounded-reuse constraint wins. Named fold, not a new platform item: the edit arm IS the generic record-edit contract the request floated; its live scope is pinned to ONE declared path by DATA; W6 is its only user.

## W6 contract (coder, one run)
1. config/drafting/adapters.yaml: record-drafting.operations += edit-record.
2. NEW config/drafting/record-edit-guards.yaml: per target-schema url: declared editable path + merge mode + entry defaults; sole entry: gc-method schema url → {path: analysis.compound_assignments, merge: append, defaults: {assignment_state: provisional}}. Interpreter carries ZERO path/kind literals.
3. server/src/drafts/recordDraftCompile.ts: envelope operation enum [compose-record, edit-record]; edit arm {operation, requestId?, term, fields}, additionalProperties:false. stage(): require body.target (refuse named diagnostic if absent); read target; resolve `term` through the existing resolve-spine dep — exact known term yields the CURIE, unknown/ambiguous throws → generic needs-missing-fact canAccept:false arm, never a guessed CURIE; append ONE entry (fields + resolved compound_ref + guard defaults) to the declared path; a content-identical entry already present → named-diagnostic refusal; run REAL validate+lint on the MERGED payload via context.store; card document (resolved term, rt, state, entry-count before/after) in result; ZERO staged writes.
4. server/src/drafts/FormDraftService.ts (:202) + adapters.ts interface: pass draft.input (intent+target) to onAccept. Additive; existing hooks ignore extra args.
5. server/src/drafts/adapters.ts: 'record-drafting' onAccept hook — create arm returns {writes} unchanged; edit arm applies exactly ONE store.update of the merged payload and returns it as writes, so the loop's content-equal skip + ensureOwnerPolicy fire as shipped. No state EVER injected: assignment_state rides only inside the human-approved payload.
6. server/src/ai/submitSuggestionTool.ts: recordDraft arg description + operation enum widened to the two arms (edit arm: term = the compound noun, never a self-invented CURIE).
7. app/src/shared/ai/useWorkstateProposalFlow.ts: optional target arg on proposeWorkstate filling body.target.recordId; AnalysisChatPanel (its W5 wiring) supplies the active-run method revisionRef. Event-editor mount untouched (no target ⇒ create arm).

## Write-wall sub-ruling: NO 'analysis' row
review-write-wall.yaml (actual path: config/drafting/review-write-wall.yaml) guards protocol-review's SAID/provenance/retarget trust problem; its verb lists (change/edit/update…) would over-block the analysis surface, where assignment edits ARE the legitimate work. Analysis proposal safety is structural (compile wall, DATA path guard, never-guess, contentHash). If an analysis leak class ever shows, add a scoped askWalls entry then — DATA, later, not now.

## Receipts the coder must carry (W8)
unknown-noun blocked card with zero writes; accepted PUT body shows exactly ONE new compound_assignments entry; duplicate re-draft refused by name; pre-accept target GET byte-identical + zero audit delta; reject = zero store calls.

DECISION: OPT-A
