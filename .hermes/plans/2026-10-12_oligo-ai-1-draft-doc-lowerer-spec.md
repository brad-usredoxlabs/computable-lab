# SPEC (draft, l1t1945) — OLIGO-AI-1: oligo-order-draft document schema + the lowerer to the SAME OligoRow[]

Item: OLIGO-AI-1 — lane 1 task list (`~/.hermes/cl/lanes/1/task-list.md`, id OLIGO-AI-1).
Canonical plan: `.hermes/plans/2026-10-11_133742-oligo-order-ai-read-fallback.md` — **Tasks 0, 1, 2 ONLY**. Tasks 3+ are OLIGO-AI-2; touching them is scope creep.
Base: trunk `cl/integration-1` @ `12efb613df546b190b9639571d6c967448067f5f`, worktree `/mnt/vast/home/brad/git/cl-integration-1`. Every git command on this NFS mount: `git -c core.fileMode=false ...` (MANDATORY).
Composer: cl-spec-composer run l1t1945, 2026-10-12. Every fact below was re-measured first-hand at HEAD (no scout, no plan-trust); probe scripts live in `/tmp/oligo-probe/` (throwaway, not deliverables).

## Goal (one sentence)

Give the pipeline a second PRODUCER contract, not a second pipeline: a validated `oligo-order-draft` document schema plus a pure lowerer `oligoRowsFromDraft` that turns such a draft into the exact `OligoRow[]` the deterministic regex extractor emits — byte-identical through the candidate envelope builder — so the future AI read (OLIGO-AI-2) changes only who writes the draft, never what downstream code compiles.

## 1. Task 0 status — VERIFIED, zero worktree/patch work remains

The plan's Task 0 (worktree off main + apply an uncommitted hardening patch) is obsolete. The task-list meta-plan says the patch landed; I verified: `git -c core.fileMode=false merge-base --is-ancestor 8a34d52f HEAD` → **YES**. `8a34d52f feat(sequences): multi-format oligo extraction — declared formats[] + sequenceNoise from config` is in trunk, and trunk's `config/sequence-analysis/oligo-order.yaml` carries the full hardening (3 `formats[]` ids `labeled-fields`/`invitrogen-order-summary`/`dye-wrapped-row`, `sequenceNoise`, FAM/BHQ-1/MGBNFQ/VIC/ABY/QSY `modifications`, `metadata`, `ocr`) with **no `aiFallback` key** (that is OLIGO-AI-2's Task 4 — do not add it here).

Task 0 for this item reduces to: branch off trunk at dispatch HEAD and paste the baselines of §5 into the report. Baseline command run twice at HEAD (also via the workspaces root):

    cd server && npx vitest run src/sequences/oligoOrder.test.ts
    # → Test Files 1 passed (1) | Tests 6 passed (6)
    npm run test:run -w server -- src/sequences/oligoOrder.test.ts   # from repo root — same 6 passed

## 2. The deterministic parser — verified locations

- `server/src/sequences/oligoOrder.ts` (80 lines).
  - `OligoRow` at :14 — `{ label: string; residues: string; raw: string; page: number; modifications: Array<{label;role;position}>; issues: string[]; metadata: Record<string,string> }`. **`metadata` is `Record<string, string>` — numbers must not leak into it.**
  - `extractOligoRows(text)` :15–49. Line loop :22–37 produces `raw`; **the normalization stage is the loop at :38–47**: strip `sequenceNoise` patterns → strip `5'`/`3'` wrappers → walk `config.modifications` (regex test, push `{label,role,position}`, strip) → `normalizeSequence(bases, alphabets.iupac_dna)` with catch → `residues = bases.replace(/\s+/g,'')` + issue. This is the block the lowerer must share, not copy (see §4).
  - `ingestOligoOrder` :51–80 — job/artifact/bundle/candidate envelopes via `server/src/ingestion/records.ts`; untouched by this item.
- `server/src/sequences/sequenceRuntime.ts` — `sequenceConfig(name)` reads `config/sequence-analysis/<name>.yaml` fresh on every call (YAML-reload trap does not apply to tests, only to tsx --watch boot); `SEQUENCE_SCHEMA = 'https://computable-lab.com/schema/bio/'`.
- `server/src/sequences/sequenceEngine.ts:10` — `normalizeSequence(raw, alphabet)`: strips whitespace, uppercases, throws `Unrecognized sequence symbol '<x>' at base N. Keep modifications in the oligo specification.` on unknown symbols.
- Baseline suite green at HEAD: 6/6 (see §1).

## 3. Schema trio convention — verified precedent, and why this schema is schema-only

Registration path (verified first-hand): `server.ts:366-370` calls `loadAllSchemas({ basePath: schemaDir, recursive: true })`; `SchemaLoader` (`server/src/schema/SchemaLoader.ts`) picks up **any** `*.schema.yaml` under `schema/`, keyed by its `$id`. `server.ts:387` builds the runtime validator with `createValidator()` (strict:true default).

- Full-triplet precedent (record types): `schema/identity/ownership-policy.{schema,lint,ui}.yaml`, `schema/bio/oligo-spec.{schema,lint,ui}.yaml`.
- **Schema-only precedent (non-record / never-persisted documents):** `schema/ingestion/` — `ingestion-job`, `ingestion-artifact`, `ingestion-candidate`, `ingestion-candidate-bundle`, `ingestion-issue` have **no lint.yaml and no ui.yaml** (only `extraction-spec` has a ui). The draft is an API-boundary document, never a record; schema-only matches `ingestion-*`. (See OQ1.)
- Test precedent to mirror: `server/src/schema/OwnershipPolicySchema.test.ts` — `REPO_ROOT = resolve(process.cwd(),'..')` (vitest cwd is `server/`), `loadSchemasFromContent` → `registry.addSchemas` → topological `validator.addSchema` → `createValidator({ strict: false })`. `server/src/schema/Wave2QuantitySchema.test.ts` exists and is the harness the plan names — also fine. **Prefer the OwnershipPolicy `REPO_ROOT` pattern**: the plan's Task-1 snippet reads `readFileSync('schema/sequence-analysis/...')` cwd-relative, which only works because `server/schema` is a gitignored symlink (`.gitignore:44`); the REPO_ROOT pattern works in any worktree with zero symlink assumption.
- The DEV-3 envelope form still holds where the store is involved: `RecordStoreImpl.validate(envelope)` (:873-886) runs `validator.validate(envelope.payload, envelope.schemaId)` and errors `Schema not found: ...` when the id is unknown. This item does not touch the store; if any test wants `store.validate`, it must pass the full `{recordId, schemaId, payload}` envelope.

Probe-proven facts about the plan's Task-1 YAML (I built it verbatim at `/tmp/oligo-probe/draft-schema.yaml` and ran it through the real code):
- `loadAllSchemas({basePath: <dir with the file as oligo-order-draft.schema.yaml>})` → **0 load errors, 1 entry, id `https://computable-lab.com/schema/computable-lab/sequence-analysis/oligo-order-draft.schema.yaml`** — a new `schema/sequence-analysis/` directory registers cleanly and does not break boot (current registry: 195 entries, no `$id` collision).
- Through the real `AjvValidator`: readable row → valid; `{sequence: null, unreadable: true}` row → valid; fabricated `{name, bases}` row → **rejected**; AND it also loads under `createValidator()` **default strict:true** (no strict-mode keyword traps in this YAML) — so boot registration cannot blow up.

Pin the `$id` string exactly (Task 3 of OLIGO-AI-2 will import it): `https://computable-lab.com/schema/computable-lab/sequence-analysis/oligo-order-draft.schema.yaml`.

## 4. The lowerer seam — the smallest pure function, and the shared normalizer

The deterministic text→rows path is `extractOligoRows`. The AI producer will hand a draft document instead of text; the seam is:

    oligoRowsFromDraft(draft): Promise<OligoRow[]>        // pure, async only for sequenceConfig

Byte-identity proof (probe, `/tmp/oligo-probe/probe.mts`, run against trunk code):
- Input line `30 Pass Oformi_1784_ABY |ABY-CAC CGT ATC GCA AGG TTG TCG ACA GTC A-QSY 28 365570 10137.44 Pass 6000 100uM` through `extractOligoRows` → residues `"CACCGTATCGCAAGGTTGTCGACAGTCA"`, modifications `[ABY 5-prime, QSY 3-prime]`.
- The plan's lowerer algorithm on draft `sequence: "ABY-CAC CGT ATC GCA AGG TTG TCG ACA GTC A-QSY"` → **residues BYTE-IDENTICAL, modifications array deep-equal**. The plan's Task-2 test expectation `'CACCGTATCGCAAGGTTGTCGACAGTCA'` is grounded in this measurement.
- Bracket-VIC class (`[VIC-CCC ... -QSY`) — the row the regex path silently misses — lowers to residues with a leftover `[` and the honest issue `Unrecognized sequence symbol '[' ...` via the same catch arm. **Do not "fix" this in the lowerer** (that would be a second normalizer / a vendor-format hardcode); the fix belongs to OLIGO-AI-2's config-driven patterns or the honest unreadable path.
- Envelope identity (probe2): `buildIngestionCandidateEnvelope` is a **pure function of its input** — `recordId = compactId('ICD', candidateType-title)` (sha1-based, no randomness), and the candidate envelope contains **no timestamps** (unlike the job envelope's `submitted_at`). Two builds with equal input are `JSON.stringify`-identical. So the acceptance bar "deterministic rows vs AI-draft rows produce identical envelopes" is testable at builder level with zero I/O: `extractOligoRows(line)` payload vs `oligoRowsFromDraft(draft)` payload, same `{job, bundle, candidateType:'oligo', title, payload:{...row, sha256}, sourceRefs, proposedRecordKind:'oligo-spec', proposedSchemaId: SEQUENCE_SCHEMA+'oligo-spec.schema.yaml'}` → `expect(aiEnvelope).toEqual(deterministicEnvelope)`.

**The one-place-compile mandate (recommended shape, deviation from plan Task 2):** the plan's sample lowerer *copies* the normalization loop (`oligoOrder.ts:38-45`) into `oligoOrderDraft.ts`. A copy satisfies "same output" only until the next config- or code-edit touches one copy. The smallest seam that *structurally* guarantees identity: extract the :38–46 stage into an exported function in `oligoOrder.ts`, e.g.

    export function normalizeOligoRawBases(bases: string, config: ..., alphabets: ...):
      { residues: string; modifications: OligoRow['modifications']; issues: string[] }

have `extractOligoRows` call it verbatim (its own loop body shrinks to that call — `oligoOrder.test.ts` must stay 6/6 untouched), and `oligoRowsFromDraft` call the same function. One compiler, two producers, literally. This adds `oligoOrder.ts` to the diff (a 5th file, still ≤5). If the reviewer rejects touching `oligoOrder.ts`, the fallback is a verbatim copy plus an equivalence-pinning test — OQ3, recommended default = shared helper.

Lowerer contract details the tests must pin (beyond the plan's 3):
- `label = entry.name.trim()`; `page = entry.page ?? 1`; `raw = entry.sequence ?? ''` **verbatim** (the identity arm depends on `raw` matching the regex capture byte-for-byte — do not trim, do not re-space).
- metadata mapping (all `Record<string,string>` keys, matching the regex path's `config.metadata` keys): `vendor`, `orderId`, `synthesisScale` (from `scale`), `purification`. Draft fields `yieldPmol/mass/concentrationUM/buffer/sourceQuote/unreadable` are NOT `OligoRow` fields — they ride the draft document (review UI in OLIGO-AI-2); do not `String()` them into metadata.
- unreadable arm (`entry.unreadable || sequence == null || sequence.trim() === ''`): push issue matching `/could not be read/`, `residues: ''`, **never call `normalizeSequence('')`** (it throws `Sequence is empty.` — the wrong message and an empty-string residue trap).
- modifications (see OQ2): derive them deterministically from the bases through the shared normalizer (pattern-table order = the config's YAML order), then append `entry.modifications` entries the table did not produce, deduped by `label` — a naive append of draft mods + pattern mods yields duplicates (ABY/QSY twice) and is the single likeliest reviewer rejection of the plan's sample code.

## 5. Baselines re-measured at HEAD 12efb613 (zero-NEW gate — paste these into the report)

| Check | Command | Measured at HEAD |
|---|---|---|
| server types | `cd server && npx tsc --noEmit 2>&1 \| grep -c "error TS"` | **0** (stay 0) |
| app types | `cd app && npx tsc --noEmit 2>&1 \| grep -c "error TS"` | **23** — NOT "all event-editor": 15 lines under `src/event-editor/`, 8 elsewhere (`useAiChat.surfaceContext.test.ts`×5, `useSurfaceContext.ts`, `IngestionUploadModal.tsx`, `ExtractionProgressPanel.test.tsx`). app is untouched by this item → count must stay 23 with 0 lines in touched files |
| oligo baseline | `cd server && npx vitest run src/sequences/oligoOrder.test.ts` | 6 passed |
| sequences neighborhood | `cd server && npx vitest run src/sequences/` | **6 files, 40 passed / 2 skipped (42)** → after: 7 files, 43+N passed / 2 skipped |
| schema neighborhood | `cd server && npx vitest run src/schema/` | **PRE-EXISTRED RED at HEAD: 10 failed / 424 passed / 53 skipped (487)** — `EventGraphSemanticKeySchema`×4, `EventGraphEquipmentSchema`×3, `ProcurementSchemaContracts`×3. The new test adds +3 passed; the 10 failures must stay byte-identical in count and identity |
| full server suite | `cd server && npx vitest run` (~4.5 min) | **98 failed / 5510 passed / 70 skipped (5860), +2 unhandled errors** — pre-existing trunk drift; only run if cheap, quote verbatim, zero-NEW |
| lane stack | `:3092/:5192` | untouched — this item is test-level only, **no restart, no curl needed** (schema boot probe §3 already proves registration). `:3001/:5174` never touched |

UNVERIFIED: none material. Every row above was run by the composer at HEAD. If dispatch lands on a newer trunk HEAD, re-run the first five rows and re-quote; the counts above are for `12efb613`.

## 6. Files

IN scope (exactly these 5, ≤5 rule met):
1. `schema/sequence-analysis/oligo-order-draft.schema.yaml` — NEW, plan Task 1 verbatim (its YAML is probe-validated, §3).
2. `server/src/schema/OligoOrderDraftSchema.test.ts` — NEW, OwnershipPolicy harness (`REPO_ROOT` pattern), the plan's 3 arms (readable / unreadable / fabricated).
3. `server/src/sequences/oligoOrderDraft.ts` — NEW, `oligoRowsFromDraft` + `OligoOrderDraft`/`OligoOrderDraftRow` types (plan Task 2 shape, with OQ2 mod-dedupe and OQ3 shared-helper adjustments).
4. `server/src/sequences/oligoOrderDraft.test.ts` — NEW, plan's 3 tests **plus the envelope-identity arm** (§4) — that arm IS the task-list acceptance clause; a suite without it does not satisfy `verified by`.
5. `server/src/sequences/oligoOrder.ts` — EDIT, only the mechanical extraction of the :38-46 stage into the exported shared normalizer (OQ3 default). No behavior change; its own suite must stay 6/6 with the test file untouched.

EXPLICITLY OUT of scope (OLIGO-AI-2 / others — a reviewer should reject any of these in this diff):
`server/prompts/`, `oligoOrderAiRead.ts` or any AI call, `sequenceRoutes.ts`, `server.ts` wiring, `config/sequence-analysis/oligo-order.yaml` (no `aiFallback`, no `declaredItemCount` — those are plan Tasks 4-5), `app/` (no `SequenceImport.tsx`), lint/ui YAML for the draft (OQ1), canonical `oligo-spec`/`sequence` schemas, any store/route write path, any fixture with vendor PDF text (plan Task 10), `git add -A`, commits in `/mnt/vast/home/brad/git/computable-lab` or the trunk worktree itself.

## 7. Acceptance criteria — verbatim from the task list (id OLIGO-AI-1)

    title: "Oligo draft-document contract: oligo-order-draft schema + the lowerer to the SAME OligoRow[] (plan Tasks 0-2)"
    description: >-
      Task 0 simplified (patch already landed — see meta-plan note): branch off trunk, baseline
      oligoOrder.test.ts (6 passed), tsc counts. Task 1: the oligo-order-draft document schema
      trio (RED->GREEN). Task 2: the lowerer draft -> the SAME OligoRow[] the deterministic
      parser emits, so candidates/review/promotion downstream are untouched (RED->GREEN). The
      deterministic parser stays the compiler; the AI is only a second PRODUCER of the draft doc.
    why: >-
      Reuses the entire existing envelope/candidate pipeline (records.ts builders, SequenceImport
      review cards) — the AI read only replaces the text->rows step, never the compiles.
    verified by: >-
      Draft schema validation tests + lowerer round-trip tests (deterministic rows vs AI-draft rows
      produce identical envelopes); zero-NEW tsc/vitest at trunk baseline; report quotes baselines.
    files: schema triplet for oligo-order-draft, server/src/sequences/ (+tests per plan).

## 8. RED-first commit plan (structural RED precedent: trunk `6b38a74b test(mcp): RED — ownership-policy AI tool contract (§T10) — structural RED: module absent`)

Commit 1 (Task 1 RED) — test only, suite RED with the YAML absent:
    git -c core.fileMode=false add server/src/schema/OligoOrderDraftSchema.test.ts
    git -c core.fileMode=false commit -m "test(oligo): RED — oligo-order-draft schema contract (structural RED: schema/sequence-analysis/oligo-order-draft.schema.yaml absent)"
Commit 2 (Task 1 GREEN):
    git -c core.fileMode=false add schema/sequence-analysis/oligo-order-draft.schema.yaml
    git -c core.fileMode=false commit -m "feat(oligo): oligo-order-draft schema — a validated AI-read document kind (null bases + unreadable flag, verbatim source quote)"
Commit 3 (Task 2 RED) — lowerer test incl. the envelope-identity arm, module absent:
    git -c core.fileMode=false add server/src/sequences/oligoOrderDraft.test.ts
    git -c core.fileMode=false commit -m "test(oligo): RED — draft-to-OligoRow lowering contract incl. candidate-envelope identity (structural RED: server/src/sequences/oligoOrderDraft.ts absent)"
Commit 4 (Task 2 GREEN) — lowerer + shared-helper extraction in ONE commit (the extraction is inert without its second caller; `oligoOrder.test.ts` must be byte-unchanged and stay green in this commit):
    git -c core.fileMode=false add server/src/sequences/oligoOrderDraft.ts server/src/sequences/oligoOrder.ts
    git -c core.fileMode=false commit -m "feat(oligo): deterministic lowering of an oligo-order-draft into the pipeline's own OligoRow[] — one shared normalizer, two producers, byte-identical candidate envelopes"

Report every RED run with its failing output in the report file (orchestrator re-runs them).

## 9. First targeted check (proves the approach before any test file exists)

From the coder worktree, after Task 0 branching — this single command sequence early-proves the two hard claims (schema loads into the real registry; lowerer normalization matches the regex path):

    cd server && npx vitest run src/sequences/oligoOrder.test.ts   # 6 passed = the compiler you must match
    cd server && npx tsx <(cat <<'EOF'
    import { extractOligoRows } from './src/sequences/oligoOrder.ts';
    const rows = await extractOligoRows('30 Pass Oformi_1784_ABY |ABY-CAC CGT ATC GCA AGG TTG TCG ACA GTC A-QSY 28 365570 10137.44 Pass 6000 100uM');
    console.log(rows[0]?.residues === 'CACCGTATCGCAAGGTTGTCGACAGTCA' ? 'TARGET-CONFIRMED' : 'TARGET-DRIFT ' + rows[0]?.residues);
    EOF
    )   # → TARGET-CONFIRMED   (tsx needs a real file if process-substitution is awkward: write to /tmp, .mts suffix for top-level await)

## 10. Full verification commands + expected outputs (measured above)

    cd server && npx vitest run src/schema/OligoOrderDraftSchema.test.ts
      # RED at commit 1 (module/file absent); GREEN after commit 2: "Test Files 1 passed (1) | Tests 3 passed (3)"
    cd server && npx vitest run src/sequences/oligoOrderDraft.test.ts
      # RED at commit 3; GREEN after commit 4: "Test Files 1 passed (1) | Tests N passed" (N ≥ 4, incl. the envelope-identity arm)
    cd server && npx vitest run src/sequences/oligoOrder.test.ts
      # "Tests 6 passed (6)" — unchanged test file, unchanged result (proves the normalizer extraction is inert)
    cd server && npx vitest run src/sequences/
      # after: "Test Files 7 passed (7)", "43+N passed | 2 skipped" — zero failures
    cd server && npx vitest run src/schema/
      # 10 failed / 427 passed / 53 skipped (490) — the SAME 10 pre-existing failures (EventGraph×7, Procurement×3), zero NEW
    cd server && npx tsc --noEmit 2>&1 | grep -c "error TS"    # 0
    cd app   && npx tsc --noEmit 2>&1 | grep -c "error TS"    # 23, zero lines in touched files (app untouched)
    cd server && npx vitest run                                # optional; baseline 98f/5510p/70s (5860) + 2 errors, zero NEW

## 11. Worker contract

- Worktree: `/mnt/vast/home/brad/git/wt/OLIGO-AI-1-lane1-<TS>`, branch `wt/OLIGO-AI-1-lane1-<TS>` off trunk `cl/integration-1` at dispatch HEAD (lane precedent: `wt/OWN-11-lane1-l1t1200`). `git -c core.fileMode=false` for EVERY git command. node_modules comes via the lane worktree symlink convention — verify at prep.
- Unique deliverable: report `~/.hermes/cl/lanes/1/oligo-ai-1-report-<dispatch-id>.md`, final line `OLIGO-AI-1 CODER DONE <sha>`. Report quotes §5 baselines verbatim plus each RED output.
- Never `git add -A`; commit paths exactly as §8. Never commit in `/mnt/vast/home/brad/git/computable-lab` or in `/mnt/vast/home/brad/git/cl-integration-1` (the orchestrator merges). Never touch `:3001/:5174`; this item needs no lane-stack restart.
- Stop boundary: anything from plan Tasks 3+; any change to `ingestOligoOrder`'s envelope flow; any vendor name or dye pattern in TypeScript; any DB/record write.

## 12. Reviewer bait (the edge errors this item will be attacked on — pre-empt all of them)

1. **exactOptionalPropertyTypes is ON** (`server/tsconfig.json:13`). `entry.scale` etc. must NEVER be assigned as `metadata.synthesisScale = undefined`; use `if (entry.scale) metadata.synthesisScale = entry.scale` / conditional spread. `sequence?: string | null` must be typed `?: string | null`, not `?: string`, or the schema's `sequence: null` arm stops typechecking into the lowerer.
2. **Duplicate modifications** (§4): pattern-derived + draft-declared mods are the likeliest defect; the identity test with a mod-carrying draft is the trap that catches it.
3. **Envelope form (DEV-3)**: store-level validate wants `{recordId, schemaId, payload}` envelopes and errors `Schema not found:` on unknown ids — the identity test belongs at `buildIngestionCandidateEnvelope` level (pure, no store); if you do open a `RecordStoreImpl`, follow `SequenceService.test.ts`'s harness (`loadAllSchemas` recursive → topological `addSchema` → `createRecordStore(...)`).
4. **YAML-reload traps**: none at test level (`sequenceConfig` re-reads per call — verified, `sequenceRuntime.ts:14-16`); but do NOT conclude from tsx --watch behavior on the lane stack — this item never touches the stack.
5. **Ontology/hardcode boundary**: zero vendor strings (`Thermo`, `Invitrogen`, `Oformi`...) outside test fixtures; every pattern comes from `sequenceConfig('oligo-order')`; no model, no prompt, no `aiFallback` key in this diff.
6. **Schema authoring traps**: do NOT `$ref` `FAIRCommon`/`common.schema.yaml` — the draft is DATA, not a record (no `recordId`/`title`); `additionalProperties: false` everywhere (the fabricated-shape arm depends on it); `role`/`position` enums exactly `reporter|quencher|other` and `5-prime|3-prime|internal` (they must round-trip into the config's modification rows); `$id` exactly as §3 (nested `sequence-analysis` segment is intentional and collision-free — probe-verified).
7. **Empty-string residues**: an unreadable row must short-circuit before `normalizeSequence` (which throws `Sequence is empty.`) and must still occupy an `OligoRow` — no silently dropped rows.
8. **cwd traps in tests**: use the `REPO_ROOT` pattern; `server/schema` is a gitignored symlink and the plan's cwd-relative `readFileSync('schema/...')` is a worktree-portability trap.
9. **The 10 pre-existing `src/schema/` failures and 98 full-suite failures are NOT yours** — a diff that "fixes" them is scope creep; a diff that adds one is a reject.

## 13. Open questions (composer could not resolve locally; each with recommended default)

- **OQ1 — triplet completeness.** The task-list `files:` says "schema triplet", but the plan's Task 1 creates schema-only, and `schema/ingestion/` proves schema-only is house convention for never-persisted documents (6 of 7 ingestion schemas have no lint/ui; only `extraction-spec` has a ui). Checked: CLAUDE.md's triplet rule is worded for *record types*; `LintEngine`/`UISpecLoader` load `*.lint.yaml`/`*.ui.yaml` recursively, and empty stubs would validate nothing. **Recommended default: schema.yaml + schema test only; if the adversarial reviewer demands the triplet, adding valid no-rule `lint.yaml` + minimal `ui.yaml` stubs is a ≤10-line follow-up commit.**
- **OQ2 — modifications merge policy.** Plan sample appends pattern-detected mods on top of draft-declared ones → duplicates for ABY/QSY. Checked: no existing dedup helper anywhere near (`oligoOrder.ts` pushes unconditionally; probe confirmed single-source order = config YAML order). **Recommended default: pattern-table first (deterministic truth), then draft-declared mods the table did not produce, deduped by `label` — with a test that a draft carrying correct `modifications` yields the SAME mods array as one carrying none.**
- **OQ3 — shared normalizer vs copy.** Recommendation = extract the `oligoOrder.ts:38-46` stage into an exported function and call it from both paths (§4); alternative = verbatim copy + equivalence-pinning test if touching `oligoOrder.ts` is contested. Checked: `oligoOrder.test.ts` is behavior-pinned (6 tests, no internals), so the extraction is safe; the probe shows the copy also produces identical bytes TODAY — which is exactly why a reviewer will demand the shared version. **Recommended default: shared helper (5th file in scope).**

COMPOSER-DRAFT-END l1t1945

## ORCHESTRATOR ADJUDICATION (promoted 2026-10-12 tick l1t2040)

- OQ1 (schema-only vs triplet): ADOPTED schema-only. Verified precedent first-hand: all five
  ingestion-* documents under schema/ingestion/ are schema-only (no lint/ui). The draft is an
  API-boundary document, never a record — a lint/ui pair would invent vocabulary with no consumer.
- OQ2 (mod merge): ADOPTED as drafted — pattern-table-first, then draft-declared mods the table
  did not produce, deduped by label. The naive-append duplicate is the named reviewer-bait; keep it.
- OQ3 (shared normalizer vs copy): ADOPTED shared helper (export the oligoOrder.ts:38-46 stage;
  extractOligoRows calls it verbatim; its suite stays 6/6 UNTOUCHED). This is the project thesis —
  one compiler, two producers — not merely a style preference. If the adversarial reviewer rejects
  touching oligoOrder.ts, fall back to verbatim copy + equivalence-pinning test.
- BASE SKEW: draft baselines were measured at 12efb613; trunk at promotion is 36402ae3 (OWN-11
  483e57ba + OWN-12 36402ae3 merges — app-code only, zero server/schema files touched, so the
  server/schema/sequences baselines carry; the coder must still re-quote the first five §5 rows at
  its dispatch HEAD before writing code).
- DISPATCH GATE UNCHANGED: OLIGO-AI-1 waits for OWN-13 merged (lane FIFO). OWN-13 is blocked on the
  CLAUDE.md rule-9 append (human/interactive-only; file verified untouched at md5
  cc43d17766d5606ee3d532c5356cbff4 this tick). Do not dispatch this coder while OWN-13 is held.
