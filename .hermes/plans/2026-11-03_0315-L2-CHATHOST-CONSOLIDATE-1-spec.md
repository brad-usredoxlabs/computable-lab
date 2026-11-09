# L2-CHATHOST-CONSOLIDATE-1 — One context collector, one registrar, one YAML door registry

**PROMOTED 2026-11-03T03:20 EST (orch l2t0255)** — composer draft (l2t1855) promoted to canonical
after an orchestrator audit. Not a rubber stamp: the four load-bearing pins were re-read FIRST-HAND by
the orchestrator at trunk `86500e04` and again at `8814ae52` (the only commits in between are docs-only:
`8d7ac781` handoff, `8814ae52` Brad card), so the composer's line numbers stand.

AUDIT CORRECTIONS (read these — they override the draft's own citations where they differ):
- The harness lives at `.hermes/plans/harness/l2-trunk-journeys/`, NOT `harness/l2-trunk-journeys/`.
  A file of the SAME NAME also exists under `.hermes/plans/harness/l2-suite-a/` — **every edit and every
  gate run must target `l2-trunk-journeys`**. Confirmed: the shrink-guard arm (`sg_ok0/sg_rm0`,
  "current inventory matches the blessed manifest -> green", "a SHRUNKEN inventory ... -> RED, names the
  host") lives in that file at **:967-982** (the draft/handoff cited :1069-1076 — same fact, different
  line numbers; trust the symbols, not the offsets).
- `load_chat_host_inventory` is at `.hermes/plans/harness/l2-trunk-journeys/check-gate.py:70-97`: it
  returns `(ids, surfaces)` in file order and RAISES on an absent id, a duplicate id, or a missing/empty
  `surface`. That is why OQ2 refuses a per-mount `doors:` schema — the loader already fails closed on
  malformed entries.
- `config/chat/chat-hosts.yaml` confirmed at 6 hosts with `id` + `surface` (grep count 6 at `8814ae52`).
- The draft's own disclosure stands: NO scout output informed it. Everything here is composer-read code
  plus the orchestrator's first-hand re-reads; nothing is cited as scout evidence.

---

## §0 What this spec does not re-litigate

- The inventory `config/chat/chat-hosts.yaml` stays at **6 hosts, same ids, same `surface:`
  values** (ruling §5). This item ADDS fields to entries; it does not add, remove or rename a
  host. Verified first-hand: the shrink-guard hashes **ids only**
  (`chat-hosts-shrink-guard.py:64-68` over `inventory_ids` `:71-82`), so additive fields are
  sha-neutral — proven in §7 probe P-2.
- The guard's *mechanism* is not redesigned except where OBS-B/OBS-C explicitly require it.
  No second guard, no second manifest, no parallel harness.
- The engine is untouched: `useAiChat`, revision trail, clarification cards, compiler-accept
  boundary. This item moves DOORS, not the loop.

---

## §1 Goal

Replace the four handwritten per-host chat bridges with **one context collector**
(`collectSurfaceContext()` in `app/src/shared/`), **one registrar** (the existing
`app/src/shared/shell/SurfaceChatBridge.tsx`), and **one YAML door registry**
(`config/chat/chat-hosts.yaml`, which already enumerates the doors) — so that a door mounted one
provider too high is a loud error instead of a silently deaf pane.

### §1.1 Acceptance criteria — VERBATIM from the lane list (`task-list.md`, CHATHOST-CONSOLIDATE-1 `verified by`)

> (a) grep: zero per-host bridge components remain (DeckSurfaceChat/RunSurfaceChatBridge/
> SurfaceChatBridge/ProjectSurfaceChat deleted or reduced to declarative config); every page
> chat mount is the shared registrar; (b) inventory YAML names every host with
> required_providers, and a unit test mounts the registrar with a required provider absent
> and asserts the loud error (RED-first); (c) full corpus prompts 1–3 re-driven cold on
> :5193 with per-host live round-trip receipts (sweep gate); (d) deck ghost + adoption
> journey still green on BOTH deck hosts; (e) post-merge stack restart + truth-table rows.

Plus the three BRIEF BINDINGS, which are acceptance requirements and not suggestions:
**OBS-A** (§3, mandatory, same commit), **OBS-B** (§4, a decision this spec must make),
**OBS-C** (§5, folded in here, never a dedicated cycle), and the **evidence debt** from the
SWEEP-1 close (§6).

### §1.2 Retired vs kept — named from the inventory, nothing invented

The inventory (`config/chat/chat-hosts.yaml:72-131`) enumerates exactly six hosts. **All six
are KEPT** — same ids, same routes, same `surface:` values, same thread-scoping behaviour:

| host id (YAML line) | surface | door today | route |
|---|---|---|---|
| `run-workspace` (:73) | `run-workspace` | `RunSurfaceChatBridge` (RunWorkspacePage.tsx:168) | `/runs/:runId` |
| `event-editor` (:84) | `event-editor` | `DeckSurfaceChat` (DeckHostPage.tsx:139) | `/deck/:eventGraphId/:runId?` |
| `project-deck-tab` (:93) | `analysis` | inline `ProjectSurfaceChat` (ProjectWorkspacePage.tsx:82) + `DeckSurfaceChat` deck branch (:280) | `/project/:studyId[/event-graph/:id]` |
| `record-host` (:106) | `analysis` | `SurfaceChatBridge` (RecordHostPage.tsx:53) | `/record/:recordId`, `/record/new/...` |
| `artifact-host` (:114) | `analysis` | `SurfaceChatBridge` (ArtifactHostPage.tsx:49) | `/artifact/:kind/:artifactId` |
| `registry-host` (:122) | `analysis` | `SurfaceChatBridge` (RegistryHostPage.tsx:51) | `/registry` |

**RETIRED (four implementations → one):**
1. `app/src/event-editor/deck/DeckSurfaceChat.tsx` (252 lines) — bespoke deck projection +
   ghost mount + adoption + focus publish. DELETE.
2. `app/src/run/RunSurfaceChatBridge.tsx` (147 lines) — bespoke selectedWells threading +
   ghost mount + adoption + focus publish. DELETE.
3. `ProjectSurfaceChat` — the inline function at
   `app/src/event-editor/projects/ProjectWorkspacePage.tsx:101-131`. DELETE (its context
   becomes a published `workspace` slice; its stand-down rule at `:129` becomes data).
4. `app/src/shared/shell/SurfaceChatBridge.tsx` — **kept as the ONE registrar**, reduced to
   declarative config: it stops taking a pre-built `aiContext` from each page and instead takes
   `host` (the inventory id) and composes the context from published slices.

**EXPLICITLY OUT OF SCOPE (declared, not forgotten).** The inventory's own exclusion block
(`chat-hosts.yaml:56-69`) names the surfaces this item must NOT touch:
- dead/fixture pages: `app/src/graph/RunWorkspacePage.tsx:69`, `app/src/graph/LabwareEventEditor.tsx:1022`;
- the PRE-universal-chat generation that still calls `useRegisterAiChat` directly:
  `literature/LiteratureBody.tsx:74`, `sequences/SequencesPage.tsx:78`,
  `protocol-ide/ProtocolIdePage`, `ingestion` vendor-pdf `ReviewAiPanel`,
  `analysis/AnalysisChatPanel`, `editor/FormulationsPage.tsx:641`, `editor/MaterialsPage.tsx:47`.

The item description names literature/materials/formulations/sequences as context-producing
providers. **They are not in the host set** — the inventory is this item's input contract
("consolidate against the enumerated doors, do not re-enumerate by hand"), and the ruling's
§5 keeps the inventory frozen. The collector therefore declares slices only for providers
reachable from the six inventory hosts. Touching the legacy pages is a separate campaign step;
changing them here would be an un-gated behaviour change on seven surfaces no gate covers.

Also out of scope: the `execution` branch of the project workspace
(`ProjectWorkspacePage.tsx:287-298`) mounts `EventEditorProvider` with **no chat door at all**
today. Parity is preserved: no door is added there. (Recorded as OQ3, not a change.)

---

## §2 The door-registry DATA contract

### 2.1 What an entry declares today

`config/chat/chat-hosts.yaml` entries carry exactly five keys — `id`, `surface`, `mount`,
`route`, `note` (`:73-131`). Three consumers read them:
`check-gate.py:70-97` (`load_chat_host_inventory`: requires `id` and a non-empty `surface`,
rejects duplicate ids), `chat-hosts-shrink-guard.py:71-82` (`id` only), and
`app/src/shared/config/chatHostInventory.contract.test.ts` (`id` + `surface`).

**These five keys do not change.** The harness readers keep working untouched — that is the
reason the new capability is expressed as ADDITIVE keys rather than a `doors:` re-shape.

### 2.2 What an entry must declare after

Per host, three new keys, **required on every entry** (a key that is present-and-empty is a
declared fact; an absent key is an omission and must fail the contract test):

```yaml
  - id: run-workspace
    surface: run-workspace
    mount: ...            # unchanged prose
    route: ...            # unchanged
    required_providers: [deck]      # slice ids that MUST be published at this host's door
    optional_providers: []          # slice ids that upgrade the door when published
    ghost_mount: true               # wire deck ghost/adoption from the published deck slice
    note: >- ...          # unchanged
```

Assignment for the six hosts (derived from the current wiring, not invented):

| host | required_providers | optional_providers | ghost_mount | why (verified) |
|---|---|---|---|---|
| `run-workspace` | `[deck]` | `[]` | `true` | bridge lives INSIDE `EventEditorProvider` and threads selection + ghosts (`RunSurfaceChatBridge.tsx:40-62`, `:90-116`) |
| `event-editor` | `[deck]` | `[]` | `true` | deck projection + ghosts (`DeckSurfaceChat.tsx:42-130`, `:198-234`) |
| `project-deck-tab` | `[]` | `[deck]` | `true` | page-level door is above the provider (`ProjectWorkspacePage.tsx:80-87`); the deck branch adds ghosts (`:280`) |
| `record-host` | `[]` | `[]` | `false` | context built from page props (`RecordHostPage.tsx:39-56`) |
| `artifact-host` | `[]` | `[]` | `false` | same (`ArtifactHostPage.tsx:39-49`) |
| `registry-host` | `[]` | `[]` | `false` | same, workspace optional by design (`RegistryHostPage.tsx:36-51`) |

`ghost_mount: false` means the registrar **never** wires ghost/adoption handlers, even if a
deck slice is published somewhere in the tree.

### 2.3 The closed slice vocabulary

One new top-level block in the same file — the vocabulary the `required_providers` values draw
from. A slice id names a **published state bundle**, never a host id and never a `surface:`
value; the file must say so, and the contract test enforces the three vocabularies stay
disjoint.

```yaml
slices:
  - id: deck
    publisher: app/src/event-editor/EventEditorContext.tsx:1372   # EventEditorProvider
    carries: >-
      event graph, labwares, placements, well selection, staged preview, deck scope
  - id: workspace
    publisher: app/src/event-editor/workspace/WorkspaceContext.tsx:89
    carries: >-
      studyId, active tab (kind, recordId, artifactId, eventGraphId)
  - id: protocol-selection
    publisher: app/src/event-editor/protocol/ProtocolSelectionContext.tsx:160
    carries: >-
      focused step (ordinal, label) — the pane's working-focus box only
```

Only `deck` is ever *required*. `workspace` and `protocol-selection` are consumed by the
collector when published and are positionally guaranteed at their doors
(`ProjectWorkspacePage.tsx:80` mounts `WorkspaceProvider` above the door; `DeckHostPage.tsx:141`
mounts `ProtocolSelectionProvider` around the shell).

### 2.4 Why a STORE, not a React context

The defect class this item kills is positional: a bridge mounted one provider too high is
silently deaf (proven live on `ProjectSurfaceChat`, `ProjectWorkspacePage.tsx:120-129`). React
context only flows DOWN, so a "well-known context slot" implemented as another React context
reproduces the defect. The slot must be an app-level **store** the providers write into and the
registrar reads, exactly like the existing chat-registration store
(`app/src/shared/context/AiPanelContext.tsx:37-40`, `:95-111`, `useSyncExternalStore`).

Required shape (one new file, `app/src/shared/context/SurfaceSliceStore.tsx`):
- `usePublishSurfaceSlice(id, value)` — render-safe write (no setState), version bump on
  identity change, unsubscribe clears the slice on unmount.
- `useSurfaceSlices()` — subscribes the calling component to slice changes (mirrors
  `useRegistrationStore`, `AiPanelContext.tsx:167-174`).
- The store instance is created by `AiPanelProvider` (`AiPanelContext.tsx:70-128`) and read
  through the same context, so there is exactly ONE store per app tree and no module-global
  cross-test leakage.

### 2.5 The collector and the registrar

- `app/src/shared/lib/collectSurfaceContext.ts` (new, ONE function):
  `collectSurfaceContext({ host, base, slices, entry }) -> AiContext`. It merges published
  slices into `base.surfaceContext`, resolves the posted `surface` (a published slice may
  declare the surface it implies — the deck slice implies `event-editor`, which is how
  `project-deck-tab`'s deck branch keeps posting `event-editor` as it does today via
  `DeckSurfaceChat.tsx:97`), and returns the context. **It contains no host-name comparison.**
- `SurfaceChatBridge.tsx` (the ONE registrar) takes `host: ChatHostId` plus an optional `base`
  context (the page-local fields record/artifact/registry build today) and:
  1. resolves `entry = registry.hosts[host]` (build-time parse, §2.6);
  2. after mount, verifies every `required_providers` id is published; a missing one **throws**
     `ChatDoorMisconfiguredError(host, missing[])` — never a silent empty pane;
  3. wires `onProposalDrafted` / `onPreviewDiscarded` / `onPreviewAccept` / `onStagedExtras` /
     `onAcceptEvent` / `onDeckLayout` from the `deck` slice **only when `ghost_mount: true`**;
  4. calls `useSurfaceChat({ aiContext, endpoint, scope, ...handlers })` exactly once.
- The call sites pass a literal `host` id (6 literals in `app/src`). That is a door naming
  itself, not a host list: the list lives in YAML, and a contract test pins exact-set equality
  between the literals in `app/src` and the YAML ids (§8 T-1).

### 2.6 Consumption point, parse, and loud failure

The app reads the YAML at **build time** via a vite `?raw` import — the established precedent is
`app/src/shared/lib/participationConvention.ts:16-17` (`config/drafting/...yaml?raw` + `yaml`
parse). Parse ONCE at module load (the registry is static, not caller-parameterized — the
per-call parse in `participationConvention` exists because that parser takes a caller-supplied
convention), and throw naming the path on malformed YAML. A YAML typo therefore cannot reach
production: the contract test (§8 T-1) runs in CI, and the module throws at import.

### 2.7 Schema / lint placement — decided

- **No `schema/` change.** `schema/` governs governed record datatypes
  (`schema/core/collection.schema.yaml`, `context.schema.yaml`, …); a chat-door registry is
  lane/harness config, not a record type, and the harness already validates it at runtime
  (`check-gate.py:70-97`, fail-closed).
- The lint IS a contract test, placed beside its sibling:
  `app/src/shared/config/chatDoorRegistry.contract.test.ts`. House precedent:
  `chatHostInventory.contract.test.ts` and `shorthandDraftingSurfaces.contract.test.ts` are the
  repo's "opened in DATA, pinned by a contract test" mechanism.
- The YAML file's own header must be corrected in this commit: `chat-hosts.yaml:9-11` currently
  claims "DECLARATION ONLY — ZERO behaviour branching. No product tsx/ts reads this for control
  flow." After this item the product DOES read it as the mount contract. Rewrite to the truth:
  the product reads it at build time as the mount contract; capability is DATA and no TypeScript
  branches on a host name. (A false header left standing is the same class of defect OBS-A
  exists to kill.)

---

## §3 OBS-A — MANDATORY: remove every false FROZEN/immutable enforcement claim

**Acceptance line (same commit as the OBS-B mechanism change):** every FROZEN/immutable
*enforcement* claim about `first_blessed_sha256` is removed from the three owned files, and the
truthful framing replaces it. Per the ruling (§4 OBS-A, lines 37): the anchor is a **DATA
tripwire against accidental/uncited rewrites**; a deliberate multi-field rewrite (anchor moved
with the crime) is **not** stopped by the guard and is policed by adversarial review + trunk
merge. No immutable claim may return unless an authority OUTSIDE the writable worktree actually
enforces it.

Sites to rewrite (each read at `ff53e5a8`; 18 lines total):

| file | lines | what it claims today |
|---|---|---|
| `config/chat/chat-hosts.manifest.yaml` | `:22-31` | "FROZEN FIRST-BLESS ANCHOR … It is itself FROZEN — the immutable reference" |
| same | `:33-46` | "the ORIGINAL (first) bless and is FROZEN … the frozen id set" |
| `.hermes/plans/harness/l2-trunk-journeys/chat-hosts-shrink-guard.py` | `:12-35` (module docstring) | "is the ORIGINAL bless and is FROZEN"; "the FROZEN `first_blessed_sha256` anchor" |
| same | `:143-169` (`shrink_guard` docstring) | "FROZEN: the guard ASSERTS …"; "the FROZEN first-bless anchor"; "off the FROZEN first bless" |
| same | `:196-205`, `:208-210`, `:213`, `:217`, `:222` (comments + the `no-anchor` message) | "the FROZEN FIRST-BLESS ANCHOR"; "no frozen first_blessed_sha256"; "IS the frozen first-bless set"; "GROWTH off the FROZEN first bless" |
| same | `:281-283` (the `no-anchor` cause string) | "carries no FROZEN first-bless anchor" |
| `.hermes/plans/harness/l2-trunk-journeys/README.md` | `:183-184` | "the FROZEN first bless, the guard pins it against the frozen `first_blessed_sha256` DATA anchor" |

Required truthful sentence (adapt wording, keep the substance — all four clauses):
> `first_blessed_sha256`/`first_blessed_ids` are DATA carried in the same writable manifest. The
> guard uses them as a **tripwire**: an accidental or uncited rewrite of the blessed set goes
> RED. A deliberate rewrite that moves the anchor together with the blessed set is NOT stopped
> by this guard; that class is policed by adversarial review and the trunk merge
> (decisions/CHATHOST-SWEEP-c3-cyclecap-l2t1805.md).

Grep gate (must return zero lines):
```
git -c core.fileMode=false grep -n "FROZEN\|immutable\|frozen" -- \
  config/chat/chat-hosts.manifest.yaml \
  .hermes/plans/harness/l2-trunk-journeys/chat-hosts-shrink-guard.py \
  .hermes/plans/harness/l2-trunk-journeys/README.md
```
(The word may not be "replaced by a softer synonym" while keeping the enforcement claim — the
claim, not the token, is what must go.)

**Do not touch history.** `first_blessed_sha256` also appears in
`.hermes/plans/handoffs/2026-11-02_1540-…md` and `…1850-…md`. Handoffs are historical records;
rewriting them is falsifying the trail. Three files only.

---

## §4 OBS-B — DESIGN DECISION (made here): option (i), anchor the first-bless ID SET

The ruling (§4 OBS-B, line 39) requires this spec to decide the anchor-authority question at the
YAML-consumption point among three enumerated options. **Decision: (i)** — permanently accept
tripwire semantics and additionally anchor the first-bless **ID SET**.

### 4.1 Why not (ii) or (iii)

- **(ii) git/trunk-base authority** — the ruling already measured its cost and rejected the
  path (ruling §2, line 21): the manifest does not exist at its own declared `base_sha`
  `4bea98a5` (first added at `aab0114e`), git history is amendable from inside the worktree, and
  non-git `/tmp` fixtures break the 75-arm selfcheck, forcing a fail-open/fail-closed policy that
  re-opens the hole through `--repo-root`. Nothing has changed since.
- **(iii) compare against TRUNK's blessed manifest at merge time** — it only fires at merge
  time, i.e. it re-implements the authority the ruling already identified as the real one
  (adversarial review + trunk merge), and it cannot run in the hermetic selfcheck (no trunk ref
  in `/tmp` fixtures). Cost without coverage.

### 4.2 Why (i) — and what it fixes that nothing else does

The surviving defect after SWEEP-1 is **c3 D3: the removed-set is unrecoverable on the
authorized path.** Verified first-hand at `ff53e5a8` (probe P-1 in §7): a *consistent* top-level
rewrite (top-level `blessed_ids` trimmed, `blessed_sha256` re-set, anchor left honest, plus a
spec-cited `blessed_records` entry) returns `(True, [], None, <spec>)` — the guard authorizes
the shrink and **names no dropped host**, because `removed` is derived from the rewritten
top-level set (`chat-hosts-shrink-guard.py:194-195`). The selfcheck encodes this as acceptable
today (`test-channel-selfcheck.py:1064-1066`: "the top level already FORGETS the dropped host,
so removed … is legitimately []").

Anchoring the first-bless ID SET closes it: derive `removed = first_blessed_ids − current_ids`,
so the dropped host is named on every path, including the authorized one.

### 4.3 The mechanism (binding shape)

1. Add `first_blessed_ids:` to `config/chat/chat-hosts.manifest.yaml` — the original six ids,
   written once, in the same block as `first_blessed_sha256` (`:31`).
2. Guard invariant: `canonical_sha(first_blessed_ids) == first_blessed_sha256`, else fail closed
   (`reason: "anchor-invariant"`). This makes the anchor set self-checking and costs no new
   vocabulary.
3. Missing or empty `first_blessed_ids` → fail closed (`reason: "no-anchor-set"`), same posture
   as the current missing-anchor branch (`:206-210`).
4. `removed` is computed from the ANCHOR set, not from the top-level set: `sorted(set(first_blessed_ids) - set(current_ids))`.
   Every existing GREEN/RED decision is unchanged; only the *reported removed set* widens.
5. Authorization is unchanged: still only a `blessed_records` entry whose `blessed_sha256`
   equals the current inventory sha, whose `blessed_ids` reproduce it, and whose `bless_note`
   cites a real spec (§5).
6. **Honesty:** this is still a tripwire. A tamper-capable actor rewrites the anchor set too.
   §3's prose must say exactly that — option (i) does not license a single word of enforcement
   language.

### 4.4 Consequences the coder must carry in the same commit

- `test-channel-selfcheck.py:1069-1072` asserts `sg_rm8 == []` for the consistent-rewrite arm;
  under (i) it must assert `sg_rm8 == [dropped]` and its comment (`:1064-1066`) must be rewritten
  to say the anchor set is what remembers the dropped host.
- Every selfcheck fixture manifest that builds a `dict(manifest, ...)` now needs
  `first_blessed_ids` (or deliberately omits it for the `no-anchor-set` RED arm). Enumerate the
  CHATHOST arms (24 `CHATHOST` occurrences in the file) rather than patching until green.
- `check-gate.py` needs **no change** — it imports `shrink_guard` and prints the returned
  `removed` list (`:312-327`).

### 4.5 OQ1 — ratification only (not a coin flip)

**OQ1 (orchestrator ratify):** adopt option (i) with `first_blessed_ids` as specified. The
trade-off is one-way on the evidence above — (i) is the only option that closes D3 without a
bootstrap matrix, and the ruling already retired (ii). It is raised as an OQ only because the
architect explicitly asked CONSOLIDATE-1 to *make* the decision, and because it changes a
selfcheck arm's expected value. If the orchestrator prefers zero manifest-schema growth, the
fallback is (i-minus): keep the sha anchor and derive `removed` from the UNION of top-level
`blessed_ids` and every `blessed_records[].blessed_ids` — cheaper, but it cannot name a host
dropped by a rewrite that also dropped its record, so it only half-closes D3.

---

## §5 OBS-C — `spec_cited` restricted to real spec trees

Current behaviour (`chat-hosts-shrink-guard.py:102-126`): any whitespace token that looks
path-ish and EXISTS under the repo authorizes a deletion. **Verified hole (probe P-3):** a
5-host inventory plus a re-bless record citing
`.hermes/plans/harness/l2-trunk-journeys/README.md` returns
`(True, ['registry-host'], None, '.hermes/plans/harness/l2-trunk-journeys/README.md')` — the
guard's own README authorizes the crime (c3 D4, reproduced first-hand).

New rule (binding):
- A candidate token must be repo-relative, EXIST, **and** match exactly one of:
  - `.hermes/plans/<basename>-spec.md` — top level only (no further `/` after
    `.hermes/plans/`), basename ending `-spec.md`;
  - `specifications/**`;
  - `docs/**`.
- Explicitly rejected even when they exist: `.hermes/plans/harness/**`,
  `.hermes/plans/decisions/**`, `.hermes/plans/handoffs/**`, `.hermes/plans/reviews/**`,
  `config/**`, and any bare `.md` outside the three roots.
- File-exists stays as the backstop. Keep the return shape `(cited, path)` — callers
  (`shrink_guard:240-242`, `check-gate.py:312-327`) are unchanged.
- The three real trees exist at this tip: `.hermes/plans/` (161 `*-spec.md` files),
  `specifications/`, `docs/`.

Acceptance (all three, in the same commit):
1. Probe P-3's README citation → `(False, None)`; the shrink is RED.
2. `.hermes/plans/2026-11-02_0500-L2-CHATHOST-SWEEP-1-spec.md` (today's `good_spec`,
   `test-channel-selfcheck.py:1017`) → still `(True, …)` GREEN.
3. New selfcheck arms: a `decisions/` citation → RED; a `docs/` citation → GREEN; a
   `.hermes/plans/<name>-spec.md` citation → GREEN.

---

## §6 Evidence debt from SWEEP-1 — named leg, with its acceptance command

**Debt (verified at this tip):** `check-gate.py --chat-hosts` fails closed because
`CL_RECEIPTS/latest` points at the legacy journey run `20261101T151312Z`, whose `run-meta.json`
carries no `chat_host_verdicts` table. Measured first-hand:

```
$ python3 .hermes/plans/harness/l2-trunk-journeys/check-gate.py --chat-hosts
BLOCKER: run /home/brad/.hermes/cl/receipts/L2-TRUNK-JOURNEYS/20261101T151312Z declares no
chat_host_verdicts table — a chat-host sweep run must be graded against the inventory
(Change 2: fail closed)
GATE-VERDICT blocking
EXIT=1
```

**LEG-C6-SWEEP-DEBT.** Produce ONE compliant 6-host sweep run whose `run-meta.json` satisfies
BOTH gate axes on the same `latest`:
- `verdicts` exactly equal to the declared journey set (`journeys/J1,J2,J3`), `fake_mode: true`,
  `fake_restore.restore_ok: true`, `app_base: http://localhost:5193` — the no-flag gate's
  contract (`check-gate.py:459-479`, `:504-527`);
- `chat_host_verdicts` with all six inventory ids, each
  `{"verdict": "accept", "receipts": "<file that exists>"}` — the chat axis contract
  (`check-gate.py:245-251`, `:270-283`).

**Why it must be ONE run and not a standalone sweep dir:** the tick gate reads `latest` and
requires an exact-set journey verdict table; a sweep-only run that owned `latest` would block
every claim in the lane. So the sweep rides the ONE driver's existing run shape
(`run-journeys.py --all --fake`, run-meta written at `:844-875`, flip only after the A2 restore
grades OK, `:799-809`, `:882`), not a second runner. Mechanism (binding, no parallel harness):
add a `--chat-hosts` flag to `run-journeys.py` that, inside the same run dir, drives each
inventory host once through the existing browser executor (`ui-drive.cjs`), writes one receipt
per host carrying the request body + rendered answer, and appends `chat_host_verdicts` to
`run-meta.json` BEFORE the flip. The probe prompt's canned completion is DATA in
`canned/completions.yaml` (keying contract at `:6-9`: a block is matched by
`prompt_contains`) — one `CHATHOST-SWEEP` block serves all six hosts; no per-host code.

A fake-mode run is honest here: the fake sits on the BACKEND side of `/api/ai/**` and "the
browser wire is untouched" (`run-journeys.py:915-918`) — every host verdict is a real browser
round trip through the real HTTP stack with deterministic model content.

**Acceptance command (orch-run, post-merge, live stack on :5193/:3093):**
```
cd /mnt/vast/home/brad/git/cl-integration-2
python3 .hermes/plans/harness/l2-trunk-journeys/run-journeys.py --all --fake --chat-hosts
python3 .hermes/plans/harness/l2-trunk-journeys/check-gate.py --chat-hosts   # expect exit 0
python3 .hermes/plans/harness/l2-trunk-journeys/check-gate.py               # expect exit 0
```
Expected stdout, both gates, same run dir:
`GATE-VERDICT green (chat-host sweep covers the full inventory; shrink-guard clean)` and
`GATE-VERDICT green`.

Coder-side, no live claims: the selfcheck gains an arm proving the driver emits
`chat_host_verdicts` for every inventory id from a synthetic sweep fixture, and that a
five-host table from the same emitter exits 1 naming the missing host.

---

## §7 PIN TABLE — every line read first-hand at `ff53e5a8`

Probes were executed by the composer (read-only copies in `/tmp`); no repo file was modified.

| # | pin | what it establishes |
|---|---|---|
| 1 | `config/chat/chat-hosts.yaml:72` `hosts:`; `:73,84,93,106,114,122` the six ids | the door set is exactly six, ids as tabled in §1.2 |
| 2 | `config/chat/chat-hosts.yaml:9-11` | "DECLARATION ONLY … No product tsx/ts reads this for control flow" — the claim this item falsifies (§2.7) |
| 3 | `config/chat/chat-hosts.yaml:56-69` | the exclusion block (dead pages + legacy `useRegisterAiChat` generation) — §1.2 scope |
| 4 | `config/chat/chat-hosts.manifest.yaml:20,31,47-53,70,72` | `blessed_sha256`, `first_blessed_sha256`, `blessed_ids`, `bless_note`, `base_sha` |
| 5 | `config/chat/chat-hosts.manifest.yaml:22-31,33-46` | the false FROZEN prose OBS-A removes |
| 6 | `chat-hosts-shrink-guard.py:64-68` `canonical_sha` (ids only) | additive entry fields cannot change the sha (§2.2) |
| 7 | `chat-hosts-shrink-guard.py:71-82` `inventory_ids` (`hosts[].id` only) | same |
| 8 | `chat-hosts-shrink-guard.py:191-195` invariant + `removed = blessed - cur` | D3's root: removed derives from the top-level set |
| 9 | `chat-hosts-shrink-guard.py:206-243` anchor + `blessed_records` authorization | OBS-B/OBS-C edit sites |
| 10 | `chat-hosts-shrink-guard.py:102-126` `spec_cited` | OBS-C edit site |
| 11 | `check-gate.py:70-97` `load_chat_host_inventory` (id + surface required) | the five existing keys must survive (§2.1) |
| 12 | `check-gate.py:245-251`, `:258-264`, `:270-283`, `:284-286` | chat axis: verdicts table, trunk rule, receipt-file existence, grading |
| 13 | `check-gate.py:297-328` shrink-guard import + BLOCKER | guard change needs no gate change |
| 14 | `check-gate.py:459-479`, `:504-527` | no-flag gate: exact-set journey verdicts, restore, `fake_mode` — §6's one-run requirement |
| 15 | `check-gate.py:543-544` dispatch on `--chat-hosts` | axis entry point |
| 16 | `test-channel-selfcheck.py:1017` `good_spec` | the citation that must stay GREEN under OBS-C |
| 17 | `test-channel-selfcheck.py:1064-1066` + the `sg_rm8 == []` arm | the expectation OBS-B (i) inverts |
| 18 | `test-channel-selfcheck.py:1113-1120` | prints `SELFCHECK: PASS`, exit 0 (run: PASS, 75 arms, exit 0) |
| 19 | `README.md:172-174`, `:176-213`, `:183-184` | harness file list + the FROZEN prose + the chat axis contract |
| 20 | `run-journeys.py:799-809`, `:844-875`, `:882`, `:915-922`, `:961-963` | flip-after-restore, run-meta shape, fake is backend-side, run dir naming |
| 21 | `canned/completions.yaml:6-9`, `:19`, `:21` | `prompt_contains` keying; adding a block = adding DATA |
| 22 | `app/src/shared/shell/SurfaceChatBridge.tsx:82-97` | today's registrar: `aiContext` prop + one `useSurfaceChat` |
| 23 | `app/src/agent/useSurfaceChat.ts:33-55` | one hook registers chat + proposal flow (`useRegisterAiChat` at `:52`) |
| 24 | `app/src/shared/context/AiPanelContext.tsx:37-40`, `:95-111`, `:167-174`, `:209-245` | the store pattern the slice store mirrors; `useRegisterAiChat` throws without a provider (`:211`) |
| 25 | `app/src/event-editor/deck/DeckSurfaceChat.tsx:42-130`, `:132-134`, `:148-169`, `:184-196`, `:198-234`, `:240-249` | the deck projection, ghost mount, adoption, `onDeckLayout`, scope, focus publish — the behaviour the collector must reproduce |
| 26 | `app/src/run/RunSurfaceChatBridge.tsx:39-62`, `:70-88`, `:90-116`, `:130-144` | selectedWells threading, adoption, scope, focus publish (incl. the exactOptionalPropertyTypes `detail` rule) |
| 27 | `app/src/event-editor/projects/ProjectWorkspacePage.tsx:80-87`, `:101-131` (`:129` stand-down), `:260-284`, `:287-298` | the two-mount host; the execution branch with no door |
| 28 | `app/src/shared/shell/DeckHostPage.tsx:129-155` | deck route: `EventEditorProvider` at `:130` → `DeckSurfaceChat` at `:139`, `ProtocolSelectionProvider` at `:141` |
| 29 | `app/src/shared/shell/{Record,Artifact,Registry}HostPage.tsx:39-56 / :39-49 / :36-51` | the three prop-built contexts (no slice needed) |
| 30 | `app/src/run/RunWorkspacePage.tsx:113`, `:168` | the run door mount site |
| 31 | `app/src/shared/lib/participationConvention.ts:16-17` | the `?raw` + parse precedent for reading config YAML in the app |
| 32 | `app/src/shared/config/chatHostInventory.contract.test.ts:37,46-72` | the contract-test precedent + the fields it pins |
| 33 | `app/package.json:10` (`typecheck: tsc --noEmit`), `:11` (`test: vitest run`) | verification commands |
| 34 | **P-1** guard probe: consistent top-level rewrite + spec-cited record → `(True, [], None, <spec>)` | D3 is real at this tip (OBS-B §4.2) |
| 35 | **P-2** guard probe on a modified copy of `chat-hosts.yaml` (added `slices:` + per-host `required_providers`/`ghost_mount`) → ids unchanged, sha `dcf32649…75156b` unchanged, guard `(True, [], None, None)` | additive fields need no re-bless |
| 36 | **P-3** guard probe: 5-host inventory + record citing the harness `README.md` → `(True, ['registry-host'], None, '.hermes/plans/harness/l2-trunk-journeys/README.md')` | OBS-C's hole, reproduced |
| 37 | measured `npx tsc --noEmit` at `ff53e5a8` → **10** errors (list in §8 V-2) | the typecheck baseline the coder must not move |
| 38 | measured `test-channel-selfcheck.py` at `ff53e5a8` → `SELFCHECK: PASS`, exit 0 | harness baseline |

---

## §8 RED-first tests, verification, boundaries, open questions

### 8.1 First targeted check — the single command that proves the approach early

Run BEFORE and AFTER the first edit to `config/chat/chat-hosts.yaml`:

```
cd /mnt/vast/home/brad/git/cl-integration-2
python3 .hermes/plans/harness/l2-trunk-journeys/chat-hosts-shrink-guard.py; echo "rc=$?"
```
Expected, both times:
```
SHRINK-GUARD green (current sha=dcf326497e83976112405fde5396113659301cf715032591fd103af33875156b; no blessed host dropped)
rc=0
```
If the sha or the verdict moves, the additive-fields assumption is wrong — STOP and report, do
not "fix" the manifest. (Proven viable by P-2; this re-proves it in the coder's own tree.)

### 8.2 RED-first tests (write them failing first)

**T-1 `app/src/shared/config/chatDoorRegistry.contract.test.ts` (new).** RED before the YAML
fields exist; GREEN after. Pins, all read from DATA, no TS copies:
1. every host entry carries `required_providers`, `optional_providers`, `ghost_mount` (total
   declaration, empties allowed);
2. every id in any `required_providers`/`optional_providers` is declared in `slices:`;
3. every `slices[].publisher` file exists (path before `:line`);
4. slice ids ∩ host ids = ∅ and slice ids ∩ `surface:` values = ∅ (three vocabularies stay
   disjoint);
5. exact-set equality between YAML host ids and the `host="…"` literals in `app/src`
   (a grep over source at test time — this is what replaces per-host bridges as the anti-drift
   pin);
6. the six `surface:` values are unchanged from today (`run-workspace`, `event-editor`,
   `analysis` ×4).

**T-2 `app/src/shared/shell/SurfaceChatBridge.door.test.tsx` (new).** RED first: mount the
registrar with `host="run-workspace"` and no `deck` slice published → expect a throw of
`ChatDoorMisconfiguredError` whose message names `run-workspace` AND `deck`. Then publish the
slice → the registered chat's `AiContext` carries the deck fields (parity with the retargeted
`DeckSurfaceChat.test.tsx` pins: labwares, events, `selectedWells` object form, deck fields).

**T-3 retarget, never delete, the existing pins** (each currently names a component being
retired; the assertions are the regression net for this refactor):
- `app/src/event-editor/deck/DeckSurfaceChat.test.tsx:74,93,112` — parity core fields,
  `selectedWells` shape, labware-editor parity.
- `app/src/event-editor/deck/DeckSurfaceChat.ghost.test.tsx:247,307` — ghost mount + pane Apply;
  revise-turn remount + revision trail.
- `app/src/event-editor/deck/DeckSurfaceChat.threadScope.test.tsx:212,308` — `x-cl-thread-scope`
  on get/append, re-key on navigation, no header when unsaved.
- `app/src/event-editor/deck/DeckSurfaceChat.deckLayout.uifix1.test.tsx:201,244,277,319` —
  `deck_layout` applies via native actions; manifest guard refuses; no false wall.
- `app/src/run/RunSurfaceChatBridge.focus.test.tsx:179,190,201` — focus publish, and the
  ABSENCE of the `detail` key when no step is focused.
- `app/src/shared/shell/{Registry,Artifact,Record}HostPage.surfaceChat.test.tsx:146/119/124` —
  working pane; `Registry…:185` dots-only scope refusal.
Keep the file names (provenance); add one header line: "retargeted from <old component> —
assertions unchanged".

**T-4 harness selfcheck arms** (`test-channel-selfcheck.py`): OBS-B (`no-anchor-set` → RED;
anchor-set/`first_blessed_sha256` mismatch → RED; consistent rewrite authorized → `removed`
NAMES the dropped host) and OBS-C (README citation → RED; `decisions/` → RED; `docs/` → GREEN;
top-level `*-spec.md` → GREEN) and §6 (synthetic sweep emits all six ids → gate green; five-host
table → exit 1 naming the host).

### 8.3 Verification commands with expected output

```
# V-1 app tests (touched pins + new contract/door tests)
cd /mnt/vast/home/brad/git/cl-integration-2/app
npx vitest run src/shared/config/chatDoorRegistry.contract.test.ts \
  src/shared/shell/SurfaceChatBridge.door.test.tsx \
  src/event-editor/deck/DeckSurfaceChat.test.tsx \
  src/event-editor/deck/DeckSurfaceChat.ghost.test.tsx \
  src/event-editor/deck/DeckSurfaceChat.threadScope.test.tsx \
  src/event-editor/deck/DeckSurfaceChat.deckLayout.uifix1.test.tsx \
  src/run/RunSurfaceChatBridge.focus.test.tsx \
  src/shared/shell/RegistryHostPage.surfaceChat.test.tsx \
  src/shared/shell/ArtifactHostPage.surfaceChat.test.tsx \
  src/shared/shell/RecordHostPage.surfaceChat.test.tsx
# expect: all files green, 0 failed

# V-2 typecheck — baseline MEASURED first-hand at ff53e5a8: 10 errors, byte-identical required
cd /mnt/vast/home/brad/git/cl-integration-2/app
npx tsc --noEmit 2>&1 | grep -E "^src/.*error TS" | sort > /tmp/app-tsc-after.txt
# expect diff EMPTY against this measured list:
#   src/event-editor/deck/LawnSurface.moveAcross.test.tsx(47,5) TS2353 runDeckLock
#   src/event-editor/deck/PreviewActionBar.test.tsx(108,5) TS2353 runDeckLock
#   src/event-editor/editorHistory.test.ts(176,34) TS2345 load_event_graph_success
#   src/event-editor/editorHistory.test.ts(199,37) TS2345 load_event_graph_success
#   src/event-editor/EventEditorContext.tsx(1525,29) TS2339 equipments
#   src/event-editor/focus/LabwareFocus.instrument.test.tsx(47,5) TS2353 runDeckLock
#   src/event-editor/viewer/ViewerToolbar.tsx(55,13) TS2322 protocol-review
#   src/event-editor/viewer/Viewer.tsx(65,13) TS2322 protocol-review
#   src/ingestion/components/IngestionUploadModal.tsx(232,23) TS2554 2 args
#   src/ingestion/protocol-review/ExtractionProgressPanel.test.tsx(9,19) TS6133 fireEvent

# V-3 server untouched (expect 0)
cd /mnt/vast/home/brad/git/cl-integration-2/server && npx tsc --noEmit

# V-4 harness selfcheck (baseline: PASS, exit 0, 75 arms; must stay PASS with the new arms)
cd /mnt/vast/home/brad/git/cl-integration-2
python3 .hermes/plans/harness/l2-trunk-journeys/test-channel-selfcheck.py | tail -1
# expect: SELFCHECK: PASS

# V-5 shrink-guard (sha unchanged, green)
python3 .hermes/plans/harness/l2-trunk-journeys/chat-hosts-shrink-guard.py

# V-6 OBS-A prose gate (expect NO output)
git -c core.fileMode=false grep -n "FROZEN\|immutable\|frozen" -- \
  config/chat/chat-hosts.manifest.yaml \
  .hermes/plans/harness/l2-trunk-journeys/chat-hosts-shrink-guard.py \
  .hermes/plans/harness/l2-trunk-journeys/README.md

# V-7 acceptance (a) — retired components gone from product AND test sources
git -c core.fileMode=false grep -n "DeckSurfaceChat\|RunSurfaceChatBridge\|ProjectSurfaceChat" -- app/src
# expect: NO output

# V-8 no TS host-name switches
git -c core.fileMode=false grep -nE "=== *'(run-workspace|event-editor|project-deck-tab|record-host|artifact-host|registry-host)'" -- app/src
# expect: NO output (the `host` prop is passed to a data lookup, never compared)

# V-9 §6 leg (orch, post-merge, live stack)
python3 .hermes/plans/harness/l2-trunk-journeys/run-journeys.py --all --fake --chat-hosts
python3 .hermes/plans/harness/l2-trunk-journeys/check-gate.py --chat-hosts   # exit 0
python3 .hermes/plans/harness/l2-trunk-journeys/check-gate.py               # exit 0
```

### 8.4 Boundaries — files the coder MAY touch

DATA / harness:
- `config/chat/chat-hosts.yaml` (additive keys + `slices:` + header-prose correction)
- `config/chat/chat-hosts.manifest.yaml` (OBS-A prose; `first_blessed_ids`)
- `.hermes/plans/harness/l2-trunk-journeys/chat-hosts-shrink-guard.py` (OBS-A docstring/comments,
  OBS-B anchor set, OBS-C `spec_cited`)
- `.hermes/plans/harness/l2-trunk-journeys/README.md` (OBS-A prose; sweep-leg documentation)
- `.hermes/plans/harness/l2-trunk-journeys/test-channel-selfcheck.py` (new arms)
- `.hermes/plans/harness/l2-trunk-journeys/run-journeys.py` (`--chat-hosts` sweep mode)
- `.hermes/plans/harness/l2-trunk-journeys/canned/completions.yaml` (one sweep block)
- `check-gate.py` — expected UNCHANGED; any change needs a stated reason in the report.

App (product):
- `app/src/shared/context/SurfaceSliceStore.tsx` (new — store + publisher hook)
- `app/src/shared/lib/collectSurfaceContext.ts` (new — the ONE collector)
- `app/src/shared/shell/SurfaceChatBridge.tsx` (the ONE registrar)
- `app/src/event-editor/EventEditorContext.tsx` (publish the `deck` slice)
- `app/src/event-editor/workspace/WorkspaceContext.tsx`, `app/src/event-editor/protocol/ProtocolSelectionContext.tsx`
  (publish their slices — only if the collector consumes them)
- `app/src/shared/shell/{DeckHostPage,RecordHostPage,ArtifactHostPage,RegistryHostPage}.tsx`,
  `app/src/run/RunWorkspacePage.tsx`, `app/src/event-editor/projects/ProjectWorkspacePage.tsx`
  (call-site changes)
- DELETE `app/src/run/RunSurfaceChatBridge.tsx`, `app/src/event-editor/deck/DeckSurfaceChat.tsx`
- `app/src/shared/context/AiPanelContext.tsx` (ONLY to host the slice store instance)
- tests listed in §8.2 + the new ones.

**OUT OF SCOPE (hard):** `server/**`; `schema/**`; `config/drafting/**`; `useAiChat.ts`
semantics; `useSurfaceChat.ts` semantics beyond what §2.5 needs; the legacy
`useRegisterAiChat` pages named in §1.2; `docs/`; `specifications/`; `.hermes/plans/decisions/**`;
handoffs; receipts under `~/.hermes/cl/receipts/`.

### 8.5 Worker contract

- Worktree: `/mnt/vast/home/brad/git/wt/L2-CHATHOST-CONSOLIDATE-1-lane2-<tick>` off the lane
  trunk (`cl/integration-2`) at claim time.
- Branch: `cl/lane2-chathost-consolidate-1-l2t<tick>`.
- Report: `/home/brad/.hermes/cl/lanes/2/deliverables/CHATHOST-CONSOLIDATE-1-report.l2t<tick>.md`
  — must carry: V-1..V-8 raw output, the OBS-A before/after line counts per file, the P-2-style
  sha proof in the coder's own tree, and an explicit statement of what was NOT verified live.
- Marker on completion: `CHATHOST-CONSOLIDATE-1 DONE <full sha>`.
- No live browser claims by the coder: (c)/(d) are orch-run post-merge (§6 + re-gate).

### 8.6 Open questions

- **OQ1 (ratify, §4.5):** option (i) + `first_blessed_ids`. One-way on the evidence; raised
  because it changes a selfcheck arm's expected value and grows the manifest schema.
- **OQ2 (genuinely two-way):** `required_providers` is per HOST, so it cannot express "the
  `deck` slice is required only on `project-deck-tab`'s deck branch". Recommended: accept
  `required_providers: []` + `optional_providers: [deck]` there and let the retargeted deck
  parity pins (T-3) be the branch's guard; the alternative is a per-mount `doors:` schema, which
  breaks `check-gate.py:70-97` and the contract test in the same commit. Checked: both mount
  sites and the stand-down rule (`ProjectWorkspacePage.tsx:82`, `:129`, `:280`).
- **OQ3 (no action requested):** the `execution` branch (`ProjectWorkspacePage.tsx:287-298`)
  mounts `EventEditorProvider` with no chat door. Parity preserved (no door added). If the lane
  wants a door there it is a new inventory host and a re-bless — out of scope for this item.

---

## §9 Reviewer bait — pre-empt these

1. **exactOptionalPropertyTypes.** Every optional field must be conditionally spread, never
   `undefined`-assigned. The live precedent is `RunSurfaceChatBridge.tsx:130-144` (`detail` is
   ABSENT, not `undefined`) and `SurfaceChatBridge.tsx:94` (`...(safe ? { scope } : {})`). The
   collector's `AiContext` merge and the registrar's `useSurfaceChat` options must follow the
   same rule — `useAiChat`'s option type is exact-optional, and a `detail: undefined` fails
   `tsc` AND changes the pane's rendering.
2. **YAML-reload trap.** `config/chat/*.yaml` is imported at BUILD time by the app
   (`?raw`), so the vite dev server must be restarted after editing it — `tsx --watch` does not
   reload YAML (lane binding, task-list `:70`). The harness scripts read it per run (no restart).
   The coder must restart before any local browser check and say so in the report.
3. **The store is not a React context.** If the slice slot is implemented with `createContext`,
   the LEG-F defect returns: a registrar above `EventEditorProvider` cannot see a context
   published below it. Only a store (write + subscribe) makes mount position irrelevant.
4. **Do not delete a pin.** `DeckSurfaceChat*.test.tsx` / `RunSurfaceChatBridge.focus.test.tsx`
   are the only coverage of ghost mount, adoption, thread scope, deck-layout apply and the focus
   box. Deleting them with the component is acceptance-evasion and will be caught.
5. **Do not re-bless.** Additive YAML fields leave the sha untouched (P-2). Appending a
   `blessed_records` entry "to be safe" is a false statement that the host set changed and
   destroys the anchor's meaning.
6. **OBS-A is not a find-and-replace.** Removing the token "FROZEN" while leaving "the guard
   pins it against the immutable anchor" is the same false claim in new words. The claim is what
   must go.
7. **Two terms for one entity.** Do not add `providers`, `slices_required`, `chat_hosts` or a
   second host list beside `required_providers`; do not introduce a second verdict table name
   beside `chat_host_verdicts`; do not name a slice after a host id or a surface id.
8. **Hardcode boundary.** No host-name `if`/`switch` in TS, no guard constant holding the
   blessed ids or the anchor (the ruling §2 forbids it), no TS copy of the slice vocabulary.
   The truth lives in `config/chat/chat-hosts.yaml`.
9. **Never fabricate evidence.** (c)/(d)/(e) are live legs. A report that claims a :5193 sweep
   without a receipt file per host will be checked by `check-gate.py:270-283`, which requires
   each receipt to EXIST on disk.
10. **`latest` ownership.** A run without the journey verdict table must never own `latest`
    (`check-gate.py:459-479`). A standalone sweep dir that flips `latest` blocks the whole lane.


---

## §13 ORCHESTRATOR PROMOTION NOTE (l2t0255)

- Promotion happened at claim-readiness, NOT at dispatch: the item is still `todo` and unclaimed. The
  spec is canonical so the next tick can claim and dispatch in one step without re-drafting.
- Promoted pins are valid at trunk `8814ae52`. When the item is actually claimed, re-run the four pin
  checks (a)-(d) from the l2t1805 audit against the then-current tip before the coder starts — the
  CHATHOST-CONSOLIDATE-1 block in `lanes/2/task-list.md` lists them.
- Boundary note carried from the draft: this item adds FIELDS to the six existing host entries; it must
  not add, remove or rename a host (the shrink guard hashes ids only, so added fields are sha-neutral —
  that is a property to preserve, not a licence to restructure the inventory).
