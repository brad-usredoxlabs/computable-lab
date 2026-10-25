# MATRES-ELIG orientation screening (orch l2t2050, 2026-10-19T21:15 EDT)
Scout proc (logs/scout-elig-clamp-surface-l2t2050.log) + ORCH VERIFIED each citation
against trunk ae0c6cbf. Screening only, not authority — but all 3 load-bearing cites
confirmed first-hand:
1. Suppression/clarification surface: server/src/compiler/resolution/resolutionEngine.ts
   — entry resolveScientistIntentNouns :341; resolveNoun :163-285 decides in-band bind
   (:228-236), top-accept (:241-244), clarification (:246), unknown-noun (:273-284).
   Band filter :224-226 (VERIFIED): tier!==5 && confidence in [band.min, band.max].
2. Remote-tier clamp: server/src/resolve/ResolveSpine.ts:188 (VERIFIED) —
   localOnly ? tiers.filter(spec=>!spec.remote) : tiers; ALSO compileResolver.ts:41 for
   the compiler's ontology resolver.
3. Existing data-driven acceptability: scientist-intent-vocabulary.yaml:842-847
   (VERIFIED) policies.ambiguity.confidenceAccept {min 0.7 max 1} + strategyRef
   symbolic_label — the ONLY acceptability policy in data today; everything else in
   resolveNoun is TS branches. ELIG's three-way predicates must live alongside this.
Use: seed the MATRES-ELIG spec-composition task with this when REPLAY worksheet legs
land (post-ratification).
