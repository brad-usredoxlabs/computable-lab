# MATRES-RECV — coder report (l2t0115-coder1)

Item: MATRES-RECV (campaign 2, material resolution + attestation) — material-receiving
record: lab-domain twin of sample-receipt, retrospective elicitation from chat.
Worktree: /mnt/vast/home/brad/git/wt/matres-recv-lane2  Branch: cl/lane2-matres-recv-l2t0115
Base: 46c3e4e9 (trunk tip containing the MERGED MATRES-ATTEST foundation).

## 0. Commits on-branch (oldest first)

| sha | content |
|---|---|
| 25a9522d | OQ-1 sanctioned additive `$defs` extraction in attestation.schema.yaml (Claim/Correction/AttestedAt/Against) — behavior-preserving, attestation suite green 17/17 across it |
| bf599311 | material-receiving triplet (schema+lint+ui) composing the ATTEST envelope via $ref + §5.1 suite GREEN 12/12 (RED-first, YAML-only, zero server code) |
| 5ddb81f6 | §2b receiving accept path — atomic two-write accept, deterministic content-hash RECV id, idempotent-or-supersession, append-only wall via appendOnlyKinds DATA entry + §5.2/§5.3 GREEN 15/15 |
| 98ca39e4 | §2b/§2c elicited receiving draft — compile-side Ajv+lint staging (zero durable writes), data-declared `receiving` adapter (humanReviewedCreate), P4 catalog-only vendor lookup, lot-discard-vs-block boundary + §5.4 GREEN 19/19 |
| 5ef7d4f0 | OQ-2 ratified emission surface — ONE new intent `compose_receiving` on the existing forced agent_intent tool + `receiving_proposal` relay arm; verb union stays 32; enum pins updated (DELIBERATE golden diff) + orchestrator suite GREEN 8/8 |
| 79a8f9ac | §5.5 app PIN test (TEST-ONLY, zero app product code) GREEN 5/5 |
| 7aca8895 | pin follow-through: AttestationSchemas bait-3 pin reads the sanctioned $defs/Claim extraction; humanReviewed adapter-scoped pin names the receiving block; §5.1 harness caches its corpus load (NFS full-suite timeout fix) |
| 2f638fd2 | lint rule ids renamed so the diff carries ZERO `material-receiving-correction` substring (spec §9 grep); suites re-run GREEN 46/46 — FINAL HEAD |

## 1. §1 post-merge surface verification checklist (re-cited against MERGED code at 46c3e4e9)

Cited via `git show 46c3e4e9:<file> | grep -n ...` (dispatch-time merge state), then
re-verified against the working tree after my edits.

1. `schema/lab/attestation.schema.yaml` — envelope at merge: `artifactKind:` :41;
   `claimStatus:` :65 (enum proposed|completed|unknown|reported-by-other), `occurredAtStatus:`
   :90 (known|approximate|unknown), identity triple `performer:` :115 / `accountSupplier:`
   :121 / `attestor:` :127 (absent = unknown, never presumed), `attestedAt:` :141
   (server-stamped at accept, readOnly), `against:` :152, `supersedes:` :184, `correction:`
   :192, `$defs:` :234 with `PersonRef:` :235 and `AttestationRef:` :243 ONLY.
   **DEVIATION vs spec §1 wording (merged code is authority):** at merge the claim shape was
   INLINE under `claims.items` (not a def), and `supersedes`/`correction` were top-level
   properties, not `$defs` — the envelope shipped `$defs PersonRef + AttestationRef ONLY`,
   exactly as the OQ-1 ruling states. There was NO composition point a specializing kind could
   `$ref`. This is precisely the case the ruling anticipated: I applied the SANCTIONED fix —
   the additive, behavior-preserving `$defs` extraction (Claim/Correction/AttestedAt/Against),
   its own commit (25a9522d), attestation suite green 17/17 across it (re-verified at HEAD:
   `Test Files 2 passed (2) / Tests 17 passed (17)`). RECV files contain ZERO re-declared
   envelope vocabulary (grep proof §9 below).
2. `schema/lab/attestation.lint.yaml` — pairing rules at merge: occurred-known :27,
   occurred-approximate :48, occurred-unknown-is-terminal :71, supersedes-needs-correction :97,
   correction-needs-supersedes :115, chain-no-proposed-claims :133, entity-substitution-deviation
   :158, reevaluation-review :193. All present as spec describes. RECV carries its OWN rule
   instances of the SAME vocabulary (data instantiation; LintEngine.ts:61-62 throws on duplicate
   rule ids, so per-kind instances MUST carry distinct ids — house constraint, not a new vocabulary).
3. `server/src/attestation/AttestationAcceptService.ts` — reviewHash re-check BEFORE
   already-accepted early return (header :10-13 citing FormDraftService.ts:168/169), injectable
   clock `attestedAt` stamp (:20 header), `contentHash` import :39, `reviewHash`/`attestedAt`
   result fields :60/:71. RECV composes this mechanism (never a parallel accept path).
4. `server/src/attestation/CurrentAssertionView.ts` — pure most-recent-un-superseded fold
   (header :4-12). RECV's case-5 discovery is tested THROUGH this view (ReceiveCorrectionCase5
   `AC-3(b)`), never by re-reading superseded payloads.
5. `server/src/config/types.ts` — at merge :533 `appendOnlyKinds: ['audit-event','signature',
   'vendor-protocol-candidate','attestation']`. **DEVIATION vs spec §1.5 (spec cited :528 with
   three entries):** the ATTEST merge had already added `'attestation'` and the line had moved.
   RECV adds `'material-receiving'` to the SAME data list (now :535) — zero new TS guard. The
   generic wall is `appendOnlyWallError` at RecordStoreImpl.ts:273-278 (:741 update, :958 delete).
6. `schema/workflow/events/plate-event.schema.yaml` — `occurredAtStatus:` :70, `occurredAt:` :77
   present (ATTEST §2e). RECV touched plate events NOT AT ALL (diff proves it).
7. `artifactKind` enum envelope-side only (:41 at merge). RECV ships the minimum emission-side
   declaration its own action needs: the receiving schema narrows `artifactKind` to
   `attestation-chain` (material-receiving.schema.yaml:66) and the elicited compile declares it
   explicitly (MaterialReceivingDraft.ts:329) — Q2 declared, never inferred; no general
   artifactKind framework.

## 2. Baseline (recorded BEFORE any code change)

`npm run test:run -w server` at 46c3e4e9 with the lane's untracked trunk-disk files restored
(per lane-exclude-a6fix-l2t0430) and the `server/schema -> ../schema` symlink in place:

    Test Files  88 failed | 682 passed | 9 skipped (779)
          Tests  99 failed | 6443 passed | 70 skipped
         Errors  2 errors

Raw: /tmp/matrecv-baseline-server.raw; sorted fail-file list: /tmp/b.sorted
(88 files). Note: without the lane-exclude infrastructure the suite falsely fails 227 files —
restored before baselining, zero code content.
Typecheck baseline: `npm run typecheck -w server` -> EXIT 0, 0 `error TS`
(/tmp/matrecv-typecheck-baseline.raw).
Baseline already-failing relevant files: `src/ai/submitSuggestionTool.tubeSchema.test.ts`
(event-contract tube descriptor debt) and `src/ai/createRecordIntent.test.ts` (stale 3-intent
pin). `submitSuggestionTool.test.ts` and the enum pins were GREEN at baseline.

## 3. FIRST TARGETED CHECK — RED then FIRST GREEN (gate 1)

RED (schema absent — triplet files removed, test file present; reproducible proof run at HEAD,
raw /tmp/matrecv-red-proof.raw):

    FAIL  src/schema/MaterialReceivingSchemas.test.ts > ... > no duplicate envelope vocabulary is declared in the receiving files (OQ-2 grep on the YAML itself)
    Error: ENOENT: no such file or directory, open '.../schema/lab/material-receiving.schema.yaml'
     Test Files  1 failed (1)
          Tests  12 failed (12)

(The identical RED was observed at item start before the triplet existed: 12/12 fail.)

FIRST GREEN with schema+lint+ui YAML ONLY, zero server code (after bf599311's triplet;
server/src/receiving did not exist yet):

    ✓ src/schema/MaterialReceivingSchemas.test.ts  (12 tests)
     Test Files  1 passed (1)
          Tests  12 passed (12)

## 4. Gate 2 — combined targeted suites (all green)

`npm run test:run -w server -- src/schema/MaterialReceivingSchemas.test.ts src/receiving`:

     ✓ src/receiving/ReceiveCorrectionCase5.test.ts  (7 tests) 1034ms
     ✓ src/receiving/ReceiveAccept.test.ts  (8 tests) 1113ms
     ✓ src/receiving/ReceiveElicitation.test.ts  (19 tests) 1627ms
     ✓ src/schema/MaterialReceivingSchemas.test.ts  (12 tests) 22353ms
     Test Files  4 passed (4)
          Tests  46 passed (46)

Re-run after the final rule-id rename (2f638fd2): 4 files / 46 tests passed.
Widened owned set (adds emission + attestation + touched-pin files): 13 files / 141 tests passed.

## 5. Per-§5 suites

§5.1 MaterialReceivingSchemas.test.ts — 12/12 (above).
§5.2 ReceiveAccept.test.ts — 8/8; §5.3 ReceiveCorrectionCase5.test.ts — 7/7 (15/15 combined).
§5.4 ReceiveElicitation.test.ts — 19/19 (elicitation, AC-4, tool/compile lockstep, adapter
lifecycle, P4 catalog-only lookup, discard-vs-block survival).
Emission AgentOrchestrator.receivingProposal.test.ts — 8/8.
§5.5 app receivingMintPin.test.ts — 5/5 via `npm run test:unit -w app -- src/shared/taptab/slashMenu/receivingMintPin.test.ts`:

     ✓ src/shared/taptab/slashMenu/receivingMintPin.test.ts  (5 tests) 6ms
      Test Files  1 passed (1)
           Tests  5 passed (5)

ATTEST regression guard across the OQ-1 extraction: `npx vitest run src/attestation` ->
`Test Files 2 passed (2) / Tests 17 passed (17)`.

## 6. Gate 3 — full server suite vs baseline (zero NEW failing files)

Final full run at HEAD 2f638fd2 (/tmp/matrecv-final4-server.raw):

     Test Files  88 failed | 687 passed | 9 skipped (784)
          Tests  99 failed | 6463 passed | 70 skipped (6805)
         Errors  2 errors

Fail-file comm vs baseline (sorted lists, both directions):

    === NEW vs baseline ===   (empty)
    === GONE vs baseline ===  (empty)

88 failing files identical; failing-test COUNT identical (99). File total 779 -> 784 = exactly
my 5 new server test files, all passing. `Errors 2` is the pre-existing unhandled-rejection
debt (AgentOrchestrator.golden.test.ts "Should not be called"), present in BOTH runs.
Owned files failing: only `src/ai/submitSuggestionTool.tubeSchema.test.ts`, which fails in the
baseline with the IDENTICAL assertion (`details.properties.tube ... expected undefined to be
type of 'object'`, asJson :20) — pre-existing trunk debt, byte-identical failure reason in both
raws; my enum-pin edits did not touch it.

Honest flap record: two intermediate full runs showed transient noise — one added
`src/revisions/Qms6bSchemaDrift.test.ts` via "Hook timed out in 10000ms" (NFS load flap; the
file passes standalone: 4/4 in 1.2s), one run was contaminated by my own RED-proof YAML removal
mid-suite. Both were diagnosed and the clean final run above is the gate-3 evidence.

## 7. Gate 4 — typecheck

`npm run typecheck -w server` at HEAD -> **EXIT 0, 0 errors** (/tmp/matrecv-typecheck-final2.raw).
Baseline was EXIT 0. exactOptionalPropertyTypes honored: optional envelope fields use the
conditional-spread house idiom; tests assert presence-shape (`'x' in obj`), never `field: undefined`.

## 8. Gate 5 — app diff contains ONLY the pin file

    git diff 46c3e4e9...HEAD --stat -- app/
     .../taptab/slashMenu/receivingMintPin.test.ts      | 136 +++++++++++++++++++++
     1 file changed, 136 insertions(+)

resolvers.ts and ClarificationPicker.tsx are byte-untouched (`git diff --stat` on both: empty).

## 9. §9 grep proofs (against the three-dot diff)

- `git diff 46c3e4e9...HEAD | grep -c 'material-receiving-correction'` -> **0** (rule ids
  renamed in 2f638fd2; the correction rides the SAME kind + supersedes + correction — one
  generic mechanism, zero new kinds).
- Kind-string equality in added TS lines: only (a) header comments stating the prohibition and
  (b) a TEST assertion in ReceiveCorrectionCase5 (`kind === 'material-receiving'` inside an
  `it()` audit). Zero business-rule kind-equality branches in server code. No TS lot check, no
  second wall, no denylist, no bespoke free-standing-instance gate (OQ-3 ruling honored).
- `Date.now()/randomUUID` in added lines: only header-comment prohibitions and
  `const elapsed = Date.now() - t0` in the orchestrator relay arm — an elapsed-ms LOG identical
  to the recordDraft arm's house pattern; NOT an id or occurredAt path. All ids are
  content-hash (RECV-/ATT- deterministic) or the existing canonical scan; zero Date.now()/randomUUID
  in any id or occurredAt path (grep of server/src/receiving: 1 hit, a comment).
- Diff paths: only §3 IN-scope files + the §5.5 app pin file (25 files, 3267+/115-).
- Vocabulary grep on the receiving YAML itself (pinned test): no `claimStatus ... enum`,
  no `occurredAtStatus ... enum`, no claimTarget mode re-declaration; the file contains
  `$ref: "./attestation.schema.yaml#/$defs/Claim|Correction|AttestedAt|Against"`.
- Verb union: `grep -c 'verb:' schema/scientist-intent/scientist-intent-vocabulary.yaml`
  unchanged; no `receive`/`receipt` verb added anywhere (pinned test
  `NO second forced tool and NO receive verb in the scientist-intent vocabulary (verb union stays 32)`).

## 10. Five AC clauses mapped to named it()s

AC-1 "lot-without-vendor-product rejected" ->
  §5.1 `AC-1: lot WITHOUT vendorProductRef is REJECTED and the error names the offending path`
  (lint ERROR `material-receiving-lot-requires-product`, message names `assertion.lot`).
AC-2 "double receipt for same bottle is idempotent-or-supersession (never 2 arrivals)" ->
  §5.2 `AC-2(i): repeat-accept of the same revision yields exactly ONE receipt + one instance (record COUNT, not response equality)`;
  `AC-2(ii): re-DRAFT of identical content lands the SAME deterministic id (content-hash, termId law) — one record`;
  `AC-2(iii): changed fact about an already-received entity WITHOUT supersedes is REFUSED with ZERO writes; the error names the entity + correction-or-distinct-arrival`;
  `AC-2(iii) other half: the SAME changed fact WITH supersedes lands a second record and the first record stays byte-unchanged`;
  `AC-2 second half: a distinct second bottle (new instance entity ref, same product+lot) is a LEGAL second arrival`;
  §5.4 `a second elicitation of the SAME bottle (identical stated facts) is refused at the card with the named correction-or-distinct-arrival diagnostic (idempotent-or-supersession at compile)`.
AC-3 "corrected receipt keeps descendant instance/aliquot identity discoverable (case 5)" ->
  §5.3 `AC-3: correction (same-entity-reattribute, lot 09213, photo evidence) keeps instance+aliquot ids BYTE-UNCHANGED`;
  `AC-3(b): the current view says 09213 and the historical view still says 09231 (both queryable)`;
  `AC-3(c): the correction is NOT a second arrival (arrival count of the entity == 1)`;
  `AC-3(d): correction double-submission lands the SAME id (content-scoped idempotence, Q4e)`;
  `AC-3(e): entity-substitution over a CONSUMED ref cannot reach accepted state without the deviation fact; the error names the consumed ref`.
AC-4 "retrospective elicitation draft carries attestedAt != occurredAt" ->
  §5.4 `AC-4: the retrospective draft carries attestedAt (server-stamped) AND occurredAt (the stated date) with PRESENCE-SHAPE + value-inequality-when-present`;
  `AC-4 unknown variant: occurredAt ABSENT is VALID and terminal-honest (presence-shape, not a string inequality)`.
AC-5 "receiving absent from panel mint affordances" ->
  §5.5 `resolveMaterial emits NO receiving/receive row for any query (every layer)`;
  `resolveLabware and resolveEquipment emit NO receiving/receive row for any query`;
  `the ONLY creation-entry row the material funnel offers stays the existing term-mint floor (unchanged)`;
  `resolvers.ts mentions no receiving affordance at all`;
  `ClarificationPicker.tsx mentions no receiving affordance and keeps its exact resolver-keyed canMint shape`.

## 11. Lot discard-vs-block distinction (r2 boundary)

The lint lot rule gates ACCEPTANCE ONLY. A blocked card is `canAccept:false` + a named lint
violation; the honestly reported, not-yet-resolved lot inscription survives VERBATIM in the
stored draft payload until vendor lookup resolves catalog identity. Proven by:
§5.4 `a draft with a proposed receipt claim cannot reach accept (chain lint wall fires) and the
lot inscription SURVIVES byte-verbatim in the stored draft payload` and
`a lot WITHOUT a resolvable vendor-product gates ACCEPTANCE via the named lint rule while the
draft keeps the inscription (blocked card names the rule)` — the tests read the stored draft
record back and assert the inscription bytes, not just the diagnostic string.

## 12. Vendor-scoped-lot statement (binding)

Lot identity is (vendorProductRef, lot_number) — NEVER lot_number alone. No schema rule, lint
rule, or code site implies global lot-number uniqueness; §5.1
`vendor-scoped lot: two DIFFERENT products with the SAME lot_number are BOTH valid` pins it,
and a bare lot number never mints an id and never keys a lookup (arrival identity is the
ENTITY ref — two bottles of the same product/lot are two distinct instance refs = two legal
arrivals; one entity never receives twice).

## 13. [DEFAULT-PENDING-RATIFICATION] impact note (window open until 2026-10-21 18:00 EDT)

Tags carried at RECV's own sites only (envelope-inherited tags stay in the ATTEST report):
- Q2 (§2c emission): `artifactKind: attestation-chain` declared on RECV's own emission only
  (schema enum narrowed + explicit compile declaration). If ratification redefines the
  emission-side declaration mechanism, the change is confined to material-receiving.schema.yaml
  `artifactKind` + MaterialReceivingDraft.ts:329 — no envelope edit.
- Q4 (§2a corrections): supersedes/correction pairing rules + Q4b deviation gate + Q4e
  content-scoped correction id. If Q4 changes shape, edits stay inside the RECV lint/schema +
  the shared accept service's correction-id formula; the one-generic-mechanism stance (zero new
  kinds) is load-bearing for AC-2/AC-3 and would need re-derivation, not patching.
- Q5 (§2a/§2c): receivedByStatus pairing rules + terminal-honest unknown variants + the
  elicitation "I don't know is a complete answer" once-ask. If Q5 renames the triple, the
  rename touches material-receiving.lint.yaml rules + ui.yaml select options + the intent
  schema enum — data files only.
- Q8 (§2c time): attestedAt (server-stamped) vs occurredAt (declared) presence-shape semantics.
  AC-4 is written as presence-shape + value-inequality-when-present precisely so a Q8 ruling
  that changes clock injection cannot silently manufacture history.
Dispatch-under-defaults held throughout: nothing was blocked waiting on ratification; every
dependent decision kept its tag in-file.

## 14. §11 minor notes (three, resolved-in-spec)

1. Evidence refs ride the file-ref datatype (no upload-record kind invented):
   `evidenceRefs` items `$ref ./datatypes/file-ref.schema.yaml`; §5.1 rejects an inline
   base64 blob naming the path.
2. `receivedByStatus` is memo-Q5's own naming, kept verbatim (no synonym introduced).
3. The plate-event occurredAt story belongs wholly to ATTEST §2e — RECV touched nothing
   event-side (diff proves plate-event files absent from the diff).

## 15. Deliberate golden diffs (test pins my sanctioned changes required)

- Intent-enum pins in 5 test files (submitSuggestionTool.test.ts, .analysis, .protocolEdit,
  .workstate, AgentOrchestrator.shorthandChat): `compose_receiving` appended after
  `compose_record_draft` — the house precedent for a menu growth on the ONE forced tool
  (QMS7-7 precedent comment carried in each). OQ-2 ratified this explicitly.
- AttestationSchemas.test.ts bait-3 pin: now reads `$defs/Claim` (enum VALUES unchanged,
  identical arrays) and additionally pins `claims.items.$ref === '#/$defs/Claim'` — the
  extraction's behavior-preservation is itself test-pinned.
- recordDraftCompile.humanReviewed.test.ts adapter-scoped pin: `['record-drafting',
  'receiving']` — the spec §2c mandates `humanReviewedCreate: true` on the receiving adapter;
  the pin's semantics (only blocks that DECLARE the flag) are unchanged.

## 16. UNRESOLVED / for the orchestrator

1. Live YAML-reload curl proofs (blocked-card + APPEND_ONLY PUT rejection) are DEFERRED to the
   orchestrator post-merge per contract — not run here (no lane-stack touches). In-worktree
   proofs stand in: §5.4 blocked-card tests + §5.2 `append-only wall: update/delete of a stored
   material-receiving hits APPEND_ONLY (generic data knob); a control kind still updates`.
2. OQ-3 (free-standing material-instance via compose_record_draft) is recorded and routed to
   FULFIL/CHAIN as a governance item per the ruling; RECV added NO denylist/kind check.
3. App-side consumption of `receiving_proposal`: the app's assistStream default case ignores
   unknown frames (assistStream.ts:524-527), so the new event is inert in the UI until CHAIN's
   review-wall work — spec §7 rules RECV ships no app product code and no browser gate
   (NO-BROWSER-GATE ruling precedent: MATRES-SHELF, ATTEST). If the orchestrator widens OQ-2
   into an app affordance, the browser gate returns and §7's paragraph is amended, not honored loosely.
4. No file-boundary widening was needed; every §3 IN-list file was touched, no OUT-list file was.

## EXIT SUMMARY

- Final commit: 2f638fd2 (branch cl/lane2-matres-recv-l2t0115, 8 commits on 46c3e4e9).
- Gate 1 RED: 12/12 fail (schema absent). FIRST GREEN: 12/12 with schema+lint+ui YAML only, zero server code.
- Gate 2: src/schema/MaterialReceivingSchemas.test.ts + src/receiving -> 4 files / 46 tests passed. Widened owned set 13 files / 141 tests passed. ATTEST guard 17/17. App pin 5/5.
- Gate 3: full server suite 88 failing files — IDENTICAL to baseline (comm empty both directions); 99 failing tests identical; zero failing tests in owned files (tubeSchema pre-existing, identical failure reason).
- Gate 4: typecheck EXIT 0, 0 errors (baseline 0).
- Gate 5: app/** diff = ONLY receivingMintPin.test.ts; resolvers.ts / ClarificationPicker.tsx byte-untouched.
- §9 greps: zero material-receiving-correction substring; zero kind-equality business branches; zero Date.now()/randomUUID in id/occurredAt paths; verb union stays 32.
- Unresolved: live curl proofs deferred to orchestrator post-merge; OQ-3 routed to FULFIL/CHAIN; app-side receiving_proposal consumption intentionally inert (NO-BROWSER-GATE ruling).
