# MATRES-REPLAY — HARVEST LEG REPORT (l2t1930-harvest1)

Task: MATRES-REPLAY **harvest leg only** (H1-H4), spec
`.hermes/plans/2026-10-19_1955-MATRES-REPLAY-harvest-leg-spec-DRAFT.md`.
Worker: cl-worker proc_767f6dc412ae · worktree
`/mnt/vast/home/brad/git/wt/matres-replay-lane2` · branch
`cl/lane2-matres-replay-l2t1930` @ 9841434b · 2026-10-19 ~21:00 EDT.

**Worksheet legs (intended-binding-before-panel, failure-condition verdicts) are
DEFERRED per dispatch and were NOT attempted.** Nothing in this doc rules on
MATRES-0 Q1-Q8; every artifact stays valid under any ruling.

All harvested material lives under `.hermes/plans/replay-harvest/` (read-only
**copies**; nothing under `/home/brad/.computable-lab-lane2/**` or any other data
repo was ever opened for write — originals verified read-only throughout; sha256
pins of everything copied: `replay-harvest/fates/harvest-hashes.txt`).

---

## 0. Spec claims — verified first-hand (spec asked me to)

| spec claim | verdict | what I read |
|---|---|---|
| Chat transcripts at `var/ai-threads/{userId}/{endpoint}.json` | CONFIRMED | `AiThreadStore.ts:52-54` (threadPath), `:87-91` (getThread). Additionally confirmed the per-conversation seam `conversationPath` (`:61-64`, `_conversations/`) — **no `_conversations/` dir exists on any lane repo**, so no stable-conversation transcripts survive either. |
| Endpoints incl. `event-editor` | CONFIRMED | `ai-threads/types.ts:11-17` APPLIANCE_ENDPOINTS. |
| Lane2 has only `default/{literature,sequences}.json` | CONFIRMED — and found MORE: the MAIN repo (`/home/brad/.computable-lab`) has the ONLY surviving `event-editor.json` (14 msgs, 2026-10-18/19). Harvested (read-only) as `main--default--event-editor.json`. | 
| Workstate journal `var/sessions/{userId}/journal` | CONFIRMED | `WorkstateJournal.ts` header + `journalDir()`; 500 entries seq 191-690 on lane2 USR-BRAD. Main repo has NO journal dirs → the event-editor turns have NO captured workspace context. |
| Drafts are NOT persisted pre-accept | CONFIRMED FROM SOURCE (spec required this) | `FormDraftService.compile()` (:61-83): `evaluate()` (:85+) builds `stagingStore(this.ctx.store, hidden)` and runs the whole pipeline through a Proxy store whose non-staged capabilities THROW; every create lands in `stagingStore.ts:6` `const writes = new Map()` — pure memory. `persist()` (:49-56) is called ONLY with the completed `{...draft, compiled}` envelope (compile success, line 81) and during accept transitions (:186, :198). So: **pre-accept draft payloads reach disk ONLY if compile itself completes** — a compile that throws DraftError at stage_authoring (:125, before line 81) writes NOTHING. Failed-compilation drafting is 100% ephemeral; accepted/compilable drafts persist as `form-draft` records. Consequence, seen in the data: all 50 lane2 form-draft records are the workstate/analysis/sequence adapters — **none carries a material noun** (grep trypsin|dmem|fbs|hepg2 over all 50: 0 hits). The four-term drafting sessions died pre-compile (clarification stalls) and left no draft record — exactly the lossiness the spec predicted. |
| heldIntents memory-only | CONFIRMED | `shorthandChat.ts:325` `const heldIntents = new Map<string, HeldShorthandIntent>()` + `:357` delete-on-cancel (the SH-QC-1 S9 F-3 clear-on-cancel gap is visible in the same block). Clarification Q/A pairs exist ONLY as thread text. |

## 1. H1 — Transcript harvest

Index (authoritative, generated): `replay-harvest/index.md` +
`replay-harvest/fixtures/cases.json`. Transcripts (4) under
`replay-harvest/transcripts/`, journal snapshots (35) under `journal/`,
record-store copies (160 YAML) under `records/`.

Material-bearing harvested turns (full table + verbatim text in index.md):

| turn | utterance | persisted form |
|---|---|---|
| T1 | "add 100 uL of unobtainium to wells A1:C3" (2026-10-18T13:27Z, main event-editor) | LIVE transcript + assistant unknown-noun reply |
| T2 | "add 50 uL of phlogiston to A1" (13:35Z) | LIVE transcript + same |
| T4 | "Trypsin-EDTA + DMEM + FBS + HepG2 cells" (canonical four-term) | DERIVED — `MAT-trypsin-edta-dmem-fbs-he-1om4.provenance.sourceLabel` (verbatim compound label captured at accept by `add-material-normalizer`), accepted into EVG-mvak17we-gdah 2026-10-16T05:56Z. NO live thread survives. |
| T5 | "Thermo trypsin-EDTA + Thermo DMEM + Thermo FBS + HepG2 cells" | DERIVED (1tuz + 4 MSP-DRAFT sourceLabels, EVG-mv7q7f5i) |
| T6 | "50/50 Trypsin-EDTA/DMEM + 10% FBS with 500 HepG2 cells/ul" | DERIVED (MAT-50-50-…-vkwl) |
| T7 | "Trypsin-EDTA + Dulbecco's Modified Eagle's Medium + Fetal bovine serum + HepG2 cells" | DERIVED (MSP …_I7C53NL3, EVG-mvajokf5) |
| T8 | (declared-DATA probe, not a transcript): canonical nouns under `wash.material` — the shipped vocabulary's ONLY `level: aliquot` declaration | n/a — replay-only arm |
| T9 | "Hep G2 [HEPG2] - HB-8065 \| ATCC" | DERIVED (persisted vendor-product record name) |
| T10 | case-3' unspecified source — utterance ABSENT | persisted ARTIFACT: EVG-mvajv2lb-xxwa `material_source_requirement {status: unresolved, reason: 'No explicit material instance, aliquot, or source lot selected during drafting.'}` — real footprint, no transcript |
| T11 | case-3 explicit physical bottle | **ABSENCE RECORDED** — 0 grep hits (bottle/lot/sku) in any harvested thread |
| T12 | "make 1 mL…" future prep instruction | **ABSENCE RECORDED** — 0 grep hits |

**Canonical-utterance verdict:** the four-term utterance EXISTS in persisted
derived form (8 distinct material/material-spec labels prove ≥8 accept variants
across two sessions); it does NOT exist as a live transcript turn on any repo.
No transcript was synthesized for any case (rule (d) honored — T11/T12 recorded
as absences; T4-T7 labels are quoted byte-for-byte from persisted provenance).

### Coverage vs the six required cases

| required case | coverage | basis |
|---|---|---|
| 1 original four-component mixture | PARTIAL (utterance recovered, transcript absent) | T4/T5/T6/T7 |
| 2 local wrong-level/approximate match | PROXY ONLY (real store + declared `level: aliquot`, replay-side) | T8 |
| 2' known-vendor product MISSING locally | NOT HARVESTABLE — the only real vendor product (T9) is present locally; no transcript ever asked for an absent one | recorded absence |
| 3' unspecified source (laziness) | ARTIFACT ONLY (T10) | material_source_requirement |
| 3 explicit physical bottle | ABSENT (recorded) | T11 |
| 6 "make 1 mL…" not-yet-happened instruction | ABSENT (recorded) | T12 |

Three of six cases have NO real transcript — authoring synthetic cases for them
is a post-report decision (spec §OUT), not this leg.

## 2. H2 — Instrumented spine replay + fate classification

Harness: `replay-harvest/scripts/replay_spine.mts` runs the REAL
`ResolveSpine` + REAL SPINE-3 `resolveScientistIntentNouns` against a read-only
RecordStore over the harvested YAML. **25 noun replays**, per-noun fate JSON in
`replay-harvest/fates/`, one-command offline re-run (see §5).

**Network disabled — how (five independent layers):**
1. `globalThis.fetch` replaced with a throwing stub before provider
   construction; any stray call is recorded (`offline.fetch_blocked` = 0 in
   every fate file — nothing even tried);
2. `CLA_ONTOLOGY_SERVICE_URL` deleted → OAK tier-2 provider never built
   (`createOakProvider` returns undefined without a URL);
3. direct spine probes pass `opts.localOnly:true` (P6 semantics — remote tiers
   excluded from the tier list itself, `ResolveSpine.ts:188`);
4. no `vendorProvider` passed (tier 4 absent from the spine);
5. the engine's spine adapter hard-codes `localOnly:true` (adapters.ts:82) —
   the compiler path is remote-blind by construction.
Outcome is therefore independent of any fresh web response.

### Fate tables (aggregate over the 25 replays)

**Returned-and-ranked (spine level).** 277 provider hits harvested via wrapped
tier-0/tier-1 providers; **all 277 survived to the ranked spine output** — zero
suppressed at the spine's lexical filter and zero at CURIE-dedupe on this
material. The suppression that IS real is the **`limit=20` cut**: 11 of 25 nouns
hit exactly 20 candidates (the default `DEFAULT_LIMIT`), and the engine's
`ambiguous-noun` clarification then showed **duplicate-identity floods** — e.g.
"Trypsin-EDTA" is asked about against 4 identical "Trypsin-EDTA + Thermo DMEM +
FBS + HepG2 cells" MSP-DRAFT records whose only difference is a recordId suffix
the user cannot see. (MINT-FLOOR-UI-1 collapses duplicate MINTS only; duplicate
LABELS of real records are not collapsed anywhere.)

**Suppressed-at-stage (engine level).**

| stage | mechanism | observed |
|---|---|---|
| engine in-band gate | `tier!==5 && confidenceOf in declared band [0.7,1]` | all surviving candidates pass (local tiers) — band itself suppressed nothing at tiers 0-1 |
| ambiguity → clarify | >1 in-band ⇒ `ambiguous-noun` (never an arbitrary winner) | **32 of 42 noun-arm outcomes** — this is the dominant production outcome for every real four-term noun |
| unknown-noun → mint offer | 0 in-band + noun-shape passes | 4 outcomes (T1, T2, T9-wash) — matches the live "Choose what it is, or create a local term." transcripts exactly |
| limit-20 head-cut at spine | `slice(0, limit)` before mint append | 11 nouns edge-capped (below-the-fold candidates never reach the panel at all) |

**Level-filtered.** The engine `levelFilter` (resolutionEngine.ts:144-161) fired
only under `wash.material` (`level: aliquot` — WELL_READY table): it dropped
**every** concept-level Trypsin-EDTA/DMEM/FBS/HepG2 candidate
(`level-mismatch: … ineligible for wantLevel aliquot`, per-candidate traced), and
likewise dropped both HepG2 ATCC candidates (concept + unknown levels) under
T9-wash — a genuinely-available local material and vendor product both
**level-filtered to zero, surfacing only as unknown-noun + mint**. This is the
instrumented proof that concept-level local records can be structurally
ineligible at a well-ready requirement — feeding memo Q2/Q3 evidence. Under
`add_material` (no declared level) the filter is inert, as designed.

**Remote-clamp.** Remote tiers cannot fire in the offline store, so the clamp is
recorded as DETERMINISTIC ARITHMETIC (in every fate file under
`remote_clamp`): `confidenceOf = min(max(score,0),1)` over TIER_BASE + max-bonus
gives per-tier max confidence {0:1, 1:1, 2:1, 3:0.75, 4:0.58}. Consequences:
(a) a tier-4 vendor hit is BELOW the declared band floor 0.7 — **structurally
unbindable through the engine even when online** (the P4 "known-vendor wrongly
disables product lookup" surface has a real arithmetic root: vendor hits are
visible to the UI spine but NEVER engine-bindable);
(b) tiers 0-2 all saturate to exactly 1.0 after the clamp: **343 of 347
candidate facts in the persisted clarification payloads carry confidence
1.0** — tier ranking and match quality are INVISIBLE to whatever renders the
clarification. This is harvest evidence, not a ruling.

## 3. H3 — Artifact-kind gap table (evidence for memo Q2, no ruling)

For each persisted clarification/draft reconstruction, which of the four
artifact kinds could a reader (or a model) CONFUSE it with, given ONLY stored
fields?

| persisted reconstruction (what IS stored) | its kind | confusable with | why indistinguishable in the payload |
|---|---|---|---|
| Engine clarification candidate fact `{label, confidence:1.0, ref:MAT-…}` (T4-T7 ambiguous-noun payloads) | candidate pointing at a **material concept record** (`material` kind ⇒ level concept) | **material-spec / plan-slot ref** | `ref` is a bare recordId; the candidate fact carries NO `level` field — concept vs spec is derivable only by re-reading the store; nothing in the payload states which |
| Same, ref = `MSP-DRAFT-EVG_*` | **material-spec** born as a per-draft throwaway spec (one per accepted event!) | plan-slot ref | the 8 MSP-DRAFT records for one utterance differ only by an event-id suffix; a slot ref and a formulation spec share the identical payload shape `{label, confidence:1, ref}` |
| EVG `material_source_requirement {status:unresolved, material_spec_ref}` (T10) | the spec's own recorded **"no attestation yet"** | an attestation chain, or a plan-run binding | it names a spec but states absence of instance/aliquot/lot — reads like a (negative) attestation; whether it IS one is Q4 semantics, not in the payload |
| Vendor-product candidate (`VPR-*`, tier-1 local hit, level unknown/concept) | local **vendor product** | instance/lot evidence | "ATCC HB-8065" LOOKS like source-lot evidence (it is catalog identity, i.e. what Q2 may or may not accept as attestation-substitute) — payload says neither |
| `MAT-thermo-trypsin-edta-ther-1tuz` **material** record named "+ Thermo DMEM + Thermo FBS + HepG2 cells" | single concept record whose NAME is a whole mixture | a candidate-protocol / full formulation | vendor-qualified spellings minted one material per spelling variant — mixture-shaped concept vs formulation indistinguishable without the store's `kind` |

Count: **all 4 confusion axes are attested by persisted data** (spec-vs-concept
via the flood; attestation-absence via T10; vendor-identity-as-attestation via
T9; protocol-shape via T5/T6 record names). This is the Q2 input, not a Q2
answer.

## 4. H4 — Static typed panel material

`replay-harvest/panels/<turn-id>__<noun-slug>.txt` — 25 plain-text candidate
grids, grouped **referent-level × tier**, score shown, **MINT SUPPRESSED** (the
tier-5 affordance is filtered out of every panel; capture format only, zero
selection semantics). Example (`T4 … Trypsin-EDTA`): 11 concept-level tier-1
materials (top `MAT-trypsin-edta-100w` 1.150) + 9 spec-level tier-1 MSP-DRAFTs —
the user-visible "which component does this bind" problem, made flat-text
visible: identical labels at different levels, no level word rendered anywhere.

## 5. Harness + one-command offline re-run proof

```
bash /mnt/vast/home/brad/git/wt/matres-replay-lane2/.hermes/plans/replay-harvest/scripts/run-all.sh
```
Scripts: `harvest_index.py` (H1), `replay_spine.mts` (H2-H4),
`hooks-resolve.mjs` (resolve hook, see assumption A2), `run-all.sh`.
Verified: two consecutive runs produce **byte-identical** `fates/_summary.json`
(diff empty); final line of the run: `replay complete: 25 noun replays; fetch
blocked calls: 0; store records: 160`. No network reachable-by-construction (§2).
Exit 0, no product files touched.

## 6. Assumptions recorded

- **A1 — MAIN repo harvested too.** The spec named only the lane2 repo; the
  sole surviving event-editor transcript lives at
  `/home/brad/.computable-lab/worktrees/main` (same standing test-data ruling,
  read-only copy). Excluding it would have lost T1/T2 — the only REAL
  clarification transcripts anywhere.
- **A2 — untracked product file pinned.** Trunk 9841434b IMPORTS
  `server/src/ai/materialRefFields.js` from tracked code, but that file is
  UNTRACKED — excluded via `/home/brad/.hermes/cl/lanes/1/lane-exclude:72`
  (found only in Brad's main disk tree). To run the REAL engine off a clean
  worktree I pinned a byte copy at
  `replay-harvest/fixtures/materialRefFields.pinned.ts`
  (sha256 0cf0b9784d9ccde36efab7779fef1e5de054a207ebc4ab6690b1d5ed208f7f54 —
  identical to main-tree file) and pointed a harness resolve-hook at it. Zero
  product-code edits; the missing file is flagged here as a **trunk-hygiene
  finding for the orchestrator** (an importer-only-tracked import — typecheck
  on a fresh checkout must fail for every file importing it).
- **A3 — T8 is a declared-DATA probe, labeled as such.** The wrong-level
  required case has no transcript; replaying real nouns under the real
  `wash.material level: aliquot` declaration probes the SAME production filter
  against the SAME harvested store. Clearly marked non-transcript in cases.json.
- **A4 — sourceLabel-as-utterance.** Accept-time `provenance.sourceLabel` is
  the compiler's verbatim capture of the compound label; treating it as the
  closest persisted form of the user utterance is an interpretation, flagged at
  every table. The user's exact pre-normalization wording may have differed.
- **A5 — journal≠turn attribution.** Journal snapshots prove WHAT was on
  screen (deck/tab/eventGraphId) near the accept timestamps; they are NOT
  per-turn chat context. No turn claims more than the capture shows.
- **A6 — node_modules symlink** `node_modules ->
  /mnt/vast/home/brad/git/computable-lab/node_modules` created at worktree root
  (lane-standard practice; gitignored, not committed) — dependency resolution
  only.
- **A7 — task-list.** Lane block already recorded this dispatch (orch
  l2t1930b, this pid); no reclaim needed. I could NOT add the intended
  in-progress marker line: `grep 'HARVEST DISPATCHED'` under the lock matched
  (comment inside the MATRES-REPLAY block) but my sed insertion attempt no-op'd
  on marker de-dup; the orchestrator owns canonical bookkeeping, left untouched.

## 7. Files (this commit)

All under `.hermes/plans/`: the spec (pre-existing), this report, and
`replay-harvest/` {index.md, fixtures/cases.json,
materialRefFields.pinned.ts, transcripts/×4, journal/×35, records/×160,
fates/×25+2, panels/×25, scripts/×4}. `git diff` outside `.hermes/`: empty
(verified `git status --short` post-run — only `.hermes/plans/replay-harvest/`
untracked, now committed).

EXIT SUMMARY
- Deliverable: /mnt/vast/home/brad/git/wt/matres-replay-lane2/.hermes/plans/MATRES-REPLAY-harvest-report.l2t1930-harvest1.md
- Coverage: 3/6 required cases have real/derived evidence; 3 recorded ABSENT (no synthesis).
- 25 instrumented offline replays; fate classification (returned / suppressed-at-stage / level-filtered / remote-clamp arithmetic) in replay-harvest/fates/.
- H3 gap table attests all four confusion axes from persisted payloads; H4: 25 mint-suppressed level×tier panels.
- Re-run proof: bash .hermes/plans/replay-harvest/scripts/run-all.sh → byte-identical second run, fetch_blocked=0.
- Trunk-hygiene finding: server/src/ai/materialRefFields.ts is imported by tracked code but lane-exclude-untracked (assumption A2) — route to orchestrator.
