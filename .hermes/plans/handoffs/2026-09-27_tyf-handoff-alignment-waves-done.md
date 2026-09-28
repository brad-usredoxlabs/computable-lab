# Handoff — TYF Customer-Handoff Alignment on CL (waves executed)

Date: 2026-09-27 (overnight run)
Session: architect profile (Hermes), plan `.hermes/plans/2026-09-27_181140-tyf-customer-handoff-alignment.md`
Parent: `fbeeeb25` (prior session's lab-sync core). Our commits, in order:

1. `7bc57876` — tyfcus identity aliases, registration slot/lineId/sampleId, needs_review status, ArtifactClient (chunked resumable upload)
2. `5fe94413` — evidence export policy (config/lab-sync/evidence.yaml) + EvidenceBuilder + standalone viewer library build
3. `aa7edbc2` — tyf.evidence/1 document schema, report.evidenceFiles, ReportReleaser (upload-before-release), pending-evidence re-push rule, wiring factory
(+ in flight at write-time: E2E lifecycle tests in LabSyncWorker.e2e.test.ts — see §In flight)

## What landed (all schema-first, all TDD, all parent-verified)

### Identity alignment (customer-handoff spec §Identity)
- `customer.schema.yaml`: `aliases[]` (remoteId pattern `^tyfcus_[0-9a-f]{32}$`, uniqueItems) + `verifiedAt`. Legacy `email:<email>` source.remoteId stays put; recordId NEVER changes (Git-preserves-history honored literally).
- New inbound handlers (`translate/inbound.ts`):
  - `customer.identity_assigned` — attaches the tyfcus handle to the ONE normalized-email-matched customer (trim+lowercase; matches source.remoteId OR contacts email). 0 matches -> unknown_type (never mints). >=2 matches -> NEW mirror status `needs_review` (hard stop as data; operator resolves; zero mutation). Idempotent beyond event dedupe.
  - `customer.verified` — sets verifiedAt (event occurred_at wins; first timestamp wins on replay).
  - `order.updated` `changes.customer_id` — re-owns the order (customerRef+requesterRef retarget via alias lookup); unknown handle -> needs_review, order untouched; customer_id stripped before generic merge (never lands as stray field).
- `sample-registration.schema.yaml`: `sampleId`/`lineId`/`slot` (commercial fields stay domain-side). `sample.registered` handler mirrors `sample_id` onto the lab sample as `identifiers[]` entry `{system: tyf-sample-id}` — core `sample` schema untouched (no domain-named field; mapping.yaml gained the identifier system).

### Evidence release path (the long pole from the prior handoff, now built)
- `evidence-document.schema.yaml` — validation contract for `tyf.evidence/1` (not a record: no FAIRCommon/recordId). Cross-sample equality scoping is NOT schema-expressible; enforcement is in builder tests (assert other-sample strings absent from the serialized doc).
- `config/lab-sync/evidence.yaml` — redaction policy: default-deny include-list closure; shared_kinds redacted (top-level redact_paths + drop-kind ref-object pruning so `report.requestRef -> order` can't leak other customers' order ids); drop_kinds never included.
- `server/src/lab-sync/evidence/build.ts` — EvidenceBuilder: build(sample, report, revision) -> immutable doc + files with sha256/size; gitLog injectable for source_revisions (git history citations); missing required artifact kinds (graph/trace/script/inputs/zip) -> throws listing them, never ships incomplete; determinism test pins byte-identical rebuilds (website pending-evidence retry demands byte-equivalent JSON).
- `ArtifactClient` — init/status/chunk/complete client for POST /api/lab-sync/artifacts: 100 MiB cap, 1 MiB chunks, client-side guards before fetch, per-chunk retry, 409 -> re-query status -> resume (a stale-slice bug was caught and killed by the resume test). Token scrubbed from error excerpts. `uploadFile(id, bytes, sampleId?)`.
- `outbound/reports.ts` — report.released payload extended: `sample_id`, `barcode`, `evidence` (doc inline) alongside legacy fields; `REPORT_RELEASED_EVENT_TYPE` single source.
- `outbound/push.ts` — pending-evidence rule: report.released answered `unknown` -> push_failed 'evidence pending website-side' -> identical mirror payload re-pushes until applied/duplicated. All other event types keep unknown=delivered.
- `outbound/release.ts` — ReportReleaser.releaseSample(sampleId, reportId): build evidence -> upload ALL files -> report released (status+releasedAt) -> mint report.released -> pushPending. Fail-fast on unresolvable order remoteId BEFORE uploads. Order advances to `reported` ONLY from `testing_complete` (lifecycle authority rule respected; other statuses leave the order ladder alone).
- `wiring.ts` — createReportReleaser factory: all three config fields (baseUrl/token/evidencePolicyPath) hard-required at runtime, no defaults (§7/§9). NOT yet mounted on any route — deliberate: bench UI is the consumer, not yet built.

### Standalone viewer (deliverable for the website agent)
- `app/src/viewer/` (entry index.tsx — JSX forced .tsx): exports `apiVersion = 1` + `mount(element, {document, resolveArtifact}) -> {destroy()}`. Dependency-free inline styles; React bundled (206 KB self-contained ES module). resolveArtifact scope enforced; fail-closed split per spec (viewer_version mismatch = banner + content; schema_version mismatch = blanked content + downloads). destroy idempotent; flushSync for sync DOM.
- `app/vite.viewer.config.ts` + `app/scripts/build-viewer.mjs` -> `app/dist-viewer/viewer.js` + PROVENANCE.json (viewer_version, git_sha, built_at). Grep gates: no dangerouslySetInnerHTML, no `/api/` strings, no fetches. `dist-viewer/` gitignored.
- Deploy = copy dist-viewer/ into website `public/lab-viewer/v1/`, then they set TYF_VIEWER_URL. Our build has NOT been run against their `tests/fixtures/viewer-v1.mjs` contract double in-repo (their repo) — browser acceptance is their gate; our 9 tests cover the same interface.

## Verification (real runs)
- Targeted: server lab-sync suite + ServiceDomainSchemas = 117/117 green (parent re-run, not child claims); app viewer 9/9; build produced + grep gates clean; `tsc --noEmit` server clean at each wave commit.
- Full-suite baseline diff (the honest method, since the tree is shared): baseline worktree at `fbeeeb25` — 121 failing files / 206 failing tests (sibling session's in-flight work pollutes the WORKING tree, but the worktree isolates it). Current worktree: 84 files / 88 failing. The 4 files newly failing vs baseline (`AgentOrchestrator.tubeGate`, `submitSuggestionTool.tubeSchema`, `EventGraphEquipmentSchema`, `surfacesAjv`) are ALL sibling-session untracked files (absent from git at fbeeeb25 AND from HEAD) — zero failures in any lab-sync or service-domain file. Our waves introduced zero new failures. 41 files newly green (sibling churn).
- App typecheck: 23 errors, ALL in sibling's deck/ingestion files, ZERO in src/viewer.

## In flight / unfinished
1. DONE — committed `ae4c20ea`: E2E lifecycle tests (`LabSyncWorker.e2e.test.ts`, +197 lines; 8/8 green parent-verified): identity_assigned + ambiguous needs_review + registration through fetch->translate->ack->cursor. The mid-run ambiguity red was the child's fixture seeding (needed a poll between customer.created and the planted second match), NOT a worker bug; needs_review confirmed acked-and-terminal through the real worker loop.
2. Report GENERATION (results -> evidenceFiles sources: graph/trace/script/inputs/zip bytes on disk with paths recorded on the report) — the builder consumes evidenceFiles but nothing MINTS them yet. Still the long pole for a complete customer loop; needs a decision on where analysis artifacts land (probably analysis-output-artifact/studies-artifact records + a materialized bundle dir).
3. Not mounted: no route/UI calls createReportReleaser yet (bench receipt UI, order accept/reject UI — handoff §3/§4 from prior session still open).
4. website-side unknowns (their agent's queue, not ours): real `sample_id` format (we validate `[A-Za-z0-9_-]{1,64}`), empty-vs-present sample_id at artifact init (now present, path closed), real go-live config.

## Go-live (unchanged, config-only)
export TYF_LAB_TOKEN; config.yaml: labSync.enabled+baseUrl+token, plus new: evidencePolicyPath: config/lab-sync/evidence.yaml for the releaser (worker itself doesn't need it). Restart. Watch GET /api/lab-sync/status + poll-once.

## Process notes (orchestration thread)
- Wave shape: W1 three children (schemas / inbound / ArtifactClient) -> parent verify+commit -> W2+W3 two children (builder / viewer) -> verify+commit -> final two children (evidence schema+report field / release orchestration) -> verify+commit -> E2E child. Disjoint file ownership held 100% across 8 children (git status footprints matched owned-file lists exactly every wave). Children were NEVER allowed to touch git: parent committed per wave (shared human session + shared index).
- Vast-mount gotcha NEW: filesystem flipped 644->755 across the whole tree mid-run; commit with `git -c core.fileMode=false add/commit` + explicit file lists, or commits get polluted with hundreds of mode-only changes. Recorded in skill.
- pnpm monorepo + worktree: symlinking node_modules into a worktree breaks .bin resolution; use the root-hoisted `node_modules/.bin` on PATH for baseline runs. Baseline worktree removed after comparison.
- Skill `computable-lab-sync-worker` updated with release ordering contract, re-push rule, viewer gates, both new environment pitfalls.
- open_issues worth reading now that code is merged: builder redaction is top-level-path scoped in v1 (deep-nested non-ref PII inside shared-kind payloads relies on policy paths — revisit when real run records have nested customer mentions); wiring gitLog assumes flat records/{kind}/{id}.yaml, nested kinds get empty source_revisions (logged, by design).
