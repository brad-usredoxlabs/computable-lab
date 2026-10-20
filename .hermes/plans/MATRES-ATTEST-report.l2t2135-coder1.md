# MATRES-ATTEST — coder report (l2t2135, coder1)

Branch: `cl/lane2-matres-attest-l2t2135` (off trunk tip 558d7bae)
Worktree: `/mnt/vast/home/brad/git/wt/matres-attest-lane2`
Spec: `.hermes/plans/2026-10-19_2140-MATRES-ATTEST-attestation-foundation.md` (canonical, PROMOTED l2t2135)

## 0. Result in one line

Schema + lint data + minimal server write paths shipped; all four §5 suites GREEN
(39 tests); server typecheck EXIT 0 (baseline 0); full-suite failing-FILE set
identical to the recorded baseline (zero NEW failing files, zero failing tests in
owned files); no app/ diff; all `[DEFAULT-PENDING-RATIFICATION]` markers preserved.

## 1. RED evidence (first targeted check, run BEFORE implementation)

Command (spec §9 first check):
    cd server && npx vitest run src/schema/AttestationSchemas.test.ts

RED output (full log: /tmp/l2t2135-RED-evidence.log):

    ❯ src/schema/AttestationSchemas.test.ts  (19 tests | 19 failed) 2232ms
      ❯ ... > attestation schema + lint spec load cleanly and register
        → ENOENT: no such file or directory, open
          '.../server/schema/lab/attestation.schema.yaml'
      ... (all 19 failed on the absent schema)
     Test Files  1 failed (1)
      Tests  19 failed (19)

First GREEN (same command, schema+lint YAML only): AttestationSchemas.test.ts
19/19 pass. Note: that file imports ONLY the pre-existing harness modules
(SchemaLoader/SchemaRegistry/AjvValidator/LintSpecLoader/LintEngine) plus the new
`schema/lab/attestation.schema.yaml` + `attestation.lint.yaml` — its pass is the
data-only proof that the contract is expressible as YAML before any new TS is
justified.

## 2. Per-suite results (final targeted run, /tmp/l2t2135-targeted-final.log)

    npm run test:run -w server -- src/schema/AttestationSchemas.test.ts src/attestation src/store/AppendOnlyWall.attestation.test.ts
    -> Test Files  4 passed (4)
       Tests  39 passed (39)   EXIT 0

- src/schema/AttestationSchemas.test.ts — 19 passed (§5.1: envelope validity,
  Q5 unknown-terminal schema-valid AND lint-clean, occurredAt pairing lint errors,
  P3 identity honesty (no coercion, no synthesis), P2 chain wall, unevaluated
  property rejection naming the offending path (`/` unevaluatedProperties for the
  envelope, `/claims/0` additionalProperties for a claim), exactOptionalPropertyTypes
  runtime mirror (conditional spread -> key ABSENT), attestedAt absent-pre-accept,
  `against` pin validation + unknown-pin rejection, supersedes/correction pairing,
  claimStatus enum EXACTLY [proposed, completed, unknown, reported-by-other] and
  occurredAtStatus EXACTLY [known, approximate, unknown] (bait 3), plate-event
  §2e suite: at:/t_offset byte-stable (bait 7), retrospective occurredAt valid,
  pairing enforced by plate-event LINT rules (schema stays purely additive)).
- src/attestation/AttestationAcceptService.test.ts — 8 passed (§5.3).
- src/attestation/AttestationCase5.test.ts — 8 passed (§5.2, seven outcomes + gate).
- src/store/AppendOnlyWall.attestation.test.ts — 4 passed (§5.4).

## 3. Case-5 seven individual it() blocks (names as executed)

1. `case5-1: A and A2 both persist and A is never rewritten (stored contentHash byte-equality)`
   — A's stored payload contentHash identical pre/post correction (bait 8: bytes, not vibes).
2. `case5-2: no second arrival — a correction never increments the arrival count for entity B`
   — arrivalsForEntity() counts the CURRENT receipt claim once; two receipt claims exist
   across history (A + A2) but only one is current.
3. `case5-3: the 10 aliquot record ids are byte-unchanged after the correction`
4. `case5-4: corrected source is discoverable downstream — aliquot provenance through CurrentAssertionView yields lot 09213`
   — chain aliquot -> entity B -> current assertion.
5. `case5-5: both accounts stay queryable — historical view says 09231, current view says 09213`
   — "believed Monday" (historicalFacts(A)) and "corrected now" (currentFacts) both live.
6. `case5-6: a fulfillment fact citing superseded A yields the declared re-evaluation obligation; requirement bytes unchanged`
   — lint info rule `attestation-correction-triggers-reevaluation-review` fires on the
   correction AND `reevaluationObligations()` returns {supersededRef: A, corrections: [A2]};
   requirement fixture contentHash unchanged.
7. `case5-7: double-submitted identical correction lands on the SAME id (one record); a different changedFacts lands as a second correction`
   — idempotence proven by record COUNT and record ID (not response equality alone);
   A2 byte-unchanged (hash vs pre-alt snapshot) and its changedFacts still {lot: "09213"}.

Plus the §5.2 gate test: `case5-plus: entity-substitution over an already-consumed ref is
gated until a deviation resolution fact exists (error names the consumed ref)` — accept
refuses (lint error names ALQ-000003), deviation FACT recorded as an `attestation` claim
with `claimStatus: unknown` + `about` = the consumed ref (OQ-3 ruling, zero new kinds),
then the substitution correction (with resolutionNote) is accepted; material-instance set
byte-unchanged (no new entity id).

## 4. Idempotency + post-accept mutation (AC (b), task-block named tests)

- Double submission: accept the same (draftId, revision, reviewHash) twice -> exactly ONE
  attestation record (record COUNT asserted), second receipt equals first; third accept
  still one record. Deterministic id = `ATT-<sha256(draftId+revision+envelope)[0:32]>`
  (content hash over the payload revision, termId discipline; NO Date.now()/randomUUID in
  any id path — grep of the diff confirms the only occurrence is the comment forbidding it).
- Post-accept payload mutation: compile -> mutate the lot string -> accept with the ORIGINAL
  reviewHash -> DraftError 409 (`Draft changed. Review the current revision before accepting.`)
  AND store spies assert ZERO create/update calls; attestation list stays empty.
- Accept order cites the FormDraftService line pair (bait 9): reviewHash re-check
  (FormDraftService.ts:168 shape) runs BEFORE the already-accepted early return
  (FormDraftService.ts:169 shape); both cited in AttestationAcceptService.ts comments.
- attestedAt server-stamped from the INJECTABLE clock (mint.ts:38 precedent, test-pinned
  2026-10-19T14:00:00Z); occurredAt preserved byte-verbatim from the draft; unknown-status
  payload comes out with occurredAt ABSENT; `against.graphRevision` survives accept
  byte-stable; a graph sha moved after compile is refused at the re-check (409, zero writes).

## 5. Append-only wall (§5.4)

- `DEFAULT_CONFIG.server.appendOnlyKinds` gains `'attestation'` (config/types.ts — the ONLY
  server data entry; comment states sample-receipt is deliberately NOT added).
- update on a stored attestation -> `{success:false, error:'APPEND_ONLY: immutable records cannot be updated'}`;
  delete -> `'APPEND_ONLY: immutable records cannot be deleted'`.
- NON-attestation control record (labware) still updates AND deletes in the same store —
  proves the wall is the generic data knob (RecordStoreImpl.ts:273/:957), not a new mechanism.
- No `if (kind === 'attestation')` branch anywhere in the diff (grep-verified: zero
  kind-string comparisons in the new TS; the only kind membership site is the knob list).

## 6. Baseline proof

Environment note (honest, load-bearing): the fresh worktree initially lacked the
lane-local runtime scaffolding that cl-integration-2 has — `server/schema` symlink,
`schema/core/datatypes/revision-ref.schema.yaml`, and 12 lane-excluded server/src files
(materialBinding.ts, materialRefFields.ts, clarificationLoop.ts, AuthoringGuard.ts,
BypassAudit.ts, RunStartGateService.ts, etc., excluded via core.excludesFile
`/home/brad/.hermes/cl/lanes/2/lane-exclude-a6fix-l2t0430`). The first two baseline runs
were contaminated (336/263 failing files; typecheck 25-31 TS2307 errors) by that plus a
broken npm install (ajv missing meta/validation.json). Repaired: `npm ci` (healthy ajv),
symlink + scaffolding restored from cl-integration-2 — ALL git-ignored (verified via
git check-ignore), so NONE of it is in the commit. After repair the typecheck baseline is
EXIT 0, matching the spec §1 claim.

- `npm run typecheck -w server`: baseline EXIT 0 (pre-change, /tmp/l2t2135-typecheck-base4.log)
  and after EXIT 0 (/tmp/l2t2135-typecheck-after.log). Zero new errors.
- Full suite baseline (clean tree, scaffolding restored, changes stashed):
  `Test Files 82 failed | 656 passed | 9 skipped (747)` / `Tests 83 failed | 6200 passed`
  — 82-file failing set recorded at /tmp/l2t2135-baseline6-failfiles.txt.
- Full suite AFTER my changes:
  `Test Files 82 failed | 660 passed | 9 skipped (751)` / `Tests 83 failed | 6239 passed`
  — 82-file failing set at /tmp/l2t2135-after-failfiles.txt.
- `comm -13 baseline after` -> EMPTY: zero NEW failing files. `comm -23` -> EMPTY (no
  flapping). Zero failing tests in owned files (grep of the after-set for "attestation" -> none).
  The +4 passing files / +39 passing tests are exactly my four new suites.

## 7. The sample-receipt-pattern distinction (§7 bait 6) — stated as required

"Reuse the sample-receipt immutability+supersession house pattern" is a trap as literally
worded: sample-receipt's immutability is DECLARATIVE ONLY — `schema/services/sample-receipt.schema.yaml:8`
is schema prose, and `sample-receipt` is NOT in `DEFAULT_CONFIG.appendOnlyKinds`
(config/types.ts), so the store wall never fires for it. The ENFORCEABLE house pattern is:
the `appendOnlyKinds` DATA knob + the generic wall at RecordStoreImpl.ts:273 (update) /
:957 (delete) + schema-side `supersedes` (lab-state.schema.yaml precedent). This item reuses
THAT pattern (attestation added to the knob; no wall copied into a second place) and extends
it declaratively where its semantics are insufficient (correction propagation): `supersedes`
+ `correction` on the SAME kind with lint pairing rules and a content-hash id — no rewrite
engine, no second correction kind (OQ-2 ruling). sample-receipt lint
(`sample-receipt-truth-recorded`) untouched; sample-receipt NOT added to the knob (scope+audit
decision for its own item, stated in the config/types.ts comment).

## 8. OQ rulings honored (binding, §0')

- OQ-1: envelope stores the attestor ref supplied with the accept request; NO bespoke auth
  branch, no authorization table. HONEST OPEN GOVERNANCE GAP: enforcement of WHO may attest
  physical facts is out of this item — candidate: governance/signature machinery
  (schema/governance/signature.schema.yaml exists and is append-only). Flagged for a future item.
- OQ-2: one generic mechanism — kind `attestation` + `supersedes` + `correction`. No
  `material-receiving-correction` kind here; RECV names its own claims vocabulary on top.
- OQ-3: deviation fact = an `attestation` claim with `claimStatus: unknown` + `about` = the
  consumed ref (proven in case5-plus). Zero new kinds. No better existing carrier found
  (searched: no deviation/clarification-grade durable record kind in schema/).
- OQ-4: drafting side declares claimStatus; server NEVER derives or rewrites it (no
  accept-time label validation). Post-ratification candidate: a lint/accept rule validating
  reported-by-other against accountSupplier != attestor — flagged, not built.

## 9. [DEFAULT-PENDING-RATIFICATION] markers

All dependent decisions keep their tags in schema/lint/TS comments: Q2 (artifactKind enum
slot), Q3 (`against` reference-copy pinning), Q4 (supersedes/correction model + content-hash
id + deviation gate — §2c whole subsection tagged), Q5/Q8 (occurredAtStatus triple on claims
AND plate events, attestedAt server-stamp). No tagged default changed during the run; no
section stopped. A veto remains a targeted patch to the tagged section.

## 10. §2e decision record (plate-event / event-graph occurredAt)

- plate-event.schema.yaml: additive optional `occurredAtStatus` + `occurredAt`; `at:`,
  `t_offset`, and the `anyOf [at | t_offset]` are BYTE-UNTOUCHED (bait 7 — proven by the
  byte-stability test and the identical baseline fail set). occurredAt does NOT replace at:.
- Pairing (`occurredAt => status known|approximate`; `status known => occurredAt`) is enforced
  by NEW `schema/workflow/events/plate-event.lint.yaml` rules
  `plate-event-occurred-at-needs-status` / `plate-event-occurred-status-known-needs-occurred-at`
  (business rule as DATA, never a TS branch; the schema stays purely additive so every
  existing graph fixture validates byte-identically). Drafting-layer defaulting
  (known=today) belongs to CHAIN/RECV, never validation.
- event-graph.schema.yaml gets NO fields — its revision-pinning story is the envelope's
  `against` block (stated in the plate-event lint header + schema comment so reviewers see
  the decision). Plate events are editor content, not records: the append-only wall does not
  apply to them; mutating a pinned graph event after acceptance surfaces as a pin mismatch
  at the accept re-check (Q3d).

## 11. Lint rule inventory (all new rule ids; globally unique — LintEngine.addSpec verified)

attestation.lint.yaml: attestation-occurred-known-needs-occurred-at,
attestation-occurred-approximate-needs-approximation, attestation-occurred-unknown-is-terminal,
attestation-supersedes-needs-correction, attestation-correction-needs-supersedes,
attestation-chain-no-proposed-claims, attestation-entity-substitution-needs-deviation-resolution,
attestation-correction-triggers-reevaluation-review (info severity — declared obligation,
never blocks acceptance).
plate-event.lint.yaml: plate-event-occurred-at-needs-status,
plate-event-occurred-status-known-needs-occurred-at.

## 12. Assumptions made

1. Lane-local runtime scaffolding restored from cl-integration-2 (git-ignored; NOT committed)
   — required for ANY server test/typecheck to run in this worktree (see §6).
2. Test-local Ajv alias shim in AttestationSchemas.test.ts for the PRE-EXISTING plate-event
   details-$ref namespace mismatch (datatypes/ vs workflow/events ids; documented in
   PlateEventSchemaContracts.test.ts). Test-only; no schema files changed for it.
3. Deterministic recordId `ATT-<32 hex upper>` satisfies the schema pattern
   `^ATT-[A-Za-z0-9][A-Za-z0-9_-]*$`.
4. The fulfillment re-evaluation hook ships as (a) the info lint finding on every correction
   and (b) `CurrentAssertionView.reevaluationObligations()` — the queryable fact — per §2c;
   the re-evaluation MECHANICS stay with FULFIL.
5. CurrentAssertionView is NOT wired into InventoryShelfHandlers (OQ-3 scope note: one-line
   follow-up only if the orchestrator rules it in scope).
6. Triplet: `.ui.yaml` DEFERRED per spec (no UI surface in this item).

## 13. Live YAML-reload curl proof — ORCHESTRATOR obligation (NOT run by the coder)

Per hard rule (c), the live YAML-reload curl proof (spec §9 last item) is the ORCHESTRATOR's
post-merge obligation — stated verbatim here instead of run:

> YAML reload proof (after stack restart, data repo seeded or factory-boot fixture):
>   curl -s -X POST localhost:3093/api/records ... an attestation fixture with
>   occurredAtStatus unknown -> 2xx; follow-up PUT /records/ATT-... -> 409/4xx carrying
>   'APPEND_ONLY' (curl output in the report)

The lane stack (:3093/:5193) was NOT touched, restarted, or curl-managed by this coder; all
proofs here are in-worktree vitest. tsx --watch does NOT reload schema/lint YAML (lane header
fact) — the orchestrator must restart the lane stack before this proof or the run validates
against the OLD schema.

## 14. Files changed (commit scope — §3 IN-scope only; app/ untouched)

NEW:
- schema/lab/attestation.schema.yaml
- schema/lab/attestation.lint.yaml
- schema/workflow/events/plate-event.lint.yaml
- server/src/attestation/AttestationAcceptService.ts
- server/src/attestation/CurrentAssertionView.ts
- server/src/attestation/AttestationAcceptService.test.ts
- server/src/attestation/AttestationCase5.test.ts
- server/src/schema/AttestationSchemas.test.ts
- server/src/store/AppendOnlyWall.attestation.test.ts
MODIFIED (minimal):
- schema/workflow/events/plate-event.schema.yaml (additive optional fields + decision comments)
- server/src/config/types.ts (appendOnlyKinds += 'attestation', one data entry + comment)
- .hermes/plans/MATRES-ATTEST-report.l2t2135-coder1.md (this report)

## 15. Gates

Schema+server item: NO browser gate by spec (MATRES-SHELF precedent; UI labels gate later at
CHAIN). Reviewer bait self-audit: (1) conditional spread everywhere, no `field: undefined`;
(2) YAML-reload trap acknowledged (§13); (3) enums exact (asserted in test); (4) no kind-string
branch (grep-verified); (5) no Date.now()/randomUUID in id paths (grep-verified); (6)
sample-receipt distinction stated (§7); (7) at:/t_offset byte-stable (test + baseline parity);
(8) case5-1 asserts stored contentHash equality; (9) reviewHash check precedes early return
(line pair cited in code comments).
