# FAME-7 OQ-1+OQ-2+OQ-3+OQ-4 RULED

Author: architect (read-only on all git trees except this file). Date: 2026-11-02.
Spec draft read in full: `.hermes/plans/2026-11-02_fame-7-spec-draft-l1t0210.md` (§11 OQ-1..4),
composed at trunk `01ca9005`, valid at `002bb744`; trunk verified first-hand this session at
`15a46a9d` ("lane1 243RD late: FAME-6 S1 coder LIVE ... architect routed OQ-1..4", 2026-11-02 02:23 -0500).
Grounding re-read in person at this SHA:
- `server/src/analysis/artifactPromotion.ts:51-115` (idempotent-when-linked :51-58; mint writes bytes
  :70-79, DREF w/ contentHash :81-100, artifact UPDATE adding ONLY `dataReferenceRef` :102-113);
- `server/src/store/RecordStoreImpl.ts:273-278` (append-only wall = `record-revision|signature|audit-event`
  + config `appendOnlyKinds` — `analysis-output-artifact` is NOT wall-covered; prior bytes survive in the
  data-repo git commit per write);
- `server/src/analysis/analysisService.ts:226-248` (createRun: zero validation, `inputs: input.inputs ?? {}` :238);
- `server/src/analysis/analysisRunner.ts:144-219` (provisionInputs accepts `analysis-output-artifact`
  incl. inline arm :193-196 and `data-reference` arm :200+ with GC-5 DATA_HASH_MISMATCH drift gate);
- `schema/knowledge/analysis-revision.schema.yaml:60-73` (inputs items `additionalProperties:false`, 4 keys);
- `config/drafting/analysis-composition.yaml:28-31` (`inputKinds: [data-reference, analysis-output-artifact]`,
  per-call loaded, never process-cached — readers today: `server/src/drafts/analysisCompile.ts:119`,
  `server/src/ai/analysisReferenceGrounding.ts:50`);
- `grep -rn 'acceptsKinds|acceptedArtifactNames'` over the repo = **0 code hits** (collision check re-run;
  only the spec draft itself).
Orch-verified live facts relied on (read live @02:20, re-pin at dispatch): FAME-5 head ANREV-000017;
AOUT-000111 (`standard_summary`, producer ANR-000060 succeeded) inlineValue-only, `dataReferenceRef` null;
FAME-6 S1 (renderer `artifact-table`, door D) in coding NOW on `wt/fame-6-lane1-l1t0150`, its report
successor revision lands AFTER FAME-6 merge + restart.
Precedent followed: `2026-11-01_fame-6-oq1-oq2-oq3-decision.md` (door D, bindings-as-data convention).

---

## RULING OQ-1 = OPTION A — PROMOTE-ONCE-WITH-RECEIPTS: run `POST /api/analysis-artifacts/AOUT-000111/promote` exactly ONCE; the additive `dataReferenceRef` link IS the declared, receipted freeze step; bind the minted DREF ref on the run body.

Rationale (one line): it is the shipped door (idempotent after the first call, artifactPromotion.ts:51-58),
the mutation is ONE additive key with zero content change, it yields a `contentHash` the immutability leg
can actually verify, and it is the only option that satisfies the verified-by literal "request body
CONTAINS the DREF"; option B evades the acceptance wording, option C is a platform change with the
largest blast radius and is RULED REJECTED for this campaign.

Honest immutability model (binding wording for the report — bait #4's answer):
"provably immutable" here means **the artifact's RESULT CONTENT is frozen** (content-digest-equal
before/after) **and the producer run is byte-untouched**; the artifact RECORD additionally carries one
promote-added link key, which is itself a git-committed, receipted event — the system NEVER claims the
envelope had zero writes, and the coder must not either.

Binding instructions for the coder (exact receipts, all under
`~/.hermes/cl/receipts/FAME-7/<ts>/immutability/`):
1. PRE receipt, BEFORE the promote call: full GET of AOUT-000111 and ANR-000060 saved verbatim; from
   the AOUT GET record (a) `meta.contentSha` + `meta.commitSha`, (b) the sorted payload KEY LIST
   (must show no `dataReferenceRef`), (c) `sha256(JSON.stringify(payload.inlineValue))` — the RESULT-CONTENT
   digest. Same digest method must be recomputable from the saved JSON (state the extraction command).
2. The promote call ONCE: request + response saved; response must show `created:true`. A second call
   (if made) must show `created:false` and zero store change — optional idempotency leg.
3. POST receipt: full GET of AOUT-000111 again. The payload key diff vs step 1 must be EXACTLY
   `+dataReferenceRef` — no other key added, removed, or changed; `dataKind`, `schema`, `name`,
   `runRef`, `sourceRelations`, `provenance` byte-identical.
4. Digests re-verified UNCHANGED (the heart of the ruling):
   - `sha256(JSON.stringify(inlineValue))` post == pre (RESULT CONTENT unchanged);
   - ANR-000060 `meta.contentSha` post == pre, byte-identical (producer run untouched — promote
     touches only the artifact + mints the DREF; never re-execute ANR-000060);
   - the DREF's `contentHash` == sha256 of the stored bytes re-read via
     `GET /api/analysis-artifacts/AOUT-000111/content` (the DREF self-proves its bytes).
5. The run body binds the DREF: `inputs.standard_summary = {kind:'record', id:'<DREF minted>',
   type:'data-reference'}` — bait #3 stands: the run-input value is the ref object, never a
   `dataReferenceRef` key on the run record. The entryScript consumes this slot via the SDK's
   streamed-file/read_rows path (the DREF arm of provisionInputs, analysisRunner.ts:200+; the
   inline-dict trap ctx.py:64-70 applies to the ARTIFACT arm only, so the butter-side inline-artifact
   slot keeps FAME-5's inline discipline). One-line mapping note in the report is required.
6. `artifactPromotion.ts` stays OUT of scope — the shipped semantics are consumed as-is. No
   `updateRecord` on the artifact by the coder; the promote handler is the only writer.

Orchestrator obligations: none beyond the dispatch pin — re-read AOUT-000111's
`dataReferenceRef: null` state at dispatch (if a leg already promoted it, the pre-receipt is the
CURRENT state and step 2's call is `created:false`; that is fine, receipt it, do not re-mint).

---

## RULING OQ-2 = PARENT = THE LIVE HEAD AT DISPATCH, READ LIVE — the coder (and the spec body) NEVER hardcodes an ANREV id; the orchestrator names and receipts it in the dispatch note.

Rationale (one line): append-only lineage says a new revision parents the head that exists when it is
minted, and the head's identity is a fact about the live store, not a fact about this spec — hardcoding
ANREV-000017 would be exactly the kind of value the system must not depend on; FAME-6's report successor
(its door-D revision) is expected to BE that head, which folds the draft's recommendation into the rule
without freezing an id.

Binding instructions:
1. At dispatch, BEFORE any write: `GET /api/records?kind=analysis-revision` (or list-and-filter), take
   the revision with the MAXIMUM numeric ANREV suffix whose GET returns 200 — that is the parent. Save
   the GET of that exact record as a receipt (id, parentRevisionRef, `payload.inputs` visible).
2. The orchestrator's dispatch note must state the pinned parent id (expected: FAME-6's report
   successor, which will exist post-merge+restart per its report) and the pinned engine ref (the
   ANREV-000017 engine, ENG-L1G-6a298b per the draft — re-read from the live record, never from this
   file). If the max-id revision is NOT FAME-6's report successor, that is fine — the rule stands,
   the note records the actual.
3. `parentRevisionRef = {kind:'record', id:'<pinned>', type:'analysis-revision'}` in the W2
   revision-create body; the report cites the receipt path. A dispatch that finds FAME-6's successor
   absent (not yet merged/minted) is the dependency gate (§0): STOP, BLOCKED — do not parent around it
   back to ANREV-000017.
4. Lineage continuity is the WHY (the comparison report renders what the report head's family
   produces); the coder copies the pinned id from the dispatch note, never from this file or the draft.

Orchestrator obligations: the pin is part of the dispatch contract (§0 gate + W2(d) restart gate
unchanged: schemas startup-cached, server.ts:370-376 / SchemaRegistry.ts:73; a revision-create 400 on
the new keys BEFORE the restart is the gate, record 400-then-201 as two receipts, bait #7).

---

## RULING OQ-3 = RATIFY `acceptsKinds` + `acceptedArtifactNames`, AND A LEGACY REVISION WITH NO `inputs` DECLARATION IS SKIPPED — a NAMED, documented, unit-tested skip, never a silent one.

Rationale (one line): both names are generic, kebab-camel per the file's existing style, carry zero
domain nouns (the domain string `standard_summary` lives in the revision YAML's VALUES, never in TS),
and collide with nothing repo-wide (grep re-run this session); rejecting legacy revisions would break
every shipped inputless flow (ANREV-GC10A/B/C, DNA/demo revisions, the AI-drafting surface) the moment
validation lands — a regression blast radius outside approved scope — while the skip loses no FAME-7
guarantee because every FAME-7-relevant revision DECLARES.

Binding instructions:
1. Exact keys added to `schema/knowledge/analysis-revision.schema.yaml` inputs items (70-73 block) and
   mirrored in `CreateRevisionInput.inputs` (analysisService.ts:82-88), SAME commit, `additionalProperties:false`
   stays, comment cites FAME-7 + this file:
   - `acceptsKinds: { type: array, items: { type: string } }` — record `type` strings this slot admits;
     absent ⇒ the global default (OQ-4). No enum IN the schema (enums here would restart-gate policy;
     admissibility is validated against the config, not the shape).
   - `acceptedArtifactNames: { type: array, items: { type: string } }` — the producer artifact payload's
     own `name` field values this slot accepts; absent ⇒ no name gate.
   - `name`, `description`, `dataKind` (12-kind enum), `required` are unchanged. No other new key.
   One term, one entity: the artifact payload's field is `name`; the declaration key is
   `acceptedArtifactNames`; nothing in this item renames either.
2. Legacy skip rule — the ONE answer, exact semantics for `declaredInputs.ts`:
   - `revision.payload.inputs` ABSENT (key not present) ⇒ **skip input validation entirely** (any body,
     legacy flows byte-identical). Documented at module top: "A revision that declares NO inputs array
     carries no contract; validating it would invent a contract history never wrote. This skip is named
     here and pinned by test `skips validation for a revision with no inputs declaration`." That is the
     GC-5 bait-#2 precedent (OPTIONAL keeps legacy revisions valid with zero backfill).
   - `inputs` PRESENT (including an EMPTY array) ⇒ validate fully: body key not declared ⇒
     `INPUT_UNDECLARED`; declared `required:true` absent from body ⇒ `INPUT_REQUIRED_MISSING`; an empty
     declaration array means the contract is "no inputs" — any body input is `INPUT_UNDECLARED`.
     Absent vs empty-array is a real semantic distinction in the record; do not collapse it.
   - The skip is invisible in the API surface (a 201 exactly as today) and visible ONLY in the named
     module comment + the named test. No new rejection token is minted for legacy revisions.
3. The W4 rejection set stands exactly as drafted (`INPUT_UNDECLARED`, `INPUT_REQUIRED_MISSING`,
   `INPUT_NOT_RECORD_REF`, `INPUT_KIND_NOT_ACCEPTED`, `INPUT_UNRESOLVABLE`,
   `INPUT_ARTIFACT_NAME_MISMATCH`, `INPUT_DATAKIND_INCOMPATIBLE`); the first Check
   (`rejects an undeclared input name`) runs against a DECLARING revision, unchanged.
4. R8 stays absolute: the strings `standard_summary` / `analyte_summary` appear in the W2 revision
   YAML VALUES and test fixtures only, never as TS constants or branches (bait #12 unchanged).

---

## RULING OQ-4 = OPTION A — THE GLOBAL ADMISSIBLE-KIND SET LIVES WHERE IT ALREADY LIVES: `config/drafting/analysis-composition.yaml` `inputKinds:` (:30), read PER CALL by the validator as the fallback when a slot declares no `acceptsKinds`. It is NOT copied, NOT duplicated, NOT enum'd into the schema.

Rationale (one line): the set is already shipped policy DATA with a load-per-call, presence-checked
precedent (the file's own :1-4 comment; readers analysisCompile.ts:119, analysisReferenceGrounding.ts:50)
and it matches the runner's accepted arms exactly (analysisRunner.ts:144-219); a schema enum would
duplicate the SAME set in a second home AND restart-gate what is a data edit — the opposite of
"things that can be data should be data".

Binding instructions:
1. `server/src/analysis/declaredInputs.ts` loads the YAML per call via a `new URL('../../../config/drafting/analysis-composition.yaml', import.meta.url)`
   read (copy the analysisCompile.ts:119 pattern), reads `inputKinds` as a `string[]`. NO process cache.
   NO new config file, NO new key — `inputKinds` at :30 is the entity, reused, not re-founded.
2. Precedence, one rule: slot `acceptsKinds` present ⇒ it IS the gate (no intersection logic); absent ⇒
   the config set is the gate. `ref.type` not in the gate ⇒ `INPUT_KIND_NOT_ACCEPTED` (400), message
   names the gate's values and their source ("declared in
   config/drafting/analysis-composition.yaml inputKinds" — the analysisCompile.ts:323 message style).
3. Failure of the config read (file/key missing) ⇒ a NAMED 500-class rejection
   (`INPUT_POLICY_UNDECLARED`, 500), never an empty-set default (an empty set would silently reject
   everything) and never a hardcoded TS fallback (bait: the system must work if the value is removed —
   it must FAIL NAMED, not silently re-embed).
4. The config file itself gets ZERO diff (its OUT-of-scope clause "unless OQ-4 sends the set there" is
   exercised by REUSE, not edit). The UI's accepted-kind line (W5c) reads the kinds from the DECLARED
   slot when present; for an undeclared slot it may show nothing (the server names the policy in the
   rejection) — the page does not need to load the config.
5. One term check: `inputKinds` (global config policy) vs `acceptsKinds` (per-slot narrowing on the
   revision) are two DIFFERENT entities with two names — permitted; neither renames the other.

---

## Orchestrator obligations (consolidated)

- Dispatch gate: FAME-6 MERGED + `cl-lane-stack.sh 1 restart` + `grep -rn 'artifact-table' app/src schema/` > 0
  (W1). The W2 revision-create and every live leg run only post-restart (schema startup cache).
- Dispatch note pins (live facts, each with a GET receipt path): the parent ANREV id + its GET (OQ-2),
  the engine ref (OQ-2), AOUT-000111 current `dataReferenceRef` state + `meta.contentSha` (OQ-1),
  ANR-000060 `meta.contentSha` (OQ-1).
- The one promote call (OQ-1) is a RECORDS-API write the orchestrator permits inside the FAME-7
  records policy ("read + create + the ONE promote"), and only ONE promote for AOUT-000111 campaign-wide.
- Browser gate: ROUND-TRIP-GATE-1 as the draft §6.2 applies it — the DREF leg is graded on the CAPTURED
  request-body file (`grep '"DREF-'`), paired with the rendered-report screenshot; rejections are
  body+response pairs; the butter arm is the HONEST today-arm (denominator null,
  `UNDEFINED_NO_ELIGIBLE_AREA` rendered as words, never an invented %) — a numeric arm, if run, is a
  SEPARATE declared run with its own params_digest and its own report line (bait #10 unchanged).

## Evidence actually read this session (trunk 15a46a9d)
- .hermes/plans/2026-11-02_fame-7-spec-draft-l1t0210.md (full, incl. §11 OQ-1..4)
- .hermes/plans/2026-11-01_fame-6-oq1-oq2-oq3-decision.md (full — precedent)
- server/src/analysis/artifactPromotion.ts:40-116 (full promote path)
- server/src/analysis/analysisService.ts:222-251 (createRun verbatim)
- server/src/analysis/analysisRunner.ts:140-219 (provisionInputs both arms + GC-5/GC-12 gates)
- server/src/store/RecordStoreImpl.ts:266-283 (append-only wall, exact kind list)
- schema/knowledge/analysis-revision.schema.yaml:40-89 (inputs items, parameterSchema, engineRef OPTIONAL precedent)
- config/drafting/analysis-composition.yaml (full, 40 lines)
- grep: acceptsKinds/acceptedArtifactNames = 0 code hits; analysis-composition readers listed above
- git log -1 at 15a46a9d; clock: 2026-11-02 02:23 -0500

`FAME-7 OQ-1+OQ-2+OQ-3+OQ-4 RULED <this file>` — orchestrator: fold into the spec at promotion.

ENDURANCE: this decision is final for FAME-7 promotion.
