# MATRES-FULFIL — POST-RECV RE-VERIFY AMENDMENT (l2t1510, 2026-10-21 15:30 EDT)

Composer: cl-spec-composer. Target spec: `.hermes/plans/2026-10-21_1030-MATRES-FULFIL-requirement-fulfillment.md`
(canonical, promoted @ l2t1015, composed at trunk b59225b9 / code tip 46c3e4e9 — PRE-RECV).
Re-verified against: `cl/integration-2 @ f6f49d44` (docs tip; CODE tip `6f8fb519` = MATRES-RECV merge,
merge of fix-run `96cfc063`, base 46c3e4e9 ancestor-proven). This amendment satisfies the spec's own
OQ-2 dispatch-time obligation (orch ruling l2t1015: "where merged RECV code deviates, merged code is
authority and the deviation note goes in the dispatch prompt"). Trunk was READ-ONLY throughout; every
git command ran `-c core.fileMode=false`. Every cite below is a FIRST-HAND read this session (no scout).

## (1) VERDICT

**FULFIL POST-RECV RE-VERIFY: READY-WITH-PATCHES**

All deviations are CITE-LEVEL / ID-LEVEL drift caused by the RECV merge (incl. its architect-rulled
fix-run). ZERO deviations change a FULFIL design decision: D1–D9 all stand, OQ-1 stance (a) stands,
OQ-3 ruling (FULFIL-owned home) stands, the §8 file set needs no edits (collision-checked clean
against merged RECV AND against ELIG's in-flight owned set). The patches below are paste-ready
targeted edits to §5 / §7.6 / §10 / §12 — the coder must receive the corrected cites so it does not
"fix" surfaces that are actually fine, and so its rule ids / rule-name references are exact.

## (2) DEVIATION TABLE (spec claim -> merged reality, with patch instruction)

| # | Spec claim (section) | Merged reality @ 6f8fb519 (first-hand file:line) | Patch instruction | Design impact |
|---|---|---|---|---|
| D-1 | §5 bullet 2: "MATRES-RECV — **IN CODER FLIGHT** … server/src/receiving/ module phase still in progress … FULFIL dispatch only legal AFTER the RECV merge" | RECV is **MERGED**: `6f8fb519` (advc c2 accept, orch-verified, 15 files/161 tests, typecheck 0, base 46c3e4e9 ancestor-proven). The dependency gate in `deps: [MATRES-ATTEST, MATRES-RECV]` is **satisfied**. | Replace the whole §5 RECV bullet with the OQ-2 resolution text in section (3) below. | None — gate now open. |
| D-2 | §5 bullet 1 + §12 bait 11: attestation.lint.yaml has "**9 rules**" / "the **nine** `attestation-*` rules" | **8 rules**, both at composition trunk b59225b9 (verified via `git show b59225b9:…`) and on merged tip — this was a miscount at composition, not drift. Ids @ attestation.lint.yaml :27, :48, :71, :97, :115, :133, :158, :193. `attestation-correction-triggers-reevaluation-review` :193 confirmed exactly (info severity, header literally names "FULFIL hook" in its message template :213). | "9"/"nine" -> "8"/"eight" in §5 and §12 bait 11. Line cite :193 stands. | None. |
| D-3 | §5 bullet 1: attestation.schema.yaml "trunk state: claims/assertion/against/supersedes/correction INLINE — the $defs extraction is NOT yet on trunk" | **The full $defs extraction LANDED** (RECV fix-run, D3/OQ-1 sanctioned): `$defs/AttestedAt` schema.yaml:93, `$defs/Against` :103, `$defs/Claim` :125, `$defs/Correction` :205, `$defs/PersonRef` :246, `$defs/AttestationRef` :254 (left UNTOUCHED per its own def), plus NEW additive `$defs/AttestationRefWidened` :262-279 (type `attestation|material-receiving`, id `^(ATT|RECV)-…$` :278-279), declared exactly ONCE and `$ref`'d from envelope.supersedes :82 AND material-receiving.schema.yaml:124. It is NOT the widened-ref-only form — Claim/Correction/AttestedAt/Against all extracted. | §5 bullet 1: strike "INLINE … NOT yet on trunk"; state the merged $defs state with the cites left. ADD a new §12 bait line (see (5) prompt addition P3): **FULFIL must $ref these $defs and NEVER re-declare claim/correction/attestedAt/against vocabulary inline** — RECV's anti-duplication pin (fix-run D3) makes an inline re-declaration the canonical OQ-2/bait-9 violation, now with a merged precedent AND a pinned test. | None (extraction was the plan; §12 bait 9 already forbids the violation). |
| D-4 | §5 bullet 2 + §7.6: RECV's re-evaluation lint rule named "`supersession-triggers-reevaluation-review`" (bare) | Merged id is **`material-receiving-supersession-triggers-reevaluation-review`** @ material-receiving.lint.yaml:**264** (info severity, always-firing-by-construction on `supersedes` exists, message names "FULFIL hook" :286). RECV's file carries 11 rules, all `material-receiving-*` prefixed (:32,:57,:78,:101,:128,:151,:176,:195,:214,:241,:264). | §5 + §7.6: replace the bare id with the exact merged id + cite. FULFIL tests that assert "the receipt correction raises the obligation" should name the rule by the FULL id. | None — mechanism identical (info finding + `assertion.cites` liveness). |
| D-5 | §5 bullet 1: CurrentAssertionView "`ReevaluationObligation` :39-61" | Interface is :45-61 (`export interface ReevaluationObligation` :45, `citingRecordIds` :61); `claimCitesId` reads `assertion.cites` at :105; `reevaluationObligations()` :185-208. NOTE: `git diff b59225b9..HEAD -- server/src/attestation/` is **EMPTY** — every ATTEST cite in the spec (recordIdOf :113, correctionIdentity :95-101, compile :141, accept :172, gate-3 pinned-reads :190-192, cites :105, obligations :185-194/:175-194) was re-verified first-hand and STANDS UNCHANGED. | §5: ":39-61" -> ":45-61". No other ATTEST cite needs touching. | None — the ride is byte-intact. |
| D-6 | §5 bullet 2 pins RECV shapes at branch commits bf599311/25a9522d/2f638fd2 | The merge rode the **fix-run** `96cfc063` per architect ruling (option a), not branch-head 2f638fd2 verbatim. Module shape as merged: `server/src/receiving/` = MaterialReceivingDraft.ts, receivingIdentity.ts (88 lines), + 3 test files. **`MaterialReceivingAcceptService` was DELETED** — helpers relocated to receivingIdentity.ts (`receivingRecordIdOf` :53-62 — same Q4e formula: corrections hash `supersedes+changedFacts+mode` :56-58, envelope hash excludes `attestedAt`/`recordId` :60; `alreadyReceivedDiagnostic` :76-88 routed THROUGH `CurrentAssertionView.currentAssertion`, D4 ruling). Accept-time composition moved to the **adapter `onAccept` hook** (adapters.ts:160-172, `attestedAt = acceptNow`) invoked by FormDraftService.ts:201-202 with the injectable accept clock; ratified "absent-before-accept" (draft carries NO attestedAt, adapters.ts:128-134). | §5 bullet 2: replace commit pins with "merged @ 6f8fb519 (fix-run 96cfc063, ruling a)" + the shape facts in section (3). §7.8: the sentence "NO new draft adapter registration needed beyond the accept service the RECV module already demonstrates" stays TRUE for FULFIL (FULFIL rides `AttestationAcceptService`, which is untouched and was NOT replaced — the deletion was RECV's own dead service), but add the note that the house accept-composition rail is now FormDraftService + adapter `onAccept` (see prompt addition P2). | None for D4/D9 (FULFIL rides ATTEST's rail). Coder must NOT assume any accept-service class in `server/src/receiving/`. |
| D-7 | §7.6: LintEngine "duplicate-id throw :66-68" (also §12 bait 11) | Throw is at **LintEngine.ts:62** (`throw new Error(\`Duplicate rule ID: ${rule.id}\`)` inside the :59-68 registration loop); schemaId filter `getRules` :110-119 confirmed unchanged. | ":66-68" -> ":59-62 (throw :62)". | None — the collision hazard is real, id-unique law holds. |
| D-8 | §7.3: "`appendOnlyKinds` already lists `attestation` — config/types.ts:533" | Merged line is **config/types.ts:535**: `['audit-event','signature','vendor-protocol-candidate','attestation','material-receiving']` (RECV appended `material-receiving`, shifting the line; RECV also got the wall — the appendOnly recurrence defect caught @ l2t1300 was fixed pre-merge). | §7.3: ":533" -> ":535". FULFIL still adds NO list entry (attestation already listed; bait 4 stands). | None. |
| D-9 | §10 harness note: "`MaterialReceivingSchemas.test.ts` exists only on the RECV branch; use the trunk harness" | **It is ON TRUNK** now: `server/src/schema/MaterialReceivingSchemas.test.ts` (304 lines) — the triplet-test precedent the coder can mirror for the add-material detail-payload suite, alongside `AttestationSchemas.test.ts`. | §10: strike the "only on the RECV branch" caveat; both harness precedents are on trunk. | None (improvement: a second in-tree precedent for detail-payload lint tests). |
| D-10 | §5/§7.3: FULFIL consumes receipts "ONLY as generic ref-shaped evidence (`ref.schema.yaml`, `type: material-receiving | attestation`)" | Confirmed expressible: `ref.schema.yaml` `type` is a **free string** (:52-54, description-only examples; NO type enum) — the ref datatype needs NO widening for `material-receiving`/`material-derivation`/`material-instance`/`aliquot` evidence types. The widened SUPERSEDES ref vocabulary is D3's `AttestationRefWidened` (D-3), which FULFIL must NOT extend. PathResolver single-wildcard law (:131-137) and attestation dir + lint dir are byte-unchanged from the composition base (`git diff b59225b9..HEAD` empty for server/src/lint/, server/src/attestation/, schema/lab/attestation.lint.yaml, server/src/materials/, schema/workflow/events/ — so ALL §6 (a)-(f) audit cites, incl. AddMaterialSupport.ts:457/:642/:669/:704 and the status enum :58-60, re-verified STAND). | No text change needed; record the re-verification in the dispatch prompt so the coder skips re-auditing. | None. |

Rule-id collision check for FULFIL's PLANNED ids (grep `id: fulfil` / `id: add-material` across `schema/`
on merged tip): **ZERO existing hits** — the `fulfil-*` and `add-material-*` prefixes are globally free
against the merged 8 `attestation-*` + 11 `material-receiving-*` + `plate-event-*` corpus. The planned
`fulfil-reevaluation-changed-facts-must-vary` (§7.6) and `add-material-requirement-id-unique` (§7.2)
will not trip the LintEngine :62 throw.

## (3) OQ-2 RESOLUTION — paste into spec §5 (replaces the RECV bullet verbatim)

> **MATRES-RECV — MERGED** (`6f8fb519`, fix-run `96cfc063`, architect ruling (a): adapter-level
> accept-time composition; advc c2 accept; orch-verified 15 files/161 tests, typecheck 0). FULFIL
> consumes receipts AS MERGED (merged code is authority; the bf599311/25a9522d/2f638fd2 draft-time
> pins are superseded). Merged receipt shapes FULFIL relies on: record kind `const "material-receiving"`
> (material-receiving.schema.yaml:52); id pattern `^RECV-[A-Za-z0-9][A-Za-z0-9_-]*$` (:56);
> `createdInstanceRef` REQUIRED, typed `kind:record / type:material-instance` (:48, :90-104) — the
> arrival entity FULFIL's fulfilled-by-receipt evidence may name; envelope vocabulary composed by
> `$ref` into attestation.schema.yaml `$defs` — Claim :125 / Correction :205 / AttestedAt :93 /
> Against :103 / **supersedes = `$defs/AttestationRefWidened` :262-279** (declared once, $ref'd at
> :124; type `attestation|material-receiving`) — corrections ride `supersedes` + `correction` with NO
> second envelope, and the receipt-correction id is the same Q4e formula as ATTEST's
> (receivingIdentity.ts:56-58); the receipt re-evaluation info finding is
> **`material-receiving-supersession-triggers-reevaluation-review`**
> (schema/lab/material-receiving.lint.yaml:264, info, "FULFIL hook" in its message :286). FULFIL
> references receipts ONLY as generic ref-shaped evidence (`ref.schema.yaml` `type` is an open string,
> ref.schema.yaml:52-54 — no widening needed) plus the `assertion.cites` contract
> (CurrentAssertionView.ts:105, obligations :185-208); FULFIL reads NO field inside RECV's claim
> payloads. Accept-time `attestedAt` stamping moved to the adapter `onAccept` hook
> (adapters.ts:160-172 via FormDraftService.ts:201-202, injectable clock, absent-before-accept
> ratified); there is NO `MaterialReceivingAcceptService` on trunk (deleted, helpers in
> `server/src/receiving/receivingIdentity.ts`). Case-5 ride confirmed: a receipt correction raises the
> info finding, a fulfillment claim's `assertion.cites = RECV-…` makes the obligation LIVE through
> `reevaluationObligations` — exactly the §7.6/AC-4 mechanism, unchanged.

## (4) COLLISION CHECK vs ELIG (in flight) and merged RECV

ELIG branch `cl/lane2-matres-elig-l2t1445` exists (checked out, worktree `+`), currently **0 commits
ahead of 6f8fb519** (`rev-list --count` = 0 — coder early, no pushes yet), so the collision check runs
against ELIG's promoted-spec owned set (`.hermes/plans/2026-10-20_0230-MATRES-ELIG-acceptability-policy.md`
§files :64-68): `server/src/compiler/resolution/**` (new `eligibility/`, resolutionEngine.ts, types.ts),
`server/src/resolve/ResolveSpine.ts` (only if the D4 hook is needed),
`schema/scientist-intent/scientist-intent-vocabulary.{yaml,schema.yaml,lint.yaml}`,
NEW `schema/scientist-intent/material-eligibility/**`, and ELIG's tests.

FULFIL §8 IN-set vs that: **ZERO overlap.** Line-by-line: `plate-event.add-material.schema.yaml` /
NEW `plate-event.add-material.lint.yaml` — outside ELIG's set (ELIG never touches schema/workflow/events/);
`server/src/materials/requirementId.ts` + `AddMaterialSupport.ts` — outside (ELIG is compiler/resolve);
`server/src/fulfillment/**` — NEW dir, does not exist on trunk (`ls server/src/fulfillment` = none),
outside; `schema/lab/attestation.lint.yaml` additive — ELIG does not list it; ELIG's lint additions ride
scientist-intent-vocabulary.lint.yaml + material-eligibility.lint.yaml, different files. Rule-id global
uniqueness (LintEngine :62): ELIG's ids will be eligibility/material-eligibility/scientist-intent-shaped;
FULFIL's are `fulfil-*`/`add-material-*` — free (grep zero hits). FULFIL §8 OUT already names
`server/src/compiler/**` and `schema/scientist-intent/**` — the fence line is written in the spec.
Merged RECV set (the 28-file merge stat @ 6f8fb519): the only files BOTH RECV and FULFIL would touch is
`schema/lab/attestation.lint.yaml` — RECV is MERGED, so a later additive edit is a normal fast-forward,
no conflict. `schema/lab/attestation.schema.yaml` RECV touched; FULFIL §8 does NOT include it (D4 rides
the loose assertion bag) — **FULFIL must not touch attestation.schema.yaml either** (it needs no $defs
change; if a reviewer sees a diff there, reject — prompt addition P3).
VERDICT: FULFIL must-not-touch list confirmed current; add explicit ELIG-owned-set enumeration to the
dispatch prompt (below) since ELIG is in flight and FULFIL branches AFTER it.

## (5) DISPATCH RECOMMENDATION

Prerequisites: MATRES-ATTEST merged (46c3e4e9, ancestor-proven) — MET. MATRES-RECV merged (6f8fb519,
advc c2 + orch-verified) — MET. Hook-shape verified — MET (ATTEST rail byte-intact: `git diff
b59225b9..HEAD -- server/src/attestation/ server/src/lint/` EMPTY; FormDraftService `onAccept` hook
present @ FormDraftService.ts:201-202, adapters.ts:30 — FULFIL rides ATTEST's rail, the hook is RECV's
composition mechanism, not FULFIL's dependency).

Earliest LEGAL dispatch base: trunk >= `6f8fb519` (spec §11's "NOT 46c3e4e9" note now reads: base =
merged tip). **RECOMMENDATION: do NOT dispatch now — branch FULFIL off the POST-ELIG tip** once ELIG
merges, keeping the fleet queue serial (ELIG coder is live on the fleet lock; FULFIL's §8 explicitly
fences ELIG's files, and branching post-ELIG removes any rebase risk on the shared
`schema/scientist-intent` fence line and any LintEngine global-id surprise until ELIG's ids are on
trunk where they can be grepped). If the orchestrator ever needs to dispatch at pre-ELIG tip legally,
the coder must re-run the §8-OUT grep fence before its first commit.

Coder prompt additions (verbatim, on top of §11 which stands):
- P1 (superseded cites): apply amendment deviations D-1..D-10 — corrected cites are: 8 attestation
  lint rules (:193 stands), `material-receiving-supersession-triggers-reevaluation-review`
  (material-receiving.lint.yaml:264), LintEngine dup-id throw :62, appendOnlyKinds config/types.ts:535,
  ReevaluationObligation :45-61, MaterialReceivingSchemas.test.ts ON trunk as harness precedent. The
  ATTEST surfaces and ALL §6 audit cites were re-verified byte-unchanged since composition — do not
  re-audit them, re-pin them.
- P2 (rail note): the merged accept-composition precedent is FormDraftService + adapter `onAccept`
  (adapters.ts:160) — FULFIL nonetheless rides `AttestationAcceptService` unchanged (D4/D9); there is
  no accept-service class in `server/src/receiving/` to reach for.
- P3 (schema-fence): FULFIL edits `schema/lab/attestation.lint.yaml` ADDITIVELY (rule ids `fulfil-*`,
  verified collision-free today) and touches `schema/lab/attestation.schema.yaml` ZERO — the merged
  `$defs` (Claim :125 / Correction :205 / AttestedAt :93 / Against :103 / AttestationRefWidened :262)
  are $ref'd, never re-declared (RECV's fix-run D3 anti-duplication pin is the merged precedent).
  Out-of-scope fence also covers ELIG's live set: `server/src/compiler/resolution/**`,
  `server/src/resolve/**`, `schema/scientist-intent/**`.
- P4 (OQ-1 stands): merged `recordIdOf` is UNCHANGED — corrections still hash
  (supersedes + changedFacts + claimTarget.mode) (AttestationAcceptService.ts:95-101, :113-117), and
  RECV's receipt-correction id mirrors it (receivingIdentity.ts:56-58), so the evidence-only-collision
  wart now exists on BOTH rails. OQ-1 stance (a) is RE-AFFIRMED: FULFIL-side
  `fulfil-reevaluation-changed-facts-must-vary` protection ONLY; the formula is ratified behavior
  (l2t1015 ruling), queued-for-Brad observation unchanged, not coder discretion.
- P5 (OQ-3 stands): ELIG is now IN FLIGHT, not un-dispatched — the ruling (FULFIL-owned compatibility
  home, no unification with material-eligibility) is re-confirmed; the coder must treat ELIG's files as
  third-party territory even mid-merge.

Open questions not resolvable locally: NONE beyond the above (OQ-1/OQ-2/OQ-3 all closed by
re-verification; OQ-2 is closed BY THIS DOCUMENT).

FULFIL-REVERIFY DONE
