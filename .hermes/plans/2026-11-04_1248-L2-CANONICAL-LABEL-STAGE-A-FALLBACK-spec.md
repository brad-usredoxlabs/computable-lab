# SPEC OF RECORD — L2-CANONICAL-LABEL-STAGE-A-FALLBACK

    item:        L2-CANONICAL-LABEL-STAGE-A-FALLBACK
    status:      PROMOTED (spec-of-record) 2026-11-04T12:50 EST by orchestrator l2t1245
    author:      cl-spec-composer unit cl-l2-composer-canonlabel-l2t0955 (draft 36,192 B)
    rotated in:  drafts/CANONICAL-LABEL-STAGE-A-l2t0955.md (byte-identical content below, header replaced)
    base rev:    33760236 (branch cl/integration-2) — every cited line and baseline re-checked at that rev
    authority:   decisions/CARD1-D5-one-entity-one-label-l2t0520-ruling.md §4 (Q4), binding
    start gate:  ONLY after L2-CLARIFY-CARD-1 closes (ruling Q4). CARD-1 is blocked-by
                 L2-THREADSCOPE-FLIP-1. No dispatch is authorised while that gate holds.
    scope class: READ-ONLY product change. No data repair, no migration, no new policy imperative.

## ORCHESTRATOR PROMOTION REVIEW (what I checked myself, at 33760236)

Promoted after a first-hand review, not on the composer's word:

1. **Badge anchor (the ruling's unproven premise).** The ruling's §Observation 3 assumed a "New" badge on the
   CARD. Measured: `grep -c "'New'\|VOCABULARY_BADGE" app/src/agent/ChatClarificationCard.tsx` = **0**; the
   badge is the PICKER's (`ClarificationPicker.tsx:981` class `message-log__clarification-mint__badge`,
   `:988` renders `{VOCABULARY_BADGE.mint}`) and the DATA token is `tokens.ts:45` `local: 'Local'` /
   `:47` `mint: 'New'`. The draft records this as a MOVED pin and does not invent an anchor. ACCEPTED.
2. **Legacy record is real.** `GET :3093/api/records/MAT-1-mm-clofibrate1-mm-clof-l84l` = 200,
   `payload.name = "1 mM Clofibrate in DMSO"`, `status = proposed`, file sha256 `ad9797f6…df81`. ACCEPTED.
3. **Cost bound — the one open question the composer deliberately left to me. RULED:** the bound is
   **one LAZY `store.list` per batch** (materials-only, `limit: 10000`, skipped entirely when nothing is
   unresolved), tested exactly by AC-6(a)/(b). Worst case is therefore **two per assistant turn** (the two
   batch sites `AgentOrchestrator.ts:1560`/`:3127`), never one per fact. A **per-turn cache is REJECTED**:
   it adds invalidation state to a read-only display fallback for no measurable saving. AC-6 as written is
   the contract; the coder may not add caching.
4. **Badge word — RULED (and already consistent with the draft's AC-7):** the ONE word is **`New`**, declared
   once in DATA (`tokens.ts:43-48`) and never as a component literal (AC-7(b) grep guard makes that
   enforceable). AC-7's rejected-alternative reasoning (four concrete breakages) is accepted.
5. **Scope class.** Every criterion is gradeable and READ-ONLY; AC-4 proves zero writes with throwing stubs
   and AC-8 proves the legacy record file is byte-identical before/after. No criterion was weakened, and
   none was added by me.

Read the rest of this document as the spec-of-record; §4 (AC-1..AC-9) is the grading contract and §7 is the
pin re-audit.

---

# SPEC OF RECORD (DRAFT) — L2-CANONICAL-LABEL-STAGE-A-FALLBACK

    item:        L2-CANONICAL-LABEL-STAGE-A-FALLBACK
    owner:       unassigned (fleet coder; authored by cl-spec-composer unit cl-l2-composer-canonlabel-l2t0955)
    status:      DRAFT — not promoted, not dispatched
    base rev:    33760236 (branch cl/integration-2, tree /mnt/vast/home/brad/git/cl-integration-2)
    authority:   decisions/CARD1-D5-one-entity-one-label-l2t0520-ruling.md §4 (Q4), binding; §1 Q1(a) and
                 §3 Q3 amendment are load-bearing for criterion reconciliation below
    item text:   task-list.md:17871-17901 (id, description, hard bounds, "verified by")
    date:        2026-11-04
    scope class: READ-ONLY product change. No data repair, no migration, no new policy imperative.

## 0. GOAL (one sentence)

Extend the READ-ONLY STAGE A canonical-label read with the mint handler's OWN sanctioned
case-insensitive exact-name lookup, as a fallback AFTER the id-keyed miss, so a legacy-id material
record grounds the card and the question row renders that record's stored title; and pin ONE word for
the mint row's badge in DATA.

## 1. PROBLEM STATEMENT (measured in this tree at 33760236)

### 1.1 The id key and the name key are two different resolution functions

- STAGE A is ID-KEYED. `canonicalLabelsForFacts` derives the record id from the fact's label:
  `server/src/ai/shorthandChat.ts:1100` `const recordId = localMaterialIdForLabel(fact.label)`, then
  one `store.get(recordId)` per distinct id (:1104-1115). Missing record ⇒ the key is ABSENT from the
  map (:1116-1118) ⇒ the caller renders STAGE B.
- The mint handler is NAME-KEYED. `server/src/api/handlers/VocabHandlers.ts:124-126`:
  `const materials = await store.list({ schemaId: mintable.schemaId, limit: 10000 }); const needle =
  label.toLowerCase(); const nameMatch = materials.find((env) => payloadName(asPayload(env)).toLowerCase() === needle)`,
  and on a hit it returns the STORED title (`label: payloadName(...) || label`, :131). The id lookup is
  only the SECOND arm (:137-145). So the two layers resolve the same entity by DIFFERENT keys, in the
  opposite order of precedence.

### 1.2 For a legacy record the two keys disagree — measured

The lane store is `/home/brad/.computable-lab-lane2` (config.yaml:5 `dataDir`). The legacy record lives at
`/home/brad/.computable-lab-lane2/worktrees/main/records/material/MAT-1-mm-clofibrate1-mm-clof-l84l__1-mm-clofibrate1-mm-clofibrate-in-dmso.yaml`
(sha256 `ad9797f6b2fbfbb3b08932942a364f6a18c865f956a333d87d570e1d1121df81`, mtime
`2026-11-03 00:37:45.950447254 -0500`, size 364 B), and `GET :3093/api/records/MAT-…-l84l` returns
HTTP 200 with `payload.name = "1 mM Clofibrate in DMSO"`, `payload.status = "proposed"`,
`payload.domain = "other"`.

Run in `server/` (measured by the composer at 33760236, `npx tsx`):

    localMaterialIdForLabel('1 mM Clofibrate in DMSO')  ->  "MAT-1-mm-clofibrate-in-dmso-1cqj"
    canonicalLabelKey('1 mM clofibrate in DMSO')        ->  "1 mm clofibrate in dmso"
    legacy recordId on disk                             ->  "MAT-1-mm-clofibrate1-mm-clof-l84l"

`MAT-1-mm-clofibrate-in-dmso-1cqj` ≠ `MAT-1-mm-clofibrate1-mm-clof-l84l`, so the STAGE A `store.get`
misses structurally: the id suffix of the legacy record is the pre-D3 `${seed}${noun}` concatenation
(`1-mm-clofibrate1-mm-clof`) and no label-derived id can ever equal it. Yet the mint handler's
`store.list`/`.find` DOES find that record (its name lowercases to the mint needle), so the mint
existing-wins onto it.

### 1.3 The visible failure — three casings on one card

With the card built from the map (shorthandChat.ts:950-951 `identityKey = canonicalLabelKey(fact.label)`;
`groundedTitle = canonicalLabels?.get(identityKey)`; :953-975 the declared `mintedDisplay` /
`preMintDisplay` arms), a legacy-id entity renders STAGE B:

    question row  : "1 mm clofibrate in dmso"      (STAGE B identity form — :968, measured key)
    mint row seed : "1 mM clofibrate in DMSO"      (app: ClarificationPicker.tsx mintLabelFor :389-411,
                                                    seeds from unresolvedFact.label = RAW provenance)
    answered row  : "1 mM Clofibrate in DMSO"      (mint response label = the record title, VocabHandlers.ts:131)

Three strings, one entity, one card: the "one entity, one label" defect (ruling §4, Observation 2).

### 1.4 Why the divergence is a READ bug, not a data bug

The record's title was adopted at its own naming moment (2026-11-03T05:37Z, ruling §0). Ruling Q2 rules
that a mint hit on an existing record MUST NOT write that record's title, and §4 rules that legacy data
repair (renaming/re-iding `MAT-…-l84l`) is NOT authorised. The only admissible fix is to make the READ
agree with the mint's own lookup. That is this item.

## 2. MECHANISM (exactly where the change goes)

One function changes: `canonicalLabelsForFacts` (server/src/ai/shorthandChat.ts:1087-1120). Nothing else
in server code changes. No YAML change (see §2.4). No client display change (§4, AC-7).

### 2.1 Shape after the change

```ts
// server/src/ai/shorthandChat.ts  (existing export, same signature, same return type)
export async function canonicalLabelsForFacts(
  facts: readonly ScientistIntentUnresolvedFact[],
  store?: RecordStore,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!store) return map;

  // identityKey -> entry.  needle is the MINT handler's own key (VocabHandlers.ts:125).
  const byKey = new Map<string, { recordId: string; needle: string; title: string }>();
  for (const fact of facts) {
    if (typeof fact.label !== 'string') continue;
    const key = canonicalLabelKey(fact.label);
    if (byKey.has(key)) continue;
    byKey.set(key, {
      recordId: localMaterialIdForLabel(fact.label),
      needle: fact.label.toLowerCase(),               // VERBATIM mint semantics — bare toLowerCase per MaterialGrounding.ts:213 (no trim)
      title: '',
    });
  }

  // PASS 1 — UNCHANGED: id-keyed GET, deduped by recordId, all in parallel.
  await Promise.all([...byKey.values()].map(async (entry) => {
    const env = await store.get(entry.recordId).catch(() => null);
    const title = payloadTitle(env);
    if (title) entry.title = title;
  }));

  // PASS 2 — NEW: name-keyed fallback, mint's OWN lookup, AFTER the id miss.
  // Runs only if at least one identity is still unresolved; ONE list for the
  // whole batch; a failing list degrades to STAGE B and never throws.
  const unresolved = [...byKey.values()].filter((entry) => !entry.title);
  if (unresolved.length > 0) {
    let materials: RecordEnvelope[] = [];
    try {
      materials = await store.list({ schemaId: MATERIAL_SCHEMA_ID, limit: 10000 });
    } catch {
      materials = [];                                  // absent/failing list => STAGE B
    }
    for (const entry of unresolved) {
      const hit = materials.find((env) => payloadName(env).toLowerCase() === entry.needle);
      const title = payloadTitle(hit);
      if (title) entry.title = title;
    }
  }

  for (const [key, entry] of byKey) if (entry.title) map.set(key, entry.title);
  return map;
}
```

Helpers `payloadName` / `payloadTitle` are the local mirrors of VocabHandlers.ts:71-84 (`asPayload`
object-payload guard; `payloadName` = `payload.name` trimmed else `''`) — the same deliberate local-mirror
discipline VocabHandlers documents at :71-73. `payloadTitle(env)` = `payloadName(asPayload(env))`, i.e. the
existing inline predicate at shorthandChat.ts:1109-1113 lifted into a named helper so both passes use ONE
predicate. `MATERIAL_SCHEMA_ID` is imported from `server/src/materials/MaterialGrounding.ts:7` (already
exported, imports only `termId.js` + `store/types.js` — no cycle with `ai/`); do NOT add a new literal.

### 2.2 Ordering and precedence (non-negotiable)

1. id-keyed `store.get` FIRST, exactly as today, same dedupe by `recordId`.
2. name-keyed `store.list` FALLBACK only for identities the id pass left without a title (miss OR
   a record whose `payload.name` is not a non-empty string).
3. A title found by id is never overwritten; a title found by name never overwrites an id title.
4. `.find` (FIRST match in `store.list` order) — never `.filter(...)[0]` with a re-sort, never
   `.findLast`: the mint uses `.find` on the same call shape, so both layers pick the same record.

### 2.3 Identity key / dedupe consequences

- The map stays keyed by `canonicalLabelKey(fact.label)` (:1098). DO NOT re-key by recordId: two facts
  that differ only in case/whitespace must still collapse to ONE key and one entry (AC-5).
- The fallback can map several DISTINCT identity keys onto the SAME record only if their stored names
  are case-insensitively equal; because `canonicalLabelKey` already folds case and inner whitespace, two
  distinct keys can never produce the same needle unless they differ only by NFKC form. Accepted (the
  mint would take the same record for both).
- The returned map gains entries only where a title exists; every previously-absent key stays absent
  (the STAGE B guarantee / 10-fresh-draws property is untouched).

### 2.4 Why NO new policy token in the YAML block

`schema/scientist-intent/scientist-intent-vocabulary.yaml:950-953` stays byte-identical
(`preMintDisplay: identity-case`, `mintedDisplay: record-title`,
`titleAdoption: scientist-phrasing-when-key-equal`). The fallback introduces no new DISPLAY rule: the
STAGE A/B display tokens are consumed unchanged at shorthandChat.ts:953-975. It changes only WHICH facts
reach STAGE A, and the only admissible rule for that is "agree with the mint", which is a consistency
invariant, not a policy choice. A declared switch here would license STAGE A and the mint to disagree —
the exact defect this item closes. `loadCanonicalLabelPolicy` (canonicalLabelPolicy.ts:96-137) therefore
needs no change and its token set (:54-58) stays untouched.

Consequence to state in the report: if a future reviewer wants a switch, it must be a token in THAT block
plus a loader token-set entry plus the meta-schema enum — out of bounds here.

## 3. RECONCILED CRITERION (read this before grading AC-3)

The item's "verified by" line says "the pre-mint row, the mint row and the answered row render ONE string".
The binding ruling's §3 amendment (still binding, quoted there as the exact close text) says, for the
EXISTING-WINS case: "the ANSWERED-row label === the durable name read back … and the pre-mint row label is
transient identity-form provenance, graded for being ONE label only, not for exact equality with the
record title."

The app makes the mint row's seed the RAW provenance label on purpose
(`ClarificationPicker.tsx:389-411`, `mintLabelFor` reads `request.unresolvedFact.label` first, citing ruling
l2t1951 Q1: feeding the canonical fold back as the durable title is forbidden). `unresolvedFact.label`
MUST stay the model's verbatim string (shorthandChat.ts:1059 `unresolvedFact: fact`)
so provenance is never collapsed.

Therefore the gradeable form of "ONE string" is the ruling's, not the paraphrase's:

- one STRING chain: question row === record title === answered row (all `"1 mM Clofibrate in DMSO"`);
- one LABEL (not one literal): the mint row's seed is the entity's offered phrasing, is exactly what the
  mint call sends, resolves to the SAME record id, and creates nothing;
- when the offered phrasing is already case-identical to the title, all three literals ARE equal — pinned
  as AC-3(b) so the "ONE string" claim is proven on the case where it is true.

This is a reconciliation of the item's summary with its binding source, not a weakening: no assertion is
deleted, and the STAGE A assertion is strictly NEW.

## 4. ACCEPTANCE CRITERIA (each independently gradeable)

Fixture constants used below (all measured at 33760236, §1.2):

    LEGACY_ID    = 'MAT-1-mm-clofibrate1-mm-clof-l84l'
    LEGACY_TITLE = '1 mM Clofibrate in DMSO'
    FACT_LABEL   = '1 mM clofibrate in DMSO'          // differs from the title only in case
    FACT_KEY     = canonicalLabelKey(FACT_LABEL) = '1 mm clofibrate in dmso'
    FACT_ID      = localMaterialIdForLabel(FACT_LABEL) = 'MAT-1-mm-clofibrate-in-dmso-1cqj' (≠ LEGACY_ID)

**AC-1 (RED-first, server).** New test file `server/src/ai/shorthandChat.canonicalLabelFallback.test.ts`.
Fake store: `get` resolves `null` for every id; `list` resolves exactly
`[{ recordId: LEGACY_ID, schemaId: MATERIAL_SCHEMA_ID, payload: { kind: 'material', id: LEGACY_ID, name: LEGACY_TITLE } }]`;
`create`/`update`/`delete` are stubs that throw. Assertions, in order:
  (a) `expect(localMaterialIdForLabel(FACT_LABEL)).toBe('MAT-1-mm-clofibrate-in-dmso-1cqj')` and
      `.not.toBe(LEGACY_ID)` — the id miss is structural, not incidental;
  (b) PRE-FIX (this assertion must be observed RED before the production edit):
      `expect(await canonicalLabelsForFacts([fact(FACT_LABEL)], store)).toEqual(new Map())` and
      `expect(clarificationsFromUnresolvedFacts([fact(FACT_LABEL)], map)[0].query).toBe('1 mm clofibrate in dmso')`;
  (c) POST-FIX: `map.get(FACT_KEY) === LEGACY_TITLE`; `map.size === 1`;
      `clarificationsFromUnresolvedFacts([fact(FACT_LABEL)], map)[0].query === LEGACY_TITLE`;
      its `.prompt` contains the literal `"1 mM Clofibrate in DMSO"` (quoted, displayLabel interpolation
      at shorthandChat.ts:977-978);
      `card.unresolvedFact.label === FACT_LABEL` (provenance NOT collapsed).

**AC-2 (STAGE B preserved — no regression of the 10-fresh-draws guarantee).** In the same file: a store
whose `get` → null and `list` → `[]` yields `map.size === 0` and `query === '1 mm clofibrate in dmso'`;
a store with NO `list` method at all (only `get`) yields `map.size === 0` and does not throw; a store whose
`list` rejects yields `map.size === 0` and does not throw. (The last two protect the existing partial
fakes — see AC-9 and bait 4.)

**AC-3 (one string on the card — app).** New test file
`app/src/agent/ChatClarificationCard.stageAstring.test.tsx` (do NOT edit `ChatClarificationCard.mint.test.tsx`
— see §6 dependency note). Drive the REAL `ClarificationPicker` with
`{ id, kind: 'material', prompt: 'The draft names "1 mM Clofibrate in DMSO" …', entityType: 'material',
menuProvider: '/m', query: LEGACY_TITLE, options: [], allowCreateLocal: true,
unresolvedFact: { label: '1 mM clofibrate in DMSO', reason: 'ambiguous-noun', actionLocation: {…} } }`
and a mocked `apiClient.mintLocalTerm` resolving `{ success: true, recordId: LEGACY_ID, label: LEGACY_TITLE, iri: … }`:
  (a) the mint row (`[data-testid="clarification-mint-row"]`) input `clarification-mint-label` has value
      exactly `'1 mM clofibrate in DMSO'`; the preview text is exactly
      `mintLocalTermLabel('1 mM clofibrate in DMSO')`; on click `mintLocalTerm` is called with
      `('material', '1 mM clofibrate in DMSO')` — the seed is what is sent (no join, no fold);
  (b) VARIANT where `unresolvedFact.label === LEGACY_TITLE`: the input value, the preview and the
      `mintLocalTerm` argument are all exactly `'1 mM Clofibrate in DMSO'`, and after the pick the
      `onPick` `answer.ref.label === '1 mM Clofibrate in DMSO'` — the all-three-equal literal pin;
  (c) feed the same `answer` through `clarificationAnswerPrompt` into a `ChatLog` (the pattern already in
      `ChatClarificationCard.mint.test.tsx:241-264`) and assert
      `[data-testid="chat-log-clarification-answered"]` textContent contains `'1 mM Clofibrate in DMSO'`
      exactly; and assert `expect(container.textContent).not.toContain('1 mm clofibrate in dmso')` — the
      all-lowercase STAGE B identity form appears nowhere once the record is grounded.
  (d) the server half of the chain is AC-1(c): the question row renders `LEGACY_TITLE`. Together (a)-(d)
      prove the ruling's strings: question = title = answered, mint seed = offered phrasing, one record.

**AC-4 (READ-ONLY proof, zero writes).** In AC-1's file: `create`, `update` and `delete` are throwing
stubs AND `expect(create).not.toHaveBeenCalled()`, `expect(update).not.toHaveBeenCalled()`,
`expect(delete).not.toHaveBeenCalled()` after the call; `expect(get).toHaveBeenCalledTimes(1)` (one per
distinct id). The minted durable name is UNCHANGED: `server/src/api/handlers/VocabHandlers.ts` is not in
the diff (`git diff --stat -- server/src/api` empty) and `server/src/api/handlers/VocabHandlers.mint.test.ts`
stays green with its 11 tests unchanged.

**AC-5 (dedupe preserved).** Two facts, labels `'1 mM clofibrate in DMSO'` and `'1 mM Clofibrate in DMSO'`
(same `FACT_KEY`): `map.size === 1`; `get` called once (one distinct recordId); `list` called once;
`map.get(FACT_KEY) === LEGACY_TITLE`.

**AC-6 (cost bound — no N+1).** Cost model, stated in a comment above PASS 2 and proven by assertions:
  (a) N facts with N DISTINCT identities, all id-missing ⇒ `expect(list).toHaveBeenCalledTimes(1)`, and
      `expect(list.mock.calls[0][0]).toEqual({ schemaId: MATERIAL_SCHEMA_ID, limit: 10000 })` — materials
      only, capped exactly like VocabHandlers.ts:124;
  (b) a batch where every id HITS ⇒ `expect(list).not.toHaveBeenCalled()` (lazy: no list when nothing is
      unresolved);
  (c) `get` is one call per distinct recordId, unchanged from today.
  Batch-site note for the report: `canonicalLabelsForFacts` is called from exactly two batch sites
  (`server/src/ai/AgentOrchestrator.ts:1560` and `:3127`), so the per-turn worst case is TWO
  `store.list` calls, never one per fact.

**AC-7 (ONE word for the mint badge — DATA, pinned).** Observed facts (measured, and they correct the
the ruling's assumed file — see §7): the card itself has NO badge; it imports the picker
(`ChatClarificationCard.tsx:30`) and renders it (:203), and the visible badge is the picker's.
`VOCABULARY_BADGE` (app/src/shared/taptab/slashMenu/tokens.ts:43-48) declares
`local: 'Local'` (:45), `mint: 'New'` (:47); the card's mint row renders `VOCABULARY_BADGE.mint`
(ClarificationPicker.tsx:988, class `message-log__clarification-mint__badge`, :981) and the `/m` floor row
does the same (resolvers.ts:138). No `'Local'` string is rendered on the mint row. DECISION: the ONE word
is **`New`**, and it stays where the DATA already declares it.
  (a) new pin (in the AC-3 file, no product-code change): `expect(VOCABULARY_BADGE.mint).toBe('New')` and
      the rendered badge node — `row.querySelector('.message-log__clarification-mint__badge')!.textContent`
      — is exactly `'New'`; and `expect(row.textContent).not.toMatch(/Local/)`;
  (b) the declared home is tokens.ts:43-48 and it is the ONLY home: an added grep-guard assertion
      (`readFileSync` of `src/event-editor/right-pane/ai/ClarificationPicker.tsx`) must NOT match
      `/'New'|"New"/` — the literal lives in DATA, never in the component;
  (c) report must state the residue resolved here: the word `Local` was used for this same row in the
      CARD-1 paperwork (`app/src/agent/ChatClarificationCard.mint.test.tsx:9`, `[Local] 1 mM clofibrate1 mM
      Clofibrate in DMSO`), not in product copy. Do not edit that file (dependency note §6); the pin in
      (a) is the register of the single word.
  Rejected alternative and why (must appear in the report): changing `mint: 'New'` → `'Local'` would
  (i) break `receivingMintPin.test.ts:113` (`expect(creationRows[0]!.badge).toBe('New')`),
  (ii) break `tokens.test.ts:207,220,235` (the tier palette/word set), (iii) orphan `badgeStyles('New')`
  (tokens.ts:150-151) and (iv) contradict the table's own declared law at tokens.ts:36-42 that the mint
  floor must be a visibly DISTINCT tier from a workspace record — a create-affordance that wears the
  record's word is indistinguishable from select-a-record.

**AC-8 (live read-only proof on the lane stack).** No model service, no browser gate, no record created.
  (a) `curl -s -o /tmp/l84l.json -w '%{http_code}\n' http://localhost:3093/api/records/MAT-1-mm-clofibrate1-mm-clof-l84l`
      → `200`, and `payload.name` is exactly `1 mM Clofibrate in DMSO`;
      `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5193/` → `200`.
  (b) BEFORE and AFTER: `stat -c '%y %s'` and `sha256sum` of
      `/home/brad/.computable-lab-lane2/worktrees/main/records/material/MAT-1-mm-clofibrate1-mm-clof-l84l__1-mm-clofibrate1-mm-clofibrate-in-dmso.yaml`
      must be identical (`ad9797f6…df81`, mtime `2026-11-03 00:37:45.950447254 -0500`), and
      `git -C /home/brad/.computable-lab-lane2/worktrees/main status --porcelain -- records/material`
      must be byte-identical before/after. NOTE: that worktree ALREADY carries pre-existing
      `D` (deleted) rows under `records/` — record the before-output and diff it; do not "clean" it.
  (c) Honest limit to state in the report: the card render is not driven live because it requires a model
      turn and this item may not touch a model service; the live leg proves the DATA PLANE (the record
      the fallback must ground onto and its immutability), and AC-1/AC-3 prove the code path.

**AC-9 (no collateral damage).**
  (a) `server/src/ai/shorthandChat.sameNounDedupe.uifix3.test.ts:243-282` (the existing STAGE A test) stays
      green UNCHANGED: its fake store defines only `get` + `create`, so the fallback must never touch
      `store.list` when the id hits (AC-6(b) is the same property);
  (b) the three pre-existing server test files keep their measured counts (25 tests, §5);
  (c) the three pre-existing app files keep their measured counts (40 tests);
  (d) server `tsc --noEmit` = 0 errors; app `tsc --noEmit` = the same 10 pre-existing errors, none in the
      touched files (§5);
  (e) `git diff --stat` touches ONLY `server/src/ai/shorthandChat.ts` (+ its new test) and the app test
      file. No `app/src/agent/*.tsx`, no `ClarificationPicker.tsx`, no `tokens.ts`, no YAML, no schema,
      no records, no `.hermes/plans/task-list.md`.

## 5. VERIFICATION COMMANDS AND MEASURED BASELINES

Measured by the composer at 33760236 (never assume a green you did not see):

    cd server && npx vitest run src/ai/shorthandChat.sameNounDedupe.uifix3.test.ts \
        src/compiler/resolution/canonicalLabelPolicy.test.ts src/api/handlers/VocabHandlers.mint.test.ts
      -> 3 files / 25 tests passed   (measured 09:55:46, vitest 1.6.1)
    cd app && npx vitest run src/agent/ChatClarificationCard.mint.test.tsx \
        src/shared/taptab/slashMenu/tokens.test.ts src/shared/taptab/slashMenu/receivingMintPin.test.ts
      -> 3 files / 40 tests passed   (measured 09:56:03)
    cd server && npx tsc --noEmit    -> 0 errors, rc 0        (measured)
    cd app    && npx tsc --noEmit    -> 10 errors in 9 files  (measured), NONE in
        src/agent/**, src/shared/taptab/**: LawnSurface.moveAcross.test.tsx, PreviewActionBar.test.tsx,
        editorHistory.test.ts, EventEditorContext.tsx, LabwareFocus.instrument.test.tsx, ViewerToolbar.tsx,
        Viewer.tsx, IngestionUploadModal.tsx, ExtractionProgressPanel.test.tsx

The coder's bars (all must be run and pasted into the report):

1. FIRST TARGETED CHECK — the cheapest proof the approach is sound (run before writing production code):
       cd server && npx tsx -e "import {localMaterialIdForLabel} from './src/materials/termId.ts'; console.log(localMaterialIdForLabel('1 mM clofibrate in DMSO'))"
   Expected: `MAT-1-mm-clofibrate-in-dmso-1cqj`. If that string ever equals
   `MAT-1-mm-clofibrate1-mm-clof-l84l`, STOP — the premise of this spec is dead and the item must be
   re-ruled.
2. RED: `cd server && npx vitest run src/ai/shorthandChat.canonicalLabelFallback.test.ts` → AC-1(b) fails
   with `map.size 0 !== 1` (or the empty-map assertion passing and the post-fix arm failing) BEFORE the
   production edit. Paste the RED output.
3. GREEN: `cd server && npx vitest run src/ai/shorthandChat.canonicalLabelFallback.test.ts src/ai/shorthandChat.sameNounDedupe.uifix3.test.ts src/api/handlers/VocabHandlers.mint.test.ts src/compiler/resolution/canonicalLabelPolicy.test.ts`
   → 4 files, all green; the three pre-existing files keep 25 tests.
4. `cd app && npx vitest run src/agent/ChatClarificationCard.stageAstring.test.tsx src/agent/ChatClarificationCard.mint.test.tsx src/shared/taptab/slashMenu/tokens.test.ts src/shared/taptab/slashMenu/receivingMintPin.test.ts`
   → 4 files; the three pre-existing keep 40 tests.
5. `cd server && npx tsc --noEmit` → 0 errors.
6. `cd app && npx tsc --noEmit | grep -c 'error TS'` → `10`, and
   `... | grep -E 'ChatClarificationCard|slashMenu|ClarificationPicker'` → no output.
7. AC-8 live block, pasted verbatim (before/after sha, mtime, git status).
8. `git diff --stat 33760236` → only the files in AC-9(e).

## 6. DEPENDENCIES, RISKS, OUT OF SCOPE, ROLLBACK

### DEPS

- Starts only after `L2-CLARIFY-CARD-1` closes (ruling §4 Q4). CARD-1 is itself BLOCKED-BY
  `L2-THREADSCOPE-FLIP-1`, so this item is not dispatchable yet.
- File ownership: `L2-CLARIFY-TARGET-1` (live, launcher 3881148) owns `app/src/agent/**`. Therefore the
  app test lands in a NEW file (`ChatClarificationCard.stageAstring.test.tsx`) and the coder must NOT edit
  `app/src/agent/ChatClarificationCard.mint.test.tsx` (hence AC-7(c) leaves that docstring alone).
  `server/src/ai/shorthandChat.ts` is free once CARD-1 closes; it is forbidden in CARD-1's own prompt,
  which is why it is this item.
- Folds into NO other item.

### RISKS (accepted, with the mitigation already in the spec)

1. Two records whose stored names are case-insensitively equal: both layers take `.find`'s FIRST match on
   the same `store.list` call, so the card and the mint agree. Residual risk if `store.list` order were
   non-deterministic between the card read and the mint call — same code path, same filter, accepted.
2. `limit: 10000` blinds the fallback in a store with more materials. The mint has the identical cap, so
   the two layers still agree; the cost is that a very large lab keeps the STAGE B display. Accepted
   (and it is the bound the ruling names as sanctioned).
3. One extra `store.list` per batch (2 per turn max, AC-6 note). Materials only. Accepted.
4. A store `list` failure now degrades silently to STAGE B instead of throwing. Deliberate: a card must
   render; the mint path will still decide at answer time. Stated in the code comment.

### OUT OF SCOPE

- No legacy data repair, no re-iding, no renaming, no touching `records/**` or the store worktree.
- No change to `localMaterialIdForLabel`, `labelHash`, `labelSlug` or `canonicalLabelKey` (termId.ts).
- No change to `VocabHandlers.ts`, to the mint response, or to `app/src/event-editor/right-pane/ai/*`
  (the mint row's provenance seed stays the raw label — see §3).
- No YAML / meta-schema / new policy token (§2.4). No `[Local]`→`New` product-copy rewrite (§4 AC-7).
- Not the D2(b) thread-scope defect (its own item). Not the CHATHOST/harness debt. No browser gate.

### ROLLBACK

Revert the single commit. **No data migration is required and none exists**: the change reads only, the
store is untouched, the vocabulary YAML is untouched, and no record id or name moves. A revert restores
exactly today's STAGE B behaviour for legacy records.

## 7. PIN RE-AUDIT (every cite used in this spec, re-read at 33760236)

| cite | what it is | status |
|---|---|---|
| server/src/ai/shorthandChat.ts:49 | `import { canonicalLabelKey, localMaterialIdForLabel } from '../materials/termId.js'` | HOLD |
| server/src/ai/shorthandChat.ts:51 | `import { loadCanonicalLabelPolicy } …` | HOLD |
| server/src/ai/shorthandChat.ts:873-885 | `clarificationsFromUnresolvedFacts(facts, canonicalLabels?)` signature + STAGE A/B doc | HOLD |
| server/src/ai/shorthandChat.ts:906-918 | per-call policy load; throw-on-absent arm | HOLD |
| server/src/ai/shorthandChat.ts:950-951 | `identityKey = canonicalLabelKey(...)`; `groundedTitle = canonicalLabels?.get(identityKey)` | HOLD |
| server/src/ai/shorthandChat.ts:953-975 | declared `mintedDisplay` / `preMintDisplay` arms; :968 identity form | HOLD |
| server/src/ai/shorthandChat.ts:1047 | `query: displayLabel` | HOLD |
| server/src/ai/shorthandChat.ts:1059 | `unresolvedFact: fact` (raw provenance mirror) | HOLD |
| server/src/ai/shorthandChat.ts:1065-1120 | `canonicalLabelsForFacts`; :1100 id derivation; :1104-1115 GET + inline title predicate; :1116-1118 map fill | HOLD |
| server/src/api/handlers/VocabHandlers.ts:71-84 | local `asPayload` / `payloadName` mirrors (`payload.name.trim()`) | HOLD |
| server/src/api/handlers/VocabHandlers.ts:119-146 | id derivation, then name-first lookup, then id lookup | HOLD |
| server/src/api/handlers/VocabHandlers.ts:124-126 | `store.list({schemaId, limit:10000})` + `needle = label.toLowerCase()` + `.find` | HOLD |
| server/src/api/handlers/VocabHandlers.ts:131 | hit returns `payloadName(...) || label` (the STORED title) | HOLD |
| server/src/materials/termId.ts:34-43 | `canonicalLabelKey` = NFKC+trim+space-collapse+`toLocaleLowerCase('en')` | HOLD |
| server/src/materials/termId.ts:50-55, :70-72 | `labelHash` off the key; `localMaterialIdForLabel` | HOLD |
| server/src/compiler/resolution/canonicalLabelPolicy.ts:54-58, :96-137 | token set + fail-loud `loadCanonicalLabelPolicy` | HOLD |
| server/src/materials/MaterialGrounding.ts:7 | `export const MATERIAL_SCHEMA_ID = '…/material.schema.yaml'` | HOLD |
| server/src/store/types.ts:64-75, :167 | `RecordFilter {kind,schemaId,idPrefix,limit,offset}`; `list(filter?)` | HOLD |
| server/src/ai/AgentOrchestrator.ts:1560, :3127 | the two `canonicalLabelsForFacts(...)` batch call sites | HOLD |
| schema/scientist-intent/scientist-intent-vocabulary.yaml:950-953 | declared `canonicalLabel` block (unchanged by this item) | HOLD |
| app/src/event-editor/right-pane/ai/ClarificationPicker.tsx:389-411 | `mintLabelFor` — raw `unresolvedFact.label` first, then `mintNounFromQuery`, then `query` | HOLD |
| app/src/event-editor/right-pane/ai/ClarificationPicker.tsx:841-846 | `mintAvailable` incl. `(request.options?.length ?? 0) === 0` | HOLD |
| app/src/event-editor/right-pane/ai/ClarificationPicker.tsx:893, :975-1015 | `mintBadge = badgeStyles(VOCABULARY_BADGE.mint)`; the mint row; :981 badge class; :988 `{VOCABULARY_BADGE.mint}` | HOLD |
| app/src/shared/taptab/slashMenu/tokens.ts:36-48 | tier law comment; `local: 'Local'` (:45); `mint: 'New'` (:47) | HOLD |
| app/src/shared/taptab/slashMenu/tokens.ts:130-169 | `badgeStyles`, incl. `case 'New'` (:150-151) and `case 'Local'` (:146-147) | HOLD |
| app/src/shared/taptab/slashMenu/resolvers.ts:57-59 | `mintLocalTermLabel(q)` = `Create material record "<q>" in the lab (new record)` | HOLD |
| app/src/shared/taptab/slashMenu/resolvers.ts:135-139 | `/m` mint floor row: `badge: VOCABULARY_BADGE.mint` | HOLD |
| app/src/shared/taptab/slashMenu/resolvers.ts:909 | `'material': VOCABULARY_BADGE.local` (record rows wear `Local`) | HOLD |
| app/src/agent/ChatClarificationCard.tsx | 256 lines; imports the picker (:30), renders it (:203); **contains NO badge and no `'New'` literal** (grep: 0 case-sensitive hits) | MOVED — ruling's assumed home is wrong; badge is ClarificationPicker.tsx:988 |
| app/src/agent/ChatClarificationCard.mint.test.tsx:9 | `[Local] 1 mM clofibrate1 mM Clofibrate in DMSO` docstring (paperwork residue) | HOLD |
| app/src/shared/taptab/slashMenu/receivingMintPin.test.ts:113 | `expect(creationRows[0]!.badge).toBe('New')` | HOLD |
| app/src/shared/taptab/slashMenu/tokens.test.ts:207,220,235 | tier word/palette pins incl. `'New'` and `local: 'Local'` | HOLD |
| server/src/ai/shorthandChat.sameNounDedupe.uifix3.test.ts:243-282 | existing STAGE A pin; fake store has `get`+`create` only (no `list`) | HOLD |
| server/src/api/handlers/VocabHandlers.mint.test.ts | 11 tests, incl. store.get arm returning the stored name (:180-188) | HOLD |
| config.yaml:5 | `dataDir: /home/brad/.computable-lab-lane2` | HOLD |

Pin-re-audit verdict: every anchor the task prompt supplied is HOLD at 33760236. Two corrections to the
prompt's assumptions, both measured and load-bearing:
1. the badge is real but lives in `ClarificationPicker.tsx:988` + `tokens.ts:47`, NOT in
   `ChatClarificationCard.tsx` (which has no badge at all);
2. the mint row's seed is the RAW `unresolvedFact.label` (`ClarificationPicker.tsx:389-411`), not
   `request.query` — which is why §3 reconciles "ONE string" with ruling §3's amendment.

## 8. WORKER CONTRACT FIELDS

    branch:        cl/lane2-canonical-label-stagea   (off the lane trunk cl/integration-2 @ 33760236)
    worktree:      wt/L2-CANONICAL-LABEL-STAGE-A-FALLBACK-lane2
    commit count:  one commit (code) + one commit (report), or one combined — never a merge, never a rebase
    report:        .hermes/plans/deliverables/CANONICAL-LABEL-STAGE-A-FALLBACK-report.<unit>.md
                   mirror (byte-identical, `diff -q` silent):
                   /home/brad/.hermes/cl/lanes/2/deliverables/CANONICAL-LABEL-STAGE-A-FALLBACK-report.<unit>.md
    must paste:    the RED output (bar 2), the GREEN tables (bars 3-4), both tsc outputs (bars 5-6), the
                   AC-8 live block with before/after sha256+mtime+git status, and `git diff --stat 33760236`
    must state:    which of AC-3(a)/(b) the run exercised, and that the minted durable name is unchanged

## 9. REVIEWER BAIT (pre-empt these; each is a live failure mode in this exact code)

1. **`exactOptionalPropertyTypes`.** Do not add `needle?: string` / partial entries; build the entry object
   complete (`{ recordId, needle, title }`) and mutate `.title` only. Never assign `undefined` to an
   optional field.
2. **Widening the needle.** Do NOT use `canonicalLabelKey(fact.label)` as the needle. It collapses inner
   whitespace and NFKC-normalises; mint's needle is bare `label.toLowerCase()` (MaterialGrounding.ts:213, no trim).
   A wider needle grounds the card where the mint would CREATE — the card would then display a title that
   is not the record the mint returns. Equality with the mint's decision is the whole invariant.
3. **N+1.** `store.list` never goes inside the per-key loop. One call per batch; assert it.
4. **Laziness.** Calling `store.list` unconditionally throws `TypeError: store.list is not a function` on
   the existing partial fakes (`shorthandChat.sameNounDedupe.uifix3.test.ts:259-262` defines only
   `get`+`create`). Hence: fallback only when ≥1 entry is unresolved AND a `try/catch` around the call.
5. **Throwing on a broken store.** A missing/failing `list` must degrade to STAGE B, never fail the card.
6. **Last-match / re-sort.** Use `.find` (first in `store.list` order), exactly like the mint.
7. **Re-keying the map.** Keep `canonicalLabelKey(fact.label)` as the map key; do not key by recordId and
   do not return the record's id.
8. **A new YAML switch.** Forbidden here. If you add one you must also touch
   `CANONICAL_LABEL_POLICY_TOKENS` (canonicalLabelPolicy.ts:54-58) and the meta-schema enum — that is a
   second policy and a widened bound. Don't.
9. **Writing anything.** No `store.create/update/delete`, no record rename, no re-id, no
   `localMaterialIdForLabel` change, no store-worktree cleanup (it already has pre-existing `D` rows).
10. **"Fixing" the badge by changing the value.** `mint: 'New' → 'Local'` breaks
    receivingMintPin.test.ts:113, tokens.test.ts:207/220/235, orphans `badgeStyles('New')`, and violates
    tokens.ts:36-42. The item pins the word; it does not rewrite the tier table.
11. **A NEW schema-id literal.** Import `MATERIAL_SCHEMA_ID` (MaterialGrounding.ts:7). Do not paste the
    URL into `shorthandChat.ts`.
12. **Editing an owned file.** Do not touch `app/src/agent/ChatClarificationCard.mint.test.tsx`,
    `ClarificationPicker.tsx`, `tokens.ts`, `ChatLog.tsx` — TARGET-1 owns `app/src/agent/**` and this
    item's app surface is a NEW test file only.
13. **Test-count drift.** If the three pre-existing server files drop below 25 tests or the app files below
    40, you deleted or rewrote someone's assertion.
14. **"it should be around".** Do not cite a line you did not re-read; the report's pin table is graded
    against §7.

DRAFT-END 6dc3362c88faf3338e6f72b4b83f37a5f6c574ee3736c8632922b549cf3e158c
COMPOSER_DONE L2-CANONICAL-LABEL-STAGE-A-FALLBACK
