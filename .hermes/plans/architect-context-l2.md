# ARCHITECT CONTEXT — LANE 2 (the things a brief cannot guess)

Written by the architect for the composer, the orchestrator, the coders and the reviewers of lane 2.
Approved by Brad 2026-11-13 (his option "A": a short orientation plus an index into declared files,
with enforcement doing the teaching, rather than a long system prompt).

**How to use this file.** Quote it; do not paraphrase it into a new vocabulary. Every claim here is
either a binding decision with a committed document behind it, or a measured fact with a path:line
anchor. If a claim here disagrees with the repository, THE REPOSITORY WINS and this file is stale —
say so in your handoff or your report instead of quietly following either. "Needs measurement" means
exactly that: it is a hypothesis, not a fact, and no task may be briefed as though it were settled.

## 1. Orientation paragraph (the doctrine in five sentences)

Consult the declared contracts and a capability's preconditions before changing anything consequential.
A run executes an accepted LOCAL protocol; a global protocol supplies lineage and numbers, never
execution. Use declared operations: a model proposes, the compiler decides what is legal, a runner
executes deterministically, and a person signs every regulated write. A draft, a proposal or a staged
artifact is never a commitment, and completion is decided by a committed record plus the evidence the
scenario demands. Never invent an observation, an identifier, a catalogue number or a value the person
did not state; surface a named refusal and ask for what is missing.

## 2. The load-bearing distinctions (one line each, with the file that owns it)

1. **Context creates materials.** A material can be defined by its context of creation (conditioned
   medium) and a control is a complete biological system, not a chemical.
   Owner: `docs/knowledge-layer-canonical-example.md`.
2. **Materials are a provenance hierarchy.** concept ≠ formulation ≠ instance ≠ aliquot ≠ composition.
   Never collapse two rungs into one record. Owner: `CLAUDE.md` rule 8; `schema/lab/*.schema.yaml`.
3. **Global vs LOCAL protocol.** A published assay is global; a run follows the local realization that
   names its source and records the lab's substitutions with a rationale.
   Owner: `schema/workflow/local-protocol.schema.yaml`; ruling
   `.hermes/plans/decisions/PROTOCOL-LOCALIZATION-l2-20261113.md`.
4. **Presentation ≠ execution.** A surface is where something is shown or a person acts; a capability
   is what executes. A page must never own a capability, and a capability must never require one page.
   Owner: `schema/workflow/capability-descriptor.schema.yaml` (`surfaces`).
5. **Proposal ≠ commitment.** Nothing is written before an accept; a staged draft never satisfies a
   committed-record port. Owner: `schema/workflow/capability-descriptor.schema.yaml` (effects +
   governed_write); `.hermes/plans/decisions/GOVERNED-WRITE-ADMISSION-l2-20261113.md`.
6. **Pending intent is not a record.** A half-filled form lives on the parked prompt's checkpoint,
   restored on reload, and never gets a record id.
   Owner: `.hermes/plans/decisions/PENDING-DRAFT-PERSISTENCE-l2-20261113.md`.
7. **Identity is a record id, never a name.** Names, labels and aliases only pre-select a candidate;
   a miss is a named unresolved slot.
   Owner: `.hermes/plans/decisions/LABWARE-INSTANCE-DEFINITION-IDENTITY-l2-20261113.md`.
8. **An anchor belongs to what is named.** The design owns the ontology anchor; an instance displays
   it labelled with its source; a design-less instance carries its own.
   Owner: `.hermes/plans/decisions/ONTOLOGY-ANCHOR-OWNERSHIP-l2-20261113.md`.
9. **Hands-offs are typed ports.** Provenance rung, units, cardinality, record revision, coordinate
   frame and committed-vs-staged are declared, not implied. Owner: `schema/workflow/journey-port.schema.yaml`.
10. **A human step declares its own completion.** The decision, the controls, the evidence shown, the
    selectable kinds and cardinality, and what counts as done — never "the user visited the page".
    Owner: `schema/workflow/human-task.schema.yaml`; `server/src/compiler/journey/humanTaskCompletion.ts`.
11. **Return is a context delta, never a rewritten prompt.** The original sentence stays immutable;
    additions carry their epistemic status and who accepted them. Owner: `schema/workflow/context-delta.schema.yaml`.
12. **A saved checkpoint is not an exactly-once write.** Consumption-once state and effect-once domain
    writes are different guarantees; anything crossing a commit boundary owes a fault-injection leg.
    Owner: `/mnt/vast/home/brad/git/computable-lab/test-prompts/corpus-manifest.yaml` (`fault_injection_leg`).
13. **Policy is data and deny wins.** Permission to propose, permission to execute and approval
    obligations are separate; regulated status comes from authoritative records, never an AI field.
    Owner: `schema/governance/policy-set.schema.yaml`;
    `schema/core/policy-bundles/{notebook,sandbox,tracked,regulated}.policy-bundle.yaml`.
14. **Controlled vocabulary over free text.** Use ontology terms or CURIE-style local terms
    (`cf:ROS`); a new concept is authored as a term, not smuggled in as prose. Owner: `CLAUDE.md` rule 7;
    `schema/registry/`.
15. **Never invent a value.** A missing catalogue number, vendor, geometry or measurement is a declared
    unresolved slot, shown as one, and the person is asked.
    Owner: `CLAUDE.md` "The Hard Boundary"; the corpus canon (see §4 for where it lives).

Lane-scoped, not doctrine: for THIS lane a document-sourced protocol is treated as global. A lab's own
SOP can also arrive as a PDF and still be local; the distinction is whose practice it describes.

## 3. What exists in the journey machinery (measured 2026-11-13, trunk f4987dc7)

Done and merged — the eight bedrock pieces: the journey intent document; a two-stage compiler; the
human task contract; durable checkpoint + context delta (`PendingIntentStore`, `/ai/threads/:endpoint/
checkpoints`, `server/src/compiler/journey/checkpointContract.ts:26-35`); policy sets as data; typed
ports; the capability catalogue; the evidence ledger. Plus a YAML-declared trunk-journeys harness.

Measured gaps that decide real work:
- `config/journey/capabilities/` holds FOUR descriptors, all read-only (material-library-search,
  ontology-lookup, vendor-web-search, ncbi-gene-search). No capability CREATES anything, and
  `config/journey/` contains no journey document at all.
- The universal→local protocol machinery EXISTS and is wired: schema + three lint rules,
  `server/src/protocol/BranchResolver.ts` ("Phase-0 of localization"), four producers of
  local-protocol records
  (`server/src/compiler/protocol/LocalProtocolBuilder.ts`,
  `server/src/compiler/pipeline/passes/ProtocolRealizePass.ts`,
  `server/src/protocol/ProtocolContextService.ts`, `server/src/api/handlers/IntentAcceptHandlers.ts`),
  three YAML pipelines, and `POST /runs/from-local-protocol`.
  Missing: nothing writes `overrides.substitutions` (no material substitution is ever produced); no rule
  refuses a run whose effective authority is a universal protocol; the localization pipeline is not a
  declared capability. Do not build a fifth producer.

## 4. Where the acceptance lives

IMPORTANT — the canon lives in Brad's own working tree, NOT in the lane trunk:
`/mnt/vast/home/brad/git/computable-lab/test-prompts/`. A lane worktree's `test-prompts/` holds only the old `easy1.md`, so a
relative path will not resolve for a coder. Read the canon from that
absolute path; never copy it into the lane trunk (that would create a second authority, and the
tripwire below compares one hash against one file).

- `/mnt/vast/home/brad/git/computable-lab/test-prompts/AI-Chat-Corpus2.md` — the canon, in Brad's words. Scenario ids 1, 2, 2a, 3, 3a, 4-8.
- `/mnt/vast/home/brad/git/computable-lab/test-prompts/corpus-manifest.yaml` — per scenario: verbatim utterances, entry state, human
  choices, return expectation, `completed_when`, `not_done_if`, evidence, `continues_from`,
  `fault_injection_leg`. Gates grade `completed_when` as written and treat any `not_done_if` as
  disqualifying. Prompt 8 is deferred by Brad.
- `python3 /mnt/vast/home/brad/git/computable-lab/scripts/check-corpus-manifest.py` — the drift tripwire. Run it before any gate; a
  changed corpus needs every utterance re-verified and the hash re-pinned, never a blanket accept.
- `~/.hermes/cl/lanes/2/corpus-state.md` — which scenario is active, and the old→new id mapping for
  old receipts.

## 5. Active rulings (committed, binding, do not re-litigate in code)

| Ruling | Committed | Answers |
|---|---|---|
| `LABWARE-INSTANCE-DEFINITION-IDENTITY-l2-20261113.md` | 9e814174 | instance→definition identity; alias-exact is not a criterion |
| `PENDING-DRAFT-PERSISTENCE-l2-20261113.md` | 9e814174 | drafts ride the checkpoint, never the store |
| `GOVERNED-WRITE-ADMISSION-l2-20261113.md` | 9e814174 | which write path admits a document-created noun |
| `ONTOLOGY-ANCHOR-OWNERSHIP-l2-20261113.md` | c03bcc02 | who owns an anchor; gate criterion corrected |
| `PROTOCOL-LOCALIZATION-l2-20261113.md` | dee118e1 | global vs local; executable authority; substitution production |

## 6. What a brief must carry from this file

- The distinction that governs the unit (section 2), quoted, with its owning file.
- The measured anchor for every claim about existing code (`path:line` + the verbatim line), verified
  in the current tree — never a path from this file trusted without a grep.
- The scenario id (from the canon at its absolute path) and the `not_done_if` traps the change could
  plausibly trip.
- The named refusal the change must produce when its precondition is missing (a defect that fails
  silently is not done).
- If the unit crosses a commit boundary, the fault-injection leg it owes.

A brief that cites an opinion instead of a decision is malformed. Astra second-opinion packets live
outside the repo under `~/.hermes/specs/intake/` and are NOT coder-facing authority: they contain
explicit "needs measurement" claims. Their conclusions entered through the rulings above, and the
rulings are what a brief cites.
