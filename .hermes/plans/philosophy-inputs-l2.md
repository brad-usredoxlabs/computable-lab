# PHILOSOPHY INPUTS — raw material for Brad's forthcoming computable-lab philosophy update

Not a document; not canon. A capture of what the system has actually demonstrated, with the evidence and the
ruling each point rests on, so that when Brad writes the philosophy section he is pointing at behaviour
rather than intention. Assembled 2026-11-15 by the architect, lane 2.

## The three claims Brad wants the philosophy to carry

1. The noun-creation journey is a **trust-building, load-bearing** concept: the system sends the person away to
   collect a prerequisite, and returns them to their own sentence, unchanged, now satisfiable.
2. computable-lab is an **agent harness for biology**: the model proposes, the compiler is the deterministic
   referee, the human owns regulated writes.
3. The default is **lack of friction** for new and creative users, while policy can still carry a regulated
   lab to full compliance.

## What the evidence supports, point by point

### On the creation journey as trust

- Brad's words (2026-11-15, binding): "taking a journey to collect the pre-requisites before returning to the
  jumping off spot is what gives the user trust over time that they should trust the system ... think about it
  like a setup wizard that works on an ad hoc basis."
- The anti-pattern it replaces is documented in our own gate record: an invisible Accept bar once wrote a
  Thermo 384-well plate with invented geometry and a catalogue number surviving only in free text (gate 7,
  `PROMPT1-GATE-20261114T193636Z`). The person gained no knowledge and lost the ability to audit.
- The corrective principle, already ruled: the model may PROPOSE a value; it may never assert a fact. A
  catalogue number read off a selected vendor document may be proposed as a candidate; geometry guessed from
  the words "96-well plate" may not (`NOUN-CREATION-JOURNEY-EXECUTION-l2-20261115.md`, correction 4).
- "Completion" is not "a record exists": it is committed outputs in declared lifecycle roles
  (concept ≠ formulation ≠ attested inventory). This is what makes trust durable rather than momentary.

### On the harness

- The loop, as built: the person's words → a compiled plan (data) → clarification where the plan needs a
  decision → a deterministic compile → a visible proposal → human acceptance → a committed record.
- The compiler's oversight is deterministic and inspectable, not aspirational: resolution runs declared
  strategies over tiers, and emits a *named reason* (`ambiguous-noun`, `unknown-noun`, `bind-incomplete`)
  rather than guessing. Evidence: `server/src/compiler/resolution/resolutionEngine.ts:356-386`.
- Identity is a record id; names are labels. Gates 10–12 failed repeatedly by resolving names
  (`labwareDefinitionSearch.ts` reading `payload.recordId`; the clarification dropping the chosen record's id).
- The system must be able to say "I do not know": absence is a rendered state with a reason, never a default
  value, and never an empty card with a create button.

### On friction versus rigour

The distinction that has to be written down, because it is the one that gets lost:

- **Friction** = the number of decisions and keystrokes a person must supply.
- **Rigour** = whether what was recorded is true, attributable and reconstructable later.

They are separable, and the system's job is to reduce the first without touching the second:

1. **Reduce typing, never evidence.** Anything the system can observe (instrument identity, file hash, parse
   provenance, timestamps, the person, the plan version) is captured automatically. A form field that exists
   only to make the database happy is friction with no rigour.
2. **Spend friction where an error is irreversible.** Acceptance before a regulated write; confirmation of
   geometry that will decide what the instrument sees; nothing else.
3. **The permissive path is a declared bundle, not a soft code path.** Policy bundles and ownership-policy
   records already exist as data (CLAUDE.md rule 9: defaults are declared, and a missing document falls back
   to creator-private and SAYS SO). A permissive default therefore does not require weaker code — it requires
   a differently configured bundle.
4. **An honesty floor that no bundle may lower.** No configuration may let the system claim more than it
   knows: an unverified product is "unverified", not "not found"; a proposal is a proposal; a draft never
   satisfies a committed-record port.
5. **Every friction exception is declared with an owner and a reason.** Otherwise "we skipped that because the
   user asked for speed" becomes institutional memory and the compliance story collapses at audit.

### The trap worth naming in the document

"Frictionless" is usually bought by deleting provenance — that is exactly what gate 7 did (a preview bar
nobody saw, an Accept that wrote a definition with inferred geometry). The rule that separates the two:
**friction may be removed from the person's hands only by moving it into the machine, never by dropping it.**
Auto-capture is legitimate; silence is not.

## Where the document can point, rather than assert

| Claim | Artifact |
|---|---|
| Declaration over code | `schema/`, `lint/`, `ui/` triplets; lint DSL interpreted by LintEngine |
| Defaults are data and admit their absence | `ownership-policy` records (CLAUDE.md rule 9) |
| The compiler names its reasons | `resolutionEngine.ts` reason codes; clarification cards |
| Human owns regulated writes | acceptance gate on every proposal; no model-origin writes |
| Provenance hierarchy is not collapsible | concept ≠ formulation ≠ instance ≠ aliquot ≠ composition |
| Absence is a state, not a null | absence card with reason; `draftProducedNothing` + absence probe tiers |
| The AI chooses a journey, the compiler decides legality | journeys doctrine; compiled plan, versioned contracts |

## Open questions this section will have to answer

- Who may author a policy bundle, and how is a bundle's permissiveness bounded (which fields may relax)?
- Is the honesty floor enforced structurally (schema/lint) or by convention? Today: partly both.
- What is the equivalent of the creation journey for a *regulated* lab — where the same wizard must also
  collect signature, competency and instrument qualification before returning?
