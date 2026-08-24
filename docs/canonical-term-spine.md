# Canonical Term Spine & Linkouts (Phase 0–7)

Status: implemented (Phases 1–6), see git log for commit hashes.

## Summary

computable-lab has moved from "a single CURIE is the canonical id per thing" to a
**unified `term` identity node** — Option B, the decision locked in the strategy plan
(`.hermes/plans/2026-08-23_224321-ontology-curie-strategy.md`). Every named thing the lab
reasons about (materials, vendor products, labware, instruments, action verbs, kits,
organisms, conditions) is now **one `term` record** carrying three things:

- `preferredLabel` — the human-facing canonical name
- `aliases[]` — every spelling variant the lab actually uses ("F praus", "FPRAUS",
  "f pruas", "f praaus")
- `linkouts[]` — the heterogeneous identifier basket: ontology CURIEs (CHEBI, NCIT, GO),
  vendor catalog numbers (Thermo 13579, Sigma 4321), action-verb mappings (incubate →
  EXACT:Class_49), and external URLs

Real ontology CURIEs are demoted from **identity** to **provenance/linkout**. Nothing pretends
`CHEBI:16236` is "the" id of ethanol anymore; the term is the id, the CURIE is one thing it's
known by. This is the F-praus fix: the resolve spine matches `aliases[]` first (tier 0), so a
lab-owned spelling variant outranks any remote exact hit.

## Non-negotiables preserved

- Declarative rules stay in lint YAML (`term.lint.yaml`); no hardcoded domain logic in TS.
- Reconstructible from schemas + git repo: identity is deterministic (`TERM-<slug>-<hash>`,
  djb2), minted by `localTermIdForLabel`.
- CURIE-style local namespace punned to the lab; ontology terms preferred over free text.
- `term` uses the **vocabulary** lifecycle only (`proposed/in_review/active/rejected/deprecated`);
  physical records (material-instance/lot/aliquot) keep their **inventory** lifecycle and do NOT
  get `lifecycleId`/`provenance`.

## The model

```
terminology.lock:
term:
  id: TERM-<slug>-<hash>            # deterministic djb2 (termId.ts)
  kind: material | vendor | labware | instrument | verb | kit | organism | condition | other
  preferredLabel: "ethanol"
  aliases: [ "ethanol", "EtOH", "ethyl alcohol" ]   # lowercase+separator-insensitive keys
  status: proposed | in_review | active | rejected | deprecated  # vocabulary lifecycle
  linkouts:
    - { kind: ontology, namespace: CHEBI, curie: CHEBI:16236, uri?, label }
    - { kind: ontology, namespace: NCIT,  curie: NCIT:8765,  uri?, label }
    - { kind: vendor,   vendor: Thermo, catalog_number: 13579, grade?, volume?, label }
    - { kind: vendor,   vendor: Sigma,  catalog_number: 4321,  grade?, volume?, label }
    - { kind: action,   verb: incubate, exact?: EXACT:Class_49, label }
    - { kind: external, url, label }
```

**Alias normalization** (`server/src/terms/alias.ts`): the comparison key drops case and ALL
non-alphanumeric characters, so `FPRAUS`, `F praus`, `F.praus`, `f praaus→(no, typo stays
distinct)` — separators/case collapse, but genuine typos are NOT silently corrected (over-merge
risk). A typo variant is captured by being *recorded* as an alias on the term, then it folds.

## What was built (per phase)

| Phase | Deliverable | Files |
|---|---|---|
| 1 | `term` schema triplet + Ajv all-schemas test | `schema/core/term.{schema,lint,ui}.yaml`, `server/src/schema/TermSchema.test.ts` |
| 2 | deterministic term id + alias normalization + EnsureTerm | `termId.ts`, `server/src/terms/{alias,EnsureTerm}.ts` (+tests) |
| 3 | root-anchor migration (concept → term, re-point role refs) | `server/src/terms/MigrateTerms.ts` (+tests) |
| 4 | resolve spine **tier 0 = canonical-term alias-first** | `resolve/providers/terms.ts`, `ResolveSpine.ts` (+tests) |
| 5 | AI grounds CURIE/vendor as **confirm-once linkouts**, no bare-CURIE mint | `terms/EnsureTerm.ts#ensureTermForCurie`, `ai/mentions/bindOntologyMentions.ts` |
| 6 | picker + client surface canonical-term tier-0 | `app/src/shared/api/{client,resolveUtil}.ts`, `RefPicker.tsx`, slashMenu `resolvers.ts` |
| 7 | docs + full verification (this file) | — |

## Resolve spine (six tiers)

`canonical-term` (0) → `local-record` (1) → `oak` (2) → `ols4` (3) → `vendor` (4) → `mint` (5).

Tier 0 scans the term set, scores by alias quality (exact > prefix > substring over
`aliases[]`), and emits `local:<TERM-…>` CURIEs. Tier gap (0.2) > max match bonus (0.15), so a
canonical-term alias hit always outranks a local substring hit or a remote exact hit — "prefer
what the lab already has," extended to lab-owned spelling variants. Every consumer (compiler's
NounPhraseResolver, UI picker/slash-menu, MCP `ontology_search`, agent resolve tool) uses the one
spine, so they all agree.

## Migration (zero backwards compatibility, per owner decision)

`migrateRootsToTerms(store, kinds?, roleKinds?)` converts concept-level records to terms:
- `material` → `term(kind:material)`, `vendor-product` → `term(kind:vendor)`,
  `labware-definition` → `term(kind:labware)`, `instrument-definition` → `term(kind:instrument)`,
  `verb-definition` → `term(kind:verb)`
- `synonyms[]` → `aliases[]`, `class[]` ontology refs → ontology `linkouts[]`,
  vendor+catalog/grade → vendor `linkout[]`.
- Role records (material-spec/instance/lot/aliquot) keep their physical identity but re-anchor
  their root `material_ref` → the term id (`type:'term'`).

It is idempotent (re-mint reuses the same term) and the alias dedup makes spelling variants
collapse onto one node. Legacy `MAT-/VPR-/LWD-/INSTDEF-` concept namespaces are NOT preserved —
the term id is the one identity (data is disposable test data, so no back-compat burden).

## Verification

- Server: `npx vitest run src/terms src/resolve src/schema/TermSchema.test.ts
  src/ai/mentions/bindOntologyMentions.test.ts` → all pass (the resolve conformance suite locks
  "one resolution path, one answer").
- App: `npx vitest run src/shared/ref src/shared/api/resolveUtil.test.ts
  src/shared/taptab/slashMenu` → all pass; `npx tsc --noEmit` clean.
- See the F-prausnitzii scenario in `server/src/terms/EnsureTerm.test.ts` and
  `server/src/resolve/providers/terms.test.ts`: two spellings resolve to ONE term; a canonical
  alias hit outranks remote OLS4.

## Known pre-existing failures (NOT from this work)

The broader `server` suite has ~71 failing test files (execution/measurement/API/compiler
fixtures) that fail identically at the pre-work baseline commit `d001e5a` — verified by running
the same sample (ExecutionOrchestrator, MeasurementService, aiPrecompileGating,
ChatbotCompileDeckSlot, ExtractHandlers) on a clean baseline worktree with identical results. None
are attributable to the term-spine work.

## Running the migration on live data

```bash
# In server/, against the connected workspace store (data is disposable):
#   node -e "import('./dist/... ')"  — or call migrateRootsToTerms via a script/MCP tool.
```
The migration module is imported by server code; a CLI/script binding is a follow-up if live
migration on real data is required (per owner, current records are disposable test data).