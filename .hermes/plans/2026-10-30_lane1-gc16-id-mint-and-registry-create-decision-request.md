# GC-16 fix-cycle decision request — knowledge id mint + registry Create wording (lane 1)

ASKED BY: lane-1 orchestrator tick 2026-10-30 ~02:30. ANSWER PATH (write ruling here, dated
section): `.hermes/plans/2026-10-30_lane1-gc16-id-mint-and-registry-create-decision.md`
TIME-BOX: fix coder launches when slot+stagger free; if no ruling by its launch gate +15 min it
proceeds on the orch default recorded below (PROVISIONAL, ratifiable).

## Context (verified first-hand by the orch, corroborated by adversarial cycle 1)

Adversarial cycle 1 verdict: fix, 9 defects (report
~/.hermes/cl/reviews/GC16-adv-l1t0105--l1t0105w-021008.md). Defects 1-6, 8-9 are within the
approved spec's intent and boundary; the fix run is being dispatched. Two defects are a
CONTRACT question, not an implementation question:

### Q1 — How does a knowledge record get its `id` on create, given the hard boundary?

Facts (orch first-hand):
- `schema/knowledge/{assertion,claim,evidence}.schema.yaml` declare `id: type string` with NO
  `pattern` (only prose "e.g., ASN-0001"). `required: [kind, id, scope]` (assertion),
  `[kind, id, statement, subject, predicate, object]` (claim), `[kind, id, sources]` (evidence).
- Sibling knowledge schemas DO declare patterns: ACQP (^ACQP-...), ENG, CR, DM, MECH. The
  spine studies schemas declare patterns too (registry OQ-3 door parses
  `properties.id.pattern` — RecordRegistryPage.tsx:68-76).
- The registry's OQ-3 door therefore REFUSES knowledge creates ("No id pattern declared"),
  which is honest. RecordCreatePanel currently mints ids from a client `ID_PREFIXES` table —
  the repo's OWN comment (RecordRegistryPage.tsx:70) names that table the anti-pattern /
  CLAUDE.md "The Hard Boundary". Adversarial defect 4 charges exactly this.
- Server does NOT mint ids for generic record create (only a special protocol/document path,
  RecordHandlers.ts:394). A server-side mint would be a server change = outside GC-16's
  approved boundary ("NO server edits, NO schema/lint edits").

Options:
- **D-A (orch default, smallest):** knowledge id is left to the AUTHOR — the create form
  renders the schema-declared `id` field (it already exists in the projection), pre-seeded with
  a schema-honest placeholder hint from the schema's OWN description/example ONLY if derivable
  from served data, never a client kind→prefix table; submission without an id is refused by
  the server's required-check (schema speaks, client does not). `ID_PREFIXES` loses its NEW
  knowledge entries (defect 4); the spine table stays as documented fallback (defect 5 fix:
  registry-first, literal fallback, test pinned to fallback-on-failure).
- **D-B (scope amendment):** add `pattern: ^ASN-...` / `^CLM-` / `^EVD-` to the three knowledge
  schemas → registry door + Panel both derive via the existing OQ-3 parse. Cleanest long-term,
  but touches schema YAML = OUTSIDE the approved GC-16 file boundary; needs Brad's scope nod.
- **D-C (scope amendment):** server-side id mint for kinds with no declared pattern. Server
  change, larger.

### Q2 — Acceptance bullet 2 "Create → assertion renders a schema-backed form" vs the
registry door's refusal (defect 7)

As landed, /registry Create refuses knowledge kinds loudly (no id pattern — correct under
OQ-3), and the lane's NEW tests PIN that refusal. Two readings:
- **R-1 (orch default):** the bullet is satisfied through `/record/new/<kind>` (RecordCreatePanel,
  registry-resolved schemaId — no SCHEMA_NOT_FOUND, no "Create undefined"); the registry door's
  refusal becomes a named refusal that POINTS to the working door (one line, within
  RecordRegistryPage.tsx boundary), and the end-to-end mint leg runs through /record/new.
  Acceptance wording amended to record this split. The pinned refusal test updates to pin the
  pointed refusal.
- **R-2:** make the registry door actually create knowledge records — only possible via D-B/D-C.

If Q1 = D-A, R-1 is the only in-boundary composition; the orch will dispatch on that pair as
PROVISIONAL absent a ruling.

— lane-1 orchestrator
