# SPEC (PROMOTED) — L2-UI-SURFACE-MANIFEST-1, Phase 1
## Declarative surface manifest: page composition + mount context as data

Status: PROMOTED 2026-11-05 by lane-2 orchestrator (l2t0235) at claim, per task-list instruction.
Anchors re-measured first-hand at promotion against trunk be22ba18+ (measured numbers corrected
below). Architect draft: lanes/2/drafts/L2-UI-SURFACE-MANIFEST-1-architect-spec-l2tA.md.

---

|---|---|
17|| L2-CLARIFY-TARGET-1 D2 | the well-selection affordance + its tests | the product never mounts `WellSelectionProvider`; the test wrapped one |
18|| L2-THREADSCOPE-FLIP-1 | `threadTabIds` mint-once, `AiThreadStore` key, `threadHeaders` | nothing declared WHEN the scope is settled, so mount timing decided the key |
19|| CHATHOST-CONSOLIDATE-1 D1 | `SurfaceChatRegistrar` | nothing declared that `deck` slice publication precedes the registrar's render |
20|| L2-CONFIRM-CARD-1 D5 / MANIFEST | the vocabulary YAML | the hash pin that blesses it had no declared owner to re-bless |
21|
22|Each was found by a cold browser gate at 1 item/3-5h cost. Each would have been a **lint failure** if the
23|surface had been declared as data.
24|
25|Measured inventory (2026-11-04, first-hand):
26|- `schema/**/*.ui.yaml` = **64** specs, all shaped `display: / form: / list: / editor:` — declarative rendering
27|  exists ONE level down (record forms and lists) and is healthy.
28|- `app/src/App.tsx` = **41** `<Route ` declarations (the draft's 42 counted the `<Routes>` wrapper; re-measured 2026-11-05 via `grep -c '<Route '` on trunk) — page composition is 100% hand-written, undeclared.
29|- `app/src` = **441** capitalised `.tsx` component files, of which **36** are never imported or rendered
30|  anywhere by a literal `import`/`<Component` match (heuristic; route-string lazy loads are possible false
31|  positives — the checker in §4.1 must resolve those properly).
32|
33|## 2. What this item is NOT
34|
35|- NOT a page renderer. No component is made declarative; how the deck draws, how the plate drags, how TipTap
36|  edits — all stay code. **Context is data; interaction is code.**
37|- NOT a rewrite of `App.tsx`, and NOT a behaviour change in Phase 1. Nav, routing and mounting stay exactly as
38|  they are; the shell reads the manifest in Phase 2 (a separate item, filed only if Phase 1 lands).
39|- NOT a second vocabulary. Surface ids MUST be the ids already used by `config/chat/chat-hosts.yaml`
40|  (`surface:` values) and by the slice/store layer. New ids require the same CURIE-style local-term treatment
41|  (`cf:surface-…`) and a shrink-guard-equivalent pin, not an ad-hoc string.
42|
43|## 3. Deliverable
44|
45|### 3.1 The manifest instance — `config/ui/surfaces.yaml`
46|
47|Config-resident, mirroring the `config/chat/chat-hosts.yaml` precedent (data at `config/`, schema+lints in
48|`schema/`). One entry per routed surface:
49|
50|```yaml
51|- id: event-editor                 # SAME id as chat-hosts.yaml surface / slice id
52|  route: /event-editor/:runId
53|  panes: [deck, chat]
54|  requires:
55|    providers: [selection, well-selection, surface-slices]
56|    records: [event-graph:*]        # declared record dependencies (type:selector)
57|    endpoints: [/api/ai/assist/stream]
58|  context:
59|    scope_source: loaded-record-id  # enum: loaded-record-id | route-param | none
60|    settles_within_ms: 1500         # the bounded re-check deadline this surface may rely on
61|  gate:
62|    leg: event-editor/deck-clarify  # browser-gate journey leg id, or null with a declared reason
63|```
64|
65|Field discipline, non-negotiable:
66|- `context.scope_source` is an **enum**, never prose. Prose goes in a `description` field that no rule reads.
67|- `panes` reference component names; existence is checked mechanically (§4.2).
68|- `gate.leg` references a real journey leg id in the harness; `null` must carry `gate.reason`.
69|
70|### 3.2 The schema triplet
71|
72|`schema/ui/surface-manifest.schema.yaml` (structure, Ajv-validated), `schema/ui/surface-manifest.lint.yaml`
73|(policy, DSL predicates only), `schema/ui/surface-manifest.ui.yaml` (list/form hints for any future admin
74|editor). Follows the repo's three-file convention exactly; `ui-v1.schema.yaml` stays untouched (it describes
75|`*.ui.yaml`, a different artifact).
76|
77|### 3.3 Lint rules (declarative, in the lint YAML — never in TS)
78|
79|- **L-SM-1 undeclared route**: every route in `app/src/App.tsx` has a manifest entry. (Source list is
80|  extracted by the checker, not hand-maintained.)
81|- **L-SM-2 phantom pane**: every `panes[]` name resolves to a file in `app/src`.
82|- **L-SM-3 duplicate/missing id**: ids unique, and every `config/chat/chat-hosts.yaml` surface appears here.
83|- **L-SM-4 gate gap**: every surface whose panes include a chat pane MUST name a `gate.leg`.
84|- **L-SM-5 context declared**: `context.scope_source` present and within the enum for every surface that
85|  declares the `surface-slices` provider.
86|- **L-SM-6 orphan component**: a capitalised component under `app/src` reachable from no declared surface and
87|  no declared route — warning, with a generated artifact (not a task-list prose list).
88|
89|## 4. Verification (the acceptance criteria — externally observable)
90|
91|1. **Route parity is mechanical**: `scripts/check-ui-surfaces.py` (new, read-only) extracts the routes from
92|   `App.tsx` and the manifest ids, and prints `ROUTES=41 DECLARED=<n> MISSING=0 PHANTOM=0 (41 = the measured `<Route ` count incl. the catch-all `*` route at App.tsx:228; the checker must count mechanically, not hardcode)`. It must resolve
93|   lazy `import()` route strings, so the orphan count is a measurement, not a heuristic (the 36 figure above is
94|   the pre-check answer and may legitimately move DOWN once lazy loads are resolved — report the true number).
95|2. **Ajv is the validation authority**: the manifest validates through the existing schema-registry/validation
96|   path (the `/api/…` validation surface), not a bespoke validator; a deliberately malformed manifest in `/tmp`
97|   is rejected by the REAL server path with the schema's error text.
98|3. **Lint fires, non-vacuously**: in a `/tmp` copy, (a) delete a route entry → L-SM-1 FAILS naming that route;
99|   (b) rename a pane → L-SM-2 FAILS naming it; (c) delete a `gate.leg` from a chat surface → L-SM-4 FAILS.
100|   Both directions pasted raw in the report. A rule that cannot be made to fail is a decorative rule.
101|4. **Zero behaviour change**: `pnpm typecheck` at the same baseline; app and server test suites at the same
102|   counts; `git diff --stat` confined to `schema/ui/`, `config/ui/`, the new script, and `deliverables/` —
103|   **zero** files under `app/src/**` or `server/src/**` modified. Lane stack `/` and `/api/health` 200 after.
104|5. **The orphan artifact**: a committed `deliverables/ui-surface-manifest-1/orphans.txt` listing every
105|   unreachable component with the checker's reasoning per entry.
106|
107|## 5. Boundaries
108|
109|- Owned files: `schema/ui/surface-manifest.*.yaml`, `config/ui/surfaces.yaml`, `scripts/check-ui-surfaces.py`,
110|  `deliverables/`. Nothing else.
111|- Touch none of: `app/src/agent/**`, `app/src/shared/hooks/useAiChat.ts`, `app/src/shared/shell/**`,
112|  `app/src/graph/lib/eventGraph.ts`, `app/src/App.tsx` (Phase 2 owns that), `server/src/lint/**` internals,
113|  `config/chat/chat-hosts.yaml` (read-only input).
114|- No dev-server start/stop, no browser gate (there is no user-visible change to gate), no merge/push/rebase.
115|- Phase 2 (shell reads the manifest) and Phase 3 (declarative pane layout for CRUD pages only) are NOT this
116|  item and must not be smuggled in.
117|
118|## 6. Why this is worth the slot (the standing-question answers)
119|
120|**Is it the computable-lab way?** Yes: policy in `schema/`, instances in `config/`, interpretation in code.
121|Every rule above is a DSL predicate, not a TypeScript branch. The manifest is exactly the kind of thing the
122|project says must be data.
123|
124|**What already exists that this reuses?** (a) `config/chat/chat-hosts.yaml` — a working 6-entry surface
125|inventory that made the 6-host sweep possible; this generalises that pattern rather than inventing one.
126|(b) The 64-spec `*.ui.yaml` triplet convention and `SchemaLoader`/`SchemaRegistry` `$ref` resolution.
127|(c) `LintEngine`/`LintSpecLoader` — the DSL executor; no new engine. (d) `check-gate.py chat_host_axis()` and
128|`run-journeys.py --chat-hosts` — the gate-leg ids this manifest references already exist. (e) `UiSpecLoader`
129|on the server for spec loading conventions.
130|
## 7. Promotion-time anchors (orchestrator-measured, trunk l2t0235)

- `app/src/App.tsx:148` — `<Route path="/" element={<DeferredRoute><HomeRedirect /></DeferredRoute>} />` (route count: 41 `<Route ` incl. `*` at :228)
- `app/src/App.tsx:39` — `const EventEditorPage = lazy(async () => import('./event-editor/EventEditorPage').then((m) => ({ default: m.EventEditorPage })))` (~27 lazy decls at :39-75 — checker must resolve these)
- `config/chat/chat-hosts.yaml:77` `hosts:` — 6 entries; `surface:` values: run-workspace (:79), event-editor (:107), analysis x4 (:156,:178,:230,:244); `slices:` at :276 (3 entries)
- PRECEDENT CORRECTION (measured by scout, verified): chat-hosts.yaml has NO schema/lint triplet — it is guarded by sha manifest + python shrink-guard. The lint-DSL precedent for a non-record config doc is `schema/registry/provenance-ladder/rung-vocabulary.lint.yaml`: binds via `schemaId:` == the doc's `doc_id:` (rung-vocabulary.yaml:29); LintEngine filters rules by schemaId (LintEngine.ts:119). So surfaces.yaml must declare a doc_id and the lint binds by that URI. The spec's §3.3 rules that cannot be expressed as payload predicates (L-SM-1 route extraction from App.tsx, L-SM-2 file resolution, L-SM-6 orphans) live in the python checker (§4.1) — the DSL covers within-manifest rules (id uniqueness via everyItem/exists, enum membership, gate.leg presence when panes contains chat).
- Validation path: `server/src/api/routes.ts:318` — `fastify.post('/validate', validationHandlers.validate.bind(validationHandlers));` (:321 /lint, :324 /validate-full) — server boot loads schema dir 'schema' recursively (server.ts:205, :420 loadAllLintSpecs recursive:true).

## 8. Unit split (orchestrator, per granularity rule — >3 files, 2 seams)

- UNIT 1 of 2: the data + schema + lint triplet — `config/ui/surfaces.yaml`, `schema/ui/surface-manifest.schema.yaml`, `schema/ui/surface-manifest.lint.yaml`, `schema/ui/surface-manifest.ui.yaml` (+ lint fires non-vacuously via /tmp copies through the REAL server path for malformed-rejection proof at unit 2? NO — Ajv rejection proof via POST /validate-full is unit 1's proof; lint non-vacuity proof is unit 2 with the checker present). Unit 1 proof: manifest validates through /validate-full; a malformed /tmp copy rejected with schema error text; targeted vitest boot test shows the new lint spec loads (Duplicate-rule-id guard).
- UNIT 2 of 2: `scripts/check-ui-surfaces.py` + `deliverables/ui-surface-manifest-1/orphans.txt` + the non-vacuous lint-firing proofs (L-SM-1/2/4 fire in /tmp copies; paste both directions).
Acceptance stays ITEM-level: advc judges the accumulated branch.
