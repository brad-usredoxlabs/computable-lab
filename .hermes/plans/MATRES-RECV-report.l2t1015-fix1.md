# MATRES-RECV — FIX-RUN 1 coder report (l2t1015-fix1)

Branch: cl/lane2-matres-recv-l2t0115 (worktree /mnt/vast/home/brad/git/wt/matres-recv-lane2, base tip ddd730c0)
Inputs: adversarial report /home/brad/.hermes/cl/lanes/2/reviews/MATRES-RECV-advc1-l2t1015.md (VERDICT: fix, 2 MAJOR + 4 MINOR, D1..D6); architect ruling /home/brad/.hermes/cl/lanes/2/decisions/MATRESRECV-accept-rail-decision-l2t1015.md (BINDING: option (a), adapter-level accept-time composition).

## 0. Verdict

All six defects fixed per the ruling's EXACT repair scope. RECV suites 50/50 green; ATTEST suites 17/17 green; drafts suites 111/111 green (11 files); typecheck EXIT 0; full-suite fail-file set == trunk baseline (88 = 88, comm empty both directions, run 3). No scope guard touched: config/drafting/adapters.yaml, draftRoutes.ts, StagingStore, server/src/attestation/**, server/src/fulfilment/**, other schema/lint YAML — all byte-untouched (the ONE sanctioned schema edit is the additive D3 $defs entry, §D3 below).

## 1. What the ruling changed (option (a), ratified posture)

- ABSENT-BEFORE-ACCEPT is policy: the draft envelope carries NO attestedAt; the accepted receipt's attestedAt equals the injected accept clock and differs from occurredAt.
- FormDraftService gains an optional per-adapter `onAccept` hook; the receiving adapter implements it.
- The dead `MaterialReceivingAcceptService` class is DELETED (git rm); its helpers relocated to `server/src/receiving/receivingIdentity.ts`.
- The compile-time attestedAt stamp (old MaterialReceivingDraft.ts:337) is DELETED; the compile's clock dep is dropped (ReceivingCompileDeps has no clock member anymore — grep `clock` in MaterialReceivingDraft.ts: 3 hits, all header comments).

## 2. Repair-scope execution (items A–E)

### A. server/src/drafts/FormDraftService.ts + adapters.ts interface
- `adapters.ts`: `DraftAdapter.onAccept?(writes, acceptNow, store): Promise<AcceptOutcome>` where `AcceptOutcome = { writes; volatileFields?: Record<string,string[]> }` (adapters.ts:14-30). Optional; same seam class as stage/project/checkRequest.
- `FormDraftService` ctor: `constructor(ctx, actor, private clock: () => string = () => new Date().toISOString())` (FormDraftService.ts:40) — injectable-clock precedent lab-sync/outbound/mint.ts:38; default preserves behavior byte-for-byte for adapters WITHOUT the hook (the clock is never read then).
- accept(): hook invoked AFTER the reviewHash re-check + status early-return + source-hash checks + adapter re-evaluation, and BEFORE the prior-scan (FormDraftService.ts:198-205): `if(authoring.onAccept){ const outcome = await authoring.onAccept(compiled.writes, this.clock(), this.ctx.store); ... }` — `acceptNow = this.clock()` computed ONCE per accept. ZERO kind/adapter-name branches: grep of FormDraftService.ts for `adapter ===|kind ===|'receiving'|material-receiving` returns exactly 1 hit — a comment (line 189) stating the prohibition.
- Prior-comparison sites (both the pre-persist scan and the write-loop re-check): `comparable(payload, recordId)` strips each record's declared volatileFields keys from BOTH sides before contentHash; prior-exists-equal-modulo-volatile => already accepted (create skipped, `ensureOwnerPolicy` still runs — FormDraftService.ts:207-233). The exemption set comes FROM the hook, never inferred generically.
- Adapters WITHOUT onAccept: `writes = compiled.writes`, `volatile = {}`, `comparable` returns the copy unchanged — byte-identical behavior (FormDraftService.test.ts 10/10 green unchanged).

### B. Receiving adapter onAccept (adapters.ts:160-170)
Stamps `attestedAt = acceptNow` into the write whose `schemaId === MATERIAL_RECEIVING_SCHEMA_ID` (schema-id identity, not a kind branch), occurredAt byte-untouched, and returns `volatileFields: { [receiptId]: ['attestedAt'] }`. `config/drafting/adapters.yaml` UNTOUCHED.
Stage-side idempotence (ruling item B "if a store lookup shows the receipt already exists with content equal modulo attestedAt, that IS the accepted form"): the compile performs that lookup through the canonical LIST view (MaterialReceivingDraft.ts:390-400, `alreadyAcceptedForm` + `durableInstanceExists` flags) and the adapter tolerates the staging create only for those flagged cases (adapters.ts:143-158); a DIFFERENT payload under the same id stays a stage failure (blocked card). StagingStore itself untouched.

### C. MaterialReceivingDraft.ts
- Compile-time attestedAt stamp DELETED; envelope construction carries no attestedAt (MaterialReceivingDraft.ts:344-352 comment block: "the draft envelope carries NO attestedAt — ... the accepted receipt's attestedAt is the server's ACCEPTANCE stamp, added by the receiving adapter's onAccept hook at accept time").
- Clock dep dropped from ReceivingCompileDeps/receivingDepsFromContext (no `now`/clock member remains).
- Header comments updated to the ratified posture (file header lines 33-38, option (a) named).
- occurredAt stays ONLY the scientist's stated date (unchanged hard rule).

### D. Relocation + deletion
- NEW `server/src/receiving/receivingIdentity.ts`: `receivingRecordIdOf` (the ONE deterministic id formula), `alreadyReceivedDiagnostic` (the shared gate), `MATERIAL_RECEIVING_SCHEMA_ID`, `MATERIAL_INSTANCE_SCHEMA_ID`. One module, no kind-dispatch, no evaluate/compile/accept path (identity + gate data only).
- `server/src/receiving/MaterialReceivingAcceptService.ts` DELETED (`git rm`). Grep `MaterialReceivingAcceptService` across server/src app/src config schema: 3 hits, all header comments in the relocated module + the two rewritten tests stating the class is deleted. No test instantiates it; no code imports it.

### D4 (minor, rides D): the already-received gate now routes through CurrentAssertionView
`alreadyReceivedDiagnostic` (receivingIdentity.ts:76-88) calls the view's exported `currentAssertion(receipts, entity)` — "a record is CURRENT iff no other supersedes it" — and the local fold that re-read superseded payloads is DELETED. Idempotence exemption: when the CURRENT receipt IS the draft's own deterministic id, the re-draft lands the SAME record (never a second arrival); a DIFFERENT current receipt yields the named correction-or-distinct-arrival diagnostic. Tests count arrivals via the view's exported `arrivalsForEntity` (ReceiveCorrectionCase5.test.ts:195,205). No second copy of the fold anywhere.

### E. Tests drive the PRODUCTION rail
- ReceiveElicitation.test.ts (22 tests): harness builds `new FormDraftService(ctx, 'USR-RECV-TEST', () => PINNED_ACCEPT)` (line 122). AC-4 RESTATED (line 169): draft envelope has NO attestedAt; after accept `receipt.attestedAt === PINNED_ACCEPT`, `!= occurredAt` and `!= draft.createdAt`; the decorative `typeof` check is replaced by the strict accept-stamp assertion (lines 355, 394, 413). Live-rail AC-2(i) repeat-accept asserts record COUNT; AC-2(ii) re-draft-identical-content lands the SAME record id with store count 1. Blocked cases assert compile-side `canAccept:false` + the named diagnostic.
- ReceiveAccept.test.ts REWRITTEN (9 tests): every accept goes through `FormDraftService.compile -> accept` (helper `compileAndAccept`); attestedAt asserted as the pinned accept clock; `attestedAt` ABSENT asserted on the compile result envelope; AC-2(i)/(ii)/(ii-volatile)/(iii)+other-half/distinct-bottle/reviewHash-409/append-only wall all on the live rail. The volatile-field-skip test proves equal-modulo-volatile idempotence across two DIFFERENT accept clocks (drafts compiled before either accept; second accept skips create, keeps owner policy; durable record keeps the FIRST stamp).
- ReceiveCorrectionCase5.test.ts REWRITTEN (7 tests): receipt + correction both compiled/accepted through `new FormDraftService(ctx, actor, pinnedClock)` (clock advances per accept); instance/aliquot ids asserted BYTE-UNCHANGED across the correction; `arrivalsForEntity(...) === 1` (correction is not a second arrival); correction double-submission lands the SAME id.
- No test instantiates the deleted class or bypasses FormDraftService (grep-verified).

## 3. D3 (minor): widened supersedes ref declared exactly ONCE

- `schema/lab/attestation.schema.yaml`: NEW additive `$defs/AttestationRefWidened` (type attestation|material-receiving, id pattern covering both prefixes); `supersedes` now `$ref: "#/$defs/AttestationRefWidened"`. The existing `AttestationRef` def stands UNTOUCHED (additive-only).
- `schema/lab/material-receiving.schema.yaml:123-132`: the inline `allOf` widening (ref.schema.yaml + enum [attestation, material-receiving]) REMOVED; replaced by `$ref: "./attestation.schema.yaml#/$defs/AttestationRefWidened"`.
- Anti-duplication pin added to MaterialReceivingSchemas.test.ts:286-301: RECV file must contain the widened $ref and must NOT re-declare the widened shape inline (no inline enum, no inline `^(ATT|RECV)` pattern); envelope file declares `AttestationRefWidened:` exactly ONCE and `supersedes: $ref` it; `AttestationRef:` still present. 12/12 green. AttestationSchemas.test.ts stays green (19/19 in the full run).
- This is the ONLY schema/lab edit in the fix-run; no lint YAML touched; no stack restarted.

## 4. D5 (minor): §9 grep claim rescoped

The coder-1 report's `git diff 46c3e4e9...HEAD | grep -c 'material-receiving-correction'` returned 3 because the diff includes the report .md itself. Reproducible-as-written version (re-run at this fix-run):
- `grep -rn "material-receiving-correction" schema server/src config app/src` -> 0 hits (exit-clean scan of code/schema/lint paths).
- The 3 diff hits are all inside `.hermes/plans/MATRES-RECV-report.l2t0115-coder1.md` itself.

## 5. Targeted suite runs (GREEN)

    src/receiving + src/schema/MaterialReceivingSchemas.test.ts:
      Test Files  4 passed (4)   Tests  50 passed (50)
        ReceiveElicitation 22, ReceiveAccept 9, ReceiveCorrectionCase5 7, MaterialReceivingSchemas 12
    src/attestation + src/drafts:
      Test Files  11 passed (11)  Tests  111 passed (111)
        AttestationAcceptService 9, AttestationCase5 8, FormDraftService.test 10,
        workstateCompile 17, analysisCompile 16, RecordDraftAdapter 9,
        WorkstateDraftAdapter 13, AnalysisDraftAdapter 11,
        recordDraftCompile.landing 4, recordDraftCompile.humanReviewed 7, recordDraftEnvelopeLockstep 7

## 6. Full server suite vs baseline (three runs, raws on disk)

Baseline (coder-1, /tmp/b.sorted): 88 failing files, 99 failing tests.

Run 1 (/tmp/matrecv-fix1-server.raw): 91 failed | 684 passed | 9 skipped (784); 103 failed tests.
  NEW files: W25DraftLifecyclePromotion, Wave2SemanticPassE2E, sequenceRoutes (+2 test-level flaps in modelLifecycle, EventEditorFixHandlers).
  Isolation proof: all 5 pass standalone (`npx vitest run ...` -> 3 files 16 tests passed; 2 files 17 tests passed; W25 alone takes 21.4s and Wave2 33.5s — over the 10s per-test timeout under full-suite NFS load).
Run 2 (/tmp/matrecv-fix1-server-r2.raw): 89 failed | 686 passed; 99 failed tests. NEW: Qms6bSchemaDrift (file-level `Hook timed out in 10000ms`; passes standalone 4/4 in 599ms).
Run 3 (/tmp/matrecv-fix1-server-r3.raw): 88 failed | 687 passed | 9 skipped (784); 99 failed | 6467 passed | 70 skipped (6809); Errors 2 (pre-existing unhandled-rejection debt, present in baseline too).
  Fail-file comm vs baseline: NEW (empty), GONE (empty) — 88 = 88 IDENTICAL.
  Failing-TEST comm vs baseline: GONE (empty); NEW = 1 extra `modelLifecycle > Model lifecycle chain (integration)` row — the baseline raw itself lists that same file/test as failing (1 occurrence); run 3 shows 2 occurrences of the identical integration-chain flap. File-level set is identical; the chain test is a known load-flap (passes standalone 1/1 in 21.9s).
  The flap set ALTERNATES across runs (run1: W25/Wave2/sequenceRoutes; run2: Qms6bSchemaDrift; run3: none at file level) — load-timeout flaps, not lane regressions; every flapped file passes in isolation.
  All owned files GREEN in the full run: ReceiveElicitation 22, ReceiveAccept 9, ReceiveCorrectionCase5 7, MaterialReceivingSchemas 12, AttestationSchemas 19, all drafts suites, AgentOrchestrator.receivingProposal 8.

Typecheck: `npm run typecheck -w server` -> EXIT 0, 0 `error TS` (re-run after all edits, /tmp captured in-session).

## 7. Five AC clauses after the fix (live-rail mapping)

- AC-1 (schemas): unchanged, 12/12 + D3 pin.
- AC-2 (idempotent-or-supersession): (i) repeat-accept -> 1 receipt + 1 instance (count); (ii) re-draft identical content -> SAME deterministic id, count 1; volatile-field skip across two accept clocks -> create skipped, owner policy kept, first stamp preserved; (iii) changed non-identity fact (receivedBy) WITHOUT supersedes -> canAccept:false, diagnostic names entity + correction-or-distinct-arrival, store spy ZERO creates; WITH supersedes -> second record, first record byte-unchanged; distinct bottle (new entity ref) -> two legal arrivals.
- AC-3 (case 5): correction keeps instance+aliquot ids byte-unchanged; current view says new lot, historical view still says old; arrivalsForEntity == 1; double-submission same id; deviation wall (lint YAML rule `material-receiving-entity-substitution-needs-deviation-resolution`) fires an ERROR naming the consumed ref on the substitution shape (see §8 deviation note on AC-3(e) restatement).
- AC-4 (restated): draft envelope NO attestedAt; accepted receipt attestedAt === pinned accept clock, != occurredAt, != draft.createdAt; unknown variant stays presence-honest.
- AC-5 (panel): unchanged (app pin file untouched by this fix-run).

## 8. Deviations & rulings recorded

1. D6 — ORCHESTRATOR RULING (recorded, not silent): the local vendor-product declared-field scan in `lookupVendorProduct` (MaterialReceivingDraft.ts, ~:168-185) IS the sanctioned "catalog identity" mechanism for §2c. The spine tier-4 vendorExa provider is a REMOTE Exa lookup — wrong for local catalog identity. Matcher kept as-is; no spine routing added. This deviates from §4's literal wording per orchestrator ruling.
2. AC-3(e) restated honestly for the live rail: the accept re-evaluation re-runs the compile from the stored draft INPUT, so an elicited correction can only ever be same-entity-reattribute — an entity-substitution is UNREACHABLE from the chat surface and therefore cannot reach accepted state through the rail. The test now asserts: (a) the rail's correction is same-entity-reattribute; (b) the deviation LINT WALL fires the named error on the substitution shape over the consumed ref (real LintEngine, real lint YAML data); (c) zero writes / receipt set byte-unchanged. The coder-1 version mutated the stored draft's compiled envelope before accept — that bypassed the rail's input-authority and is removed.
3. Test isolation: ReceiveAccept tests use per-test lots (sigma('10001'..'10009')) because lot is part of the derived ENTITY identity; a shared lot across tests would make a prior test's CURRENT receipt block a later test's fresh draft (cross-contamination through the shared store). AC-2(iii) changes receivedByLabel (a NON-identity fact) rather than the lot — changing the lot would derive a DIFFERENT entity, which is the legal distinct-arrival path, not the already-received refusal path.
4. Compile-side idempotence lookup reads through the canonical LIST view (repo scan), not the staging proxy's get, so it pins nothing in the reviewHash read set and the accept re-evaluation reproduces identical flags.

## 9. Files changed in this fix-run

- server/src/drafts/FormDraftService.ts (clock ctor param, onAccept invocation, volatile prior-comparison)
- server/src/drafts/adapters.ts (AcceptOutcome + onAccept interface; receiving stage idempotence tolerance; receiving onAccept hook)
- server/src/receiving/MaterialReceivingDraft.ts (attestedAt stamp deleted, clock dep dropped, ratified comments, idempotence flags, gate call)
- server/src/receiving/receivingIdentity.ts (NEW — relocated helpers + schema-id constants + D4 view-routed gate)
- server/src/receiving/MaterialReceivingAcceptService.ts (DELETED)
- server/src/receiving/ReceiveElicitation.test.ts (AC-4 restated, pinned accept clock, live-rail AC-2)
- server/src/receiving/ReceiveAccept.test.ts (rewritten to the production rail)
- server/src/receiving/ReceiveCorrectionCase5.test.ts (rewritten to the production rail)
- server/src/schema/MaterialReceivingSchemas.test.ts (D3 anti-duplication pin)
- schema/lab/attestation.schema.yaml (additive AttestationRefWidened; supersedes $refs it)
- schema/lab/material-receiving.schema.yaml (inline allOf removed; $refs the widened def)

Scope guards honored: config/drafting/adapters.yaml, draftRoutes.ts, StagingStore.ts, server/src/attestation/**, server/src/fulfilment/**, all other schema/lint YAML — untouched (git status shows only the files above).

## 10. Commits

See `git log` on cl/lane2-matres-recv-l2t0115 after this report's commit (fix-run commit ids listed in the exit summary).
