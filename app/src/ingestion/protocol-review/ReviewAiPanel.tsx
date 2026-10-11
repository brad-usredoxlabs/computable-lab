/**
 * ReviewAiPanel — the protocol-review host's right-pane chat (W2-9 §3 R2).
 *
 * Composed from the existing channel parts (the PB-CH-6 precedent, NOT
 * AiTabPanel dragged onto this page — it requires useWorkspace, which throws
 * outside WorkspaceProvider): useChatThread + MessageLog + ChatInput +
 * ChangesPanel protocol mode.
 *
 * SURFACE: sends on 'protocol-review' — the id registered in
 * schema/registry/surfaces/surfaces.yaml — so the server renders the grounded
 * review prompt (ATTACHED PROTOCOL block + protocol_edit instruction region)
 * when an attached protocol rides the context. Borrowing 'event-editor' or
 * 'workspace.deck' here would be the PROTO-AI-9 defect class (dishonest
 * telemetry + ungrounded prompts).
 *
 * GROUNDING: context.attachedProtocol is built from the OPEN extraction-draft
 * (XDR): recordId = the XDR id, sha = meta.contentSha (the lock token the
 * proposal binds to), steps = candidates[i].draft steps. steps.length === 0
 * => null attachedProtocol (identity alone is an invention invitation —
 * AiTabPanel.tsx:164-166 discipline) + a NAMED reason line.
 *
 * WRITE DISCIPLINE (propose-never-write): the panel itself contains NO write
 * call. The only write is the single post-Accept PUT inside
 * applyDraftProtocolEdit (R3). A protocolEdit whose protocolId is not the open
 * XDR is REFUSED visibly — chat cannot retarget writes. An error/refusal turn
 * never leaves an actionable Accept over an empty change list (PB-CH-4 D1).
 * No SourcesStrip, no RunInEventEditorButton, no warm chip, no promote
 * affordance — a chat column + review card, honest to this surface.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiClient } from '../../shared/api/client'
import { useChatThread } from '../../event-editor/right-pane/ai/useChatThread'
import { MessageLog } from '../../event-editor/right-pane/ai/MessageLog'
import { ChatInput } from '../../event-editor/right-pane/ai/ChatInput'
import { ChangesPanel, protocolEditDiffFrom } from '../../event-editor/right-pane/ai/ChangesPanel'
import type { AssistAttachedProtocol, AssistDraftResult } from '../../event-editor/right-pane/ai/assistStream'
import type { ProtocolEditDiff } from '../../event-editor/right-pane/ai/sidebarState'
// The ops ride the APPLIER type (AiTabPanel.tsx:38 precedent) — the schema,
// not TypeScript, is the vocabulary authority; this is a call-site mirror.
import type { ProtocolEditOp } from '../../event-editor/right-pane/protocol/protocolEditOps'
import { applyDraftProtocolEdit } from '../../event-editor/right-pane/protocol/applyDraftProtocolEdit'
import {
  describeWriteRejection,
  findSaidCandidate,
  findSemanticDraft,
  type SemanticDraftEnvelope,
  type SemanticDraftView,
} from './semanticDraft'
import './reviewAiPanel.css'

export interface ReviewAiPanelProps {
  /** The VPDF-* route id — the SAID artifact the open draft was built from. */
  recordId: string
  /** Fires after an accepted edit lands: the host bumps its draft nonce so both panes re-read the XDR. */
  onDraftApplied: () => void
}

interface DraftStep {
  stepId?: string
  label?: string
  ordinal?: number
  kind?: string
}

function draftSteps(draft: Record<string, unknown>): DraftStep[] {
  return Array.isArray(draft.steps) ? (draft.steps as DraftStep[]) : []
}

/**
 * The local discovery effect (duplication declared, spec §3 R1): the SAME
 * discovery shape the merged W2-8 page uses — listRecordsByKind('extraction-
 * draft') joined by source_artifact.id, plus the SAID candidate join. W2-8
 * exposes the join FUNCTIONS (semanticDraft.ts, reused read-only), not a
 * shared hook, so the effect lives here.
 */
function useOpenDraft(vpdfRecordId: string) {
  const [view, setView] = useState<SemanticDraftView | null>(null)
  const [said, setSaid] = useState<SemanticDraftEnvelope | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!vpdfRecordId) return
    let cancelled = false
    const load = async () => {
      let drafts: unknown[] = []
      let candidates: unknown[] = []
      try {
        drafts = (await apiClient.listRecordsByKind('extraction-draft', 200)).records
      } catch {
        drafts = []
      }
      try {
        candidates = (await apiClient.listRecordsByKind('vendor-protocol-candidate', 200)).records
      } catch {
        candidates = []
      }
      if (cancelled) return
      setView(findSemanticDraft(drafts, vpdfRecordId))
      setSaid(findSaidCandidate(candidates, vpdfRecordId))
      setLoaded(true)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [vpdfRecordId])

  return { view, said, loaded }
}

interface OpenProposal {
  diff: ProtocolEditDiff
  ops: ProtocolEditOp[]
  /** The sha the proposal was grounded on (the ATTACHED PROTOCOL sha the model
   *  cited). An Accept against a moved record STOPS — bait 6. */
  groundedSha?: string
}

export function ReviewAiPanel({ recordId, onDraftApplied }: ReviewAiPanelProps) {
  const { view, said } = useOpenDraft(recordId)

  // The ATTACHED protocol: the open draft IS the ground truth the model may
  // cite. No open draft, or a draft whose steps have not landed => null
  // (identity alone is an invention invitation) and a NAMED arm below.
  const attachedProtocol = useMemo<AssistAttachedProtocol | null>(() => {
    if (!view) return null
    const steps = draftSteps(view.draft)
    if (steps.length === 0) return null
    const meta = view.xdr.meta as { contentSha?: string; commitSha?: string } | undefined
    const sha = meta?.contentSha ?? meta?.commitSha
    return {
      recordId: view.xdr.recordId,
      ...(sha ? { sha } : {}),
      steps: steps.map((s, i) => ({
        stepId: s.stepId ?? `step-${i}`,
        ordinal: s.ordinal ?? i + 1,
        label: s.label ?? s.stepId ?? `step ${i + 1}`,
        ...(s.kind ? { kind: s.kind } : {}),
      })),
    }
  }, [view])

  const context = useMemo<Record<string, unknown>>(
    () => ({
      attachedProtocol,
      reviewContext: {
        sourceRecordId: recordId,
        ...(said ? { candidateRecordId: said.recordId } : {}),
        ...(view ? { draftRecordId: view.xdr.recordId, candidateIndex: view.candidateIndex } : {}),
      },
    }),
    [attachedProtocol, said, view, recordId],
  )

  const [proposal, setProposal] = useState<OpenProposal | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applyNote, setApplyNote] = useState<string | null>(null)

  const onDraftResult = useCallback(
    (result: AssistDraftResult) => {
      // W2-89 g2b-1/2 — THE WRITE-WALL REFUSAL (deterministic, server-side
      // policy: config/drafting/review-write-wall.yaml). A refusal turn
      // carries the server-built wording and NO proposal payload; the panel
      // shows the named refusal and closes any prior card — an Apply/Accept
      // card over a refused ask is the gate's hard-FAIL (g2b-1/2).
      if (result.refusal) {
        setProposal(null)
        setApplyError(null)
        setApplyNote(null)
        setRefusal(result.refusal.message)
        return
      }
      // R-Defect-1 / PB-CH-4 D1 class: a failed turn (schema rejection, model
      // failure — the error renders in the chat log via summarizeDraftResult)
      // must NEVER open an actionable review over an empty change list.
      if (result.error) {
        setProposal(null)
        setRefusal(null)
        setApplyError(null)
        return
      }
      const protocolEdit = result.protocolEdit
      if (!protocolEdit || !Array.isArray(protocolEdit.ops) || protocolEdit.ops.length === 0) {
        // A plain answer / notes-only turn: the chat log is its surface. No
        // review card, no Accept (the empty-accept defect class). The prior
        // turn's refusal banner is cleared too (advc-W289-l2t0525 DEFECT-3): a
        // non-refusal turn must not keep reporting the earlier refusal.
        setProposal(null)
        setRefusal(null)
        return
      }
      if (!view) {
        // No open draft = no target. Named refusal, zero writes.
        setProposal(null)
        setRefusal('There is no open draft to edit on this page — the proposal was not applied and nothing was written.')
        return
      }
      if (!attachedProtocol) {
        // No citable step ids (the draft has no steps yet): a proposal has no
        // ground truth to bind to. Named refusal, never an actionable Accept.
        setProposal(null)
        setRefusal('The open draft has no steps to cite — this proposal was not applied and nothing was written.')
        return
      }
      // BIND-WHAT-IS-OPEN: the target is the open XDR. A protocolId that names
      // anything else (e.g. a live PRT-*) is REFUSED — chat cannot retarget writes.
      if (protocolEdit.protocolId !== undefined && protocolEdit.protocolId !== view.xdr.recordId) {
        setProposal(null)
        setRefusal(
          `The proposal targets ${protocolEdit.protocolId}, not the open draft ${view.xdr.recordId}. ` +
            'Chat edits apply only to the draft open on this page — nothing was written.',
        )
        return
      }
      const snapshot = {
        steps: draftSteps(view.draft).map((s) => ({
          stepId: s.stepId ?? '',
          label: s.label ?? '',
          ...(s.kind ? { kind: s.kind } : {}),
        })),
        labwareRoles: [],
        instrumentRoles: [],
      }
      const diff = protocolEditDiffFrom(
        protocolEdit,
        {
          recordId: view.xdr.recordId,
          ...(typeof view.draft.title === 'string' ? { title: view.draft.title } : {}),
        },
        snapshot,
      )
      if (!diff) {
        // An unmappable envelope never opens an empty protocol review.
        setProposal(null)
        return
      }
      setRefusal(null)
      setApplyError(null)
      setApplyNote(null)
      setProposal({ diff, ops: protocolEdit.ops as ProtocolEditOp[], ...(attachedProtocol.sha ? { groundedSha: attachedProtocol.sha } : {}) })
    },
    [view, attachedProtocol],
  )

  const thread = useChatThread({
    surface: 'protocol-review',
    context,
    onDraftResult,
  })

  const handleAccept = useCallback(async () => {
    if (!proposal || !view || applying) return
    setApplying(true)
    setApplyError(null)
    try {
      const outcome = await applyDraftProtocolEdit(view.xdr.recordId, view.candidateIndex, proposal.ops, proposal.groundedSha)
      if (outcome.wrote) {
        setProposal(null)
        setApplyNote('Accepted — the draft was revised. The panes re-read it.')
        onDraftApplied()
      } else {
        setProposal(null)
        setApplyNote('Nothing to apply — the draft already says that.')
      }
    } catch (err) {
      // The stale-lock message rides through verbatim (applyDraftProtocolEdit
      // throws STALE_PROTOCOL_WRITE_MESSAGE; every other rejection shows its
      // machine-readable body). NO retry, NO re-propose.
      setApplyError(describeWriteRejection(err))
    } finally {
      setApplying(false)
    }
  }, [proposal, view, applying, onDraftApplied])

  const handleDiscard = useCallback(() => {
    setProposal(null)
    setApplyError(null)
    setApplyNote(null)
  }, [])

  const draftHasNoSteps = view !== null && attachedProtocol === null

  return (
    <section className="review-ai" data-testid="review-ai-panel" aria-label="Review assistant (protocol-review)">
      <header className="review-ai__header">
        <span className="review-ai__title">Ask about this draft</span>
        <span className="review-ai__hint">
          Proposals show as a review card — nothing is written until you Accept. Edits land on the draft (MEANT), never on the source document (SAID).
        </span>
      </header>

      <div className="review-ai__log">
        <MessageLog state={thread.state} />
      </div>

      {view === null ? (
        <div className="review-ai__arm" data-testid="review-ai-no-draft" role="status">
          No semantic draft is open for this document — the assistant can answer questions, but there is no draft to edit and no proposals can apply until one exists.
        </div>
      ) : draftHasNoSteps ? (
        <div className="review-ai__arm" data-testid="review-ai-no-steps" role="status">
          The open draft has no steps yet — the assistant has no citable step ids, so no protocol edits can be proposed until the draft is rebuilt.
        </div>
      ) : null}

      {refusal ? (
        <div className="review-ai__refusal" data-testid="review-ai-refusal" role="alert">
          {refusal}
        </div>
      ) : null}

      {proposal ? (
        <div className="review-ai__review">
          <ChangesPanel
            changes={[]}
            warnings={[]}
            protocolDiff={proposal.diff}
            applying={applying}
            {...(applyError !== null ? { applyError } : {})}
            onApply={() => void handleAccept()}
            onDiscard={handleDiscard}
          />
        </div>
      ) : null}

      {applyNote ? (
        <div className="review-ai__note" data-testid="review-ai-apply-note" role="status">
          {applyNote}
        </div>
      ) : null}

      <div className="review-ai__input">
        <ChatInput
          isStreaming={thread.isStreaming}
          onSend={(text) => void thread.send(text)}
          onStop={thread.stop}
          placeholder="Ask about the draft, or request a wording change…"
        />
      </div>
    </section>
  )
}
