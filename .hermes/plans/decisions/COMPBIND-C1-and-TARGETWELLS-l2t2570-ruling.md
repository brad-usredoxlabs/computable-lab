# ARCHITECT RULING — two owed seam questions: COMPBIND criterion 1 tie-break; targetWells ownership (lane 2, l2t2570)

Date: 2026-11-06 08:35 EST. Decider: architect. Requested by: lane-2 orchestrator, handoffs l2t2550
("criterion 1: should declared-formulation twin at equal score auto-resolve?") and l2t2565
("ARCHITECT QUESTION: which layer owns wells->targetWells binding (policy parameterBinding vs vocabulary
satisfiedBy alias)?").

---

## Q1 — COMPBIND criterion 1: a declared formulation's twin at equal score

**Ruling: it auto-resolves in favour of the DECLARED formulation, and the precedence is declared in DATA.
It must not surface a clarification card.**

Reasoning from the binding contract already in force (task block, filed 2026-11-02): "an exact-name bind
to a formulation carrying concentration+solvent is a bind, not a blob." The utterance
`1 mM clofibrate in DMSO` *declares* a formulation. When the spine derives a second candidate from that
same mention — the raw substances read out of the declaration — the two are not two things the scientist
said; one is what they said and the other is our own derivation of it. Asking them to choose between
their own words and our parse of those words is the popup-form failure, not disambiguation.

Conditions (ALL must hold, else clarify as today):
1. the winning candidate is sourced from the mention's own declaration (it carries concentration +
   solvent, i.e. the declaration named it), and
2. the twin is derived from that same mention — not independently mentioned in the utterance, and
3. scores are equal.

Negative pins that must survive: two INDEPENDENTLY mentioned distinct formulations at equal score still
clarify (never auto-pick between two things the scientist actually said); a derived twin whose parent
declaration lacks concentration or solvent does not qualify.

**Where the rule lives:** the vocabulary's existing `ambiguity` / contender-level declaration — a level or
precedence flag on the declaration-sourced candidate. NOT a new TS comparator, NOT a name branch. If the
existing block cannot express "declaration-sourced outranks derived-from-same-mention", the unit extends
that block additively (data), and the report must show the diff in the YAML, not in the resolver.

**Criterion 3** (spine without `MSP-PR9-TEST-CLO-1MM`) stays open and needs a data-write owner; it is not
this unit's code problem and must not gate criterion 1.

---

## Q2 — targetWells: which layer owns the wells->targetWells binding

**Ruling: neither of the two proposed homes. The owner is the DECLARED ARG-KIND LOWERING in the
vocabulary layer, implemented once generically.**

Grounds, read at source this session:
- `schema/registry/realization/robot-realization.policy.yaml:26,141` — `parameterBindings` is explicitly
  "which CONSTRAINT DIMENSIONS have a scientist-intent arg". `targetWells` is a well-coordinate set, not
  a typed planner constraint bound. Binding it there would put a spatial noun into a dimensional table.
- `scientistIntent/vocabulary.ts:44` — the kind enum is `'resolvable' | 'scalar' | 'wells' | 'quantity' |
  'wellset'`. `wells` is a first-class declared kind, so its lowering belongs beside the other kinds, in
  the same generic mechanism that lowers `quantity` and `scalar`.
- `satisfiedBy?: string[]` (`:285`) aliases one argument's value to another argument's — that is a
  name-to-name alias, not a parser for a coordinate set. Using it here would alias `targetWells` to some
  other field that also has no lowering: a rename, not a fix.

Therefore: one generic lowering keyed on the DECLARED kind (`wells`/`wellset` -> well-coordinate set),
reachable by every verb that declares such an argument (add_material, transfer, aliquot,
serial_dilution — `intent.compile.system.yaml:49,51,59,68`), with the syntax it accepts declared in data
alongside the kind rather than hardcoded per verb.

**First step for the unit, before any code:** prove WHICH of the two is actually unwired — the `wells`
lowering, the `wellset` variant, or both — by exercising the declared path and pasting the failure. u1's
finding ("no parameterBinding/labelField/satisfiedBy alias") describes three mechanisms that should never
have been candidates for this arg; the report must say what it measured, not what it ruled out.

**Non-goals:** a `parameterBindings` entry for `targetWells`; a per-verb TS mapping; a `satisfiedBy`
alias to another well-shaped arg; inventing default wells.

**Scope consequence:** VACUOUS-PINS u1 stays BLOCKED on this until the lowering lands. If the lowering
turns out to be more than one unit, the VACUOUS-PINS pin (its actual deliverable) proceeds against the
`wellset`-free arm and records the gap; the debt item is filed against the vocabulary layer, not against
VACUOUS-PINS.

---

## OBLIGATIONS PRODUCED

1. Orchestrator: cut COMPBIND's criterion-1 unit as a DATA-level precedence extension per Q1 with the two
   negative pins; no merge of u14/u14fix is conditional on it.
2. Orchestrator: cut the wells-lowering unit per Q2, evidence-first (measure which mechanism is missing),
   and un-block VACUOUS-PINS u1 accordingly.
3. Both units cite this file. Neither may add a domain/kind name literal in TypeScript.
