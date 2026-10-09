# DRAFT — ai-drafting-and-ui-projection.md adoption table edit — PB-CH-9 Half B item 2

Status: **DRAFTED, PENDING ARCHITECT** — never merged by the worker.
Worker: cl-coder lane 2, dispatch l2t2355, 2026-10-09.

Target file: `specifications/ai-drafting-and-ui-projection.md` (tracked ONLY on `main`).
Drafted against the **b30b36dc COMMITTED text** (sha256 `894f902c6447d54455057671b84bb36ec5b7188a0dc1df7d22bd44438da377e2`,
121 lines; working copy in Brad's tree is byte-identical at check time — re-measured
2026-10-09), table at :96-103. Code cites re-read at lane-trunk code tip **c74c5214**.

## Table discipline preserved

- Rows stay in the table's own terse register (Surface | Adoption).
- Adoption is per-surface and honest. "Report unimplemented adapters as such" (:121) stays in
  force; anything the gate records blocked/absent is drafted as NOT adopted.
- Unadopted things stay unadopted: no existing row is deleted or upgraded by this draft. The
  `Generic AiDraftBar / record drafting` row (:102, "Legacy") and the
  `Sequence assays, endpoints, imports, knowledge` half of :103 stay exactly as written —
  the shipped PB-CH surfaces are NEW rows, not a reclassification of legacy surfaces.
- Terminology: the ledger concept is **workstate-snapshot** (PB-CH-7 decision :225); no row
  calls it a revision/record/history-record.

## Hunk — insert three rows after the "Cross-page invocation and composition" row (:101)

CURRENT (:101-:103):
> | Cross-page invocation and composition | Universal contract specified; runtime adoption must be tracked by surface and is not supplied by the first form adapter |
> | Generic AiDraftBar / record drafting | Legacy; migrate through a registered adapter in a later change |
> | Sequence assays, analysis, endpoints, imports, knowledge | Existing explicit structured review/manual controls; native projection is later work |

PROPOSED (:101 unchanged; new rows inserted between :101 and :102):
> | Cross-page invocation and composition | Universal contract specified; runtime adoption must be tracked by surface and is not supplied by the first form adapter |
> | Run workspace (AiTabPanel, `/runs/:runId`) | Adopted: tier-1 focus/open-surface applies on arrival after compile; tier-2 workstate composition is the Accept/Reject/revise card on the ONE shared flow+executor (`app/src/event-editor/right-pane/ai/AiTabPanel.tsx:574`, `app/src/shared/ai/useWorkstateProposalFlow.ts`, `app/src/shared/session/useWorkstateExecutor.ts`) |
> | Analysis (`/analysis`, AnalysisChatPanel) | Adopted for the analysis-composition card path on the SAME shared flow+executor (`app/src/analysis/AnalysisChatPanel.tsx:42`, `:72`); full AI-authored analysis through ghosted review remains later work |
> | Literature protocol-builder (`/literature?view=build`, PdfProtocolBuilder) | Adopted as the ONE generic consumer mount of the same shared flow+executor (`app/src/literature/PdfProtocolBuilder.tsx:137`); surface label `literature` per PB-CH-6 OQ1 ruling — note `literature` is NOT a registered surface id in `schema/registry/surfaces/surfaces.yaml` (10 ids at c74c5214), so a model proposing `knowledge` from this pane is registry-mapping, recorded not failed |
> | Workstate-ledger reattachment (query_workstate_history) | Adopted as a server-built tier-2 proposal: the ledger answer rides the SAME Accept/Reject/revise card with a server-built envelope from the stored workstate-snapshot (`server/src/ai/AgentOrchestrator.ts:2378`, `:2443`; `server/src/workspace-session/ledgerQuery.ts:95` `ServerBuiltWorkstateEnvelope`); no-history answers emit NO card and move nothing |

ARCHITECT NOTE (flagged, not resolved): the existing :103 row lists "analysis" among surfaces
whose "native projection is later work." The analysis CARD path is now shipped (row above);
whether to trim "analysis" from :103 or leave it (the ghosted-review half of analysis IS still
later work) is the architect's call. This draft does not edit :103.

## Honesty anchors for the rows above

- "Adopted" here means the shipped code path exists at c74c5214 AND the surfaces passed their
  own per-item browser gates (PB-CH-4/4b/5/6 accepted verdicts; PB-CH-8 merged at 55319ef2 with
  gate receipts `receipts/PB-CH-8/2026-10-08_ledgerfixed{,2c}` legs 2c+6 green per handoff
  2026-10-08_2350). The integrated PB-CH-9 gate re-proves behavior; it does not substitute for
  per-item verdicts (attribution rule, spec dependency gate 1).
- If the integrated gate records any leg NOT RUN-BLOCKED, the architect must downgrade the
  corresponding row to "partial/blocked" before merge — the manifest's disposition slots are
  the input for that call.
- The ledger row is drafted from MERGED code only (PB-CH-8 is an ancestor of the claim tip:
  `merge-base --is-ancestor 55319ef2 HEAD` green, re-measured at f9eba9cf). No unmerged
  internals are cited.
