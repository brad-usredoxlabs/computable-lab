# Architecture of Record — How the Pieces Fit Together

**Status:** Reference document for the Hermes profiles (architect, orchestrator, cl-coder, cl-reviewer, cl-browser-reviewer).
**Last Updated:** 2026-10-06
**Authority:** Subordinate to [Foundational Principles](computable-lab-principles.md) and [AI drafting / UI projection contract](ai-drafting-and-ui-projection.md). Where this document and a spec disagree, the spec wins; where a spec and shipped code disagree, the code wins and the spec is a defect (Brad's rule: docs follow the shipped code — label the divergence).

This is the single recent architectural summary the pipeline was missing. It states what is implemented today, what is specified-but-unimplemented, and which earlier ideas are dead — so no profile re-litigates superseded decisions or re-reads 90 .hermes/plans files to reconstruct them.

---

## 0. The one-sentence shape

computable-lab is a **schema-driven ledger of what happened in the lab**, where all domain truth lives in YAML triplets (schema/lint/ui), every AI action is a **declarative intent compiled deterministically before it can touch the screen**, terms resolve through **one six-tier spine**, the working session is **server-persisted (tmux-style) so any device picks up the same tabs**, quality governance is a **declarative lifecycle layer that stays out of the way**, and analysis is a **record chain (method → run → artifact → view-spec) rendered only through shipped, validated renderers**.

---

## 1. First principles (unchanged — the anchor)

Everything below must be re-derivable from `specifications/computable-lab-principles.md`:

1. Context is everything; context creates materials.
2. Knowledge layer captures WHY, not WHERE (reason over context graphs, never well positions).
3. Materials are a provenance hierarchy: concept ≠ formulation ≠ instance ≠ aliquot ≠ composition.
4. Controlled vocabularies over free text; CURIE-style local terms (`cf:ROS`).
5. Declarative rules, imperative drools — business logic lives in lint YAML.
6. YAML is king; data files over binary configs.
7. The hard boundary: never hardcode; stop and ask rather than fabricate.
8. Ajv is the single validation authority; code creates records, records are linted.
9. **Principle 12** — AI proposes declarative page/workflow intent; the deterministic compiler projects it; the scientist accepts/rejects/revises. (Implementation contract: `ai-drafting-and-ui-projection.md`.)

Brad's operating overlays (friction-first for biologists — snappy+acceptable beats correct-but-slow; loosen ontology enforcement UP-FRONT and confirm terms in the review dialogue, never a blocking pre-draft card; hard line that stays: never two local terms for one entity; AI belongs in the AI panel, never in deterministic surfaces; dead chrome is a defect).

---

## 2. Pillar A — The resolver spine (supersedes intent-as-ontology-mapping)

**What was abandoned.** Earlier designs captured the scientist's *user intent* by mapping free prose directly onto ontology terms at intake — a blocking pre-draft ontology-mapping step. That idea is retired. Terms are no longer gates on intent; they are *outcomes* of resolution, confirmed later in review (Brad's AI-loop ruling, 2026-10).

**What replaced it: one spine, six tiers.** `server/src/resolve/ResolveSpine.ts` — a single implementation of *term → ranked CURIE candidates* used by EVERY consumer: the compiler's `NounPhraseResolver`, the UI slash menu/copilot, and the agent's resolve tool. Tiers, ranked by tier-first then match quality (tier gap 0.2 > match bonus 0.15, so a canonical alias hit always beats a local substring hit):

```
0 canonical term nodes (alias-first; lab spelling variants are authoritative — the F-praus fix)
1 local records (incl. previously minted local terms)
2 local OAK index
3 remote OLS4
4 vendor (Exa)
5 mint-local  (affordance, not a truth claim)
```

Local tiers resolve synchronously; remote tiers are best-effort under short timeouts and simply drop out offline. Providers in `server/src/resolve/providers/` (terms, records, oak, ols4, vendorExa); conformance harness in `server/src/resolve/conformance/` (24 fixtures). Config: the `ontology:` block in the root `config.yaml` (validated by `server/src/config/loader.ts`); search is served at `GET /api/ontology/search`.

**Why it matters to coders:** any new surface that resolves a term MUST call the spine. A second resolver is a hard defect — every consumer must agree on what a term resolves to. The spine sits on top of the **canonical term spine** (`docs/canonical-term-spine.md`, implemented phases 1–6): every named thing (materials, vendor products, labware, instruments, verbs, kits, organisms, conditions) is ONE `term` record, and ontology CURIEs are *provenance/linkouts on term records*, not the canonical id itself. The AI authoring path (`server/src/ai/materialIdentity.ts`, `MaterialResolution.ts`, `resolveMentions.ts`) feeds resolution output into drafts; small models emit **symbolic noun phrases only — never CURIEs, record IDs, or deck slots** (`server/src/compiler/scientistIntent/compileScientistIntent.ts`); unknown → Gap/unresolved. Unresolved terms are *preserved* in `unresolvedRefs`/`clarificationRequests` and resolved in the review dialogue, not blocked pre-draft. Term review surface (shipped): `PreviewActionBar.tsx` holds `termDecisions` and hard-blocks Accept on pending ontology decisions; `acceptedOntologyBindings.ts` is decision-aware on materialize.

---

## 3. Pillar B — Declarative invocation, the surface registry, and the tmux-style session

This is the "AI can redraw the screen around the request" pillar, and it is three cooperating parts. Be precise about what exists: the *universal* cross-page page-composition runtime is **specified, not fully shipped** — do not describe it as implemented.

### 3a. The compiler contract (Principle 12 — the law)

`specifications/ai-drafting-and-ui-projection.md`: model proposes declarative intent → `POST /api/drafts/compile` (compile WITHOUT canonical writes; returns CompilationResult + draft id/revision/review hash + field projection + pipeline trace) → ghosted onto **native** controls (proposed fields get borders/labels, never low-opacity text) → Accept (server rechecks actor/source versions/policy; prevalidates the whole write set; no second AI call) / Reject (restores the exact unsaved baseline) / Revise (direct edits recompile deterministically; AI revisions receive prior proposal + diagnostics and recompile). The AI can *claim* navigation but never *perform* it or claim an unregistered capability — that produces compiler diagnostics.

Adoption status (per the contract's own inventory, grounded in code):
- Sequence/oligo authoring — first native form adapter: `server/src/drafts/adapters.ts` (`sequence-authoring` — "registration attaches mechanics to YAML contracts, without schema-name dispatch"), served by `POST /api/drafts/compile` + `POST /api/drafts/accept` (`server/src/drafts/draftRoutes.ts`, `FormDraftService.ts`, `StagingStore.ts`).
- Event graph drafting — reference pattern (`server/src/ai/ToolBridge.ts:250` intercepts `compile_event_graph_draft`; ghost preview + Accept/Discard live in `app/src/event-editor/deck/` — `PreviewActionBar.tsx` + `lib/previewProjection.ts`, projected badges in `app/src/graph/labware/PreviewEventBadges.tsx`).
- Protocol edits (lane 2) — ChangesPanel is the review surface (PROTO-AI-9, `7a3202e9`).
- Cross-page invocation/composition — universal contract specified; **runtime adoption tracked per surface, not yet supplied**.
- Generic `AiDraftBar` — legacy, migrate later.
- QMS acceptance is DISTINCT from draft acceptance: accepting an AI proposal never confers a regulated signature or lifecycle transition.

The AI's tool surface today: `agent_intent` (`server/src/ai/submitSuggestionTool.ts:424`) with discriminators `event_graph | deck_layout | create_record` (+ `sequence_action` in the coercion map); `submit_suggestion` for event patches; `compile_event_graph_draft` for graph drafts. All intent args are coerced deterministically (`coerceAgentIntent.ts`) — a malformed envelope is inferred from the keys present, never guessed across two intents.

### 3b. The deterministic page-builder = surface registry + schema-driven renderers

"Page building" is NOT a new imperative builder; it is the declarative machinery Principle 12 compiles against:
- **Work-surface registry** — `schema/registry/surfaces/surfaces.yaml` served at `GET /api/surfaces`: every navigable surface is DECLARED (path pattern, scoped objectTypes, selectableKinds, aiRole). Registry is data, never a TS literal union. plan/design/execute/results are MODES of ONE run surface (one tab per run). Deep-linkable iff it declares `params`.
- **Route → surface resolution** — `app/src/shared/surfaces/resolveSurface.ts` (pure) answers "where am I" for the AI's working-focus context.
- **The AI's "go there" primitive** — `app/src/shared/session/openSurface.ts`: a surface context in, a live tab out; URL comes from the registry, no private route table.
- **The generic renderer** — every page is a thin renderer over the triplet: server-side `server/src/ui/FormBuilder.ts` (form generation from `*.ui.yaml`) consumed by `app/src/shared/forms/` (SectionedForm/FormSection) with the declarative block↔slot binding (ui-v1), and `app/src/components/registry/RecordListTable.tsx` for list columns/filters. Adding a record type adds no route; it appears where the schema directs.
- **Four-endpoint posture** (`specifications/lab-appliance-ui.md`): `/browser` (knowledge), `/event-editor` (what), `/protocols` (bridge), `/literature` (intake) — top-level chrome holds nothing else.
- **Agent actions (the page-emission transport, specified)** — `schema/workflow/agent-action.schema.yaml`: the structured-output vocabulary an agent may emit to drive the workspace harness: `focus` (retarget the investigation to a `protocol-step` or any record ref) and `open-surface` (open a registered surface id, optionally scoped to a target). Ajv-validated transport values, never prose-parsed from assistant text; `contextNote` may annotate but never override the authoritative resolved label. Status: the schema is shipped; the runtime wiring from AI stream events through `openSurface()` is the open edge (§8.1) — this is what a future "AI emits a page view" task actually completes.
- **Three-pane harness** (`2026-09-07_220226-three-pane-agent-harness.md`, shipped 2026-09-08, SOUL.md rule flipped by `e822f8f6`): nav rail | action | permanent AI chat with live working-focus header — THREE-pane only on run/deck + analysis; every other endpoint stays two-pane. `app/src/agent/AgentChatPane.tsx`. Generic component-tree page building is explicitly deferred; page "building" today = registry + triplet renderers, not a component-tree emitter.

### 3c. The tmux-style session (device concurrency — shipped)

The workspace session (`OpenTabsState`: tabs, activeTabId, per-tab history/cursor, right-pane mode, breadcrumb) is **server-persisted per user**, so the same session appears on every device and survives reload.

**Lineage (do not re-decide this):** browser-like tabs + per-tab breadcrumb/history (Aug wave: `unified-browser-tabs-breadcrumb`, `browser-tabs-inplace-nav-pertab-history`, `tabs-on-every-surface`) → the custom-vs-browser-tabs decision (`2026-09-09 tabs-deep-dive-decision`: keep custom tabs; the in-app tab strip is the workspace) → tmux promotion (this). Consequences:
- The session is a **transport value, not a lab record** — NOT a `CTX-*` record, NOT the per-study `records/studies/<id>/workspace.yaml` sidecar (`server/src/api/handlers/WorkspaceHandlers.ts`). Tabs are where you WERE, never what is TRUE.
- Hydration is **synchronous** (`useReducer` initializer + hydratedRef persist gate, per-user storage keys `cl-open-tabs:{userId}`) — this was the root cause of reloads clobbering tabs, and of `HomeRedirect` committing `/splash` pre-hydration. Any new session consumer must hydrate-before-persist or it re-breaks tmux semantics.
- Store: `server/src/workspace-session/WorkspaceSessionStore.ts` — one YAML file per user at `var/sessions/{userId}/main.yaml`; explicitly *transient UI state*, not records, not git.
- Endpoints: `server/src/api/routes/workspace-session.ts` — `GET /api/session` (requesting user), `PUT /api/session` (upsert `{tabs, activeTabId}`), `GET /api/session/:userId` (read-only attach — "show me what Brad has open"). Identity via `x-user-id` header falling back to `default` so a single-user appliance works without auth. The handler owns NO validation: the document is Ajv-validated against `schema/workflow/lab-session.schema.yaml` (rule #3).
- Client sync (`app/src/shared/session/useSessionSync.ts`) — **tmux semantics, last-writer-wins**: BOOT adopts the server copy when newer than our last push (wall-clock key `cl-open-tabs:lastPushedAt`) or when local is empty (first load on a second device); PUSH debounces 500ms then `PUT /api/session`; ATTACH re-GETs on window focus/visibilitychange and adopts if the server moved ahead. localStorage `cl-open-tabs:{userId}` is only the first-paint cache; the server is the source of truth. **One writer:** everything funnels into `OpenTabsContext.replaceState`.
- **The AI-emittable session document** — `sessionYaml.ts` (`sessionToYaml`/`sessionFromYaml`/`sessionDocumentToState`, `version: 1`) + `useApplySessionDocument`: a YAML session document (tabs + activeTabId) is itself a declarative artifact the AI can emit, applied through the same single writer. This is the second life of the tmux session as a *page-composition target*: emitting "the screen you should be looking at" as data. (Entry point defined; verify current chat wiring before depending on it in a task.)
- **Consequence for coders:** any new session-shaped state (tabs, active surface, pane modes) belongs in the session document, not localStorage — that is what makes second-device pickup work.

---

## 4. Pillar C — Light QMS: lifecycle that stays out of the way

The QMS is a **declarative overlay**, not a workflow engine. Philosophy (docs/qms-manual-testing-cheatsheet.md, §"The 13 Rules"): *Record what happened. Don't get in the way. Only step in when the system says someone should — "We tell you WHEN. You decide WHETHER."* The event graph remains the primary record of lab reality; QMS only adds gates where governed objects genuinely need them.

- **Lifecycles are data:** `schema/core/lifecycles/*.lifecycle.yaml` (6: lab-vocabulary-control, document-control, document-controlled-signing, lab-sample, tyf-order, service-request; validated by `schema/core/lifecycle.meta.schema.yaml`), declaring roles/states/transitions/guards. A governed record binds itself via a required `lifecycleId` field (e.g. `schema/lab/controlled-document.schema.yaml`) and carries the current `lifecycleState` — advanced ONLY via lifecycle-gated record updates, never as a free-form form field. Transitions declare guards; `requires` guard metadata is exposed in the permissive preview (QMS-1A) — the UI renders signature-gated transitions via `(t.allowed || t.requires?.signatureRequired)`.
- **State advance = `PUT /records/:id`** (NOT PATCH) with body-top-level `signatureRefs`. `GET /lifecycle/:id/transitions?recordId=` is permissive BY DESIGN. Server: `server/src/lifecycle/` — `LifecycleLoader.ts` (loads YAML), `lifecycleCompiler.ts` (compiles lifecycles into XState machines), `LifecycleEngine.ts` (interprets guards: `requires_signature`, `requires_different_person`, `requires_field_set`, `requires_active_policy`, `requires_role`; **fails closed** — a `requires_signature` guard with no `signatureAction` returns false), `lifecycleMiddleware.ts`, `BypassAudit.ts`. `describeGuardFacts` (QMS-1A) exposes guard metadata so the UI reads gates declaratively, never infers them in TS. Run-start carries its own gate (`RunStartGate` / controlled-use readiness machinery).
- **Signatures:** hash-chained `SIG-` records (prevHash→hash chain, 409 on tamper). Two gates per record (approved+effective) both declare `signatureAction: approved`; person separation is enforced by the SIG's `targetState`. Signer identity comes from the server-resolved request user (`identityService.resolveRequestUser` — session/JWT or the appliance's `x-user-id`), never from the request body.
- **Revision integrity (81454a4e):** immutable `REV-` snapshots + content hashes; `STALE_SIGNATURE` / `SIGNED_CONTENT_CHANGED` / `SIGNATURE_TARGET_MISMATCH` rejections (shape `{error:TOKEN,message}`, no code field). Approved/effective content is LOCKED at HTTP + storage; editing goes via `POST /records/:id/draft-copy` (new record, `derivedFromRevisionRef`, fresh authorship, no inherited signatures). `meta.contentSha` is the word; `meta.commitSha` is legacy.
- **Governed record types:** controlled-document triplet (`DOC-`, effectiveDate + signature gates), calibration-record (`CAL-`, expiry→EXPIRED, usage→QUARANTINED gates), training-record (`TRN-`), lab-vocabulary governance (LOCAL term in `schema/registry/ontology-terms/` + material-alias + vocab-decision; `vocab:pending` is a *record* status, not a lifecycle state). Audit trail is filesystem git — no audit table.
- **Friction-first gates (13 Rules):** draft saves and chat stay frictionless even logged out; gates land on *materialize* (save/execute/release). Login-first shipped (`login-first-w1-complete.md`).
- **UI:** `DocumentControlBar` + registry Documents tab (QMS-6). Browser gate: cl-browser-reviewer receipts with VERDICT: accept — negative claims (404/blank) must be re-verified via API/reload before reporting (two false-positive incidents on record).

---

## 5. Pillar D — The analysis framework (consistent drawing across users, sessions, models)

Goal: a computable-lab AI must produce the **same analysis surface** regardless of which model, user, or session requests it. The mechanism is not a smarter model — it is that an "analysis tool" is a **record chain rendered through a closed set of validated renderers**.

```
analysis-revision (immutable method: entryScript + sdkVersion + declared inputs/parameterSchema + parentRevisionRef chain)
  → analysis-run (ARUN-, executes the revision's pinned method against real inputs)
    → analysis-output-artifact (AOA-, dataKind + inlineValue or dataReferenceRef streaming large data out of git)
      → view-spec (VSPEC-, discriminator: renderer ∈ table | signal | metric | static-figure | model | binary + bindings)
        → ViewRenderer.tsx — ONLY shipped renderers execute; unknown renderer = visible compatibility error;
          Python visuals fall back to static-figure. NO arbitrary JS/HTML ever executes.
```

Schemas: `schema/knowledge/{analysis-revision,analysis-run,analysis-output-artifact,view-spec}.schema.yaml`. Routes (verified in `server/src/api/routes.ts:1216-1229`): `GET/POST /api/analysis-revisions`, `POST /api/analysis-revisions/draft` (the AI authoring path — `draftAnalysisRevision` in the API client, wired into `app/src/analysis/AnalysisPage.tsx`), `GET /api/analysis-revisions/:id`, `GET/POST /api/analysis-runs`, `POST /api/analysis-runs/:id/execute`, `POST /api/analysis-artifacts/:id/promote` ("Use Result in New Analysis"), plus `GET /api/runs/:id/analysis-bundle`. Server: `server/src/analysis/` (`analysisRunner.ts`, `analysisAuthoring.ts`, `analysisService.ts`, `artifactPromotion.ts`). The `analysis` surface carries the AI panel (three-pane). Control-plane/data-plane split (`2026-09-05_153000-storage-instrument-analysis-surface.md`, canonical): schemas/manifests/references live in git; raw instrument bytes live on storage devices via `data-reference` records, never in git.

**Why it satisfies the consistency requirement:** determinism lives at the revision (pinned, versioned code + declared outputs) and at the renderer set (closed, validated by Ajv against view-spec). The model only *authors/proposes* the revision; two models proposing the same chart converge on the same ViewSpec discriminator vocabulary, and rendering never depends on the model at all. Plan lineage: `2026-09-05_150500-analysis-surface-slice-a.md`, `...153000-storage-instrument-analysis-surface.md` (three-tier storage model), `...170500-analysis-model-lifecycle-chained.md`.

---

## 5b. Supporting subsystems (load-bearing, not pillars)

- **Identity & governance:** `schema/identity/` (user, group, role-grant — privilege-escalation-guarded), login-first posture (admin via session login only; `POST /auth/set-password` first-run bootstrap), research policy bundles can switch transition-role enforcement (`enforceTransitionRoles`). Identity is real and provenance is system-owned; drafts are bound to the authenticated actor.
- **Lab-sync (TYF handoff):** `server/src/lab-sync/` — evidence export policy + builder, `tyf.evidence/1` schema, ReportReleaser with upload-before-release + pending-evidence re-push, cursor-based fetch→ack. Release order is evidence-before-report.
- **Corpus moat:** training corpora (surface context, compiles) live OUTSIDE the public repo on remote storage with leak quarantine (`2026-09-19 corpus-moat-relocation`); `server/src/corpus/` generates, never commits data.
- **Graph search:** `app/src/graph-search/` — plate-view search over the record graph (Sept spike, shipped).

## 6. The Hermes pipeline itself (who does what)

- **architect (this profile):** intake conversation with Brad → one grounded GPT-6 synthesis draft → authors THE LIST per lane at `~/.hermes/cl/lanes/<n>/task-list.md`. Writes no product code, dispatches no workers, marks nothing done. Platform-gap stop-boundary: a worker finding a NEW platform gap STOPS and returns requires-rescope; it never absorbs the gap.
- **orchestrator:** one per lane, own cron tick; claims tasks → specs → dispatches cl-coder workers in worktrees → adversarial review → verification → cl-browser-reviewer for UI (VERDICT: accept required) → marks done + writes handoff to `.hermes/plans/handoffs/`.
- **Lanes:** parallel independent pipelines. Lane 1 = light-QMS/editor (trunk `cl/integration-1`, worktree `cl-integration-1`, stack :3092/:5192). Lane 2 = AI protocol edit + router spike (trunk `cl/integration-2`, stack :3093/:5193). Lane config/assumptions under `~/.hermes/cl/lanes/<n>/`. Brad's main stack :5174→:3001 is LIVE — never pkill patterns, target exact PIDs.
- **cl-scout / cl-browser-scout / cl-browser-reviewer:** share the single computable vision-model slot — ONE at a time, scoped to named surfaces, never broad sweeps.
- **Ground-truth order when facts conflict:** shipped code > lane task-list environment facts > recent handoff > intake packet > old plans. Plans are *plans*; verify implementation claims against code before repeating them (several plan docs describe phases that were never executed).

---

## 7. Superseded-ideas ledger (do not resurrect)

| Dead idea | Replaced by | Where it died |
|---|---|---|
| Capture user intent as ontology mappings (blocking pre-draft term gate) | resolver spine (6-tier ranked candidates) + confirm terms in review dialogue | resolver-unification plan (2026-08-03) + Brad's AI-loop rulings (2026-10) |
| `server/src/ontology/` + per-term provider registry + legacy `resolveMaterial()` | single `ResolveSpine.ts` | `2026-08-03_resolver-spine-integration.md` (deleted files listed) |
| 'Never a third pane' hard rule | three-pane agent harness on run/deck + analysis only; two-pane everywhere else | SOUL.md flip `e822f8f6` |
| Local OLS4 server / Python OAK as the resolution authority | OAK binary (tier 2) + spine-tiered OLS4 remote (tier 3, optional, degrades offline) | resolver-unification plan §1/§3 |
| Per-record QMS workflow engine / audit table | declarative lifecycle YAML overlays + git filesystem audit | qms cheatsheet "13 Rules" |
| Generic `AiDraftBar` as the universal review surface | per-surface native review surfaces (form adapter / event ghost / ChangesPanel) under one compiler contract | ai-drafting-and-ui-projection.md adoption table |
| Retired flat `~/.hermes/cl/task-list.md` | per-lane lists at `~/.hermes/cl/lanes/<n>/task-list.md` | lane model (2026-10) |

---

## 8. Known divergences & open edges (as of 2026-10-06, verified against code)

1. **Cross-page page composition is spec, not runtime.** `agent_intent` emits event_graph / deck_layout / create_record (+ sequence coercion); there is no declarative "compose arbitrary page view" intent yet. The universal contract exists; per-surface adoption is tracked in the projection doc's table. Coders: when a task claims to "emit a page view," its real deliverable is either a surface-registry entry + openSurface target, or a compiler adapter — name which.
2. **AI draft compile path is split**: `POST /api/drafts/compile|accept` is the contract-shaped path (`server/src/drafts/`); the older chat compile path (`server/src/ai/runChatbotCompile.ts`, used by event-graph drafts via ToolBridge) predates the draft envelope. Converging them is open work.
3. **Analysis AI** is revision-drafting only; full AI-authored analysis through ghosted review on the analysis surface is still maturing.
4. **`specifications/` file permissions/ownership** have drifted (root-owned files; several lacked a+r until 2026-10-06). `architecture-of-record.md` and `ai-drafting-and-ui-projection.md` are now tracked (commit b30b36dc); keep canonical specs in git and readable.

## 9. Where truth lives (quick index)

| Question | Go to |
|---|---|
| Domain truth for a record type | `schema/<domain>/*.schema.yaml` + `.lint.yaml` + `.ui.yaml` |
| What a term resolves to | `server/src/resolve/ResolveSpine.ts` (and ONLY that) |
| What surfaces exist / where AI can go | `schema/registry/surfaces/surfaces.yaml`, `app/src/shared/surfaces/`, `openSurface.ts` |
| What session state persists across devices | `schema/workflow/lab-session.schema.yaml`, `server/src/workspace-session/`, `server/src/api/routes/workspace-session.ts`, `app/src/shared/session/` |
| AI tool contracts (what a model may emit) | `server/src/ai/submitSuggestionTool.ts`, `ToolBridge.ts`, `coerceAgentIntent.ts` |
| Proposal → ghost → accept lifecycle | `specifications/ai-drafting-and-ui-projection.md`, `server/src/drafts/` (FormDraftService, StagingStore, adapters.ts, draftRoutes.ts) |
| Lifecycle/signature/revision rules | `schema/core/lifecycles/*.yaml`, `server/src/lifecycle/`, `docs/qms-manual-testing-cheatsheet.md` |
| Analysis chain | `schema/knowledge/analysis-*.schema.yaml` + `view-spec.schema.yaml`, `app/src/analysis/ViewRenderer.tsx` |
| Current queue per lane | `~/.hermes/cl/lanes/<n>/task-list.md` (header = binding decisions + env facts) |
| What recently shipped & why | `.hermes/plans/handoffs/` (newest first) |
| One-line status of every plan ever written (June–Oct 2026) | `.hermes/plans/plan_summary.md` (129 plans, DONE/PARTIAL/PLAN-ONLY/SUPERSEDED tags; regenerated 2026-10-06 — treat its DONE* tags as self-declared, re-verify before citing to Brad) |
