# ARCHITECT CONTEXT — LANE 2 (the things a brief cannot guess)

Written by the architect for the composer, the orchestrator, the coders and the reviewers of lane 2.
Approved by Brad 2026-11-13 (his option "A": a short orientation plus an index into declared files,
with enforcement doing the teaching, rather than a long system prompt).

**How to use this file.** Quote it; do not paraphrase it into a new vocabulary. Every claim here is
either a binding decision with a committed document behind it, or a measured fact with a path:line
anchor. If a claim here disagrees with the repository, THE REPOSITORY WINS and this file is stale —
say so in your handoff or your report instead of quietly following either. "Needs measurement" means
exactly that: it is a hypothesis, not a fact, and no task may be briefed as though it were settled.

## 0. THE SINGLE STATEMENT (adopted by Brad 2026-11-14)

Source: `/mnt/vast/home/brad/git/computable-lab/test-prompts/frictionless-science-policy-proposal-20261114.md`.
Brad directed this file, the four role profiles and the lane to point at this statement. It governs
every judgement below and settles four ambiguities that previously resurfaced as defects.

> **Computable-lab lets scientists begin recording and building experiments with the information they
> actually have. Inventory registration, catalogue research, ontology curation, and quality paperwork
> are not admission requirements for ordinary scientific work.**
>
> **Low friction never licenses invented precision or lost specificity.** When the scientist names a
> particular product, coating, material, geometry or other relevant property, CL preserves that
> information. It never quietly replaces the requested item with a convenient generic or a near match.
>
> CL records what is known, who or what supplied it, and what remains unspecified. It gathers detail
> when that detail is required for the next operation, a scientific interpretation, or an applicable
> declared quality rule — and it asks at that boundary, preserving the work already done.
>
> **Scientific precision and procedural oversight are separate dimensions.** Faithful identities,
> quantities, provenance and uncertainty apply everywhere; approvals and qualification follow the
> lab's declared policy bundle and the operation being performed.

Four facts that must never be collapsed (each has cost us a defect this week):

| Fact | Establishes | Does NOT establish |
|---|---|---|
| CL understands "96-well plate" | a usable category, and a generic representation when supplied | a vendor, coating, lot, or that the lab owns one |
| a reusable DEFINITION is saved | an identified specification with declared properties and provenance | that the lab possesses a specimen |
| a PRODUCT is registered | manufacturer/catalogue identity tied to a definition | that it was purchased, received or used in this run |
| a vessel appears in a RUN | a container positions, contents and events can reference | stock count, barcode, receipt, or a completed physical action |

Consequences a brief may rely on, and must not contradict:

- A saved definition is not physical stock. A generic run container is a legitimate result, not an
  incomplete product. An explicitly requested product may never be satisfied by silently using a
  generic. Required precision depends on the requested operation and the applicable policy.
- A failed search is not evidence that a type must be created, and a search failure is not an absence.
  Report "I could not verify this product", never "this product does not exist".
- Inventory becomes richer as a consequence of recording work — it is not the fee for recording it
  (Brad, 2026-11-13: *"Inventory should become richer as a consequence of recording lab work — not be
  the admission fee for recording it."*).
- Planning and recording stay distinct: placing six tubes in a planned run records intended layout;
  "I used these six tubes" records an attributed account of use. A drawing never attests that a
  physical operation occurred.
- Later enrichment never rewrites history: do not mutate a shared generic definition into a vendor
  product; bind or revise the run container, keep the earlier state, and mark any result whose
  assumption the enrichment changes.
- Under the declared bundles (measured 2026-11-14): `authoringGate: deny` means the authoring gate is
  ACTIVE (authored records must satisfy their declared policy), **not** that authoring is forbidden;
  `allowAutoCreate: deny` (regulated, tracked) means the AI may not create records on its own — creation
  is an attributed, accepted action; `allowPlaceholders: deny` means an unresolved placeholder may not
  be used, so an intentionally generic record is recorded as a generic WITH NAMED ABSENCES, not as a
  placeholder.

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
16. **Recording is not gated on inventory.** A scientist may start with a generic category and specify
    later; a definition is not stock, a product is not a purchase, and a vessel in a run is not a
    physical action. Ask for detail only at the operation that needs it, and never substitute a generic
    for an explicitly requested product. Owner: §0 above and
    `/mnt/vast/home/brad/git/computable-lab/test-prompts/frictionless-science-policy-proposal-20261114.md`.

Lane-scoped, not doctrine: for THIS lane a document-sourced protocol is treated as global. A lab's own
SOP can also arrive as a PDF and still be local; the distinction is whose practice it describes.

## 3. What exists in the journey machinery

Measured 2026-11-13 against trunk 73507b4b (the first pass was at f4987dc7, 83 commits earlier, and
three claims had moved by the time this section was re-read). The anchors are re-verified by the
checker; the COUNTS are only as fresh as the line below. **A stale claim here is a defect of the
same class as a stale brief** — if you rely on a number in this section, confirm it in the tree first,
and if it has moved, fix this file in the same session.

Done and merged — the eight bedrock pieces: the journey intent document; a two-stage compiler; the
human task contract; durable checkpoint + context delta (`PendingIntentStore`, `/ai/threads/:endpoint/
checkpoints`, `server/src/compiler/journey/checkpointContract.ts:26-35`); policy sets as data; typed
ports; the capability catalogue; the evidence ledger. Plus a YAML-declared trunk-journeys harness.

Measured gaps that decide real work — RE-MEASURED 2026-11-13 18:15 against trunk 73507b4b (83
commits after the first pass; three claims below had MOVED and are corrected here):

- **Capability catalogue: seven descriptors, three of them write-shaped, NONE available now.**
  Read-only and available: `material-library-search`, `ontology-lookup`, `vendor-web-search`,
  `ncbi-gene-search` (all `implemented: true`, `available_now: true`). Write-shaped, all
  `handler_kind: governed_write`, all `handler_ref: records.create`:
  `noun-create-from-document` (`implemented: true`, `available_now: false`),
  `labware-definition-create` and `labware-instance-place` (`implemented: false`).
  So a journey still cannot MINT anything through the catalogue; it is declared, not enabled. Any
  task that claims creation "works" must show `available_now` true and a receipt, not a descriptor.
- **The governed-write registry exists**: `config/journey/governed-writes.yaml`, first entry
  `records.create` (route `POST /records`, handler `RecordHandlers.create`, store
  `RecordStoreImpl`, guards ajv + lint + ownership-acl). A `handler_ref` outside it must be refused
  at load; adding an entry is a reviewable act.
- **The first journey document exists**: `config/journey/declarations/labware-definition.yaml` (Pilot
  A), two steps both in the admitted catalogue, and it DECLARES the missing instance-placement
  capability as an unresolved slot instead of inventing one. Authoring a journey is therefore no
  longer greenfield: extend this shape, do not design a second one.
- **Local protocol tiers — two of three gaps still open.** Nothing PERSISTS
  `overrides.substitutions`: the only occurrence is a TYPE on the in-memory realization payload
  (`server/src/compiler/scientistIntent/realizeScientistIntent.ts:106`, whose own comment says
  "persistence is W2-8's"). Assigning it in memory is not producing it. And no rule refuses a run
  attached to a universal protocol: `schema/workflow/planned-run.lint.yaml` carries no
  local-protocol rule, though `PlannedRunFromLocalProtocolService` does refuse a non-local reference
  on ITS route.
- The universal→local machinery (schema, three lint rules, `BranchResolver`, four producers, three
  YAML pipelines) is unchanged: build the missing pieces INSIDE it; do not add a fifth producer.

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
| `DEFINITION-IDENTITY-UNIQUENESS-l2-20261113.md` | c7c1d8f4 | one recordId; registry is vocabulary; only record-backed entries bind |
| `STARTER-PACK-AND-PROMPT1-l2-20261114.md` | 957bc604 / dbe436ae | the generic starter pack SHIPS; a "[LAB] Your lab" label or record-shaped GET needs a real record |
| `RUN-IS-THE-PROVENANCE-RECORD-l2-20261114.md` | 33b553abb | the RUN is the record of biological truth; acquisitions attach to it; no instrument-owned sheet |
| `AI-DELIVERABLE-CHANNELS-ARE-DATA-l2-20261114.md` | c82333437 / 4214da963 | every deliverable channel has a declared treatment; acceptance is gated on presentation |
| `ABSENCE-RENDERING-AND-PROBE-TIERS-l2-20261114.md` | f0a2ce783 | one request renders the card; absence never asserted from one lookup tier |
| `DECK-ACTIONS-ARE-THE-OPERATION-l2-20261114.md` | 5845a6064 | the AI path invokes `addLabware`/`addLabwareFromRecord` and navigates to existing forms; it does not rebuild them |
| `GC-ANALYSIS-IS-CL-SURFACE-l2-20261114.md` | 7b9ec0ad0 | GC analysis is CL's surface built to the 2026 manual's spec, not a separate app |

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
