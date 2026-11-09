# Ruling — clarification defaults: ghost first, ask only when genuinely uncertain

Architect ruling, 2026-11-09. Lane 2. Brad's decision, recorded verbatim.

## 1. Brad's words (source of record)

On prompt 2's re-drive result (`leg3` failing `card-not-seen` / `answer-not-submitted`):

> **"In this case the correct action is A."** — i.e. the app is behaving correctly when a fully
> specified instruction produces a proposal with no clarifying question; the *test's* expectation
> is what was wrong.

And the product rule he wants this to become:

> "this is a KEY concept in how the app behaves abd is worth a follow up convo. i really DON'T want
> the yser to ever have to answer a frustrating follow-up clarificiation card if the dont NEED to
> while u also ubderstabdd that sometimes they need to. the default behaviour should be: if the noun
> and verb resolutions are readonably certain ghost it over the plate. The tooltip should allow them
> to inspect the assumptions being made (ie noun resolution). that should be good enough 90% of the
> time. if the noun or verb resolution (or labware or equipment) is genuinely uncertain, a clarifier
> should be asked."

## 2. What that means as behaviour (five statements, testable)

1. **Default is ghost, not question.** When the noun (what material/entity) and the verb (what
   operation) resolve with reasonable certainty, the app proposes directly on the plate.
2. **The proposal must be inspectable.** The tooltip carries the assumptions actually made —
   especially noun resolution: which material concept, which formulation, which concentration, which
   formula of the quantity. A user who does not trust the ghost hovers and reads it.
3. **The ghost must be reversible.** Discard leaves the record byte-identical. (Already proven:
   leg3 `discard-unchanged`, 2 events before and after.)
4. **Ask only on genuine uncertainty**, and the class matters: noun, verb, **labware**, **equipment**.
   A confused plate or instrument must never be guessed at.
5. **A card that is asked must be answerable and answered** — a card that appears and cannot be
   submitted is a defect, not a caution.

## 3. Amendment to the prompt-2 acceptance gate (approved, applied)

`leg3`'s criterion (a) `card-not-seen` and (b) `answer-not-submitted` are replaced by one conditional:

- **(a) `card-unanswered`** — *if* a clarification card appeared, an answer must have been submitted.
  A card is no longer required. The receipt records which path ran (`clarificationPath:
  not-required | asked-and-answered`), so "did not ask" is visible evidence, not silence.

`leg4` (grouped two-slot answer + submit) becomes **NA, not FAIL**, when no card appears: its subject
was never exercised. It also now always populates `failedCriteria`, which fixes the receipt that
previously read `status=FAIL failedCriteria=None` — a verdict with no stated reason.

Both drivers carry the amendment in their header comments with the date and Brad's approval, because
they are pre-registered gates and the change must be legible at the point of reading.

## 4. Where the ask/ghost decision lives today (evidence, for the follow-up conversation)

There is no declared policy. The behaviour is emergent:

- **The model authors the questions.** The draft tool's `clarificationRequests[]` is the sole
  channel, constrained only by prompt text ("never confirm a quantity the user already stated").
- **A filter removes some over-asking.** `server/src/ai/filterModelClarifications.ts` drops
  model-authored questions that demand an amount the material's type does not owe (the 2026-09-20
  seeding-card incident), and reports the drop — never silently.
- **The harness forces some asks** with `origin: 'harness'`
  (`forceMaterialClarifications.ts`, `materialRangeClarification.ts`), and those are always kept.
- **Repeats are bounded** by `clarificationLoop.ts` — the same question twice is named, not hidden.

So today "the app asks when the model decides to ask, minus what a filter deletes." That is exactly
the implicit rule Brad has now asked to make explicit.

## 5. Proposal for the follow-up (to be ratified, not assumed)

Follow the `config/drafting/forced-tool-compliance.yaml` precedent — declared policy, loaded per call,
absent means silent-off with disclosure:

- A new `config/drafting/clarification-policy.yaml` declaring **ambiguity classes** (noun/concept,
  formulation, quantity/formula, verb/operation, labware, equipment, well-range) with, per class:
  `ask: always | above-threshold | never`, the signal that establishes certainty, and the tooltip line
  the assumption must produce when the class is ghosted.
- The model may raise a clarification **only** for a class the policy marks `ask`; every other
  ambiguity is ghosted and must surface as a tooltip assumption line.
- Labware and equipment default to `ask: always` per Brad's sentence.
- The 90% figure becomes measurable: count the prompts where a card was shown, and the prompts where
  a ghost was later discarded without change — the second number is the cost of asking unnecessarily.

## 6. What this ruling does and does not do

- It does **not** change product behaviour. Option A was a decision about acceptance criteria; no
  code and no prompt changed.
- It **does** unblock prompt 2: with (a) amended, leg3 has to prove the proposal is correct, visible,
  inspectable and discardable — which is what it already did.
- The parked clarification work stays parked until §5 is ratified, so the card seam is not paid for
  twice.
