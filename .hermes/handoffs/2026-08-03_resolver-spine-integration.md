# Handoff — Resolver Spine Integration (session 2026-08-03)

**Repo:** `/home/brad/git/computable-lab` · **Branch:** `feat/ai-extension-api`
**Author:** Lead Architect (Hermes) · **Status:** COMPLETE, committed, independently reviewed (GO)

---

## What this session accomplished

Unified the term-resolution pipeline for materials so the **compiler, the AI
agent, and every search picker resolve a term to the same answer** — the
codebase's "one resolution path, one answer" goal, now actually true.

### Commits (5, in order)

| Commit | Phase | What it did |
|---|---|---|
| `62b084f` | 0+1 | Resolver conformance harness + fixed 6 stale compiler tests + **unified the compiler onto the shared resolve spine** |
| `c325b3c` | 2 | **Deterministic minting** — new `termId.ts` (djb2); `/vocab/mint` + `MaterialGrounding` converge |
| `101b6e4` | 3 | **RefPicker surfaces the tier-5 "Create local term" row** (was filtered out) |
| `5e4e355` | 4 | Locked the **server-side accept-gate** invariant with a test |
| `3089061` | follow-up | RefPicker mint row keyboard-accessible + `selectMint` error-path test |

---

## The resolution architecture (as of end of session)

**One shared 5-tier "resolve() spine"** — `server/src/resolve/ResolveSpine.ts`:

```
tier 1  local records        (previously-minted terms, workspace materials)
tier 2  local OAK            (appliance ontology service; skipped if unconfigured)
tier 3  remote OLS4          (EBI, best-effort under timeout)
tier 4  vendor               (scaffold; not wired)
tier 5  mint-local CURIE     (affordance only — caller must act to create)
```

Ranking is **tier-dominant**: tier base (1.0/0.8/0.6/0.4/0.05) + match bonus
(exact .15 / prefix .08 / substring .02); tier gap 0.2 > max bonus 0.15, so a
**local substring hit always outranks a remote exact hit** — "prefer what the lab
already has." This is the local-first → ontology-second → mint-new-CURIE-last
preference, enforced consistently.

### Key change: the compiler now shares the spine
- **Before:** the compiler's ontology tier used its own OAK-only, local-only
  spine (`server.ts:600` old) that silently dropped local-record (tier-1) and
  OLS4 (tier-3) hits — the compiler could disagree with the UI/agent.
- **After:** `server/src/resolve/compileResolver.ts` exports
  `createCompileOntologyResolver(spine)`, and `server.ts` passes it the **same
  `resolveSpine` instance** the UI and agent use (`createResolveSpineFromContext`).
  Contract preserved (`{ id, label, source }` map; tier-5 mint filtered out).
- Tradeoff (recorded in plan): compiler now depends on OLS4 by default (was
  OAK-only/fast/offline-safe). Local tiers stay fast; OLS4 is best-effort and
  omitted offline. Acceptable for the unification goal.

### Key change: one deterministic mint path
- New `server/src/materials/termId.ts` — single source of truth for local IDs:
  - label → `MAT-<slug>-<djb2hash>` (deterministic, idempotent re-mint)
  - CURIE → `MAT-<CURIE-SLUG>`
- **Before:** `/vocab/mint` used `Math.random()` suffixes; `MaterialGrounding`
  used djb2; they diverged.
- **After:** both share `termId.ts`. Verified byte-identical to the original
  algorithms (no existing-ID breakage); old random IDs not invalidated.
- Runtime-confirmed: minting "DMSO" → `MAT-dmso-ykg0`; a repeat mint of the same
  label is correctly rejected as a duplicate (not a new random record).

### Key change: mint affordance surfaced in RefPicker
- `app/src/shared/ref/RefPicker.tsx` previously filtered out `source:'mint'`
  candidates. Now renders the tier-5 candidate as a pinned-bottom **"Create
  local term"** row; selecting it calls `apiClient.mintLocalTerm(...)` and emits
  the resulting local record ref. Keyboard-accessible (ArrowDown/Enter).

### Key change: accept-gate locked
- The server-side guarantee that a draft/ghost compile never persists a local
  record until the user accepts now has an explicit test: `bindOntologyMentions`
  with `persistNew:false` (what `runChatbotCompile` always passes) → draftOnly,
  **zero** store writes.

---

## Validation (real tool output)

- Server typecheck: green · App typecheck: green
- Resolver-relevant suite: **98/98 pass**
- New tests: conformance (4), termId (6), RefPicker (3) — all pass
- Full server suite: **153 fails — down from 223 at baseline; ZERO new failures
  introduced** (proven via before/after worktree run). All 153 remaining are
  pre-existing drift in unrelated areas (see
  `.hermes/plans/2026-08-03_test-failures-snapshot.md`).

---

## Known divergences still open (by design / future work)

1. **`NounPhraseResolver`** (`server/src/compiler/precompile/NounPhraseResolver.ts`)
   still uses its **own 4-tier registries** for labware-definition and
   compound-class (frozen YAML), not the spine. Only its *ontology* tier routes
   through the spine. So "one resolution path" is complete for **vocabulary /
   ontology terms**, not for labware-defs / compound-classes. Future phase could
   feed those registries into spine tier-1.
2. **Frontend `acceptedOntologyBindings.ts`** carries its own copy of
   `localMaterialIdForCurie` (algorithm identical to server `termId.ts`).
   Not rerouted through `/vocab/mint` because it mints **ontology-grounded**
   terms (`MAT-CHEBI-5001`) — a different operation from free-text label minting.
   Candidate to move to a shared package if they ever drift.

---

## Notes / housekeeping

- **Stale worktrees** under `computable-lab/.worktrees/` were the cause of phantom
  test failures + slow vitest runs — **run vitest from `server/` or `app/` cwd**.
  All stale worktrees pruned except `computable-foundry-ai` (separate active repo).
- The `t_7b601ce0` worktree (uncommitted execution-UI work incl. `RunChatPanel.tsx`)
  was **preserved before pruning** at `/home/brad/.hermes/recovered/t_7b601ce0-save/`;
  branch ref `wt/t_7b601ce0` kept.
- Plan doc with full execution status + deviations:
  `.hermes/plans/2026-08-03_202030-resolver-unification.md`
- Test-failure triage snapshot:
  `.hermes/plans/2026-08-03_test-failures-snapshot.md`

---

## Recommended next steps
1. Triage Cluster 3 (compiler invariant tests: `aiPrecompileGating`,
   `ChatbotCompileDeckSlot`, `AgentOrchestrator.*`) with a human to separate real
   regressions from stale goldens.
2. Fix Cluster 4 real bugs (`slugify` export; `MentionResolver.test.ts:749`
   syntax error).
3. Repair the shared temp-workspace schema-staging helper (Cluster 2, ~35 fails).
4. Optional: converge `NounPhraseResolver` labware/compound tiers onto the spine.
