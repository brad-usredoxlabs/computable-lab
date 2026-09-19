# Protocol worldview — the layers, the pipelines, and where each one lives

Status: **proposal for ratification** (2026-09-19). Written after reading the
schemas, the routes, and the live records; every count below is a snapshot of the
running appliance (`/api/records?kind=…`), not an estimate.

This document exists because the protocol machinery grew as several parallel
attempts at the same idea. It states one coherent model, names the layers, and
says which surface owns which job. Companion: `.hermes/plans/2026-09-19_121028-protocol-pipeline-consolidation.md`
(the phased cleanup).

---

## 1. The five layers (this part of the mental model was already right)

A protocol is not one thing. It is five records at five levels of commitment.
Each level already has its own schema and its own id prefix — nothing new has to
be invented, the model just has to be *named* and *enforced* in the UI.

| # | Layer | Record `kind` | Id prefix | What it is | Produced by | Lives in |
|---|-------|---------------|-----------|------------|-------------|----------|
| 1 | Document truth | `vendor-protocol-candidate`, `protocol-decision-tree`, `subgraph-proposal` | *(candidate: none persisted)*, `PDT-`, `SGP-` | What the vendor's document actually says, with page/section provenance, plus the document's if/then question set and one realization per branch combination | vendor-PDF extraction (`/intake` corpus loop) | `schema/workflow/{vendor-protocol-candidate,protocol-decision-tree,subgraph-proposal}.schema.yaml` |
| 2 | AI draft | `extraction-draft` (+ audit `extraction-promotion`) | `XDR-`, `XPR-` | AI-proposed candidate records pending human review, with confidence + ambiguity spans | extraction jobs / `/extraction` review | `schema/workflow/{extraction-draft,extraction-promotion}.schema.yaml` |
| 3 | Global recipe | `protocol` | `PRT-` / legacy `PRO-`, `CAN-protocol-*` | The reusable, lab-independent recipe: `protocolLayer: "universal"`, `humanStepsText` + machine `steps[]` | human authoring; promotion of layer 1/2 | `schema/workflow/protocol.schema.yaml` |
| 4 | Lab realization | `local-protocol` | `LPR-` | THIS lab's decisions: equipment bindings, parameter refinements, material substitutions, setup rows. `protocolLayer: "lab"`, `inherits_from` the global | authoring / compile-time specialization | `schema/workflow/local-protocol.schema.yaml` |
| 5 | This run | `planned-run` + `event-graph` | `PLR-`, `EVG-` | The run's intent (roles bound to concrete labware/materials/instruments) and the method deck it executes. **Realization is per protocol STEP**, cached as step sub-graphs (`GET /api/protocols/{runId}/steps/{stepId}/graph`) | attaching a protocol in the run workspace (`apiClient.useProtocolInRun`) | `schema/workflow/{planned-run,event-graph}.schema.yaml` |

Two supporting vocabularies already exist and should be kept, not duplicated:
`phase-template` (stable phase identity so event-graph node anchors survive
re-compiles) and the per-step sub-graph cache in `ProtocolSelectionContext`.

Live snapshot (2026-09-19):

```
protocol                  7     (3 drafts from vendor PDFs, 2 hand-authored/approved, 2 seeds)
local-protocol            1
extraction-draft         16     (12 pending_review, 3 promoted, 1 rejected)
extraction-promotion      3
vendor-protocol-candidate  0     (candidates are not persisted as records today)
protocol-decision-tree   13     (12 with axisCount 0 — scale variants only)
subgraph-proposal        48
planned-run               9
event-graph              74     (48 of them EVG-PDT-* branch realizations, never used by a run)
protocol-ide-session      0     (unused)
phase-template            0     (unused)
```

The two facts that matter most from that snapshot:

1. **Only two protocols have ever been used by a run** — `PRT-4iaey2` (PureLink
   Genomic DNA Extraction) and `PRT-g5zy9e` (CellROX), both `approved`, both
   hand-authored by `USR-BRAD` (`createdBy` set, no extraction provenance).
2. **Neither automated pipeline has produced an approved protocol.** The
   extraction-draft path produced three `CAN-protocol-*` records, all still
   `state: draft`, none referenced by any `planned-run`. The intake path
   produced 48 branch realizations and 48 draft event graphs, none attached to a
   run.

---

## 2. The two pipelines (this is what the mental model was missing)

Both pipelines answer the same question — "turn a vendor document into something
this lab can run" — and today both are reachable from the UI with nothing
telling a biologist which one they are in.

**P1 — the extraction-draft pipeline (older)**

```
vendor PDF (VPDF-*)
  → extraction job → extraction-draft (XDR-*): candidates[] + confidence
  → /extraction (+ /extraction/review/:recordId): human review, promote
  → extraction-promotion (XPR-*): audit link draft → canonical record
  → protocol (CAN-protocol-<ts>) with source: {type: vendor, ref: VPDF-*}
  → /ingestion/vendor-pdf/:recordId: AI candidate → candidateToProtocolPayload
    → TapTab protocol authoring (PDF | editable protocol) → Save = "accept,
    promote to a usable protocol"
```

Strength: the only path with a real **authoring + promotion surface** (the
TapTab protocol editor you like) and an audit trail.
Weakness: single-shot AI extraction with no branch model, and the surface that
hosts it replaces the whole app surface (no tab strip).

**P2 — the corpus/intake pipeline (newer)**

```
vendor PDF
  → vendor-protocol-candidate: sections/steps/tables with page provenance
  → protocol-decision-tree (PDT-*): the document's if/then question set (axes)
  → subgraph-proposal (SGP-*): one realization per (branch combination × scale)
  → draft event-graph (EVG-PDT-*)
  → /intake (+ /intake/:treeId): tree queue, branch-path table, prompt + redraft
```

Strength: provenance, deterministic branch enumeration, scale axes, and a
**redraft loop** (`POST …/proposals/:id/prompt` attaches an instruction,
`…/redraft` re-drafts one subgraph) — i.e. the "AI follows up with if/then
clarifications" you described already exists, as a reviewable tree rather than a
chat.
Weakness: no authoring surface (it stops at proposal), and its axes are the
branches the *document* spells out per step, not the biological question.

**The missing axis.** `deriveBranchAxes.ts` (server) lifts each step's lettered
branches (a./b./c.) into one axis **per branchy step**. Its own header notes:
"Cross-step grouping of a shared axis (e.g. 'if bacterial' gating steps 1,3,5) is
a future enhancement." That is exactly the gap behind your DNA-kit example: the
ZymoBIOMICS 96 kit tree (D4303/D4307/D4309) is the only tree with axes at all —
2 axes → 12 proposals — and both axes are *deck/labware* if/thens (BashingBead
Lysis Rack vs ZR beads), not "cell culture / C. elegans / bacterial / buccal".
The ZymoBIOMICS DNA Miniprep tree (D4300) has `axisCount: 0`; it enumerates only
the three execution-scale levels. So "which variant are we extracting?" is not
yet a derivable question for these kits.

**Where the variant question belongs:** `schema/workflow/protocol-decision-tree.schema.yaml`
already declares axes as "logical branch axes lifted from the document (sample
source, kit version, labware) plus the execution-scale axis". Sample source is
in the schema's own words — the derivation has simply not learned to see it yet.

---

## 3. Surface inventory (who does what today)

| Surface | Route | Job | Tab strip? |
|---|---|---|---|
| Ingestion | `/ingestion` (+`/ingestion/:tab`) | vendor-PDF list, upload, corpus loop entry | yes |
| Vendor-PDF review | `/ingestion/vendor-pdf/:recordId` | PDF \| AI-extracted editable protocol, Save/Save-as → protocol | **no** |
| Extraction drafts | `/extraction`, `/extraction/review/:recordId` | review/promote `XDR-*` drafts (P1) | list only |
| Intake | `/intake`, `/intake/:treeId` | decision-tree queue, branch paths, prompt+redraft (P2) | yes |
| Protocol builder | `/protocol-builder` | standalone intake → extract → configure → draft → feedback → promote | no |
| Run workspace | `/runs/:runId` | left rail: Protocol (step rail + **attach**), Search, Details; right: permanent AI chat | yes |
| Artifact viewer | `/artifact/pdf/:artifactId`, `/artifact/document/:artifactId` | a PDF/document as its own tab | yes |
| Deck editor | `/deck/:eventGraphId/:runId?` | the method event graph as its own tab | yes |
| Right-pane Protocol tab | any host page | a *second* protocol picker + editor (`ProtocolTabPanel`) | host-dependent |

Structural note: the tab-hosting machinery already exists — the artifact and deck
hosts are full tab citizens with their own `WorkspaceTab` kinds, routes and
tab-strip rendering. `/ingestion/vendor-pdf/:recordId` is the only extraction
surface that renders bare, which is why opening it "disappears the tab system".

---

## 4. Decisions to ratify

**D1 — Protocol review becomes a first-class tab.** The PDF \| editable-protocol
surface moves under the tab strip (new `protocol-review` tab kind), so opening a
source document adds a tab instead of replacing the surface. Same pattern as
`ArtifactHostPage`/`DeckHostPage`.

**D2 — One authoring surface, one engine. RATIFIED 2026-09-19; `/protocol-builder`
is DEPRECATED.** `/ingestion/vendor-pdf/:recordId` (the surface you like, close to
the source document) becomes the single review-and-author surface; the intake
engine (candidate → decision tree → subgraph proposal → redraft) feeds it, so the
axes and provenance arrive as *questions at the top of the review surface*, and
Save promotes the branch-resolved result to a global protocol. `/protocol-builder`
is retired (its route redirects into the review surface once that surface can take
a URL or pasted text — Phase 2.5); `/extraction` becomes an audit list or is
retired. This supersedes `specifications/protocol-extraction-to-execution-flow.md`'s
"`/protocol-builder` is the canonical flow" — that doc now carries a superseded
banner rather than being deleted.

**D3 — Sample-source axes are derived, not asked.** `deriveBranchAxes` gains
cross-step axis grouping so the same conceptual question asked in steps 1/3/5
becomes ONE axis ("Which sample source? cell culture / tissue / bacterial /
buccal"), with options carrying document provenance. Acceptance: the ZymoBIOMICS
DNA Miniprep tree (D4300) gains a sample-source axis with ≥3 options, and its
proposal count becomes options × scale levels instead of 3.

**D4 — One protocol surface per workspace. RATIFIED 2026-09-19.** The run
workspace's left rail owns attach AND change (both landed — commits `e02ff910`,
`0076db4b`). The right-pane `ProtocolTabPanel` keeps protocol *record* editing but
its picker is retired; its empty state points at the rail.

**D5 — Name the layer in the UI.** Every protocol-family surface shows which of
the five layers it is editing (Document truth · AI draft · Global · Lab · This
run). A biologist should never have to guess whether they are looking at the
kit's instructions or their lab's version of them.

---

## 5. Non-goals

- No new record kinds. Every layer above already has a schema; this is naming,
  wiring and one derivation improvement.
- No CRDT/multi-user editing of protocols.
- Not deleting the intake trajectory data: trees, proposals and `EVG-PDT-*`
  graphs stay as corpus evidence for the moat even after D2 lands.
