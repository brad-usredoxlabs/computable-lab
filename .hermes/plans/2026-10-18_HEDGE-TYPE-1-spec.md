# LANE 2 SPEC — HEDGE-TYPE-1 (emitter hedge rule honors declared optionality)

Item: HEDGE-TYPE-1. Lane 2 trunk cl/integration-2. Authority: architect decision
.hermes/plans/decisions/W28-A5i-slotless-hedge-bar-decision.md (Q2 TASK HEDGE-TYPE-1,
binding; read it fully — this spec composes it, it does not re-decide it).

## Root cause (architect-verified first-hand, orch spot-checked)
Generated emitter prompt rule (server/src/compiler/scientistIntent/intentCompile.ts ~:101,
"put it under unresolved instead of inventing it") makes the model hedge ABSENT OPTIONAL
parameters every draw; vocabulary declares those args required:false
(schema/scientist-intent/scientist-intent-vocabulary.yaml ~:826-834) and the engine's own
sweep exempts them (server/.../resolveNounsPass.ts ~:246-251 skips kind==='scalar' &&
required!==true). Under WIRE-TEMP-1 determinism this manufactures a permanent 0/5 gate
wall (step0-probe log: 0/5, byte-identical slot-less survivors every draw).

## Scope (prompt/vocabulary DATA ONLY — ZERO TS logic, ZERO engine-file changes)
Edit the GENERATED system prompt (intentCompileSystemPrompt, intentCompile.ts:61-102) and
its drift-gated mirror schema/registry/prompt-templates/intent.compile.system.yaml (~:58-59)
so:
1. hedge ONLY what the scientist STATED but you could not commit (ambiguity, contradiction,
   unknown existing-vs-new) or a REQUIRED parameter the verb block marks required and the
   text omits;
2. NEVER hedge the absence of a parameter the ALLOWED-ACTIONS block marks optional — omit
   the field; the compiler's required-argument sweep and downstream fold own optional absences;
3. every unresolved fact about a specific action's argument MUST carry actionLocation
   {actionIndex, action, argument} (argument named exactly as the verb block declares) and
   label: EXACTLY the scientist's own word for the thing — never a sentence. (This is what
   makes SAMPLE-CARD-1's card + the ANSWER-BIND-1 exact-identity join reachable. Use reason
   'not-stated' for stated-but-uncommitted nouns, per SAMPLE-CARD-1's menu row.)
4. the generated verb block marks required-vs-optional args per verb, GENERATED from
   arg-contract required fields (vocabulary.argContracts) — zero verb/arg name literals,
   same generation principle as promptVerbBlock().

ANTI-FABRICATION CORE STAYS BYTE-PRESENT: "instead of inventing it" (~:101), "Do NOT add
wells/volumes the scientist did not state" (~:99). This scopes WHEN to speak, never WHAT
to invent. The bar (resolveNounsPass.ts:435 blocked rule) and KEEP arm (:215-217) are
TOUCHED NOTHING — a diff touching resolveNounsPass.ts or resolutionEngine.ts is itself
the defect (decision verified-by (c)).

## Mirroring
intentCompile.ts generated prompt + schema/registry/prompt-templates/intent.compile.system.yaml
must stay in lock-step (existing vocabularyMirrorDrift.test.ts discipline — run it).

## Acceptance criteria (verbatim from decision Q2 verified-by)
(a) server test with a fake LLM client: an intent whose actions OMIT optional params with
    NO unresolved entries compiles outcome 'complete' on the bead_beat-without-
    duration/cycles macro shape (proves downstream expansion tolerates declared optional
    absence);
(b) prompt + mirror drift test green;
(c) report states: zero engine-side file changes (diff of resolveNounsPass/resolutionEngine
    empty).
Additionally: RED-first — a test pinning "absent-optional omission -> no unresolved entry
required" posture at the prompt-template level where expressible (string asserts on the
generated prompt: 'optional' hedge prohibition present; actionLocation mandate present).
npm run test:run -w server green-set unchanged (compare failing-file set to trunk baseline).

## Environment
Worktree off trunk tip. Lane stack :3093/:5193 orch-owned — NEVER restart. Tests:
cd server && npm run test:run (targeted files). git -c core.fileMode=false everywhere.
exactOptionalPropertyTypes on server.

## Report / markers
Report .hermes/plans/HEDGE-TYPE-1-report.wip-<token>.md in the worktree, committed.
End stdout: 'HEDGE-TYPE-1 DONE <sha>' or 'HEDGE-TYPE-1 STOPPED <reason>'.
Zero UI surface -> no browser gate on this item (browser proof rides W28-A5D-R3 r3 per
decision Q4).
