# L2-WELLSET-TOKEN-EMIT-1 — wellset token producer-side semantics as prompt DATA

APPROVED BY BRAD 2026-10-30T22:28 EDT verbatim ("approved as-is") via architect check-in —
approval recorded in .hermes/plans/decisions/L2-WELLSET-TOKEN-EMIT-1-brad-approval-card.md
(commit 6bd501aa). Basis: architect END-RULING decisions/LABSTATE-SAMPLER-DETERMINISM-l2t1930-ruling.md
(Q1: fix = this item; Q4: mix leg cannot flip green until this ships).

## Root cause (verified first-hand by orch at trunk 6bd501aa)

On 9/9 live drives the shorthand model never emitted the declared wellset token
`wells: all-wells-containing-materials` on the `mix` action — it free-fills literal well
ranges or omits the arg. The server resolve_wellsets pass only fires on a value listed in
vocabulary `wellsetValueTokens` (schema/scientist-intent/scientist-intent-vocabulary.yaml:884);
with no token on the wire the passthrough arm (server/src/compiler/scientistIntent/
wellsetResolver.ts resolveWellsets, "no wellset token anywhere -> byte-identical passthrough")
is CONTRACTUALLY CORRECT (never-guess). The missing piece is PRODUCER-SIDE PROMPT DATA:
schema/registry/prompt-templates/intent.compile.system.yaml declares `mix — ... wells?:wellset(labware)`
in the ARGUMENTS block but never explains what a `wellset(labware)` argument accepts, and
RULES actively discourage adding wells the scientist did not state. The model has never been
taught that a contents-derived phrase maps to the declared token.

## Scope (HARD BOUNDARY)

ONE file of product change:
  schema/registry/prompt-templates/intent.compile.system.yaml

Declare, as DATA in the ARGUMENTS/PARAMETERS block (smallest edit that teaches the mapping):
a contents-derived phrase (e.g. "all wells that have material", "every well containing X")
on a `kind: wellset` argument is expressed as the vocabulary's DECLARED token — never a
literal well list, never an invented labware noun. Reference the token generically ("the
declared wellset token(s) for the phrase the scientist used") — the coder MAY include the
concrete example token `all-wells-containing-materials` for the canonical contents phrase in
the EXAMPLE/ARGUMENTS text if that is what makes the small model comply; that is a DATA
string in a prompt template, permitted (the template already carries literal examples).
No vocabulary schema change (token list already ships). Do NOT touch:
- server/** (resolver, passes, folds — HARD BANNED; the server side is contractually correct)
- schema/scientist-intent/** (vocabulary + schema — HARD BANNED this item; optional vocab-lint
  pin is the ONLY optional extra and only if the coder can do it without touching the banned files)
- app/**

No behavior of the server may change: this is prompt text only. If the coder believes a
server change is needed, it must STOP with `L2-WELLSET-TOKEN-EMIT-1 BLOCKED <reason>` —
that is an architecture escalation, not a fix.

## Prompt-composition integrity (the real regression risk)

The lane has pins that mirror this template:
- server/src/compiler/scientistIntent/promptShapeParity.test.ts
- server/src/compiler/scientistIntent/vocabularyMirrorDrift.test.ts
- server/src/compiler/scientistIntent/hedgeOptionality.test.ts
- server/src/registry/PromptTemplateRegistry.test.ts
Run ALL of them (cwd=server) plus any other test that reads intent.compile.system (grep
'intent.compile.system' server/src). If a pin asserts an exact text/shape of the template,
update the pin DELIBERATELY and disclose the hunk in the report (no rubber-stamp).

Keep the addition COMPACT (Brad's standing prompt-budget ruling): a few lines in the
ARGUMENTS/PARAMETERS/RULES vicinity, not a new section dump. Preserve every existing line
the change does not target (byte-stable diff otherwise).

## Gates (report MUST paste RAW output)

1. RED-first pin: a server test asserting the template teaches the token mapping — e.g. a
   pin that the compiled system prompt for a mix-with-contents-phrase case contains the
   wellset-token guidance AND references wellset vocabulary (shape the test on how
   vocabularyMirrorDrift/promptShapeParity read the template; assert on stable substrings,
   not the whole file). RED before the template edit, GREEN after.
2. All template-reading test files green (raw vitest output, cwd=server).
3. `npm run typecheck -w server` (or tsc -p server) — zero NEW errors vs baseline.
4. YAML valid: the template loads via PromptTemplateRegistry (covered by its test).
5. git diff: exactly schema/registry/prompt-templates/intent.compile.system.yaml + test
   file(s) (+ optional vocab-lint pin if done). ZERO server/** product lines, ZERO
   schema/scientist-intent/** unless the optional lint pin (disclose).

## Evidence leg (orch-owned AFTER merge — coder does NOT run the live drive)

Pre-flight n-probe (card acceptance 1) and the L2-LABSTATE-CONTENTS-1 full re-drive
(ED-L2-LABSTATE-CONTENTS-1-CANONICAL-SHAPE + ED-WELLSET-AC2-LIVE) are ORCH-owned post-merge
with a stack restart (YAML — tsx --watch does not reload it). Coder proves the DATA ships;
the drive proves the model uses it.

## Deliverable

Report: /home/brad/.hermes/cl/lanes/2/deliverables/L2-WELLSET-TOKEN-EMIT-1-report.<token>.md
with sections: root cause restated, diff hunk, gates 1-5 RAW, disclosures.
End with EXACTLY one of:
  L2-WELLSET-TOKEN-EMIT-1 DONE <full 40-char sha>
  L2-WELLSET-TOKEN-EMIT-1 BLOCKED <reason>
Commit(s) on the assigned branch, tree CLEAN at DONE.

## Environment

Worktree + branch are named in the dispatch prompt. ALWAYS `git -c core.fileMode=false`
(NFS mode-bit noise). Never touch :3093/:5193/:5174/:3001 or any model service. Tests:
cwd=server, npx vitest run <files>.
