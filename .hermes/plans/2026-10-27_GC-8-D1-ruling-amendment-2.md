# GC-8 D1 RULING AMENDMENT 2 — orchestrator, 2026-10-27 16:3x EDT (lane 1)

Extends ruling 2026-10-27_GC-8-D1-capability-enum-ruling.md. Trigger: FIX RUN 1 executed
ruling steps 1-3 faithfully and hit the prescribed stop (GC8 FIX1 BLOCKED): after the two
ratified widenings, the store's Ajv validation of the RUN record still rejects the spec's
real capability terms at the completion write (analysisRunner.ts:785 store.update).

Root cause verified first-hand by the orchestrator (not only the coder's report):
1. schema/knowledge/analysis-run.schema.yaml (:124-130 at fix-run HEAD; identical block on
   trunk) carries a THIRD closed copy of the capability vocabulary:
   engineProvenance.capabilitiesReported[].capability — still the original 6 terms.
2. server/src/analysis/analysisRunner.ts:630 maps capabilitiesReported VERBATIM from the
   pinned engine record's declared terms:
   `engine.capabilities.declared.map((c) => ({ capability: c.capability, support: c.support }))`
   — pure data echo, zero policy. Any engine record that truthfully declares the spec's
   terms makes the run record unsavable. The gap is in the DATA vocabulary, exactly the
   under-ruling's step-2 species.
3. The coder's isolated ajv probe (legacy term valid, real terms rejected ONLY on the third
   enum) + scratch-worktree proof (third enum widened -> chaining 6/6) + base parity 6/6.

RULING (no architect escalation warranted — same ratified decision, no new domain
semantics; per persistence protocol §3 the orchestrator resolves in-scope repairs):
1. RATIFY the scope extension +1 data file: widen the third capability enum in
   schema/knowledge/analysis-run.schema.yaml (engineProvenance.capabilitiesReported
   [.].capability) with EXACTLY `curve_fitting` and `weighted_regression`. Nothing else
   changes in that file. Precedents: ruling steps 1-2; GC-10 view-spec widening (OQ-3);
   "enum widening inside the owning item's commit is ratified campaign practice."
2. The values remain spec-mandated (§A7 :462) — not invented. The three enum copies stay a
   KNOWN drift hazard (GC-8 cycle-1 OBSERVATION; GC-5 shipped the third copy); consolidation
   into a shared vocabulary data file is a candidate at gc-wave close, NOT in GC-8 scope.
3. Approved scope at merge-time diff review becomes 16 files: the 15 from ruling + this one
   schema data file. Still ZERO production .ts, ZERO app/.
4. The fix run 2 re-runs the chaining battery IN-PROCESS (the live :3092 stack serves trunk
   and cannot curl-prove the widened schema until post-merge; tsx --watch does not reload
   YAML — orchestrator restarts + re-verifies at the gate, per ruling step 4 unchanged).
