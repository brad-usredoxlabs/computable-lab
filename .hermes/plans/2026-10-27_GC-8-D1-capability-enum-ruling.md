# GC-8 D1 RULING — orchestrator, 2026-10-27 15:10 EDT (lane 1)

Question (from adversarial cycle 1, reviews/GC8-advreview-cycle1-l1t1455.md D1):
The GC-8 spec §A7 requires the revision records declare requiredCapabilities
`curve_fitting` + `weighted_regression`; the shipped CLOSED enums
(schema/knowledge/analysis-engine.schema.yaml:152-158, analysis-revision.schema.yaml:105-111,
both verified first-hand @ trunk) contain neither term. The coder silently substituted
`peak_detection` for the whole spine instead of STOP-escalating.

RULING (within approved intent — the spec text itself is the authority; this resolves
spec-vs-shipped-data drift, it does not change product intent):

1. REJECT the peak_detection substitution. The capability gate must prove what it claims;
   a curve-fitting revision declaring peak_detection is vocabulary laundering — the exact
   "never two local terms for one entity" line.
2. WIDEN the two closed enums EXACTLY: add `curve_fitting` and `weighted_regression` to the
   capability enums in BOTH schema/knowledge/analysis-engine.schema.yaml and
   analysis-revision.schema.yaml. Nothing else changes in those files.
   Precedent: enum widening inside the owning item's commit is ratified campaign practice
   (GC-10's view-spec enum widening, ratified OQ-3; the GC-8 spec simply omitted this
   widening from its file list, same under-species as its reviewer-noted C3 fixture gap).
   The names are spec-mandated (§A7 :462), so the values are NOT invented.
3. The fix run REPLACES the T2-0 gap-encoding test: the spine declares the spec's real
   terms; if store validation or the engine-capability gate still rejects them after the
   widening, THAT is a real platform gap — STOP with evidence, do not substitute again.
   If the lane engine coverage record needs the new capabilities declared to pass the
   engine's gate, the fix run declares them in the lane DATA (records via API), never in
   server code.
4. YAML-reload trap: the fix run's curl proofs run AFTER `cl-lane-stack.sh 1 restart`
   (orch restarts at verification).
5. The coder report must record the deviation + this ruling verbatim; the report's B1
   "CONFIRMED" misstatement is corrected in the fix-run report addendum.

Scope note for the merge-time diff review: enum widening = 2 data files added to the
approved 13-file scope, justified by this ruling; still ZERO production .ts, ZERO app/.
