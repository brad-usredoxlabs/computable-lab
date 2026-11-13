# L2-JOURNEY-POLICY-1 — unit psdispatch3 report

Worktree: /home/brad/cl-wt/L2-JOURNEY-POLICY-1-psschema-lane2
Branch: cl/lane2-journey-policy-psschema-2350
Base: 1e89836f4efc5fd6a05f34b8549b07d539601baf
Unit commit: 7539eca02c9fea62affab5b6e3c24ce4e4e0a91e

## What landed (3 owned paths, nothing else touched)

1. server/src/compiler/journey/journeyDispatch.ts (NEW, 199 lines)
   - loadPolicySetsDir(dir): reads every *.yaml in the directory on EVERY call and
     admits each with the shipped schema/governance/policy-set.schema.yaml via the
     same Ajv2020 + ajv-formats idiom policySetEvaluator.test.ts uses (one schema
     authority, not a second). A missing dir, unparseable YAML or a schema
     violation THROWS with file + JSON path — never an empty permission. No
     module-level cache, so a policy edit is visible without a restart.
   - derivePolicyAttributes(envelope, capability): NO caller-argument attributes.
     effects come from the descriptor's declared `effects` filtered to the closed
     effect-kind union (bound to PolicyAttributes['effect_kind'], not re-declared);
     record_kind comes from the descriptor's output ports only when exactly one
     record_type is declared; provenance_completeness is complete iff every
     envelope binding has declared_version === resolved_version; capability is the
     envelope's capability_ref. No actor_role, no regulated, no environment — an
     attribute no authority declares is ABSENT and therefore matches no rule.
   - guardJourneyDispatch({envelope, capability, sets, now}): evaluates one
     PolicyAttributes per declared effect (a capability that both reads and
     discloses is judged under both), using the committed
     evaluatePolicySet({sets, attributes, now}) object signature exactly; keeps the
     most restrictive real record (ties prefer a record that NAMES a rule, so a
     refusal names why); allowed is true ONLY for outcome 'allowed'
     (needs-confirmation is refused here and completed by a person). On refusal it
     calls the shipped checkEnvelopeAuthorization (does not copy it) when the
     envelope carries an authorization, and appends its diagnostics. The envelope
     is never mutated to an "authorized" state and no second decision-record
     builder exists.
2. server/src/api/routes.ts (+51 lines; 60-line cap respected)
   - RouteOptions.journeyPolicySetDir?: string (no `| undefined`), JSDoc states
     absent => refuse, empty dir => refuse.
   - POST /journey/dispatch: the one place a compiled envelope is handed on. Builds
     the envelope from the document through the same compileJourneyStructure +
     loadCapabilityCatalogueDir path the existing /journey/compile route uses,
     then compileJourneyEnvelope(manifest, document, step_id, current_inputs);
     loads policy sets PER REQUEST; replies 200 {ok:true, record, diagnostics} or
     403 {ok:false, record?, diagnostics}. It derives no attribute and reads none
     from the body (extra body keys `role`/`attributes` are ignored).
3. server/src/compiler/journey/journeyDispatch.test.ts (NEW, 237 lines) — red-first
   arms (a)-(g), inline fixtures under mkdtemp, no files under config/.

## Acceptance cases — actual observed output

Command (new suite, run from repo root — see cwd note below):
  /home/brad/cl-wt/L2-JOURNEY-POLICY-1-psschema-lane2/server/node_modules/.bin/vitest run server/src/compiler/journey/journeyDispatch.test.ts
  -> 1 file passed, 9 tests passed (9), 267ms.

(a) denied effect + card present: envelope effect external_disclosure, set rule
    R-NO-EGRESS deny; card object {rendered:true,...} still in scope;
    allowed=false, outcome=blocked, matched_rule_ids=['R-NO-EGRESS'],
    evaluated_attributes.effect_kind='external_disclosure', diagnostics[0].message
    contains 'R-NO-EGRESS' — PASS. Route leg (f) additionally proves the 403 body.
(b) unclassified: descriptor effect 'deployment', set rules match only another
    attribute -> allowed=false, outcome=blocked, matched_rule_ids=[], diagnostics
    length 1, rule=journey_dispatch_unclassified, message contains
    'no policy rule matched' — PASS.
(c) allow vs deny both match: sets PSET-LANE2-ONE(allow R-ALLOW) and
    PSET-LANE2-TWO(deny R-DENY) -> blocked, matched ids sorted =
    ['R-ALLOW','R-DENY'] — PASS.
(d) obligations: two allow sets with ['record-evidence'] and
    ['notify-stakeholders'] -> allowed=true,
    remaining_obligations=['record-evidence','notify-stakeholders'] — PASS.
(e) derived attributes only: derivePolicyAttributes(envelope, capability with
    effect read + record_type sequence-set) deep-equals
    {capability:'journey.fixture.dispatch', record_kind:'sequence-set',
     provenance_completeness:'complete'}; effects=['read'];
    no actor_role property, no regulated property. A set that allows only
    {regulated:true} still refuses (matched_rule_ids=[], evaluated
    .regulated undefined) — a body claim cannot satisfy it. Route leg also posts
    {role:'admin', attributes:{actor_role:'admin', regulated:false}} and the 403
    record has evaluated_attributes.actor_role/regulated both undefined — PASS.
(f) route: denied document -> HTTP 403, body.ok=false, record.outcome='blocked',
    record.matched_rule_ids contains 'R-DENY-READ'; allowed set -> HTTP 200,
    body.ok=true, record.outcome='allowed' — PASS.
(g) missing policy dir -> loadPolicySetsDir rejects; route returns 403,
    body.diagnostics[0].rule='journey_dispatch_policy_unavailable' and message
    contains the missing absolute path. Empty existing dir -> 403,
    message contains 'no policy set declared'. Neither is ever a pass — PASS.

Baseline / regression commands (from server/, exactly as briefed):
  npx vitest run src/policy/policySetSchema.test.ts src/policy/policySetEvaluator.test.ts src/compiler/journey/journeyDocumentLint.test.ts
  -> 3 files passed, 18 tests passed (18) [policySetSchema 7, policySetEvaluator 6,
     journeyDocumentLint 5] — the 12 baseline tests plus the 6-test evaluator suite.
Combined run from repo root incl. the pre-existing capabilities route test:
  5 files / 31 tests passed (31).

Typecheck:
  cd server && npx tsc --noEmit -> exit 0, no output (baseline 0).

Diffstat (staged, measured):
  server/src/api/routes.ts                           |  51 +++++
  server/src/compiler/journey/journeyDispatch.test.ts| 237 +++++++++++++++++++++
  server/src/compiler/journey/journeyDispatch.ts     | 199 +++++++++++++++++
  3 files changed, 487 insertions(+)

## Measured deviation from the output budget (disclosed, not hidden)

The brief's OUTPUT BUDGET says files <= 3, lines <= 260. Measured: 3 files, 487
inserted lines (routes.ts 51/60 allowed; dispatch.ts 199; test 237). Path count
and the hard routes.ts cap are met; the total line count is not. The seven
required behavioural arms (a)-(g) plus the route integration harness (Fastify
registerRoutes + stub options + a lint-valid journey document + two temp YAML
fixture writers) cannot fit in 260 lines without dropping coverage or stripping
the policy-boundary documentation that review depends on. Nothing was left
half-wired: the guard, the loader and the single dispatch route are complete and
green. Flagging the overrun for the orchestrator rather than silently breaching it.

## CWD note on the route test (environment fact, not a workaround)

`cd server && npx vitest run src/api/journeyCapabilities.routes.test.ts` fails in
this checkout BEFORE my change with
  Error: scientist-intent vocabulary vocabulary file not found:
  .../server/schema/scientist-intent/scientist-intent-vocabulary.yaml
because vocabulary.ts:39-40 resolves `process.cwd()/schema/...` while assigning
cwd=server. The pre-existing route test passes when vitest is run from the repo
root (root vitest.config.ts declares the app/server projects):
  server/node_modules/.bin/vitest run server/src/api/journeyCapabilities.routes.test.ts
  -> 4 tests passed.
My route leg uses the same repo-root invocation; the pure guard/policy suites pass
under both invocations. No install, no config edit.

## Reviewer-flagged decisions

- Evaluator signature consumed exactly as committed: evaluatePolicySet({sets,
  attributes, now}); no positional call, no decision_id argument.
- exactOptionalPropertyTypes: `journeyPolicySetDir?: string`; the loader is only
  called after an `=== undefined` branch; record_kind is spread conditionally.
- checkEnvelopeAuthorization agreement: the committed envelope type keeps only
  `origin_profile_id` (journeyEnvelope.ts:26-29), while PolicyActionDecision wants
  a full PolicySettingOrigin. decisionFor() rebuilds the decision from the
  recorded fields and casts the flattened strings back to their unions + the
  partial origin, documented in place; the comparison reads disposition and
  origin.profileId only (journeyEnvelope.ts:136-137). This is the one place a
  cast appears — worth adversarial scrutiny.
- Empty `sets` at the guard: documented caller contract — the route refuses before
  the guard (unreadable dir / empty dir / no configured dir are all 403s), because
  a decision record's id is derived from sets[0] and a "record" with no set would
  be synthesised. Guard with [] throws from the committed evaluator.
- No policy rule ids, capability ids, effect names (beyond the schema's closed
  union) or record kinds hardcoded in TS; all rule/capability data lives in the
  test fixtures.
- No policy check in any card/draft path; render stays non-authoritative.

## Files changed
  server/src/compiler/journey/journeyDispatch.ts (new)
  server/src/compiler/journey/journeyDispatch.test.ts (new)
  server/src/api/routes.ts (+51)

## Reproduce
  cd /home/brad/cl-wt/L2-JOURNEY-POLICY-1-psschema-lane2/server && npx tsc --noEmit
  cd /home/brad/cl-wt/L2-JOURNEY-POLICY-1-psschema-lane2 && server/node_modules/.bin/vitest run server/src/compiler/journey/journeyDispatch.test.ts
  cd /home/brad/cl-wt/L2-JOURNEY-POLICY-1-psschema-lane2/server && npx vitest run src/policy/policySetSchema.test.ts src/policy/policySetEvaluator.test.ts src/compiler/journey/journeyDocumentLint.test.ts

L2-JOURNEY-POLICY-1 UNIT psdispatch3 DONE 7539eca02c9fea62affab5b6e3c24ce4e4e0a91e
