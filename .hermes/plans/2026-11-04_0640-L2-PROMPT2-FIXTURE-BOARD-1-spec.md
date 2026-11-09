# L2-PROMPT2-FIXTURE-BOARD-1 — fresh prompt-1 baseline board for the prompt-2 journey

SPEC OF RECORD — PROMOTED 2026-11-04T06:40 EDT (orch l2t0630) from composer draft l2t1310.
Composer unit l2t1310; promotion review by the orchestrator, first-hand, at trunk **bd39c254**.

PROMOTION REVIEW RECORD (what the orchestrator measured, not what the draft claimed):
- Re-audited the §9 V-1 pin table at `bd39c254`. **43 of 48 rows hold verbatim** (P06-P48 spot-checked
  at source: RecordHandlers.ts:585/:640/:864/:882-902/:1524, routes.ts:238/:244, App.tsx:179,
  eventGraph.ts:501-507, PathConvention.ts:129-134, ValidationHandlers.ts:122 all EXACT).
- **P01-P05 (the `run-journeys.py` rows) have ALL MOVED** — the file grew from ~940 to **1642 lines**
  because L2-CHATHOST-CONSOLIDATE-1's merged harness work (`--chat-hosts`, `alert_texts`, `probe_seed`)
  landed after the draft's base tip. They are re-anchored below to the measured `bd39c254` lines AND to
  the defining SYMBOL, because CHATHOST's in-flight `alert_texts`+`probe_seed` unit will move them again
  before this item is claimable. **At claim, re-anchor by symbol, not by the number.**
- No criterion, scope boundary, ruling or acceptance bar was changed by this promotion. The draft's
  §12-RULINGS restatement and §5 IN/OUT are carried verbatim.

Base pin for every code/schema cite in this document:
`/mnt/vast/home/brad/git/cl-integration-2`, branch `cl/integration-2`, tip
**bd39c254** (promotion tip; the draft's original base was 98ca125f020c2e922ef5f6f138f273345e3e1d9c).
Every line number below was re-read at the promotion tip on 2026-11-04T06:35Z; where a line MOVED from
the predecessor draft (drafts/L2-PROMPT2-FIXTURE-BOARD-1-spec-draft-l2t0150.md, pinned at 428a47ed) I say
so inline. No pin in this document is copied forward unverified.

Predecessor: that l2t0150 draft was audited and RULED by the orchestrator (task-list.md:17158-17172,
§12-RULINGS). Its six rulings are BINDING for this spec and are restated in §5/§13, not re-opened.
This draft exists because the predecessor was NOT promoted: the trunk moved (TARGET-1 merged at
53f761cd/31353115, then GHOSTPAINT spec at 3427f501, then 3acbe234/d672d179/5d8c7685/98ca125f), and
because the LIVE BOARD ITSELF MOVED — see §2.2, measured today.

---

## 1. Goal, and which corpus expectation becomes judgeable

**Goal (one sentence):** publish a harness-owned, reproducible event-graph board that carries exactly
prompt-1's 100 µL Thermo DMEM state on A2:H5 and nothing else, seeded through the shipped
L2-TRUNK-JOURNEYS seed path (not a delete of any legacy board, not a records hand-edit, zero product
code), so that Corpus2 Prompt 2's E-B3 and E-B4 can be judged against a well whose contents the corpus
text actually describes.

### 1.1 The two expectations that become judgeable, verbatim

Corpus `/mnt/vast/home/brad/git/computable-lab/test-prompts/AI-Chat-Corpus2.md` (read first-hand; the
file is NOT in the lane worktree — `test-prompts/` there holds only `easy1.md`):

- **E-B3**, :32 — "Expectation:  Wells A2-D5 will be a single color block.  Mousing over them will
  show the 100ul of DMEM only."
- **E-B4**, :33 — "Expectation:  Wells E2-H5 will be a single color block of a DIFFERENT color.
  Mousing over them will show the tooltip with 100ul of DMEM (~99%) plus 1ul of DMSO (~0.9%) and the
  final concentration of clofibrate."
- Prompt-1's own gate text this board must preserve, :18 and :23 — "Add 100 ul of DMEM", "A mouseover
  of the selected wells should now display \"100 uL DMEM\"".

### 1.2 Why they are LITERALLY unjudgeable today — measured at compose time, not quoted

At 2026-11-03T18:1xZ I ran a cold-context hover probe against the live board
`EVG-cellrox-flow-cytometry-assay-kits-method-bda3685b` on :5193 (the same selector recipe the recon
driver uses, §9 V-3). Raw JSON:

    E2  -> {"vol":"302.0 µL","meta":"5 events applied",
            "rows":[{"name":"1 mM Clofibrate in DMSO","conc":"—","vol":"1.0 µL"},
                    {"name":"Clofibrate","conc":"—","vol":"1.0 µL"},
                    {"name":"Thermo DMEM","conc":"—","vol":"100.0 µL"},
                    {"name":"Thermo trypsin-EDTA + Thermo DMEM + Thermo FBS + HepG2 cells","conc":"—","vol":"200.0 µL"}]}
    A2  -> {"vol":"300.0 µL","meta":"3 events applied", ... "Thermo DMEM — 100.0 µL", composite — 200.0 µL}
    A1  -> {"vol":"150.0 µL","meta":"1 event applied","rows":[{"name":"1 mM Clofibrate","conc":"—","vol":"150.0 µL"}]}

And `GET /api/records/EVG-cellrox-…-bda3685b` returns **8 events, 1 labware, status inbox**.

Three consequences, each fatal to literal judging:

1. **E-B3 is false on A2-D5 by 200 µL.** The legacy composite (`evt-add_material-9dbjge70`,
   `evt-add_material-ml6gdz21`, both 100 µL, recon table :48) is still stacked under prompt-1's DMEM.
   "100 ul of DMEM only" cannot be read off a 300.0 µL well.
2. **E-B4's percentages cannot exist on a 302 µL well.** 1 µL in 302 µL is 0.33 %, not ~0.9 %
   (recon:163-164 says exactly this: "the expected percentages are only meaningful on a clean board").
   The numbers the corpus asserts are 100/101 = 99.0 % and 1/101 = 0.99 % — only true on a 100 µL base.
3. **The board is still drifting.** The recon (2026-11-02T05:35) recorded A2:H5 = 300.0 µL / 3 events
   and **A1 = "0 µL Empty"** (recon:46-50). Today A1 reads 150.0 µL / 1 event and E2 reads 302.0 µL /
   5 events, because a later gate run committed `evt-add_material-hbhb8zb3` at
   2026-11-03T17:07:03.447Z (365/354-line record; event #8, "1 mM Clofibrate", 150 µL, well A1,
   `labwareId: lbw-seed-plate-96-flat`). Any "judge it on the live board" plan is therefore
   non-reproducible by construction: **the live board is an input to other people's gates.** That is
   the strongest argument for this task and it post-dates the recon report.

Ruling that authorises the task: `.hermes/plans/decisions/PROMPT2-recon-task-filing-l2t0747-ruling.md`
§T-4 (:136-150), including ":137-143 … make E-B3 (\"100ul DMEM only\") and E-B4 (\"~99 % / ~0.9 %\")
LITERALLY UNJUDGEABLE on the current graph. This is DATA, not product (recon:240-243), but the
prompt-2 gate cannot be judged on a polluted board" and ":148-149 … the cold tooltip on E2 pre-drive
reads exactly the prompt-1 baseline (100 µL Thermo DMEM, 1 event); the board is reproducible from the
fixture definition. This is the PRE-RUN task for the prompt-2 re-gate." Ordering: ":163-165 … T-4
(fixture) any time after TARGET-1, MUST be in place before the prompt-2 re-gate".

---

## 2. Acceptance criteria, VERBATIM, and who measures each

Lane task block, `/home/brad/.hermes/cl/lanes/2/task-list.md:17155-17183` (`id:
L2-PROMPT2-FIXTURE-BOARD-1`), quoted without paraphrase:

> description: >-
>   A fresh event-graph fixture/board carrying ONLY prompt-1's 100 uL DMEM state (no A2:H5
>   legacy 200 uL composite, no clofibrate commits), seeded via the existing fixture/seed
>   harness. NOT a delete, NOT a records hand-edit. Harness/seed-side files only; ZERO
>   product code.
> why: >-
>   E-B3 ('100ul DMEM only') and E-B4 ('~99 % / ~0.9 %') are unjudgeable on the current
>   graph — the prompt-2 gate cannot be judged on a polluted board.
> verified by: >-
>   Cold tooltip on E2 pre-drive reads exactly the prompt-1 baseline (100 uL Thermo DMEM,
>   1 event); the board is reproducible from the fixture definition (re-seed twice, same
>   state).

Who measures what (this is the part the predecessors left implicit):

| # | criterion | measurer | instrument |
|---|---|---|---|
| AC-1 | cold tooltip on E2 pre-drive = `100.0 µL` / one row `Thermo DMEM — 100.0 µL` / `1 event applied` | **coder** produces it; **orchestrator** re-runs the same probe from a fresh browser before promoting | `tooltip-probe.cjs`, fresh `chromium.launch()` + fresh context (V-3) |
| AC-2 | the board is reproducible from the fixture definition | **coder** (digests in receipt) | delete-then-reseed canonical digest equality (§7, V-4) |
| AC-3 | the same seed, reused for the prompt-1 journey, still yields prompt-1's WORKS shape | **orchestrator** judges the contrast receipt (it is a gate verdict, not a coder claim) | legB2/legC copies with URL substituted (§6-L4) |
| AC-4 | the prompt-2 re-gate runs ON this board; the truth-table row flips only on a COLD BROWSER VERDICT | **orchestrator only** | the re-gate run itself, out of scope here (§5 OUT) |

AC-4 is stated explicitly because it is the one criterion this item must NOT self-certify: this item
delivers a board and a receipt; the truth-table flip belongs to the orchestrator's cold browser gate.

---

## 3. The mechanism — which existing seed harness, with pins

Three mechanisms exist in this repo. Exactly one is the shipped seed harness. **Use M1.**

### M1 — THE SHIPPED SEED HARNESS (use this)
`.hermes/plans/harness/l2-trunk-journeys/` — journeys are DATA (`journeys/J*.yaml`), one driver
(`run-journeys.py`). Verified at 98ca125f:

- `_api()` `run-journeys.py:375-393` — urllib, sends `x-user-id` (default `USR-BRAD`) at :379.
- `seed_journey()` `run-journeys.py:396-465`:
  - `seed.record` branch `:402-415` — `rid = rec["recordId"]` (:404), `GET /api/records/<rid>`
    (:405), **if 200 → "record exists (reused)", zero writes** (:406-408), else
    `POST /api/records` with `{schemaId, payload, message}` (:409-411), non-2xx → hard fail (:412-413).
    **The record id is DECLARED in YAML, not minted** — that is what makes the board addressable.
  - `seed.copy_record` branch `:416-464` — GET source, rewrite `recordId`/`id` to `c["to"]` (:423-425),
    `PUT` if the target exists ("re-seed", :445-453) else `POST` with `c["schemaId"]` (:454-464).
    This is the ready-made second-seed path for the contrast leg.
  - `seed_journey` reads the acting user from the journey YAML (`acting_user_id`, :400).
- `teardown_journey()` `run-journeys.py:468-475` — `delete_record` → `DELETE /api/records/<id>`
  (:471-474). Precedent: `journeys/J1.yaml:51`.
- Worked event-graph seed: `journeys/J1.yaml:16-51` (`seed.record` with `recordId` :18, `schemaId` :19,
  inline payload `:20-50` incl. `labwares` :27-37, `methodContext` :38-43, `editorLayout` :44-50).

**Trap that decides where the fixture may live:** the driver enumerates `journeys/*.yaml`
(`run-journeys.py:938-940` → `declared = sorted(f for f in os.listdir(js_dir) …)`) and `declared_ids()`
`:235-245`, and an ALL-GREEN claim requires `set(results) == declared_ids(...)` at `:837`. **Dropping a
YAML into `journeys/` silently changes the standing trunk gate's declared set.** The fixture therefore
lives OUTSIDE `journeys/` (§5).

### M2 — the API create path (what M1 calls underneath)
`POST /api/records` → `server/src/api/routes.ts:238`; handler `createRecord`
`server/src/api/handlers/RecordHandlers.ts:585`; record id read out of the payload by
`extractRecordId` (:648-655, 400 if absent); duplicates → **409** (:862-866); server normalisation of
every event-graph create at :640-645; envelope stamps `createdAt`/`updatedAt` into the payload (:767-768)
but **deliberately not `createdBy` for event-graphs** (:756-768, `supportsPayloadCreatedBy = kind !==
'event-graph'`); 201 path then best-effort back-fills `run.methodEventGraphId` **only if absent**
(:882-902, guard at :891).

### M3 — the app's own save path
`apiClient.saveEventGraph` (`app/src/shared/api/client.ts`, mints the id via `generateEventGraphId`).
This is how the editor makes boards in normal use and is why the live board exists at all. **A fixture
may not use it** — it cannot take a declared id, so AC-2 becomes untestable.

Nothing existing does what this task needs: there is **no** `fixtures/` seed dir under the harness
(`.hermes/plans/harness/` holds only `l2-suite-a/`, `l2-trunk-journeys/`, `labstate-contents-drive/`;
`e2e/fixtures/` exists in the repo only under `e2e/` for the w28 draft, verified via the README's own
reference at `l2-trunk-journeys/README.md:75`), there is **no** `corpus2-board/` today (404 on `ls`),
and there is no generic "seed an event graph" CLI other than the harness. So the surface to use is M1,
and the surface to EXTEND is a new directory next to it that imports M1 rather than forking it (§5).

---

## 4. What "prompt-1's baseline" is, exactly, and what the fixture must carry

Source of truth (read first-hand, 354 lines):
`/home/brad/.computable-lab-lane2/worktrees/main/records/runs/RUN-2026-09-07-run-nzrs/event-graphs/EVG-cellrox-flow-cytometry-assay-kits-method-bda3685b__cellrox-flow-cytometry-assay-kits-method.yaml`

Events (line ranges are that file today; event order in the YAML = apply order):

| # | eventId | type | material / detail | wells | labwareId | lines | in fixture? |
|---|---|---|---|---|---|---|---|
| 1 | `evt-create_container-7pcffkyq` | create_container | slot `target`, `labwareType: 96-well-plate` | — | — | :6-17 | **KEEP** (the deck plate) |
| 2 | `evt-add_material-9dbjge70` | add_material | composite "Thermo trypsin-EDTA + Thermo DMEM + Thermo FBS + HepG2 cells", 100 µL | A2:H5 | absent | :18-65 | DROP (legacy) |
| 3 | `evt-add_material-ml6gdz21` | add_material | same composite, 100 µL | A2:H5 | present | :66-115 | DROP (legacy) |
| 4 | `evt-add_material-k5ix39zv` | add_material | "Thermo DMEM", 100 µL | A7:D10 (16) | absent | :116-147 | DROP (outside the prompt-2 scope) |
| 5 | `evt-add_material-5rcrp3re` | add_material | **"Thermo DMEM", 100 µL** | **A2:H5 (32)** | **present** | :148-197 | **KEEP ← THE baseline event** |
| 6 | `evt-add_material-3to51ucp` | add_material | "Clofibrate", 1 µL | E2:H5 (16) | present | :198-231 | DROP (recon drive 1) |
| 7 | `evt-add_material-klh1bpqc` | add_material | "1 mM Clofibrate in DMSO", 1 µL | E2:H5 (16) | absent | :232-263 | DROP (recon drive 2) |
| 8 | `evt-add_material-hbhb8zb3` | add_material | "1 mM Clofibrate", **150 µL** | A1 | present | :264-284 | DROP (2026-11-03T17:07, §1.2) |

Reusable furniture, all copied verbatim into the fixture (values read first-hand):
labware block :285-330 (`lbw-seed-plate-96-flat`, `labwareType: plate_96`, 8×12 grid, labware `name:
plate1`, `geometry.maxVolume_uL: 200`, `definitionId: opentrons/nest_96_wellplate_200ul_flat@v1`,
`sourceRecordId: lbw-seed-plate-96-flat`); `name: Event Editor Draft` / `status: inbox`; `editorLayout`
(`surface: event-editor/v1`, one lawn placement at `xMm 16 / yMm 16`, `landscape`); `methodContext`
(`runId: RUN-2026-09-07-run-nzrs`, `vocabId: liquid-handling/v1`, `platform: manual`, `deckVariant:
default`, `locked: false`, `plannedRunRef PLR-plan-cellrox-flow-cytometry-assay-kits-34e5af82`,
`protocolRef PRT-g5zy9e`).

Run record `records/run/RUN-2026-09-07-run-nzrs__2026-09-07-run.yaml`: `studyId: STU-scratch` (:7),
`methodEventGraphId: EVG-…-bda3685b` (:18) — **already set**, so the create-path back-fill
(RecordHandlers.ts:891) cannot fire. This is why declaring `links.runId` is inert (OQ2 ruling).

Why the baseline event is the shape it is (PROMPT1-REGATE receipt
`…/20261102T030211/report.md:70-77`, read first-hand): `evt-add_material-5rcrp3re`,
`provenance {actor: ai-agent, method: compiler}`, `details.material = "Thermo DMEM"`,
`volumeUl 100`, `wells = A2..H5 (32)`, `details.labwareId = "lbw-seed-plate-96-flat"`.

**Mechanically, why "1 event" is the right assertion:** the footer counts `eventHistory.length`
(`app/src/event-editor/focus/WellTooltip.tsx:135-139`), and `eventHistory` is pushed once per applied
event per well (`app/src/graph/lib/eventGraph.ts:501-507`, `applyAddMaterial`, push at :506). The walk
iterates only `details.wells` (`eventGraph.ts:964-976`, `wells` read at :968) and the well volume is
`details.volume?.value` (:503) — **not `volumeUl`**. `create_container` carries no `wells`, so it
contributes nothing. One `add_material` ⇒ "1 event applied". `formatVolume(100) === "100.0 µL"`
(`eventGraph.ts:1100-1106`). Material row label falls back to `details.material` last of six
(`app/src/types/events.ts:620-625`, return at :624).

Expected cold tooltip on E2, pre-drive, exactly:

    E2  100.0 µL  |  Thermo DMEM — 100.0 µL  |  1 event applied

(the `—` concentration cell is `concCell` with no snapshot, `WellTooltip.tsx:108-124`; it is correct
here and must NOT be asserted away — concentration is L2-PROMPT2-SCIENCE-CHAIN-1's leg.)

**Paths that matter to the fixture payload** (all verified at 98ca125f):
- root `additionalProperties: false`, `required: [id, events, labwares]` — `schema/workflow/event-graph.schema.yaml:7-13`.
- `links {studyId, experimentId, runId}` declared, `additionalProperties: false` — `:56-70`.
- `status` enum `[inbox, filed, draft]` — `:71-77`.
- `methodContext` `required: [runId, vocabId, platform, deckVariant, locked]` (`:133`), `additionalProperties:
  false` (`:132`), `plannedRunRef`/`localProtocolRef`/`protocolRef` are `$ref: ./datatypes/ref.schema.yaml`
  (`:148-153`) — i.e. the object form `{kind,id,type,label}` the live record uses is legal.
- `editorLayout.placements` `required: [placementId, labwareId, location, orientation]` — `:239-241`.
- `PlateEvent` `required: [eventId, event_type, details]`, **no** `additionalProperties: false` (:296-303),
  `details.additionalProperties: true` (:351) — which is why `verb`/`vocabPackId`/`labwareId`/
  `provenance` may ride the event and `volume`/`wells` may ride `details`.
- normalisation is a no-op for this payload: `normalizeEventGraphMaterialUsage` (`RecordHandlers.ts:640-645`
  → `server/src/materials/AddMaterialSupport.ts:613`) rewrites only when a ref/composition/source is
  present (`AddMaterialSupport.ts:432-457`), and `upsertProposedMaterialSpecFromSingleActive`
  (`:266-284`) returns null without a `material_ref` **and** a concentration (:277, :281). Store
  equality assertion in §10 V-2 relies on this.

---

## 5. IN / OUT

### IN (the only files this item may create)

All under `/mnt/vast/home/brad/git/cl-integration-2` (the lane worktree), one NEW directory:

    .hermes/plans/harness/corpus2-board/c2p1-baseline.board.yaml   # DATA: the fixture definition
    .hermes/plans/harness/corpus2-board/seed-board.py              # seed/verify/reset driver (imports M1)
    .hermes/plans/harness/corpus2-board/tooltip-probe.cjs          # cold-hover probe (the AC-1 instrument)

Receipt artifacts are written OUTSIDE the repo, where runners write them:

    /home/brad/.hermes/cl/receipts/CORPUS2-BOARD-<UTC-ts>/{seed.json,record-before.json,
    record-after.json,repro.json,tooltip.json,contrast/*,shots/*.png,report.md}

`seed-board.py` MUST import the shipped functions, not re-implement them (the filename has dashes, so
`spec_from_file_location` is required):

    spec = importlib.util.spec_from_file_location(
        "l2journeys",
        "<worktree>/.hermes/plans/harness/l2-trunk-journeys/run-journeys.py")
    # use l2journeys.seed_journey({...}, api_base), l2journeys.teardown_journey({...}, api_base),
    #     l2journeys._api(api_base, method, path, body)

(`run-journeys.py` has no import-time side effects beyond stdlib/const/env reads; `HERE` is derived
from `__file__` at :26-45 region — the coder re-reads it; the module is safe to import.)

### OUT

- `app/**`, `server/**`, `schema/**`, `config/**`, `scripts/**` — product and product-config. **Zero
  product code.**
- `.hermes/plans/harness/l2-trunk-journeys/**` — the standing gate. Do **not** add a YAML to
  `journeys/` (§3 trap), do not edit `run-journeys.py`, do not add a `hover` step to `ui-drive.cjs`.
- `records/**` in the lane data repo — no hand-written YAML, no `git` writes by the coder. Only the
  HTTP API writes records (the store commits; `server/src/repo/EmbeddedGitRepoAdapter.ts:301-315`
  stages only the touched paths).
- The polluted live board `EVG-cellrox-flow-cytometry-assay-kits-method-bda3685b`: **no delete, no PUT,
  no event removal.** It is the recon's and prompt-1's evidence.
- `.hermes/cl/lanes/2/lane2-config.yaml`, `config.yaml` (the exa-key tripwire lives there).
- Any restart of Brad's :3001/:5174. The lane stack (:3093/:5193) needs no restart — both answered at
  compose time (`/api/health` 200, app root 200).
- The prompt-2 re-gate driver and the truth-table row — OQ6 ruling: not this item (§2 AC-4).

---

## 6. Legs, each with its pin

Legs are the ordered evidence steps of ONE coder run. Each names the pin that makes it meaningful.

**L1 — definition only, no write (`--check`).**
Pin: `POST /api/validate-full` exists and takes `{schemaId, payload}`
(`server/src/api/handlers/ValidationHandlers.ts:122-135`, route at `server/src/api/routes.ts` region
`:238-250`). Measured at compose time: HTTP 200 with `{"validation":{"valid":true,...},"lint":
{"valid":true,...}}`.
**Warning this leg must not overclaim:** the validator is PERMISSIVE. I posted an event-graph whose
`add_material` had only `{material, volumeUl, wells}` — no `details.volume` — and it returned
`valid: true` (measured). So `--check` proves *schema legality*, never *fixture correctness*; §11 R13.

**L2 — seed (`--seed`).**
Pin: `seed_journey` `seed.record` branch, `run-journeys.py:402-415` (declared id, GET→reuse, POST→create).
Expected first run: `record created: EVG-corpus2-prompt1-dmem-baseline` (HTTP 201). Any rerun:
`record exists (reused): …` and **zero writes**.
Pre-condition measured at compose time: `GET /api/records/EVG-corpus2-prompt1-dmem-baseline` → **404**
(id is free; 2026-11-03T18:1xZ).

**L3 — verify the stored state equals the definition (`--verify`).**
Pin: `RecordHandlers.ts:648-655` (id from payload), `:767-768` (createdAt/updatedAt only),
`:756-768` (no createdBy for event-graph), `AddMaterialSupport.ts:613/432-457/266-284` (no-op
normalisation). Expected assertion: stored payload == fixture payload + `{createdAt, updatedAt}` and
nothing else; events=2, labwares=1, `details.volume.value=100`, wells=32, `details.labwareId` set.

**L4 — cold tooltip pre-drive (AC-1).**
Pins: `WellTooltip.tsx:61` (volume span), `:113` (material-name cell), `:135-139` (meta), `:108-124`
(conc cell `—`); `eventGraph.ts:503` (volume from `details.volume.value`), `:506` (history push),
`:964-976` (walk over `details.wells`), `:1100-1106` (`formatVolume`); `events.ts:620-625` (label
fallback); route `app/src/App.tsx:179` + `ProjectWorkspacePage.tsx:186-199` (opens a deck tab for THAT
id). Probe selectors: `main[aria-label="Labware focus"] [data-well-id="E2"]`, `.well-tooltip`,
`.well-tooltip__volume`, `.well-tooltip__material-name/-conc/-vol`, `.well-tooltip__meta` (recon driver
`PROMPT2-SCOUT…/drivers/leg2.cjs:43-64`, read first-hand).
**Operational trap measured today:** the probe must click the lawn tile (`.lawn__tile-anchor .tile,
.tile`) and wait for `main[aria-label="Labware focus"]` before hovering — a direct `goto` + hover times
out with "waiting for locator('main…')" (I hit exactly this at compose time). §11 R16.

**L5 — prompt-1 contrast on a COPY of the board (AC-3).**
Pins: `seed.copy_record` branch `run-journeys.py:416-464` (from=baseline, to=`…-contrast`, with a
declared `schemaId` at :454-456); prompt-1's journey drivers
`PROMPT1-REGATE-20261102/20261102T030211/drivers/legB2.cjs` (accept flow) and `legC.cjs` (cold reload),
both hardcode the URL at `:11` and their output dir at `:5-7` — the coder copies them into the receipt
dir and changes ONLY those lines, pasting `diff -u` into the report as proof that the assertion logic
is untouched.
Expected shape: preview bar appears after the ask; `Thermo DMEM` selected from the clarifier;
32 wells selected; accept note; **after accept the E2 tooltip carries a `Thermo DMEM` row at 100.0 µL
and NO composite row**; cold reload resolves 96/96 wells with A2:H5 carrying content colour. The
post-accept TOTAL is predicted 200.0 µL / 2 events (100 seeded + 100 accepted) — it is RECORDED, and
the orchestrator rules on whether it is asserted (OQ-B). Never assert 300.0 µL anywhere.

**L6 — reproducibility by delete-and-reseed (AC-2).**
Pins: `teardown_journey` `delete_record` `run-journeys.py:468-475` (precedent `J1.yaml:51`), `DELETE
/api/records/:id` route `server/src/api/routes.ts:244`, handler `RecordHandlers.ts:1524`. This deletes
**only the harness's own fixture record**, by its declared id, through the shipped path — it is not the
"NOT a delete" the task forbids (which is deleting the legacy board), and it is the only way to prove
"reproducible from the fixture definition alone" with a state that could not have leaked (§11 R14).

**L7 — hand-off.** The board id, URL, canonical digest, and the L4 tooltip JSON go into the report and
the lane handoff. The prompt-2 re-gate is a separate run (AC-4).

---

## 7. Reproducibility: what "re-seed twice, same state" must mean

Two distinct properties; both are cheap and both are required:

**(a) Idempotence.** Second `--seed` on an existing id prints "record exists (reused)" and writes
nothing (`run-journeys.py:406-408`). Assert: record `contentSha` identical before/after, and
`git -C <data repo> log -1 --format=%H` identical before/after.

**(b) From-scratch determinism.** Delete the fixture record through `teardown_journey`
(`:468-475`), GET → 404, re-seed from the SAME YAML, and compare canonical payload digests:

    canon() { jq -S 'del(.record.payload.id, .record.payload.recordId,
                       .record.payload.createdAt, .record.payload.updatedAt)
                    | .record.payload' "$1"; }
    canon record-before.json | sha256sum
    canon record-after-reseed.json | sha256sum     # MUST be the same digest

Only identity/timestamp fields are removed — events, labware, editorLayout, methodContext, links,
status all count. Event ids and placement ids are deterministic because the fixture DECLARES them.

(b) is stronger than the predecessor draft's OQ3 repro-copy: a copy is still derived from a board that
may carry prior state, whereas delete+reseed shows the YAML alone recreates it. **The contrast leg
(L5) runs on a copy**, so the gate board is never mutated by prompt-1's journey. OQ-A asks the
orchestrator to confirm the delete of our own record is inside the task's "NOT a delete".

If (b) is RED, the cause is almost always a server stamp leaking into the payload body (compare the
raw diff first) — read the diff before "fixing" the fixture.

---

## 8. Scope table

| file | action | why | in the ruling's boundary? |
|---|---|---|---|
| `.hermes/plans/harness/corpus2-board/c2p1-baseline.board.yaml` | NEW | the fixture definition (DATA) | yes — harness/seed-side |
| `.hermes/plans/harness/corpus2-board/seed-board.py` | NEW | seed/verify/reset; imports `run-journeys.py` | yes — harness/seed-side |
| `.hermes/plans/harness/corpus2-board/tooltip-probe.cjs` | NEW | the AC-1 instrument | yes — harness-side |
| `.hermes/plans/harness/l2-trunk-journeys/**` | **read/import only** | the shipped seed mechanism | yes (no edit) |
| `records/**` (lane data repo) | **API-only writes** | records are store-written | yes (no hand-edit) |
| `app/**`, `server/**`, `schema/**`, `config/**`, `scripts/**` | **untouched** | zero product code | yes |
| `EVG-…-bda3685b` | **untouched** | it is the evidence | yes |
| `~/.hermes/cl/receipts/CORPUS2-BOARD-<ts>/**` | NEW | evidence | outside repo |
| prompt-2 re-gate driver / truth table | **not touched** | OQ6 ruling | yes |

Deliverable path pattern (worker contract): one commit, touching only
`.hermes/plans/harness/corpus2-board/**`. If any path under `app/`, `server/`, `schema/`, `config/`,
`scripts/` or `records/` appears in `git diff --stat <base>...HEAD`, the run is RED regardless of
greens.

---

## 9. V-1 pin list (what a coder re-reads before starting)

Status legend: `self@98ca125f` = I read it at the base tip myself; `measured` = I executed it against
the live lane stack at compose time; `moved` = the line changed since the l2t0150 draft and this is the
new cite.

| id | path:line | what it proves | status |
|---|---|---|---|
| P01 | `run-journeys.py` `def seed_journey` — **:657-728** at bd39c254 (record branch :663-676: GET→reuse :665-669, POST→create :670-676) | `seed_journey` `seed.record`: declared id, GET→reuse, POST→create, hard-fail otherwise | **moved** (was :396-415; re-anchor by symbol) |
| P02 | `run-journeys.py` `def _api` — **:636-656**, `x-user-id` at **:640** | `_api` sends `x-user-id` | **moved** (was :375-393/:379) |
| P03 | `run-journeys.py` `if "copy_record" in seed` — **:677-728** | `seed.copy_record` second-seed path (PUT if present, POST otherwise) | **moved** (was :416-464) |
| P04 | `run-journeys.py` `def teardown_journey` — **:729-738**, `delete_record` at **:732-733** | `teardown_journey` `delete_record` | **moved** (was :468-475) |
| P05 | `run-journeys.py` `def declared_ids` **:496-509**; run completeness **:1405**; `journeys/*.yaml` enumeration **:1425** | `declared_ids` + run completeness + `journeys/*.yaml` enumeration → a stray YAML breaks the standing gate | **moved** (was :235-245/:837/:938-940) |
| P06 | `journeys/J1.yaml:16-51` | worked event-graph `seed.record` + teardown precedent | self |
| P07 | `l2-trunk-journeys/README.md:40-49`, `:52-78` | harness env vars (`CL_JOURNEY_APP_BASE`, `CL_JOURNEY_API_BASE`, `CL_RECEIPTS`) and journey inventory | self |
| P08 | `server/src/api/routes.ts:238`, `:244` | `POST /api/records` create; `DELETE /api/records/:id` | self |
| P09 | `server/src/api/handlers/RecordHandlers.ts:585`, `:648-655` | create body `{schemaId,payload}`; recordId read from payload (400 if absent) | self |
| P10 | `RecordHandlers.ts:640-645` | every event-graph create runs `normalizeEventGraphMaterialUsage` | self |
| P11 | `RecordHandlers.ts:862-866` | duplicate → 409 | self |
| P12 | `RecordHandlers.ts:882-902` (guard :891) | run `methodEventGraphId` back-fill only when ABSENT | self |
| P13 | `RecordHandlers.ts:756-768` | `createdAt`/`updatedAt` stamped; **no `createdBy` for event-graph** | self |
| P14 | `RecordHandlers.ts:1524` | `deleteRecord` handler | self |
| P15 | `server/src/materials/AddMaterialSupport.ts:613`, `:432-457` | per-event normalisation; no-op without ref/composition/source | self |
| P16 | `AddMaterialSupport.ts:266-284` | `upsertProposedMaterialSpecFromSingleActive` needs `material_ref` AND concentration → null for our event (:277, :281) | self |
| P17 | `AddMaterialSupport.ts:465` | `requirementOccurrenceId(graphRecordId, eventId)` — event ids must be stable, not random | self |
| P18 | `schema/workflow/event-graph.schema.yaml:7-13` | root `additionalProperties:false`; required `[id, events, labwares]` | self |
| P19 | `…event-graph.schema.yaml:56-70` | `links {studyId, experimentId, runId}` declared | self |
| P20 | `…event-graph.schema.yaml:71-77` | `status` enum `[inbox, filed, draft]` | self |
| P21 | `…event-graph.schema.yaml:132-133`, `:148-153` | `methodContext` required keys (`:133`) + `vocabId` enum (`:139-141`) + ref-typed `plannedRunRef`/`protocolRef` (`:148-153`) | self |
| P22 | `…event-graph.schema.yaml:239-241` | `editorLayout.placements` required `[placementId, labwareId, location, orientation]` | self |
| P23 | `…event-graph.schema.yaml:296-303`, `:351` | `PlateEvent` required keys, no `additionalProperties:false`; `details` open | self |
| P24 | `app/src/shared/api/client.ts` `saveEventGraph` / `generateEventGraphId` | the app save path mints the id → unusable for a fixture | self (line region re-locate at claim; TARGET-1-adjacent file) |
| P25 | `app/src/App.tsx:179` + `app/src/event-editor/projects/ProjectWorkspacePage.tsx:186-199` | gate URL `/project/:studyId/event-graph/:id` opens a deck tab for THAT id | self |
| P26 | `app/src/event-editor/focus/WellTooltip.tsx:61`, `:108-124`, `:113`, `:135-139` | volume span / conc `—` / material-name cell / `N event(s) applied` | self |
| P27 | `app/src/graph/lib/eventGraph.ts:501-507` | `applyAddMaterial`: volume from `details.volume.value` (:503); history push (:506) | self |
| P28 | `app/src/graph/lib/eventGraph.ts:964-976` | the walk iterates `details.wells` (:968); `create_container` (no wells) is inert | self |
| P29 | `app/src/types/events.ts:620-625` | material label falls back to `details.material` (return at :624) | self |
| P30 | `app/src/graph/lib/eventGraph.ts:1100-1106` | `formatVolume(100) === "100.0 µL"` | self |
| P31 | `server/src/repo/PathConvention.ts:128-136` | event-graph files under `records/runs/<runId>/event-graphs/` when `links.runId` and no experimentId | self |
| P32 | `server/src/repo/EmbeddedGitRepoAdapter.ts:301-315` | commit stages only the touched paths, then commits the index | self |
| P33 | `server/src/api/handlers/ValidationHandlers.ts:122-135` | `POST /validate-full` takes `{schemaId, payload}` | self + measured 200 |
| P34 | data repo `records/runs/RUN-2026-09-07-run-nzrs/event-graphs/EVG-cellrox-…-bda3685b__…yaml:6-283` | the 8 events with ids/volumes/wells/labwareId per §4 | self |
| P35 | same file `:284-325` (labware), `:326-327` (name/status), `:328-337` (editorLayout), `:338-353` (methodContext) | the fixture's source of truth for furniture | self |
| P36 | data repo `records/run/RUN-2026-09-07-run-nzrs__2026-09-07-run.yaml:7`, `:18` | `studyId: STU-scratch`; `methodEventGraphId` already set (back-fill no-op) | self |
| P37 | `PROMPT1-REGATE-20261102/20261102T030211/report.md:70-77` | the baseline event's committed shape (`evt-add_material-5rcrp3re`, 100 µL, A2..H5, labwareId present) | self |
| P38 | `PROMPT1-REGATE…/report.md:60-63`, `:65-67` | prompt-1's WORKS shape (post-accept and cold tooltips, 3 events, composite row) — the contrast reference | self |
| P39 | `PROMPT2-SCOUT-20261102/20261102T053516/report.md:46-50`, `:52-57`, `:160-165`, `:186-198`, `:238-246` | polluted starting state; the DATA caveat; the 302 µL / 0.33 % arithmetic; no event-delete affordance | self |
| P40 | `PROMPT2-SCOUT…/drivers/leg2.cjs:11`, `:43-64` | the literal gate URL and the proven hover selectors | self |
| P41 | `PROMPT1-REGATE…/drivers/legB2.cjs:11` + `:1-40`; `legC.cjs:5-7`, `:11` | the two prompt-1 journey drivers and their hardcoded URL/out-dir (contrast copies) | self |
| P42 | `cl-lane-stack.sh:12`, `:21` | lane-2 ports 3093 / 5193 | self |
| P43 | `config.yaml:5` | lane data dir `/home/brad/.computable-lab-lane2` | self |
| P44 | corpus `…/AI-Chat-Corpus2.md:14-23`, `:25-33` | E-B1..E-B4 wording verbatim (E-B3 :32, E-B4 :33) | self |
| P45 | `decisions/PROMPT2-recon-task-filing-l2t0747-ruling.md:136-150`, `:163-165` | T-4 binding scope + ordering | self |
| P46 | `task-list.md:17155-17183` | the task block's own description/why/verified-by (verbatim source of §2) | self |
| P47 | lane stack live | `/api/health` 200, app root 200, `GET …/bda3685b` = 8 events; E2 = 302.0 µL / 5 events; A1 = 150.0 µL / 1 event | **measured 2026-11-03T18:1xZ** |
| P48 | (inference) how `EVG-…-bda3685b` was CREATED | likely the app save path (M3), from the `ai-agent/compiler` provenance; **no receipt captures the create call** | 2nd/inference |

Re-pin rule at claim: re-read every row; correct any moved line IN the spec commit, never follow it
silently. Rows P24 (client.ts) is the only row in a TARGET-1-adjacent file, and it is not
load-bearing for a pin — it explains why M3 is unusable.

**P01-P05 are SYMBOL-anchored, not number-anchored** (promotion note, orch l2t0630): the
`run-journeys.py` rows were re-measured at bd39c254 after CHATHOST's harness merges grew the file to
1642 lines, and CHATHOST's in-flight `alert_texts`+`probe_seed` unit will move them again. At claim,
locate `def seed_journey`, `def _api`, `if "copy_record" in seed`, `def teardown_journey` and
`def declared_ids` by grep and record the numbers you measured; a number that disagrees with this table
is EXPECTED and is not a spec defect.

---

## 10. Verification — the exact commands a coder runs, with expected output

All from `/mnt/vast/home/brad/git/cl-integration-2`. `API=http://127.0.0.1:3093`,
`APP=http://localhost:5193`, `REC=/home/brad/.hermes/cl/receipts/CORPUS2-BOARD-$(date -u +%Y%m%dT%H%M%S)`.

**V-1 — THE FIRST TARGETED CHECK (proves the approach before anything is written).**
`GET` the frozen id and validate the payload, no writes:

    curl -s -o /dev/null -w '%{http_code}\n' $API/api/records/EVG-corpus2-prompt1-dmem-baseline
    # expect 404   (id free — measured 404 at compose time)
    python3 .hermes/plans/harness/corpus2-board/seed-board.py --check
    # expect exit 0 and {"validation":{"valid":true,...},"lint":{"valid":true,...}}
    #   and the driver's own line: "check: 2 events, 1 labware, 32 wells, volume.value=100"

If V-1 fails, STOP — the payload is illegal and nothing has been written.

**V-2 — seed + verify (idempotent).**

    python3 .hermes/plans/harness/corpus2-board/seed-board.py --seed --verify
    # first run : "record created: EVG-corpus2-prompt1-dmem-baseline"      (HTTP 201)
    # rerun     : "record exists (reused): EVG-corpus2-prompt1-dmem-baseline"
    # verify    : "events=2 labwares=1 volume.value=100 wells=32 labwareId=lbw-seed-plate-96-flat"
    #             "payload == fixture + {createdAt,updatedAt}: OK"

**V-3 — AC-1, cold tooltip (fresh browser process, fresh context).**

    node .hermes/plans/harness/corpus2-board/tooltip-probe.cjs \
      --url $APP/project/STU-scratch/event-graph/EVG-corpus2-prompt1-dmem-baseline \
      --wells E2,A2,D5,H5,A1 --out $REC/tooltip.json
    # expect for E2/A2/D5/H5 (identical):
    #   tipVolume == "100.0 µL"
    #   tipRows   == [{"name":"Thermo DMEM","conc":"—","vol":"100.0 µL"}]   (exactly ONE row)
    #   tipMeta   == "1 event applied"
    # expect for A1: tipVolume "0 µL", tipRows [], tipMeta null
    # one PNG per well under $REC/shots/

**V-4 — AC-2, reproducibility by delete-and-reseed.**

    python3 .hermes/plans/harness/corpus2-board/seed-board.py --digest > $REC/record-before.json
    python3 .hermes/plans/harness/corpus2-board/seed-board.py --reset      # teardown delete + reseed
    # expect: "deleted EVG-corpus2-prompt1-dmem-baseline" then "record created: ..."
    #         and "canonical digest: <sha> (before) == <sha> (after)"
    python3 .hermes/plans/harness/corpus2-board/seed-board.py --seed      # idempotence
    # expect "record exists (reused)"
    node .hermes/plans/harness/corpus2-board/tooltip-probe.cjs --url … --wells E2 --out $REC/tooltip-after-reseed.json
    # expect byte-equal tipVolume/tipRows/tipMeta to $REC/tooltip.json

**V-5 — AC-3, prompt-1 contrast on a COPY (mutating; runs after V-4).**

    python3 .hermes/plans/harness/corpus2-board/seed-board.py --contrast
    # expect "scratch copy created: EVG-corpus2-prompt1-dmem-baseline-contrast"
    node $REC/contrast/legB2.cjs     # copy of PROMPT1-REGATE legB2, URL=…-contrast, DIR=$REC/contrast
    node $REC/contrast/legC.cjs      # copy of legC, same substitutions
    # expect legB2: preview bar appeared, 32 wells selected, accept note; tooltip after accept has a
    #               "Thermo DMEM" row at 100.0 µL and NO composite row
    # expect legC: 96/96 wells resolve a fill, A2..H5 content colour, cold tooltip carries Thermo DMEM
    diff -u <receipts>/legB2.cjs $REC/contrast/legB2.cjs   # expect ONLY URL/DIR/OUT lines
    python3 .hermes/plans/harness/corpus2-board/seed-board.py --drop-contrast
    # expect "deleted EVG-corpus2-prompt1-dmem-baseline-contrast"

**V-6 — data-repo truth (the only acceptable proof of what was written).**

    git -C /home/brad/.computable-lab-lane2/worktrees/main log -1 --stat
    # expect exactly ONE new path:
    #   records/runs/RUN-2026-09-07-run-nzrs/event-graphs/EVG-corpus2-prompt1-dmem-baseline__*.yaml
    git -C /home/brad/.computable-lab-lane2/worktrees/main show --name-only --format= HEAD
    # expect: the graph YAML (+ possibly records/_index/*.jsonl). NOTHING else.
    git -C /home/brad/.computable-lab-lane2/worktrees/main log -1 --format=%H RUN-…run-nzrs
    # expect the run record NOT to appear in the seed commit's file list (back-fill is a no-op)

**V-7 — zero product code.**

    git diff --stat <lane-trunk-at-claim>...HEAD
    # expect ONLY .hermes/plans/harness/corpus2-board/{c2p1-baseline.board.yaml,seed-board.py,tooltip-probe.cjs}
    git status --porcelain app server schema config scripts records | wc -l    # expect 0

**Typecheck: NOT APPLICABLE** — zero TypeScript changed. The proof that this is honest is V-7, not a
typecheck run. Do not run the product test suite "to be safe"; it proves nothing about a fixture and
burns the fleet slot.

---

## 11. Reviewer bait — pre-empt these (R1..R17)

**R1 — `details.volume` vs `volumeUl`.** Well volume is read from `details.volume.value`
(`eventGraph.ts:503`); `volumeUl` alone renders 0 µL while still passing the schema. The live event
carries BOTH; the fixture must too. This is the single most likely way to ship a "0 µL" board that
validates.

**R2 — the fixture YAML must NOT live in `journeys/`.** `run-journeys.py:938-940` enumerates the
directory, `declared_ids` `:235-245`, and `:837` requires a complete run. A stray YAML breaks the
standing trunk gate for everyone. Put it in `harness/corpus2-board/`.

**R3 — random record id.** If the id is minted, the gate URL changes per seed and AC-2 is untestable.
The id is declared in YAML (OQ1 ruling: `EVG-corpus2-prompt1-dmem-baseline`, frozen).

**R4 — touching the run record.** The create path back-fills `run.methodEventGraphId`
(`RecordHandlers.ts:882-902`) only when absent (:891); `RUN-2026-09-07-run-nzrs` already has one
(:18). Capture the run's `contentSha` before/after and show it unchanged.

**R5 — "not a delete" drift.** Deleting `EVG-…-bda3685b`, or PUT-ing the fixture over it, would
"solve" the caveat by destroying evidence. Forbidden. Deleting the **fixture's own** record through
`teardown_journey` is a different act and is the reproducibility proof (L6) — say which one you did,
in those words, or a reviewer will conflate them.

**R6 — `ui-drive.cjs` has no hover step.** Verified: its step vocabulary runs `:296-460` with cases
`goto/set_user_id/open_ai_tab/new_thread/ensure_deck_variant_freeform/open_plate_named/click_wells/
ask/expect_visible/wait_for_body_text/click_card_first_option/assert_answered_fold_and_no_loop/
click_accept_proposal/expect_accept_note/screenshot` — no `hover`. Do not bolt one into the shared
driver; the probe is a separate script.

**R7 — fake event ids.** Do not reuse `evt-add_material-5rcrp3re` (a real id from another graph) and do
not invent 8-hex. Declared ids like `evt-add_material-baseline1` are honest and deterministic; ids also
feed `requirementOccurrenceId` (`AddMaterialSupport.ts:465`), so keep them stable across re-seeds.

**R8 — empty-vs-absent discipline.** Not TypeScript here, but the same rule: never emit
`labwareId: ""`, `wells: []`, `volume: {}`. Absent means absent. (This is the
`exactOptionalPropertyTypes` habit applied to YAML — the reviewer will look for a placeholder `""`
first, because a hand-written fixture is where it always appears.)

**R9 — the `—` in the conc column is CORRECT.** No snapshot ⇒ `concCell` `—` (`WellTooltip.tsx:108-124`).
A coder who "fixes" the probe to require a concentration is judging L2-PROMPT2-SCIENCE-CHAIN-1's leg
and will manufacture a false RED.

**R10 — receipt honesty about the data repo.** It already carries unrelated **unstaged deletions**
(observed at compose time: `D records/labware/LBW-FLAT-BOTTOM-96-WELL-PLAT-3776…`, several
`records/material/…`). So `git status` will look dirty. Do NOT report "clean tree"; report the commit's
file list (V-6).

**R11 — ontology / CURIE.** No new concept is introduced. The material is the existing local label
`Thermo DMEM` (bound as `MAT-thermo-dmem-1vq1` in the prompt-1 receipt, `report.md:93-97`), and the
fixture deliberately binds NO ref — mirroring the live event, which carries `details.material` only.
**No ontology term is required and none may be fabricated.**

**R12 — DATA-DUP / COMPOSITION-BIND coupling.** `L2-PROMPT2-DATA-DUP-RECORDS-1` removes duplicate
DMEM/DMSO records. The fixture references none, so it is independent — but if a post-seed read-back
shows a `material_ref`/`composition_snapshot` appearing, the create path changed under you: report it,
do not paper over it.

**R13 — do NOT claim the validator proves the fixture** (this corrects the predecessor draft's RED-1,
which asserted the validator would refuse a payload missing `details.volume`). Measured: it does not —
`valid: true`. The real guards are `--verify`'s field assertions (V-2) and the tooltip probe (V-3).
RED-first here means: prove `--verify` CAN fail by pointing it at the polluted id

    seed-board.py --verify --record-id EVG-cellrox-flow-cytometry-assay-kits-method-bda3685b
    # expect FAIL: events=8 (want 2), volume=302 (want 100), rows=4 (want 1)

and prove the probe CAN fail by running it against the polluted board (it reads 302.0 µL / 5 events /
4 rows — measured today, §1.2). One extra invocation each; both in the receipt.

**R14 — "it only works because the previous run's state leaked."** Two defences, both required: (a)
V-4 deletes the record and recreates it from the YAML alone, then re-asserts the tooltip; (b) the
probe runs in a fresh `chromium.launch()` + fresh context, never a reload of a warm page.

**R15 — cold ≠ warm.** The prompt-1 receipt shows the thread persists across runs (chat state in
localStorage); so does deck/tab state. Cold means a new browser process, new context, `goto` the URL.
Never assert AC-1 off a reloaded tab.

**R16 — the hover trap (measured today).** `goto` + hover times out: the Labware focus pane only
exists after clicking the plate tile. The probe MUST click `.lawn__tile-anchor .tile, .tile` and wait
for `main[aria-label="Labware focus"]` before hovering (recon driver precedent `leg2.cjs:104-107`).
A probe that "finds no wells" is this bug, not a product defect.

**R17 — never let the contrast leg run on the gate board.** legB2 accepts an event, so prompt-1's
journey appends 100 µL to A2:H5: the gate board would read 200.0 µL / 2 events and the prompt-2 gate
would be poisoned. Contrast runs on the `…-contrast` copy only (L5), and the copy is deleted after.

---

## 12. Assumptions (stated so the reviewer can attack them)

- **AS-1.** "Prompt-1's baseline" = the committed state of `evt-add_material-5rcrp3re` (100 µL Thermo
  DMEM, A2:H5, `labwareId: lbw-seed-plate-96-flat`), plus a placed 96-well plate. Proven at the state
  level by the receipt read-back and the live record; the *create mechanism* is NOT receipted (P48).
  The fixture reproduces STATE, not mechanism — that is sufficient because the gate reads state.
- **AS-2.** "1 event" means one `add_material` affecting the well; `create_container` is inert
  (P27/P28). Therefore a 2-event board reads "1 event applied" on E2.
- **AS-3.** The fixture must copy the live labware block (8×12, `maxVolume_uL: 200`,
  `definitionId: opentrons/nest_96_wellplate_200ul_flat@v1`) so the deck renders and the well ids
  address identically to the board it replaces.
- **AS-4.** The lane stack (:3093 API, :5193 app) is the target and is already up — both answered at
  compose time. No restart is needed or permitted.
- **AS-5.** `EVG-corpus2-prompt1-dmem-baseline` is free right now (404, measured). If it 200s at seed
  time with DIFFERENT bytes, the driver PUTs (re-seed) and records the pre-image digest; if it 200s
  with a board this item did not author, STOP and report (orch condition 2, §13).
- **AS-6.** The prompt-2 journey needs E2-H5 to carry exactly `100 µL Thermo DMEM` and nothing else —
  which is what one `add_material` over A2:H5 gives. Wells A2-D5 then read 100.0 µL (`Thermo DMEM —
  100.0 µL`) and E2-H5 start at 100.0 µL before the clofibrate turn.

---

## 13. Open questions for the orchestrator (3; recommendations given, not decided)

**OQ-A — May the reproducibility proof DELETE the fixture's own record (then re-seed)?**
Recommended: **yes.** It is the only proof that the board comes from the definition and not from
leftover state (§7b, R14), it uses the shipped `teardown_journey` path (`run-journeys.py:468-475`,
precedent `J1.yaml:51`), and it touches only the harness's own record whose id the fixture declares.
The binding OQ3 ruling asked for a repro-copy; the recommendation is to keep the copy for the prompt-1
contrast (L5) and ADD delete+reseed as the AC-2 proof. If the orchestrator reads "NOT a delete" as
covering every delete, fall back to copy-only and say so — but then AC-2 is weaker and should be
labelled as such.
*What I checked:* the ruling text (:136-150) says "NOT a delete, NOT a records hand-edit" in the
context of the legacy board/records; `teardown_journey` is the harness's own shipped teardown; the
delete route exists (`routes.ts:244`, handler `RecordHandlers.ts:1524`).

**OQ-B — Is the prompt-1 contrast's post-accept TOTAL asserted, or only recorded?**
Recommended: **recorded, not asserted.** On the clean board, prompt-1's accept appends a second 100 µL
DMEM event, so E2 is predicted `200.0 µL / 2 events`. Prompt-1's own criterion is about the DMEM row
being present and named (corpus :23, "100 uL DMEM"), which holds either way. Asserting 200.0 would
invent a number prompt-1's receipt never contained (its board read 300.0 because of pollution).
Assert instead: a `Thermo DMEM` row at 100.0 µL, NO composite row, 96/96 wells resolved.
*What I checked:* `PROMPT1-REGATE…/report.md:60-63` (post-accept 300.0 µL / 3 events) shows the
receipt's absolute number was pollution-derived; legB2/legC assert no volumes at all (they record
observations — grep of both drivers shows no numeric expectations).

**OQ-C — Who resets the board before the prompt-2 re-gate, given the gate itself writes into it?**
Recommended: the **re-gate's preflight** runs `seed-board.py --reset` and re-asserts V-3, recording the
pre-drive tooltip in the gate receipt. Rationale: the prompt-2 turn commits clofibrate events into
whatever board it is pointed at; a failed gate followed by a re-run would otherwise judge on a polluted
board again — the exact failure this task exists to remove. This is a re-gate-driver change and is
therefore OUT of scope here (OQ6 ruling); it is filed as a requirement for whoever writes that driver.
*What I checked:* the live board today (§1.2) demonstrates gate-run drift within 24h; the harness's
`teardown_journey` gives a one-call reset.

---

## 14. Worker contract

- Worktree: `/mnt/vast/home/brad/git/wt/L2-PROMPT2-FIXTURE-BOARD-1-lane2-l2t1310`, branched off the
  lane trunk `cl/integration-2` at the claim tip (must be ≥ 98ca125f; if the trunk has moved, re-pin
  §9 first and note the move).
- Branch: `cl/lane2-fixtureboard1-l2t1310`.
- Deliverable path pattern: `.hermes/plans/harness/corpus2-board/{c2p1-baseline.board.yaml,
  seed-board.py,tooltip-probe.cjs}`; report at
  `/home/brad/.hermes/cl/lanes/2/deliverables/L2-PROMPT2-FIXTURE-BOARD-1-report.l2t1310.md`
  (last line: `FIXTURE-BOARD DONE <full-40-sha>` or `FIXTURE-BOARD BLOCKED <reason>`).
- Exactly ONE commit on the branch, touching only `.hermes/plans/harness/corpus2-board/**`.
- The report MUST paste: V-1 output; the seed note (created vs reused) and the POST status; the
  `--verify` diff line (`payload == fixture + {createdAt,updatedAt}`); both canonical digests (V-4);
  the full tooltip JSON for E2/A2/A1 (V-3); the contrast receipt paths + the `diff -u` proving only
  URL/DIR/OUT changed (V-5); `git log -1 --stat` + `show --name-only` of the data repo (V-6);
  `git diff --stat` proving zero product code (V-7); and BOTH negative runs (R13).
- At claim: re-read every §9 row. Any line that moved is corrected in the spec commit, not silently
  followed.
- If the create path rejects a payload the schema accepted, or the stored record differs from the
  fixture beyond `{createdAt,updatedAt}`, **STOP and report it as a BLOCKER with the raw HTTP body** —
  do not fix product code under this item (orch condition 5).

---

## 15. Binding rulings carried forward (from l2t0150 §12-RULINGS — restated, not re-opened)

1. OQ1 = frozen literal id `EVG-corpus2-prompt1-dmem-baseline`, gate URL
   `http://localhost:5193/project/STU-scratch/event-graph/EVG-corpus2-prompt1-dmem-baseline`.
2. OQ2 = declare `links {studyId: STU-scratch, runId: RUN-2026-09-07-run-nzrs}` (inert: the run already
   carries `methodEventGraphId`, `RecordHandlers.ts:891`).
3. OQ3 = reproducibility via a second seed + canonical-dump compare; both dumps + digests in the
   receipt (this spec adds delete+reseed as the primary proof — OQ-A).
4. OQ4 = `provenance {actor: fixture-harness, method: seed}`, **no timestamp**. Copying
   `ai-agent/compiler` is FORBIDDEN (it would assert the AI wrote a hand-seeded board).
5. OQ5 = `status: inbox`, mirroring the state being reproduced.
6. OQ6 = do NOT wire the prompt-2 re-gate driver here.
7. Orch condition 1 = the polluted live board STAYS untouched (this item ADDS a board).
8. Orch condition 2 = frozen-id collision: 200 with different bytes ⇒ PUT + pre-image digest; 200 with
   an unknown author's board ⇒ STOP.
9. Orch condition 3 = the AC-1 tooltip string is asserted EXACTLY, including the `—` placeholder.
10. Orch condition 5 = zero product code; a product defect found while seeding is a BLOCKER report.

---

## 16. Fixture payload (the DATA this spec asks the coder to write)

Values are copies of values read in the live record (§4), except the declared event ids, the placement
id, the `name` suffix, `provenance`, and `links`/`status` (rulings above). No biological value invented.

```yaml
# Corpus2 prompt-1 baseline board — the ONLY state prompt 2 may be judged on.
# Seeded through the shipped L2-TRUNK-JOURNEYS path (run-journeys.py seed_journey, seed.record
# branch). Harness-owned TEST DATA. Not a delete, not a records hand-edit.
board:
  recordId: EVG-corpus2-prompt1-dmem-baseline
  gate_url: http://localhost:5193/project/STU-scratch/event-graph/EVG-corpus2-prompt1-dmem-baseline
  expect:                       # what --verify asserts (the AC-1 numbers, as data)
    events: 2
    labwares: 1
    e2: {volume_uL: 100, material: "Thermo DMEM", rows: 1, events: 1}
seed:
  record:
    recordId: EVG-corpus2-prompt1-dmem-baseline
    schemaId: https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml
    payload:
      id: EVG-corpus2-prompt1-dmem-baseline
      recordId: EVG-corpus2-prompt1-dmem-baseline
      kind: event-graph
      name: "Corpus2 prompt-1 baseline (100 uL Thermo DMEM, A2:H5) — TEST DATA"
      status: inbox
      links: { studyId: STU-scratch, runId: RUN-2026-09-07-run-nzrs }
      events:
        - eventId: evt-create_container-baseline1
          event_type: create_container
          verb: create_container
          vocabPackId: general
          details: { slot: target, labwareType: 96-well-plate }
          provenance: { actor: fixture-harness, method: seed }
        - eventId: evt-add_material-baseline1
          event_type: add_material
          verb: add_material
          vocabPackId: general
          details:
            material: Thermo DMEM
            volumeUl: 100
            volume: { value: 100, unit: uL }
            labwareId: lbw-seed-plate-96-flat
            wells: [A2,A3,A4,A5,B2,B3,B4,B5,C2,C3,C4,C5,D2,D3,D4,D5,
                    E2,E3,E4,E5,F2,F3,F4,F5,G2,G3,G4,G5,H2,H3,H4,H5]
          labwareId: lbw-seed-plate-96-flat
          provenance: { actor: fixture-harness, method: seed }
      labwares:
        - labwareId: lbw-seed-plate-96-flat
          labwareType: plate_96
          name: plate1
          addressing:
            type: grid
            rows: 8
            columns: 12
            rowLabels: [A,B,C,D,E,F,G,H]
            columnLabels: ['1','2','3','4','5','6','7','8','9','10','11','12']
          geometry: { maxVolume_uL: 200, minVolume_uL: 1, wellShape: round }
          layoutFamily: sbs_plate
          wellPitch_mm: 9
          orientationPolicy: rotatable
          definitionId: opentrons/nest_96_wellplate_200ul_flat@v1
          definitionSource: registry
          renderProfile: plate
          linearAxis: x
          sourceRecordId: lbw-seed-plate-96-flat
      editorLayout:
        surface: event-editor/v1
        placements:
          - placementId: pl-corpus2-baseline-1
            labwareId: lbw-seed-plate-96-flat
            location: { kind: lawn, xMm: 16, yMm: 16 }
            orientation: landscape
      methodContext:
        runId: RUN-2026-09-07-run-nzrs
        vocabId: liquid-handling/v1
        platform: manual
        deckVariant: default
        locked: false
        plannedRunRef:
          { kind: record, id: PLR-plan-cellrox-flow-cytometry-assay-kits-34e5af82,
            type: planned-run, label: "Plan: CellROX® Flow Cytometry Assay Kits" }
        protocolRef:
          { kind: record, id: PRT-g5zy9e, type: protocol,
            label: "CellROX® Flow Cytometry Assay Kits" }
teardown: { delete_record: EVG-corpus2-prompt1-dmem-baseline }
```

Shape note for the coder: `board:` and `seed:` are siblings; `seed_journey` consumes
`journey["seed"]`, so `seed-board.py` passes `yaml.safe_load(f)` straight in (it already has `seed`),
and `teardown_journey` consumes `journey["teardown"]`. That keeps the file liftable into a journey
later with zero translation.

END-OF-SPEC-DRAFT

DRAFT-END 4ee0d469abe03f109f75a19ae0af9d38
