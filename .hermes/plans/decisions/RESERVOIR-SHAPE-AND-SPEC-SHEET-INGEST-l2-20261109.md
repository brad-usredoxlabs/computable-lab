# Reservoir shape, and where spec-sheet ingest belongs — lane 2, 2026-11-09

Status: **DECIDED by the architect on Brad's correction.** Binding for lane 2. Do not re-litigate in code.

Brad, verbatim (2026-11-09): *"when i said 8-channel resevoir, what i really meant was
'a single channel reservoir wide enough to fit an 8-channel pipette.' Furthermore, both labwares and
materials should have an ingest behavior that uses the exa search (or whatever web search) to pull in
the spec sheets and fill in the details based on the spec sheet. Im not sure of this should belong in
/ingestion or /lab"*

---

## D1 — the journey's reservoir is ONE trough, not eight wells

**The error is the architect's, not the coder's.** The corpus text for prompt 3 (`test-prompts/
AI-Chat-Corpus2.md:35,46`) never mentions a reservoir at all. The only reservoir in the corpus is in
prompt 5, line 73: *"Add the 10mls of solution to a single channel 25ml reservoir, Use the
8-channel pipette to transfer 100ul of the pre-mixed stain to each well"*. The "8-well reservoir"
entered lane 2 through recon link 5 (`handoffs/2026-11-09T1920Z-L2-PROMPT3-RECON-1.md:35,38,81,93`),
which the architect wrote, and the seed unit then built it faithfully. Brad's correction lands on the
brief, so nothing the coder did was wrong.

**The schema already declares the concept**, so this is pure data — no code change:

- `schema/workflow/labware-definition.schema.yaml:183-195` — `aspiration_hints.
  single_well_multichannel_source`: *"If true, multichannel aspiration can intentionally use one
  source well/trough."* (Plus `per_channel_source_expected` and `notes`.)
- `schema/workflow/labware-definition.schema.yaml:130-181` — `physical_geometry` with
  `well_length_mm`, `well_width_mm`, `well_depth_mm`, `overall_dimensions_mm`, `well_shape`; its own
  description says *"Omit unknown values rather than inventing them."*
- `capacity.max_well_volume_uL` / `min_working_volume_uL` (line 100) — a trough has dead volume and
  a minimum depth for 8 tips to reach.

**What the object must declare** (a 25 mL single-trough reagent reservoir, the class Brad named):

- `topology.addressing: single` — one well, no grid (same shape as `flask_t25.yaml`).
- `aspiration_hints.single_well_multichannel_source: true`.
- `physical_geometry.well_length_mm` / `well_width_mm` / `well_depth_mm` — **from a real spec sheet,
  never invented**; absent until the sheet supplies them.
- `capacity.max_well_volume_uL` ≈ 25000 (from Brad's "25ml reservoir" wording) and a
  `min_working_volume_uL` from the sheet.

**The fit is computable, so it must be computed, not asserted:** 8 tips at the standard 9 mm pitch
span **7 gaps × 9 mm = 63 mm** centre-to-centre, first tip to last. The trough's usable inner length
must exceed that plus tip-outer-diameter clearance. That is a derived check
(`well_length_mm ≥ (tip_count − 1) × pitch + clearance`) against declared values — never a prose
claim that the reservoir "is wide enough". Tip outer diameter is a property of the tip, not the
reservoir, so the clearance term cannot be hardcoded.

**The merged `8-well-reservoir.yaml` stays as valid data** — a *divided* 8-well reservoir (1×8 grid,
9 mm pitch) is a real product and other journeys can use it. It is **not** this journey's source
vessel. The seed instance `records/seed/labware/lbw-seed-reservoir-8-well.yaml`
(`labwareType: reservoir`, format 1×8) must not be used as prompt 3's source location; the journey
needs a single-trough 25 mL instance.

## D2 — instance → definition linkage (answers the l2t1315 question)

`LabwareDefinitionRegistry` resolves by `platform_aliases` and `legacy_labware_types`
(`server/src/registry/LabwareDefinitionRegistry.ts:34,58`). An instance whose `labwareType` is the
coarse family word `reservoir` is **ambiguous by construction**: several definitions can claim it, and
the 8-well definition claims `reservoir_8` / `generic/reservoir_8@v1`, not `reservoir`.

Decision: resolution is **exact-match on a declared alias**, and when more than one definition claims
the same key the resolver **refuses and reports the ambiguity** — it never picks one. A seed instance
created for a journey names a definition-specific alias (e.g. `reservoir_25ml_single`), not the family
word. This keeps "we have a thing" and "we know exactly what thing" separable, which is the whole
point of the definition layer.

## D3 — spec-sheet ingest: one engine, two doors (the /ingestion vs /lab question)

**Neither page owns it.** The capability is server-side and shared; `/lab` is where a scientist
starts when creating one thing now, and `/ingestion` keeps its document-first / bulk role. Building a
second extractor for the create form is the failure mode to avoid.

**Already built — reuse, do not rebuild:**

| What | Where |
|---|---|
| Exa search across materials / labware / equipment, one endpoint pair, mint-on-select | `server/src/api/handlers/VendorExaHandlers.ts:1-40`; routes `POST /vendor/exa/search`, `POST /vendor/exa/from` (`routes.ts:540-541`) |
| Page text + PDF fetch, with Exa as the fallback when a vendor CDN blocks the download (403 at TLS fingerprint) | `server/src/integrations/exa.ts:204` (`exaGetContents`); already used this way at `VendorSearchHandlers.ts:1079` |
| URL accepted as an ingestion artifact | `IngestionHandlers.ts:128-133` — `sourceUrl or fileName is required` |
| Document → extraction driven by a **declared** spec (match, sourceAnalysis, targets, tableExtraction) | `POST /ingestion/jobs/:id/extraction-spec` (`routes.ts:662`); `schema/ingestion/extraction-spec.schema.yaml` |

**Missing, and this is what the new task builds:**

1. A **spec-sheet extraction spec per record type** (material, labware) — which record field comes
   from which part of the sheet, with units and required-ness. YAML, not TypeScript.
2. An endpoint that, given a hit URL and a record type, returns **proposed values with citations**
   (the URL plus the passage or table cell each value came from), leaving unknown fields absent.
3. The create form showing proposals field by field with their citation, accepted individually.

**Rules that follow from the project's own principles:**

- Every ingested value carries provenance (URL + quote). A value with no citation is typed, and says
  so; it is never presented as if it were read off the sheet.
- Unknown stays unknown. `physical_geometry`'s own description already forbids inventing dimensions;
  a sheet that does not state the trough length leaves `well_length_mm` unset and the form asks.
- The mapping is data, so a new record type gets spec-sheet ingest with a new YAML spec, no code.
- Never overwrite a value the user typed; a conflict is shown, not resolved silently.

**Where the user lands:** `/lab/materials` and `/lab/labware` → `+ New` → *find the spec sheet*
(Exa search → pick the product → proposals appear on the form). `/ingestion` stays the door for a
document you already have, or many at once, and reads the **same** spec-sheet specs.
