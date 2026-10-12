# SPINE-6 report — STOPPED at claim (D4 addendum unimplementable as written)

Worker: cl-coder, lane 2, dispatch token l2t2230.
Worktree: /mnt/vast/home/brad/git/wt/SPINE-6-lane2-l2t2230 (branch spine-6-lane2-l2t2230, base c74c5214 = SPINE-5 merge tip).
Status: **STOPPED per spec §12 / §1 stop-and-report discipline. ZERO goldens written, ZERO commits, ZERO tracked-file edits.**
The stop trigger is the BINDING D4 addendum on fixture 1 (orch l2t2050): its stated production
reachability premise is FALSE against the merged code at my base. Expressing fixture 1 as
specified would require a product-code change (§12: "Need one => STOP + report with the precise
change request"). I did not spec-stretch, did not fake the seam, and did not write any golden.

---

## §10 first targeted check — PASSED (claim gate met)

`grep -n "needs-clarification" server/src/compiler/pipeline/CompileContracts.ts` at c74c5214:

```
81: * SPINE-4 (OQ1 ruling (a)): 'needs-clarification' is machine-distinguishable
87:export type CompileOutcome = 'complete' | 'gap' | 'error' | 'needs-clarification';
90: * Outcomes the CHATBOT pipeline can produce. 'needs-clarification' is the
97:export type ChatbotCompileOutcome = Exclude<CompileOutcome, 'needs-clarification'>;
```

Claim-time suite capture (from <wt>/server):
`npx vitest run src/compiler/scientistIntent src/api/handlers/IntentCompileFromPromptHandlers.test.ts src/compiler/resolution`
=> **12 files passed / 151 tests passed, 0 failed.** The SPINE-4/5 merges left the seams standing.

## §1 claim-time name-and-read table (ACTUAL merged shapes vs spec SPEC-SHAPE)

| # | File | ACTUAL at c74c5214 | vs spec SPEC-SHAPE |
|---|------|--------------------|--------------------|
| 1 | CompileContracts.ts :87 | `CompileOutcome = 'complete' \| 'gap' \| 'error' \| 'needs-clarification'`; `ChatbotCompileOutcome = Exclude<CompileOutcome,'needs-clarification'>` (:97) | MATCHES (OQ1(a) spelling shipped) |
| 2 | compileScientistIntent.ts | `ScientistIntentCompileResult` = {terminalArtifacts, normalized, outcome, diagnostics, **clarifications: ScientistIntentUnresolvedFact[]**} (required field, empty when nothing unresolved); bar path (:236-252) reads clarifications from the `unresolved_arguments` diagnostic details, replaces gaps (bar gaps = []), outcome forced 'needs-clarification' | MATCHES (structured clarifications present, gaps replaced on the bar) |
| 3 | resolve_nouns pass + pipeline YAML | pass id `resolve_nouns`, output slot `resolve_nouns` = {bindings, resolvedByLabel, clarifications, failures, blocked}; pipeline has **17 passes** (16 + resolve_nouns); resolve_roles :67 depends_on includes resolve_nouns; zero-artifact on bar confirmed in compileScientistIntent bar assembly | MATCHES |
| 4 | Route contract (IntentCompileFromPromptHandlers.ts header + send sites) | 200 complete/gap (additive clarifications only when gap carries them); 422 NEEDS_CLARIFICATION {error, outcome, clarifications verbatim, localMacro held, terminalArtifacts zero-artifact}, NO axes; 502 MALFORMED_MODEL_OUTPUT {error, message}, NO outcome/clarifications/localMacro/terminalArtifacts; 500 INTENT_COMPILE_FAILED after parsed intent; 500 INTENT_COMPILE_PROMPT_FAILED catch-all; 400 PROTOCOL_TEXT_REQUIRED. Classification origin-based (driver-thrown ScientistIntentValidationError vs result object) | MATCHES SPINE-5 promoted rulings exactly |
| 5 | IntentCompileFromPromptHandlers.test.ts | 11 tests (SPINE-5 extended from 4); stubLlm tool-routing idiom; mockStore write spies; ONE vi.mock — the InferenceClient FACTORY only (settings tests); zero vi.mock of parse/normalize/compile/vocabulary/pipeline/resolution | MATCHES; copy-idiom plan stands |
| 6 | Rule files | vocabulary 808 ln (version 1); scientist-intent.schema.yaml 216 ln; scientist-intent-compile.yaml 99 ln / 17 passes. sha256: vocab 6c5e397c27ee247f…, schema 787eff7f9621bea8…, pipeline b47eee0c3bd0f4f3… | versions pinned for manifest (manifest never blessed — item stopped) |

SPINE-5 OQ2 gap-reachability audit (cited, not re-decided): the route test
`intent-compile-api.gap-additive` pins outcome 'gap' reachable post-SPINE-4 with clarifications
key ABSENT on the 200 body. No 7th clarification case needed.

## §9 claim-time baselines (captured on MY base c74c5214, before any commit)

1. **Server tsc message-normalized SET**: 26 error-lines / 6 files
   (RecordStoreImpl 11, AgentOrchestrator 8, AuthoringGuard 3, ProtocolIntakeHandlers 2,
   bootstrapAdmin 1, RecordHandlers 1). File `/tmp/l2t2230-tsc-server.txt` sha256
   `924c18bd566d539571f6bba7b4b480cffdf3bf82383200f85b893b22d52b9e41` — **byte-identical to the
   composer's trunk capture** (spec §8 reference). Note: the dispatch contract's "reference
   15 msgs/6 files per orch l2t2110" does NOT match either the spec's own §8 reference (26/6) or
   my measurement (26/6, same sha). SET identity vs the spec's pinned file holds; the "15" figure
   is flagged for the orchestrator as a contract-text discrepancy (likely a grep-pipeline variant).
2. **src/ai failing-FILE SET**: 10 files / 21 failed tests (74 files passed) — SET identical to
   carried ref. File `/tmp/l2t2230-aifail-files.txt` sha256 `d730687af087d9e4…`.
3. **Combined targeted suite** (route×3 + scientistIntent + resolution + protocolIntent):
   **20 files / 188 tests, ALL green, 0 failing files** (`/tmp/l2t2230-combined-failfiles.txt`
   empty). Carried ref 14/136 superseded by measurement (trunk moved with SPINE-4/5 merges).
4. **Compiler-scope resolution fail-file set**: `npx vitest run src/compiler` => **17 failing
   files** — MATCHES the adv-D4-corrected figure (17 at trunk tip; stale 13/29 retired). Full
   file list captured `/tmp/l2t2230-compiler-failfiles.txt` (fixture-runner/pipeline legacy set,
   consistent with AS-LANE2-PBCH4B-LEGACY-RUN-FIXTURE-ROOTCAUSE).
5. **App tsc**: 34 error-lines carried pin (47-out/34-err shape confirmed: 34 errors; my
   file-line grouping shows 28 distinct files — carried pin's "24" is against the older
   lane-synced file set; app diff is EMPTY so the pin is never exercised).
   `/tmp/l2t2230-tsc-app.txt` sha256 `96293be83b3f083d…`.
6. **Config**: config.yaml untracked (git ls-files verified), `activeProfile: qwen3.8-thunderbeast`
   :53, profile resolves to baseUrl http://thunderbeast:8080/v1 — §6 live smoke WOULD resolve
   (not reached; item stopped earlier).

## THE BLOCKER — D4 addendum fixture 1 is unimplementable through the REAL route at c74c5214

The addendum (spec §4.2 case 1) asserts: "SPINE-3 emits binding.addresses only when the role's
in-band candidate set is exactly 1 — multi-well clarifies at resolve_nouns, so **single-well is
the only reachable production path**", and requires fixture 1 to bind a role whose single-well
address "comes from the real engine" through the REAL route.

First-hand probes at c74c5214 (script `server/tmp/l2t2230-d4-probe.mts`, sha256
`042b68e56205a15257e8f66f87d569c24f76720040ebaa464cbb0d3bd8d7f5cb`, git-IGNORED tmp dir, run via
`npx tsx` from <wt>/server — full transcript below) show the premise is false on THREE
independent axes:

**Probe A — the wire schema forbids the string shape the engine requires.**
`resolutionEngine.ts:246` builds a ResolutionRequest for a wells-kind contract ONLY when
`typeof raw === 'string'`; but `schema/workflow/scientist-intent.schema.yaml:88-91/:97-100`
declares `sourceWells`/`targetWells` as `type: array` (additionalProperties:false). A string
`sourceWells: control_well` is REJECTED by the production Ajv parse:
`{"path":"/actions/0/sourceWells","message":"Expected type: array"}`.
=> A schema-valid document can NEVER feed a wells label to the engine.

**Probe B — the array shape (schema-valid) is invisible to the engine.**
`{action: transfer, source: plate, target: plate, sourceWells: [control_well]}` through the REAL
resolve_nouns pass: `resolvedByLabel` = {} (no wells binding attempted at all); the only
clarifications are the resolvable source/target args. The engine's doc-level door skips arrays.

**Probe C — the seam machinery works ONLY when the parse is bypassed.**
Injecting a string `sourceWells: 'control_well'` straight into the pass (bypassing
parseScientistIntent) DOES produce the engine binding
`{label: control_well, curie: local:well:A12, addresses: ['A12']}` — proving the engine arm
exists but is unreachable through the route's parse.

**Probe D — no production pass emits `details.role` on the scientist-intent pipeline.**
resolve_roles reads `details?.role` (ChatbotCompilePasses.ts:2391), but grep across the whole
scientist-intent chain (normalizeScientistIntent, all ~25 verb expanders in
compiler/biology/verbs/, ProtocolIntentLowering/PatternExpanders/StatePlanner) shows NO pass
writes `details.role` (the only `role` fields are labware-resource source/target roles, never
event details). Full compile of the schema-valid array doc: outcome needs-clarification,
`any event carries details.role? false`. Even if a wells binding existed, resolve_roles would
never see a matching role to consume.

**Corroborating absence checks:**
- `levelFor` (EngineDeps, "SPINE-4 supplies via deps.levelFor") is wired NOWHERE in product
  code (grep: only types.ts + resolutionEngine.ts; resolveNounsPass.ts never passes it; EXIT 1).
  The engine's wantLevel/level-mismatch arm — the ONLY machinery for a material-level-mismatch
  clarification (the nounResolution.test.ts:215 unit leg injects `wantLevel` by hand) — is
  unreachable through the route.
- The shipped vocabulary declares `required: true` on exactly 2 args, both `kind: quantity`
  (serial_dilution.factor/points); NO wells/resolvable arg is required. The
  missing-address golden's declared-required sweep (MISSING_REQUIRED_ARGUMENT_REASON) is only
  reachable via the `vocab-required-flip` FIXTURE vocabulary copy (resolveNounsPass.test.ts:151-177
  pins it exactly there). Through the shipped vocabulary the sweep can only fire on
  serial_dilution.factor/points — and a serial_dilution with missing factor/points lands on the
  route's 500 INTENT_COMPILE_FAILED arm (route test `intent-compile-api.compile-server-error`
  pins the sibling shape), not 422.

**Consequence for the acceptance list:** of the six goldens, THREE cannot be expressed through
the existing seams at c74c5214 without product-code changes:
- fixture 1's D4 authoritative-wells leg (addendum (i)-(iii)) — blocked by Probes A/B/D;
- fixture 5 material-level-mismatch "through the FULL path, not just the unit level" — blocked
  by the unwired levelFor seam (and would additionally collide with
  AS-LANE2-SPINE3-N1-VENDOR-MATERIAL-STRICTNESS, OPEN, if routed through vendor-kind terms);
- fixture 6 missing-address "declarative required-address constraint through the route" —
  blocked by the shipped vocabulary declaring no required address arg (expressible only via a
  fixture vocabulary injection, which the spec's §4.1 "REAL shipped vocabulary" criterion
  reserves for the default singleton path).

Per spec §3 ("If a golden cannot be expressed through the existing seams … that is
STOP-AND-REPORT (a product change request), not scope") and §12 (zero product-code edits),
this is a §1(c)/(d)-class stop: the goldens would have to pin a harness that bypasses the real
parse (faking the seam — bait §11.2 "the golden blessed the harness, not the product", the exact
failure mode the mutation leg exists to catch), or the product must change.

## Precise change request (for orchestrator/architect ruling)

One of:
- **(R1) Wells-label widening (product)**: accept a single string in `sourceWells`/`targetWells`
  (schema `oneOf: [array, string]` + parse normalization to array + engine doc-door accepting a
  scalar wells label), making the wells contract reachable through the real parse. Touches
  schema/workflow (forbidden to this item) + parseScientistIntent + resolutionEngine.
- **(R2) Role-carrying lowering (product)**: make normalizeScientistIntent/verb expanders carry
  resolved wells bindings into event `details.role` (or a role slot resolve_roles consumes), so
  the authoritative-wells seam has a production producer. Touches compiler product files.
- **(R3) Wire `levelFor` (product)**: supply the (verb, argument) -> MaterialLevel seam in
  resolveNounsPass registration (SPINE-4 spec intended it; it never landed), making the
  material-level leg route-reachable.
- **(R4) Re-scope SPINE-6 acceptance (spec)**: drop/replace the three blocked legs — e.g.
  fixture 1 pins the resolve_nouns resolvedByLabel identity seam (recordIds/addresses present in
  the golden via the spine/hint adapters, which ARE reachable) instead of the resolve_roles
  authoritative branch; fixture 5 becomes an ambiguous-material variant or a level-mismatch
  clarification reachable via spine candidate levels without wantLevel; fixture 6 uses the
  serial_dilution factor/points required-quantity sweep through the route (422 with
  missing-required-argument clarifications — verify reachability first) or a fixture-vocabulary
  injection ruling. AS-LANE2-SPINE4-D4-ROLES-SEAM-COVERAGE then stays OPEN (its clearance was
  riding this addendum) and needs a new home.

My recommendation: **(R4) with (R1) as the follow-on product item** — R4 keeps SPINE-6 honest
(goldens pin what the real route can actually do today), R1/R2/R3 are separate scoped product
items each with their own spec/tests. Ruling owner: orchestrator + architect (domain contract).

## What was completed (no work lost)

- §10 first check executed and PASSED (grep + 12/12, 151/151 green).
- §1 name-and-read list executed in order (all six entries; table above; actual merged spellings
  recorded; SPEC-SHAPE deltas: none material on the response contract).
- §9 baselines re-measured as sets on my base and captured:
  /tmp/l2t2230-tsc-server.txt (26/6, sha 924c18bd… — identical to spec §8 reference),
  /tmp/l2t2230-aifail-files.txt (10 files), /tmp/l2t2230-combined-failfiles.txt (empty, 20/188
  green), /tmp/l2t2230-compiler-failfiles.txt (17 files — adv D4 figure confirmed),
  /tmp/l2t2230-tsc-app.txt (34 err-lines).
- Bootstrap verified (6 symlinks + server/schema + config.yaml md5-consistent; config resolves an
  active profile — §1(e) NOT triggered).
- D4 reachability probes executed with retained artifact (server/tmp/l2t2230-d4-probe.mts,
  git-ignored) — probe transcript:

```
A: string sourceWells REJECTED by parse: [{"path":"/actions/0/sourceWells","message":"Expected type: array","keyword":"type","params":{"type":"array"}}]
B: array sourceWells through real pass => bindings: [{severity error, code unresolved_arguments, "resolve_nouns: 2 argument(s) unresolved — compilation barred", clarifications: plate/plate unknown-noun}]
B: resolvedByLabel keys: []
C: string label straight into pass => bindings: [{verb transfer, argument sourceWells, label control_well, curie local:well:A12, addresses ["A12"], tier 1, confidence 1}]
D: outcome: needs-clarification; events: []; any event carries details.role? false
```

- Ownership state: `git -c core.fileMode=false status --porcelain -uall | grep -v '^??'` => EMPTY;
  zero commits made; no tracked file touched; no golden/manifest/script written; manifest NOT
  blessed (spec §11.9: blessed once on claim base — blessing a manifest for a spec whose three
  acceptance legs are unimplementable would itself be a defect).

## Resume condition

Orchestrator ruling on R1-R4 (with architect on the wells-contract semantics if R1/R2). On
ruling, re-dispatch SPINE-6 on a fresh or this worktree at the same base; the §1/§9/§10 evidence
above is reusable as-is. Next check after ruling: re-run the probe script against the ruling's
shape to confirm the chosen fixture legs are route-reachable BEFORE writing goldens.

## Still possible right now (if orchestrator prefers partial delivery)

Fixtures 2 (labware-hint-regression), 3 (ambiguous-material), and 4 (unknown-local-term) ARE
expressible through the existing seams (spine/hint adapters, engine clarify arms, verbatim
reason passthrough) and the manifest + repro script + live smoke machinery is unblocked. I did
NOT proceed with a partial delivery because the D4 addendum is BINDING on fixture 1 and the
manifest is blessed ONCE — a partial bless onto a spec pending a ruling invites silent
re-bless churn (§11.9). Awaiting orchestrator instruction.

SPINE6_STOPPED_L2T2230_D4_UNREACHABLE
