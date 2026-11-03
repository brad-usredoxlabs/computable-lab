# RULING — CARD1 D3: canonical label source for an UNBOUND acceptance entity
Ruling by: cl-architect (lane 2). Date: 2026-11-03T14:30 EST (l2t1430).
Item: L2-CLARIFY-CARD-1 defect D3 (BLOCKING, browser-gate verdict 2026-11-03T12:17).
Worktree examined read-only: /mnt/vast/home/brad/git/wt/L2-CLARIFY-CARD-1-lane2-l2t0230 @ 10062725.
Status: BINDING for the fix run. No product code edited by this ruling; no dispatch; no merge.

## 0. What I verified myself (not coder summary)

- Receipt `~/.hermes/cl/receipts/L2-CLARIFY-CARD-1/2026-11-02_2225-tier1/draw-hashes-clo.txt`:
  10 draws -> exactly 2 hashes (`09df02df…` x6 = "1 mM clofibrate in DMSO", `fdc6e54b…` x4 =
  "1 mM Clofibrate in DMSO"). Only difference: one character of case. Confirmed.
- `server/src/ai/shorthandChat.ts:695` `factRequestId` hashes `fact.label` RAW — one char of case
  changes the id. Confirmed.
- `shorthandChat.ts:898-901` `nounPrompt` embeds `fact.label` raw verbatim. Confirmed.
- `shorthandChat.ts:1063-1066` fold join keys on `factRequestId`; `dropSatisfiedFacts` (`:1378-1392`)
  compares the doc slot value `!== entry.label` raw. One case flip defeats BOTH. Confirmed.
- The coder's premise "there is no in-flow canonical source" is TRUE for the spine and the
  (nonexistent) declared-material table — but FALSE as a general claim: `server/src/materials/termId.ts`
  is ALREADY the repo's declared single source of truth for "how a free-text label becomes a local
  CRUD id", it is ALREADY case-insensitive BY DESIGN (`labelHash`: "Case-insensitive so
  DMSO/dmso agree"), and `localMaterialIdForLabel` ALREADY collapses case+whitespace+punctuation
  drift onto ONE recordId (`MAT-<slug>-<hash>`). The canonical source is not missing; it is
  unused on the clarification path. Re-use, do not invent.
- The local-term store (material records via `MaterialGrounding.ts` / `VocabHandlers` `/vocab/mint`,
  ids from `localMaterialIdForLabel`) is the mint layer the card's own "create a local term" verb
  already points at (spec line 43's `MINT_OFFER_PREFIX` pair, byte-locked).
- UNVERIFIED: whether the live :5193 store currently holds any clofibrate material record (the
  receipt shows none consulted mid-draw; the fix run must not assume either way — the rule below
  works in both states).
- UNVERIFIED: which of the ~15 `shorthandChat.*` byte-stability pins hard-code an exact digest
  string vs only the `unresolved-c-<hex>` shape. Section 5 covers the pin that proves the id
  SEMANTICS; if a pin hard-codes a digest, updating it is EXPECTED here (the id's meaning is
  legitimately changing) and must be called out in the report diff, not silently fixed.

## 1. The canonical-source ruling (the question as asked)

An unbound acceptance entity has NO canonical label before the lab names it. That is a fact about
the domain, not a bug: the spine declined it, nothing declared it. So "the canonical label" is
owned by a two-stage source, and the two-stage rule is what makes all three acceptance clauses
hold simultaneously:

STAGE A — GROUNDED (a local-term record for this identity already exists in the store):
  The canonical label is the record's TITLE, full stop. The identity of the record is
  `recordId = localMaterialIdForLabel(fact.label)` — the existing, case/whitespace-insensitive
  idempotent id (termId.ts; same label -> same id, so `Clofibrate` and `clofibrate` resolve to the
  ONE existing record). Ask-time lookup replaces the raw label everywhere it surfaces.
  This is a READ of existing machinery; it introduces no new store, no new vocabulary.

STAGE B — PRE-MINT (no record exists, e.g. the 10 unanswered fresh draws):
  There is no case to know, so the card must not pretend the model's re-rolled case is one.
  The rendered label is the label's IDENTITY FORM: `canonicalLabelKey(fact.label)` as defined in
  section 2 — trimmed, whitespace-collapsed, ASCII-lowercased — and NOTHING else changes
  (the sentence template around it stays byte-identical, punctuation stays as typed).
  This is NOT the forbidden "lowercase arbitrary prose": the transform is scoped, by code AND by
  declaration, to the ONE label token quoted inside the template — it is an identifier being
  displayed in its identity case, exactly what `labelHash` already does for identity. Chat prose,
  answer sentences, messages, and every other rendered string are untouched. When a user types a
  free-text answer, THAT is prose — it rides through raw into the mint (section 3's title rule);
  it is never pre-folded for storage.

STAGE C — THE TRANSITION (someone names it): the mint path already collapses both case variants
onto one `MAT-…` id, so one record wins automatically. Its title is adopted from the SCIENTIST'S
own phrasing at the naming moment if that phrasing normalizes to the same identity key (raw
sentence-cased text becomes the record title — human case, decided at the review surface, exactly
Brad's standing ruling: local term now, linked later, terms confirmed in the review dialogue,
never on a blocking pre-draft card). Otherwise the title stays the identity form. From then on
every surface reads STAGE A's title.

Layer that OWNS the label: the local-term/material RECORD (data in the store). Not the model,
not the spine, not a code constant. The server code below only READS it.

## 2. The identity key rule (implement verbatim; no judgement calls)

In `server/src/materials/termId.ts` add the shared normalizer (termId.ts is its single source of
truth; `labelSlug`/`labelHash` must stay defined off it or stay byte-identical — do not diverge):

    canonicalLabelKey(label) :=
      NFKC(label).trim().replace(/\s+/g, ' ').toLowerCase('en')   // ASCII-fold after NFKC

and the ONE rule a coder implements everywhere:

1. IDENTITY: `factRequestId`'s key replaces raw `fact.label` with `canonicalLabelKey(fact.label)`.
   Everything else in the key (actionIndex, action, argument, reason) is unchanged. The id KEEPS
   the `unresolved-c-<sha1-10hex>` shape — only what is hashed changes. Effect: case/whitespace
   drift cannot change the id; the fold's 1:1 join (`factByKey`), the legacy-safe fallback, and the
   answered ledger all start agreeing across re-derivations.
2. DROP: `dropSatisfiedFacts` replaces `value !== entry.label` with
   `canonicalLabelKey(String(value ?? '')) !== canonicalLabelKey(entry.label)`.
   Type-unsafely-guarded: non-string slot values take the existing `return true` (keep) arm.
3. RENDER: the displayed label token = `canonicalLabel(fact)`, section 3's read path. NEVER render
   `canonicalLabelKey` of a string that has a grounded record; NEVER feed `canonicalLabelKey` back
   into storage as the durable title.
4. PUNCTUATION: never rewritten. Hyphens/slashes/parens are identity-relevant beyond the slug
   (slug is for the human-readable id segment; `canonicalLabelKey` keeps them verbatim — the
   collapse-insensitive join is exactly trim + inner-whitespace + case, nothing else).
5. SCOPE LOCK: `canonicalLabelKey` may be called ONLY in the three sites above plus mint-id
   derivation (which already case-folds via `labelHash`). A test grep-pins that no render path in
   `app/src` or prompt-template code calls it.

## 3. Persistence and read paths

- WHERE THE VALUE LIVES: the minted local material record's title (the existing material store via
  `/vocab/mint` / `MaterialGrounding` create-with-existing-wins). No new YAML holds a label VALUE
  — that would be a second vocabulary. What the YAML holds is the small POLICY (below).
  Policy home, smallest justified data: one `canonicalLabel` block in
  `schema/scientist-intent/scientist-intent-vocabulary.yaml` under the material domain, declaring
  `{ preMintDisplay: identity-case, mintedDisplay: record-title, titleAdoption: scientist-phrasing-
  when-key-equal }` — loaded per call like `nounShape`/`assumedValues` (never process-cached). If
  the vocabulary loader's shape makes this block unshapeable without a loader change, STOP and
  return to the orchestrator rather than hardcoding the policy.
- WHO WRITES THE RECORD: the mint path writes it (existing `/vocab/mint` handler, id from
  `localMaterialIdForLabel`). Nobody writes labels at ask time; ask-time is read-only.
- READ PATHS:
  (i) clarification text — in `clarificationsFromUnresolvedFacts`, one server-side helper
      `canonicalLabel(fact)` computes `localMaterialIdForLabel(fact.label)`, does a store GET,
      and returns title (STAGE A) or `canonicalLabelKey(fact.label)` (STAGE B); it feeds
      `nounPrompt` and the request's `label` field. The `unresolvedFact` mirror keeps the raw
      label untouched (provenance: what the model said stays visible in the fact).
      Note: `shorthandChat.ts` today has no record-store handle on this path — plumbing a
      READ-ONLY store reference into the map (via the same injection the handlers use) is
      expected work of this fix; UNVERIFIED: its exact seam, the coder finds it (it exists —
      the mint offer and /m picker already touch the store on adjacent paths).
  (ii) Answered row — renders the `label` ALREADY on the wire from (i) (server-echoed), never the
       model text; the persisted `metadata.clarification.id` is now drift-stable per rule 1, so a
       cold rehydrate joins. No new client label logic.
  (iii) minted durable name — mint uses the SAME `canonicalLabel` string for the offered name and
       the `MAT-` id; D5's seed+noun concat must render `canonicalLabel` once (seed and noun that
       share an identity key display ONE row label); the stored TITLE then follows titleAdoption.
       One entity, one string, everywhere.

## 4. Scope verdict: stays inside L2-CLARIFY-CARD-1 — no new item

D3's fix is: `canonicalLabelKey` in termId.ts + id/drop/render rewiring in shorthandChat.ts + the
read-only store lookup + the vocabulary policy block. D5 is a CONSUMER of the same
`canonicalLabel` (its concat dies the moment rule (iii) lands — do D3 first, D5 shrinks to the
exact-string pins). D2's server half was already blocked ON this ruling (its re-ask is caused by
the id drift rule 1 removes; the ledger extension proceeds as the coder's report already scoped).
Justifying evidence is the existing gate record itself: draw-hashes-clo.txt two-way split + the
fix-4 report's receipt-grounded mechanism (facts at :898, :695, :1378, fold :1063). No new
finding, no new surface, no new authority — a new item would duplicate this one.

## 5. Minimal pins (RED first, one line each; run with the pnpm-workspace-root vitest — the
report's corrected note that server pins run here is accepted and re-confirmed unnecessary to
re-litigate)

1. RED: `factRequestId({label:'1 mM clofibrate in DMSO', …same loc/reason}) ===
   factRequestId({label:'1 mM Clofibrate  in DMSO', …})` — fails today (raw-hash digests differ).
2. RED: `clarificationsFromUnresolvedFacts` on both case variants -> byte-identical `prompt` and
   `label` (store empty -> both render the identity form).
3. RED: same two variants -> `canonicalLabelKey` equal AND ids equal -> fold `answerShorthand`
   joins a turn-1 card answered in a turn-2 context flip; `dropSatisfiedFacts` drops the
   re-derived fact (the D2-server two-turn fixture folds onto this pin's fixture).
4. GREEN-guard: existing `shorthandChat.*` byte-stability suite stays green EXCEPT digests that
   legitimately re-derive (report must list any such pin and why).
5. SCOPE LOCK: source-grep pin — `canonicalLabelKey` appears only in termId.ts, shorthandChat.ts
   (id/drop/render sites), the mint derivation, and tests; zero occurrences in `app/src`.
6. RED (D5, after D3 lands): rendered `[Local]` row label === `canonicalLabel(fact)` exactly (no
   seed+noun concat), and the minted durable name === the same string, RED against the pre-fix
   builder.
7. Live gate (orchestrator-owned, not vitest): re-run the 10-draw driver; draw-hashes-clo.txt must
   show ONE hash x10. If the store already holds the record at re-gate, that is STAGE A proven
   live; if not, STAGE B proven live — either satisfies D3 as ruled; report which occurred.

## 6. Hard-rule audit of this ruling

- One term per entity: the identity key IS the term's identity (already the mint layer's own
  rule); no second vocabulary is created — records stay the single vocabulary.
- No global prose lowercase: the fold is token-scoped, YAML-declared, grep-pinned (pin 5), and
  never applied to user/model prose stored anywhere.
- Context/provenance kept distinct: the raw model label survives verbatim on
  `unresolvedFact.label`; the canonical label is a derived display/identity layer.
- Policy in YAML (the vocabulary block), code only follows it; if the block cannot load, stop —
  no hardcoded fallback policy.
- D3 acceptance NOT weakened: 10 identical fresh draws byte-identical is guaranteed by
  construction (the rendered string becomes a pure function of the identity key when unbound,
  and of the record title when grounded).

END-RULING
