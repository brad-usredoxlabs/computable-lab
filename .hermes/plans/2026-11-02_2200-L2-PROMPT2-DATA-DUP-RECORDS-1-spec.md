# L2-PROMPT2-DATA-DUP-RECORDS-1 — dedup the seed shells + identity policy as DATA (DRAFT)

Lane 2 · drafted l2t2150 (cl-spec-composer) · base `cl/integration-2` @ `3d711369`. Every file:line
below was READ AT `3d711369` first-hand; the coder re-pins each row at the claim tip before editing
(semantics are pinned, not numbers). Not promoted: the orchestrator reviews and may amend.

## 1. Goal

Remove the 15 redundant seed records through the ordinary HTTP record path (7 `MSP-API-*` shells,
`MAT-TEST-DMSO`, their 7 derived `ALQ-IMPLICIT-EVG_API_*` aliquots), repair the mangled concept's
label through the same path, publish a reproducible dangling-reference list, and land the ruled
`identityCollapse` survivor order as a DATA block + contract test in one commit. Two portions, one item.

## 2. Binding inputs (do not re-litigate)

| # | artifact | binds |
|---|---|---|
| B1 | `.hermes/plans/decisions/L2-PROMPT2-IDENTITY-POLICY-l2t2030.md` §RULING Q1-Q4 (`:78-190`) | survivor policy, 4 hygiene constraints, "YAML + contract test in ONE commit" |
| B2 | `drafts/L2-PROMPT2-COMPOSITION-BIND-1-spec-draft-l2t1955.md` §3.3 (`:111-143`) | the 21-candidate before-state |
| B3 | `task-list.md:16492-16549` incl. TICK l2t2110 note `:16495-16507` | acceptance text |
| B4 | Brad's hard line | never two local terms for one entity; if it can be data it is data |

## 3. Portion A — DATA HYGIENE

### 3.1 Store scope — a finding, not a question

`:3093` serves the LANE-2 store: `config.yaml:5` → `dataDir: /home/brad/.computable-lab-lane2`;
`config.yaml:23-38` → repository `main`, `mode: embedded-git`, `records.directory: records`,
`sync.autoCommit: true`, `autoPush: false`. The path named in the brief,
`/home/brad/.computable-lab/worktrees/main`, is a DIFFERENT clone (history `e047ebda` vs the lane-2
store's `78b3f623`) and does not contain the survivor: it has the 7 shells and 7 aliquots but NO
`MSP-PR9-TEST-CLO-1MM`, NO `MAT-TEST-DMSO`, NO mangled concept (verified today by `ls`/`grep`).
**Hygiene therefore runs against the lane-2 store only.** Deleting the shells in the other clone would
leave `1 mM Clofibrate in DMSO` with zero records — a product-intent change nobody ratified. Don't.

### 3.2 Removal set — EXACTLY these 15 ids (B1 constraint 1)

Material-spec shells (7), `records/material-spec/<id>__1-mm-clofibrate-in-dmso.yaml`:
`MSP-API-mu50x5z7`, `MSP-API-mu50yjk9`, `MSP-API-mu50yysb`, `MSP-API-mu7uyw18`, `MSP-API-mu7uzgnr`,
`MSP-API-mu7v07f1`, `MSP-API-mujsue6o`.
Concept duplicate (1): `MAT-TEST-DMSO` (`records/material/MAT-TEST-DMSO__dmso.yaml`).
Derived aliquots (7), `records/aliquot/`, each carrying `material_spec_ref` → its shell (verified on
`ALQ-IMPLICIT-EVG_API_MU50X5Z7_…yaml:7-11`):
`ALQ-IMPLICIT-EVG_API_MU50X5Z7_EVT_API_MU50X5Z7`, `…_MU50YJK9_…`, `…_MU50YYSB_…`, `…_MU7UYW18_…`,
`…_MU7UZGNR_…`, `…_MU7V07F1_…`, `…_MUJSUE6O_EVT_API_MUJSUE6O` (full ids on disk, one per shell).
Nothing else: not the 7 `EVG-API-*` graphs, not `DRAFT-91172e04-…`, not `MSP-PR9-TEST-CLO-1MM`, not
`MAT-PR9-TEST-DMSO`, not `MAT-PR9-TEST-CLO`, not `MAT-clofibrate-1mm-10tf`. 15 ids, no substitutions.
Survivors (B1 `:118-128`): `1 mM Clofibrate in DMSO` (level spec) → `MSP-PR9-TEST-CLO-1MM` (the only
record with a `formulation:` block); `DMSO` (level concept) → `MAT-PR9-TEST-DMSO` (equal 1.15 score,
curie `MAT-PR9…` < `MAT-TE…`; the reference graph agrees — `MAT-TEST-DMSO` is referenced by nothing).

### 3.3 Mechanism — the ordinary record path

**Delete** = `DELETE /api/records/:id` — route `server/src/api/routes.ts:244`, handler
`server/src/api/handlers/RecordHandlers.ts:1524-1613` (auth `:1544-1550`, append-only guard
`:1552-1564`), `store.delete` `server/src/store/RecordStoreImpl.ts:918-1000` ending in
`repo.deleteFile` (`:971-977`), index rebuild `RecordHandlers.ts:1590-1597`. Under `embedded-git` the
adapter unlinks and commits ONLY that path (`server/src/repo/EmbeddedGitRepoAdapter.ts:231-238` →
`commitPaths([path], message)`) — a data-repo commit by convention, not a hand edit.
**Label fix** = `PUT /api/records/:id` — route `routes.ts:239`, handler `RecordHandlers.ts:963-981`
(body `{payload, expectedSha, message?}`, `payload` mandatory and WHOLE), store update
`RecordStoreImpl.ts:760-841`, index rebuild `:1287-1295`.
Never `git rm`, `mv`, or hand-edit a file under `records/`: a correct store reached that way is still a
spec violation. Seed refusal is real (`RecordStoreImpl.ts:929-938`, "resolves from seed; seed records
cannot be deleted"); none of the 15 live under `records/seed`, so it is a canary — if it fires, STOP.
Auth header `x-user-id` / `x-computable-user-id` (`server/src/security/LocalIdentityService.ts:114-116`):
send `x-user-id: USR-BRAD` (the shells' `createdBy`); if it resolves inactive, fall back to the
local-admin path (`:121-160`) and name the actor in the ledger.

### 3.4 Event-graphs and form-drafts STAY; enumerate the dangling refs (B1 constraint 2)

Measured today: after the 15 deletions the dangling set is exactly 8 files (7 event-graphs + 1
form-draft). Each shell is cited by its own `EVG-API-<suffix>` (`details.material_spec_ref` and
`details.aliquot_ref`, shape verified on `EVG-API-mu50x5z7__spec-first-add-material.yaml:11-30`) and by
the single form-draft; each aliquot by the same graph. Reproducible enumeration (run from the data repo
root after deletion; capture the raw output):

```
cd /home/brad/.computable-lab-lane2/worktrees/main
IDS="MSP-API-mu50x5z7 MSP-API-mu50yjk9 MSP-API-mu50yysb MSP-API-mu7uyw18 MSP-API-mu7uzgnr \
     MSP-API-mu7v07f1 MSP-API-mujsue6o MAT-TEST-DMSO \
     ALQ-IMPLICIT-EVG_API_MU50X5Z7_EVT_API_MU50X5Z7 ALQ-IMPLICIT-EVG_API_MU50YJK9_EVT_API_MU50YJK9 \
     ALQ-IMPLICIT-EVG_API_MU50YYSB_EVT_API_MU50YYSB ALQ-IMPLICIT-EVG_API_MU7UYW18_EVT_API_MU7UYW18 \
     ALQ-IMPLICIT-EVG_API_MU7UZGNR_EVT_API_MU7UZGNR ALQ-IMPLICIT-EVG_API_MU7V07F1_EVT_API_MU7V07F1 \
     ALQ-IMPLICIT-EVG_API_MUJSUE6O_EVT_API_MUJSUE6O"
for i in $IDS; do grep -rl --exclude-dir=_index "$i" records docs; done | sort -u
```

Expected (exactly these 8; emptiness means the enumeration is wrong — that is the trap this leg exists
for): the 7 `records/event-graph/EVG-API-{mu50x5z7,mu50yjk9,mu50yysb,mu7uyw18,mu7uzgnr,mu7v07f1,
mujsue6o}__spec-first-add-material.yaml` plus
`records/form-draft/DRAFT-91172e04-01fe-4949-8424-a21ee7b3216a__untitled.yaml`. `MAT-TEST-DMSO`
contributes ZERO (`_index` excluded). Artifact: `dangling-refs-after.txt` + the id→file map in the
handoff. These 8 are PROVENANCE: do not delete, rewrite, or "repair" them (B1 `:152-154`).

### 3.5 The mangled concept — LABEL FIX, not deletion (B1 constraint 3)

`MAT-1-mm-clofibrate1-mm-clof-l84l`, file
`records/material/MAT-1-mm-clofibrate1-mm-clof-l84l__1-mm-clofibrate1-mm-clofibrate-in-dmso.yaml`,
`name: "1 mM clofibrate1 mM Clofibrate in DMSO"`, `domain: other`, `status: proposed`, definition
quoting the mangled string — the seed+noun concatenation defect (CARD-1 W7 class).
Duplication test the coder MUST run and record first:

```
curl -s -X POST localhost:3093/api/resolve -H 'content-type: application/json' \
  -d '{"term":"1 mM Clofibrate in DMSO"}' \
 | jq '[.candidates[] | select(.level=="concept" and (.label|ascii_downcase)=="1 mm clofibrate in dmso")]'
```

At read time this returns exactly one concept candidate — itself. Not a duplicate ⇒ the ruling's
default applies: fix the label, keep the record (it is a legitimate minted concept; the defect is the
string). Ordinary path: `PUT /api/records/MAT-1-mm-clofibrate1-mm-clof-l84l` with the WHOLE payload
from `GET`, changing exactly two strings — `payload.name` → `"1 mM Clofibrate in DMSO"` and the same
substring inside `payload.definition` — with
`message: "Fix concatenated label on MAT-1-mm-clofibrate1-mm-clof-l84l (CARD-1 W7 class)"`. No other
field (not `domain`, not `status`). If the test returns a SECOND concept candidate at claim time, do
not delete on your own: report and stop at that leg (OQ2).

### 3.6 Cleanup ledger (the "written cleanup record", B1 `:158`)

`receipts/L2-PROMPT2-DATA-DUP-RECORDS-1/<tick>/cleanup-ledger.md` + the same table in the handoff. One
row per id: `id | path | label | kind | contentSha read | survivor | HTTP status | commit sha |
dangling refs created`. Header states: store path, actor header used, the 5 pre-existing dirty paths
(bait 6), and the before/after receipt filenames.

### 3.7 Execution order

1. Before receipts: `probe-before-clofibrate.json`, `probe-before-dmso.json` via
   `POST /api/resolve` (`routes.ts:494`) with `{"term":"1 mM clofibrate in DMSO"}` / `{"term":"DMSO"}`.
   Expected before-state: **21** candidates / **2** candidates.
2. Shas: `GET /api/records/<id> | jq -r '.record.meta.contentSha // .record.meta.commitSha'` for all
   15 (fields: `server/src/types/RecordEnvelope.ts:19-35`; `commitSha` is deprecated, `contentSha` is
   the blob hash).
3. Delete aliquots first, then shells, then `MAT-TEST-DMSO`
   (`DELETE /api/records/<id>?expectedSha=<sha>`). On `409 SHA mismatch` the body names
   `expected X, got Y` — use `Y`. On `405 APPEND_ONLY` / seed refusal: STOP, report.
4. Label fix (§3.5). 5. After receipts. 6. Dangling enumeration. 7. Ledger + handoff.

### 3.8 Non-vacuity law — what AFTER must show

| probe | BEFORE | AFTER (required) |
|---|---|---|
| `1 mM clofibrate in DMSO` | 21 candidates, 8 sharing the exact spec label | exactly **1** candidate at level `spec` with label `1 mM Clofibrate in DMSO` = `MSP-PR9-TEST-CLO-1MM`; **0** `MSP-API-*`; **0** `ALQ-IMPLICIT-EVG_API_*`; the mangled record's label now reads `1 mM Clofibrate in DMSO` (still level `concept`, same id) |
| `DMSO` | 2 candidates, both 1.15 | exactly **1**: `MAT-PR9-TEST-DMSO` |

AFTER for clofibrate is **2 candidates total** (1 spec + 1 concept), not 1: concept and formulation are
different IDENTITIES under the ruling (B1 `:86-96` — level is part of the identity). Reporting "FAILED,
still 2" means this row was misread. What the ENGINE does with those 2 is COMPOSITION-BIND-1's
business; do NOT gate this item on a compile-level single bind.

## 4. Portion B — `identityCollapse` as DATA (ruling Q1)

### 4.1 Block: extend the EXISTING `ambiguity` block; no new YAML file

`schema/scientist-intent/scientist-intent-vocabulary.yaml`, inside `policies.ambiguity` (today
`:991-996`, siblings `mode`/`confidenceAccept`/`strategyRef`), verbatim from B1 `:101-105`:

```yaml
  ambiguity:
    mode: clarify
    confidenceAccept:
      min: 0.7
      max: 1
    strategyRef: symbolic_label
    # Identity policy l2t2030: same (normalized_label, candidate_level) is ONE identity — the
    # store may not carry two local terms for one entity. survivor is an ORDERED list of policy
    # ids; each pass is fail-safe (never empties the set). ABSENT => no collapse, pre-fix bytes.
    identityCollapse:
      key: [normalized_label, candidate_level]
      survivor:
        - declared_substance
        - stable_order
```

A parallel new YAML file is a DEFECT (B4). `normalized_label` NAMES the shipped naked-form equality
(`ResolveSpine.ts:101-104`, `tNaked`/`lNaked`); `stable_order` NAMES the shipped comparator
`resolutionEngine.ts:43-45` (score DESC, curie ASC). Neither is re-implemented.

### 4.2 Meta-schema (same commit, or the loader throws)

`schema/scientist-intent/scientist-intent-vocabulary.schema.yaml`, under
`policies.properties.ambiguity.properties` (block `:323-357`, closed):

```yaml
          identityCollapse:
            type: object
            additionalProperties: false
            unevaluatedProperties: false
            required: [key, survivor]
            properties:
              key:
                type: array
                minItems: 1
                uniqueItems: true
                items: { type: string, enum: [normalized_label, candidate_level] }
              survivor:
                type: array
                minItems: 1
                uniqueItems: true
                items: { type: string, enum: [declared_substance, stable_order] }
            description: >-
              Same-label collapse policy; ordered survivor ids, each pass fail-safe; ABSENT means
              no collapse. The closed enums are the never-guess wall (no fuzzy predicate can declare).
```

NOT added to `ambiguity.required` — absence must stay legal (§4.4 leg 3).

### 4.3 TypeScript: plumbing only, zero policy

`server/src/compiler/scientistIntent/vocabulary.ts:101-107` — add one optional field:

```ts
    identityCollapse?: { key: readonly string[]; survivor: readonly string[] };
```

`policies` is a passthrough of the parsed YAML (`vocabulary.ts:301`, `:399`), so no parsing code is
needed. That is the WHOLE TS change. No consumer, comparator, or branch (OQ3).

### 4.4 Contract test (RED first, same commit as the YAML)

New `server/src/compiler/scientistIntent/vocabularyIdentityCollapse.test.ts`; pattern to copy:
`vocabularyRipOut.test.ts:83-99` (fixture copy via `loadScientistIntentVocabulary({path})`, compared
against `defaultScientistIntentVocabulary()`, shipped asserted untouched). Legs:

1. **Declared block is what ships, byte-parity** — parse the shipped YAML with `readFileSync` +
   `yaml.parse`, compare to `policies().ambiguity.identityCollapse`. No independent literal in the
   test: both sides derive from data.
2. **Survivor pick is data-driven** — fixture `server/src/compiler/scientistIntent/fixtures/vocab-identity-collapse/`
   (a COPY, never the shipped file: `nounResolution.test.ts:1-15`) with `survivor` REVERSED; assert the
   loader reports the reversed order and the shipped one is unchanged.
3. **Off-state is key ABSENCE** — fixture without the key: `'identityCollapse' in
   policies().ambiguity === false` (not `undefined`; `exactOptionalPropertyTypes`).
4. **Never-guess, data level** — fixture with `key: [term]` and fixture with `survivor: [fuzzy_match]`
   both FAIL to load, the error naming the path (`policies/ambiguity/identityCollapse/key/0`).
5. **Schema-closed** — fixture with an extra sibling under `identityCollapse` fails to load.
6. *(only if a consumer exists at claim tip)* two different labels in band + block declared ⇒ still
   `ambiguous-noun`, bindings `[]` — the collapse runs only AFTER `exact_name` (B1 `:112-114`).

## 5. File ownership

### 5.1 In scope

| # | path | change |
|---|---|---|
| 1 | `schema/scientist-intent/scientist-intent-vocabulary.yaml` | `policies.ambiguity.identityCollapse` |
| 2 | `schema/scientist-intent/scientist-intent-vocabulary.schema.yaml` | `identityCollapse` property |
| 3 | `server/src/compiler/scientistIntent/vocabulary.ts` | optional interface field only |
| 4 | `server/src/compiler/scientistIntent/vocabularyIdentityCollapse.test.ts` | NEW contract test |
| 5 | `server/src/compiler/scientistIntent/fixtures/vocab-identity-collapse/` | fixture copy + 2 malformed variants |
| 6 | lane-2 DATA STORE `…/.computable-lab-lane2/worktrees/main/records/**` | 15 deletions + 1 label fix, API ONLY |
| 7 | `.hermes/plans/receipts/L2-PROMPT2-DATA-DUP-RECORDS-1/<tick>/**` | receipts + ledger |

### 5.2 Out of scope

`server/src/compiler/resolution/**` (COMPOSITION-BIND-1 owns `contenderOrder` + any collapse consumer);
`server/src/resolve/**`; `app/**`; `config/drafting/mixture-material-cues.yaml`; the 8 provenance files;
`_index/records.jsonl` (server-rebuilt); `/home/brad/.computable-lab/**` (Brad's tree — read-only);
`records/seed/**`; any NEW YAML file under `schema/scientist-intent/`.

## 6. Verification commands and expected output

Targeted (Portion B in one command):

```
cd /mnt/vast/home/brad/git/cl-integration-2/server
npx vitest run src/compiler/scientistIntent/vocabularyIdentityCollapse.test.ts
```

Expected `Test Files 1 passed`, 5 (or 6) tests passed; before the YAML+test pair the legs must FAIL for
the right reason — keep `red-run.txt`. Full gates:

```
cd /mnt/vast/home/brad/git/cl-integration-2/server
npx vitest run          # zero NEW failures vs the pre-change baseline (record the baseline first)
npx tsc --noEmit        # no NEW error lines vs baseline
```

Trunk carries pre-existing `src/ai`/`src/schema` failures (task-list record), so a raw "all green" claim
is unavailable and must not be fabricated — report SET DIFFS, not counts.

Live acceptance (the item's own proof):

```
curl -s -X POST localhost:3093/api/resolve -H 'content-type: application/json' \
  -d '{"term":"1 mM clofibrate in DMSO"}' | jq -r '.candidates[] | [.level,.curie,.label] | @tsv'
curl -s -X POST localhost:3093/api/resolve -H 'content-type: application/json' \
  -d '{"term":"DMSO"}' | jq -r '.candidates[] | [.level,.curie,.label] | @tsv'
```

Expected: the §3.8 AFTER table. Plus `GET /api/records/<id>` → HTTP 404 `NOT_FOUND` for all 15 ids
(proves removal, not a filter). Deletes invalidate the store path cache
(`RecordStoreImpl.ts:986`), so no restart is needed for them; a `schema/` YAML edit IS restart-sensitive
for :3093 (`vocabulary.ts:413-425`), though this block is not consumed by HEAD's resolve path — restart
anyway before the AFTER receipts if a collapse consumer has landed.

## 7. RED-first test plan

1. Portion B test written and RED (legs 1-5) → `red-run.txt`.
2. Portion A before-receipts (21/2) — the RED evidence for a data surgery; there is no unit test for a
   deletion and pretending otherwise is the defect this leg prevents.
3. Portion B YAML + schema + interface + test in ONE commit → green.
4. Portion A via the API → after-receipts + dangling list + ledger.
5. Pins re-read at claim tip; every moved row named in the report.

## 8. Worker contract fields

- Base `cl/integration-2` at the CLAIM tip (drafting tip `3d711369`; a later handoff names `71b2ab4b` —
  re-read at claim). Branch `cl/l2-datadup-<orchtick>`, one worktree per run.
- Report `.hermes/plans/L2-PROMPT2-DATA-DUP-RECORDS-1-report.<orchtick>.md`; receipts under
  `.hermes/plans/receipts/L2-PROMPT2-DATA-DUP-RECORDS-1/<orchtick>/`: `red-run.txt`,
  `probe-before-{clofibrate,dmso}.json`, `probe-after-{clofibrate,dmso}.json`,
  `dangling-refs-after.txt`, `cleanup-ledger.md`, `suite.txt`, `tsc.txt`.
- ONE code commit carrying YAML + meta-schema + interface + test + fixture (the "same commit" law). The
  data operations are commits in the DATA repo produced by the API — not in the lane worktree; list
  their shas.
- Report must state: claim tip; the 15 ids with the sha each was deleted at; label fix before/after; the
  8 dangling refs; before/after candidate counts; the data repo's pre-existing dirty paths; moved pins.
- Assumptions recorded, not asked: AS-HYGIENE-STORE (§3.1); AS-DELETE-VIA-HTTP (no CLI/UI delete
  affordance exists in-tree); AS-ORDER (aliquots first); AS-SLUG-STALE (the label fix leaves the old
  filename slug by ordinary-path design); AS-CLEANUP-RECORD (the ledger is the written cleanup record);
  AS-NO-BROWSER (no :5193 gate; receipts are API-level).

## 9. Reviewer bait — pre-empt every one

1. **"AFTER still shows 2" is CORRECT** (§3.8). Do not "fix" it by deleting the mangled concept.
2. **`exactOptionalPropertyTypes`**: `identityCollapse?` must be absent, never `undefined`; the
   passthrough already gives that — no normalization assigning `undefined`.
3. **Closed meta-schema**: `additionalProperties: false` on `ambiguity`
   (`scientist-intent-vocabulary.schema.yaml:323-357`) — the schema edit is mandatory in the same
   commit or every vocabulary test dies at import. Do not touch `required`.
4. **No TypeScript tie-break**: grep the diff — no `declared_substance` / `stable_order` /
   `normalized_label` literal in `server/src/**` code (loader-derived values in test assertions only);
   no `clofibrate`, `DMSO`, `1.15`, `0.7`, `MSP-` anywhere in product code.
5. **Do not touch the consumer**: `server/src/compiler/resolution/**` is COMPOSITION-BIND-1's.
6. **The data repo is dirty before you start**: at read time it had 5 uncommitted deletions
   (`records/labware/LBW-FLAT-BOTTOM-96-WELL-PLAT-3776…`, `records/material/MAT-bashingbead-…`,
   `MAT-eluate-plate-…`, `MAT-lysed-96-well-deep-block…`, `MAT-sample-liquid-…`). Not yours: record
   them, never revert or commit them, and verify each of your commits touches only its own path
   (`EmbeddedGitRepoAdapter.ts:231-238`).
7. **Seed refusal** (`RecordStoreImpl.ts:929-938`): if any of the 15 trips it, the layout changed —
   STOP; never work around it with `git rm`.
8. **The filename slug stays stale after the label fix** — `updateFile` writes `target.path`
   (`RecordStoreImpl.ts:824`). Ordinary-path behaviour: acceptable. Hand-renaming is NOT (outside the
   ordinary path, breaks the record-id→path cache). Say so in the ledger.
9. **Do not delete `_index` rows or the provenance records**; the rebuild is the server's job
   (`RecordHandlers.ts:1590-1597`) and the 8 files are protected by the ruling.
10. **No browser/UI claim** (verification-claims policy: no "works" without receipt+commit+timestamp),
    and no "helpful" re-slug or merge of `MSP-PR9-TEST-CLO-1MM` — its id is fixed by the ruling.

## 10. Acceptance criteria — verbatim (`task-list.md:16545-16549`)

```
verified by: >-
  Before/after `/api/resolve` (or the picker route) for '1 mM clofibrate in DMSO' and 'DMSO': AFTER shows ONE
  surviving record per identity with the intended id; the id list + the removal method are in the handoff; a
  non-vacuity leg proves the dump CHANGED. No product code change; if the policy ruling produces a declared
  order, that lands as YAML + its contract test, never a hardcoded tie-break.
```

Operative description clause (`task-list.md:16532-16534`):

```
  DATA-HYGIENE PORTION (claimable now): identify each duplicate by record id, record the exact intended single
  survivor in a written cleanup record, and remove/merge the shells through the ORDINARY record paths (never a
  hand-edited file outside the data repo's conventions). Nothing is deleted without the id list in the handoff.
```

Mapping: "ONE surviving record per identity" = §3.8 (one spec, one concept, one DMSO). "id list + removal
method in the handoff" = §3.2/§3.3/§3.6. "non-vacuity proves the dump CHANGED" = §3.7 steps 1/5 (21→2,
2→1). "declared order as YAML + contract test" = §4. "No product code change" holds for resolution
BEHAVIOUR; the only TS touched is one optional interface field (§4.3).

## 11. CITED PIN TABLE (read at `cl/integration-2` `3d711369`)

| # | claim | cite | status |
|---|---|---|---|
| P1 | :3093 data store = lane-2 store | `config.yaml:5` | VERIFIED |
| P2 | repo `main`: embedded-git, records dir, autoCommit true, autoPush false | `config.yaml:23-38` | VERIFIED |
| P3 | DELETE route | `server/src/api/routes.ts:244` | VERIFIED |
| P4 | deleteRecord handler (auth / append-only / store / rebuild) | `server/src/api/handlers/RecordHandlers.ts:1524-1613` | VERIFIED |
| P5 | store delete → `repo.deleteFile` | `server/src/store/RecordStoreImpl.ts:918-1000` (`:971-977`) | VERIFIED |
| P6 | embedded adapter commits one path | `server/src/repo/EmbeddedGitRepoAdapter.ts:231-238` | VERIFIED |
| P7 | index rebuild after delete | `RecordHandlers.ts:1590-1597` | VERIFIED |
| P8 | PUT route | `server/src/api/routes.ts:239` | VERIFIED |
| P9 | updateRecord body `{payload, expectedSha, message}` | `RecordHandlers.ts:963-981` | VERIFIED |
| P10 | update keeps existing path (stale slug) | `RecordStoreImpl.ts:811-841` (`:824`) | VERIFIED |
| P11 | index rebuild after update | `RecordHandlers.ts:1287-1295` | VERIFIED |
| P12 | seed refusal on delete | `RecordStoreImpl.ts:929-938` | VERIFIED |
| P13 | `x-user-id` / `x-computable-user-id` headers | `server/src/security/LocalIdentityService.ts:114-116` | VERIFIED |
| P14 | RecordMeta fields (`contentSha`, deprecated `commitSha`) | `server/src/types/RecordEnvelope.ts:19-35` | VERIFIED |
| P15 | `POST /api/resolve` route | `server/src/api/routes.ts:494` | VERIFIED |
| P16 | shipped `ambiguity` block | `schema/scientist-intent/scientist-intent-vocabulary.yaml:991-996` | VERIFIED |
| P17 | `ambiguity` meta-schema closed | `schema/scientist-intent/scientist-intent-vocabulary.schema.yaml:323-357` | VERIFIED |
| P18 | policies TS interface | `server/src/compiler/scientistIntent/vocabulary.ts:101-107` | VERIFIED |
| P19 | policies passthrough, no parse | `vocabulary.ts:301`, `:399` | VERIFIED |
| P20 | stable order comparator (score DESC, curie ASC) | `server/src/compiler/resolution/resolutionEngine.ts:43-45` | VERIFIED |
| P21 | in-band set construction | `resolutionEngine.ts:316-320` | VERIFIED |
| P22 | ambiguity verdict / bind arms | `resolutionEngine.ts:354-371`, `:373-383` | VERIFIED |
| P23 | contract-test pattern: fixture copy + `policies()` + shipped untouched | `server/src/compiler/scientistIntent/vocabularyRipOut.test.ts:83-99` | VERIFIED |
| P24 | fixtures are COPIES, never the shipped file | `server/src/compiler/resolution/nounResolution.test.ts:1-15` | VERIFIED |
| P25 | naked-form equality named by `normalized_label` | `server/src/resolve/ResolveSpine.ts:101-104` | VERIFIED |
| P26 | survivor's `formulation` shape | `schema/lab/material-spec.schema.yaml:77-92`; live `MSP-PR9-TEST-CLO-1MM` | VERIFIED |
| P27 | aliquot → shell via `material_spec_ref` | lane-2 `records/aliquot/ALQ-IMPLICIT-EVG_API_MU50X5Z7_…yaml:7-11` | VERIFIED |
| P28 | event-graph refs `material_spec_ref` / `aliquot_ref` | lane-2 `records/event-graph/EVG-API-mu50x5z7__spec-first-add-material.yaml:11-30` | VERIFIED |
| P29 | dangling set = 7 EVG + 1 form-draft | measured by the §3.4 command (`_index` excluded) | VERIFIED |
| P30 | pre-existing dirty paths in the data repo | `git status` on the lane-2 store, 2026-11-02 (5 `D` entries) | VERIFIED |
| P31 | `{recordId}__{slug}.yaml` path convention | `RecordStoreImpl.ts:150-160`, `:236-243` | VERIFIED |

## 12. OPEN QUESTIONS FOR ORCH (the orchestrator rules; the coder must not silently decide)

**OQ1 — Which data repo?** The brief names `/home/brad/.computable-lab/worktrees/main`, but that clone
has none of the survivor records (verified by `ls`/`grep`), while :3093 reads the lane-2 store
(`config.yaml:5`). Spec assumes LANE-2 STORE ONLY and forbids touching the other clone. Wanting the 7
shells + 7 aliquots removed there too would be a SECOND deletion set that leaves `1 mM Clofibrate in
DMSO` with no surviving record — a product-intent change.

**OQ2 — The label-fix target string.** The ruling calls for "a label FIX through the ordinary record
path" but never states the corrected string. Spec assumes `"1 mM Clofibrate in DMSO"` (drop the
duplicated seed prefix — the noun the mint was created for). Alternative reading: delete the record as
an illegitimate concept-level mint of a formulation phrase. The duplication test says FIX; rule only if
ORCH prefers deletion.

**OQ3 — Does the collapse CONSUMER ship here or in COMPOSITION-BIND-1?** The ruling's sequencing note
(B1 `:176-182`) leaves the ordering to the orchestrator; at `3d711369` neither `contenderOrder` nor
`identityCollapse` exists and `server/src/compiler/resolution/contenders.ts` does not exist. Spec ships
DATA + contract test only (matching the task's "no product code change") and forbids TS policy. If ORCH
wants this item to wire the consumer too, the in-scope list must add the pending COMPOSITION-BIND-1
files and it stops being a one-commit data change.

---

## 14. ORCH RULINGS on the OPEN QUESTIONS (l2t2150 tick 2026-11-02T22:0x EST — BINDING)

**OQ1 = LANE-2 STORE ONLY (approved as drafted).** Verified first-hand this tick: `config.yaml:5`
`dataDir: /home/brad/.computable-lab-lane2`; that store's `records/material-spec/` holds the 7 `MSP-API-*`
shells AND the survivor `MSP-PR9-TEST-CLO-1MM`; Brad's clone `/home/brad/.computable-lab/worktrees/main`
holds ZERO `PR9-TEST-CLO` records. Deleting in Brad's clone would (a) touch a tree this lane must never
write and (b) leave `1 mM Clofibrate in DMSO` with no surviving record = a product-intent change nobody
ratified. The 15-id removal set is scoped to the lane-2 store and nowhere else.

**OQ2 = LABEL FIX to `"1 mM Clofibrate in DMSO"` (approved).** The ruling (B1 constraint 3) says label fix
through the ordinary path unless PROVEN duplicate; deletion is destructive and the duplication test the
spec mandates decides it. If that test proves duplicate, STOP and report — do not delete on your own
judgement. Do not "improve" the definition text beyond removing the concatenation.

**OQ3 = DATA + CONTRACT TEST ONLY; the collapse CONSUMER does NOT ship here (approved).** Consumer wiring
(`server/src/compiler/resolution/**`) belongs to L2-PROMPT2-COMPOSITION-BIND-1, which owns the
`contenderOrder`/in-band ordering surface. Rationale: keeping this item a one-commit data change preserves
its non-vacuity proof (before/after `/api/resolve`) and avoids two items editing the same resolver; the
task block's own acceptance says "No product code change". The spec's in-scope list stands unchanged.

**Binding note for the coder:** pins in §11 were read at `3d711369`; sibling items (CARD-1, TARGET-1) are
in flight and WILL move lines. Re-read every pin at the claim tip and name every moved row in the report.
Base for this item = the trunk tip at claim.
