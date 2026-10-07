/**
 * useWorkstateProposalFlow — PB-CH-6: the ONE compile→card→accept/reject
 * implementation, lifted verbatim from AiTabPanel's inline orchestration
 * (PB-CH-4 §5 / PB-CH-5's adapter parameter) so every mount rides the same
 * machinery. The fork detector: `grep -rn compileWorkstateDraft app/src` must
 * show this file as the ONLY call site (AiTabPanel consumes the flow).
 *
 * The trust rule lives here unchanged: a tier-2 proposal is an INTENT relayed
 * verbatim; POST /api/drafts/compile (Ajv + canAccept) is the trust boundary.
 * No accept control exists until the server says canAccept:true. Accept is
 * the actor-bound compiled draft through the single writer
 * (`useWorkstateExecutor.applyAcceptedWorkstate` — consumed, zero hunks) with
 * the {accepted:true} attestation + identity driving the duplicate guard.
 * Reject is abandon: zero store calls, zero fetches. ZERO AI calls during
 * accept, ever.
 *
 * NOT lifted (PB-CH-6 extraction ruling): AiTabPanel's `workstateTurnRef`
 * turn flag and its `sendChat` choke point — they guard the AiTabPanel turn
 * model, not the flow, and stay in AiTabPanel.
 */
import { useCallback, useRef, useState } from 'react'
import { apiClient } from '../api/client'
import { useWorkstateExecutor } from '../session/useWorkstateExecutor'
import type {
  WorkstateCardDiagnostic,
  WorkstateCardPhase,
  WorkstateCardTab,
  WorkstateCardTerm,
} from '../../event-editor/right-pane/ai/WorkstateProposalCard'
import type { AiAgentActionEnvelope } from '../../types/ai'

/** Registered compiled-composition adapters (config/drafting/adapters.yaml).
 *  The adapter is a PARAMETER of the flow — a second adapter is one constant
 *  at the call site, never a second flow. */
export type WorkstateAdapter = 'workstate' | 'analysis'

/**
 * The mount-side card state. Mirrors WorkstateProposalCard's props so a mount
 * holds at most ONE pending proposal (the component stays presentational; the
 * phase vocabulary is imported from the card, never re-declared here).
 */
export interface WorkstateProposalCardState {
  phase: WorkstateCardPhase
  summary?: string
  tabs?: WorkstateCardTab[]
  resolvedTerms?: WorkstateCardTerm[]
  diagnostics?: WorkstateCardDiagnostic[]
  draftId?: string
  revision?: number
}

export interface WorkstateProposalFlow {
  /** The single pending card (null = no proposal in flight). */
  card: WorkstateProposalCardState | null
  /** Relay a tier-2 INTENT to POST /api/drafts/compile (THE trust boundary). */
  proposeWorkstate: (adapter: WorkstateAdapter, intent: Record<string, unknown>) => Promise<void>
  /** Accept = the actor-bound compiled draft through the single writer. */
  acceptWorkstate: () => Promise<void>
  /** Reject = abandon: zero store calls, zero fetches, identity cleared. */
  rejectWorkstate: () => void
  /** Tier-1: narrow a compiled agent_action envelope and hand it to the
   *  executor; an unroutable frame is a NAMED diagnostic, never a guess. */
  handleAgentAction: (action: AiAgentActionEnvelope) => string | undefined
}

export function useWorkstateProposalFlow(): WorkstateProposalFlow {
  // The executor is CONSUMED (PB-CH-3): its optional-provider diagnostics
  // (NO_TAB_STORE / NO_FOCUS_PROVIDER) are the conservative shape — no
  // fallbacks are added here.
  const executor = useWorkstateExecutor()

  // At most one pending draft identity lives in the ref; a newer proposal
  // supersedes an in-flight compile and a late response for a superseded
  // compile is DISCARDED (never resurrected).
  const [card, setCardState] = useState<WorkstateProposalCardState | null>(null)
  const cardRef = useRef<WorkstateProposalCardState | null>(null)
  const pendingDraftRef = useRef<{ draftId: string; revision: number; reviewHash: string } | null>(null)
  const compileSeqRef = useRef(0)

  const setCard = useCallback((next: WorkstateProposalCardState | null) => {
    cardRef.current = next
    setCardState(next)
  }, [])

  const proposeWorkstate = useCallback(
    async (adapter: WorkstateAdapter, intent: Record<string, unknown>) => {
      const seq = compileSeqRef.current + 1
      compileSeqRef.current = seq
      setCard({ phase: 'compiling' })
      const pending = pendingDraftRef.current
      try {
        const res = await apiClient.compileWorkstateDraft({
          adapter,
          intent,
          ...(pending ? { draftId: pending.draftId, revision: pending.revision } : {}),
        })
        if (seq !== compileSeqRef.current) return // superseded — discard
        pendingDraftRef.current = { draftId: res.draftId, revision: res.revision, reviewHash: res.reviewHash }
        const result = (res.result ?? {}) as {
          sessionDocument?: { tabs?: Array<{ kind?: unknown; title?: unknown }> }
          summary?: unknown
          resolvedTerms?: unknown
        }
        const docTabs = Array.isArray(result.sessionDocument?.tabs) ? result.sessionDocument?.tabs : undefined
        const terms = Array.isArray(result.resolvedTerms) ? (result.resolvedTerms as WorkstateCardTerm[]) : undefined
        setCard({
          phase: res.canAccept ? 'review' : 'blocked',
          ...(typeof result.summary === 'string' ? { summary: result.summary } : {}),
          ...(docTabs
            ? {
                tabs: docTabs.map((t) => ({
                  kind: typeof t.kind === 'string' ? t.kind : String(t.kind ?? ''),
                  ...(typeof t.title === 'string' ? { title: t.title } : {}),
                })),
              }
            : {}),
          ...(terms ? { resolvedTerms: terms } : {}),
          ...(res.diagnostics.length > 0 ? { diagnostics: res.diagnostics } : {}),
          draftId: res.draftId,
          revision: res.revision,
        })
      } catch (error) {
        if (seq !== compileSeqRef.current) return // superseded — discard
        setCard({
          phase: 'blocked',
          diagnostics: [{ message: error instanceof Error ? error.message : 'The compile failed — nothing was written.' }],
        })
      }
    },
    [setCard],
  )

  // Accept = the actor-bound compiled draft through the single writer. The
  // request carries ONLY {draftId, revision, reviewHash}; the server returns
  // the STORED compiled result (the client can never resubmit a document).
  // ZERO AI calls here, ever — no /ai/assist/stream, no re-propose, no
  // "confirmation pass".
  const acceptWorkstate = useCallback(async () => {
    const identity = pendingDraftRef.current
    const current = cardRef.current
    if (!identity || !current || current.phase !== 'review') return
    try {
      const body = await apiClient.acceptWorkstateDraft({
        draftId: identity.draftId,
        revision: identity.revision,
        reviewHash: identity.reviewHash,
      })
      const outcome = executor.applyAcceptedWorkstate(body, { accepted: true }, identity)
      if (outcome.ok) {
        // Spent card: controls disappear (no dead buttons). The accepted apply
        // pushes exactly once through useSessionSync's existing debounced effect.
        pendingDraftRef.current = null
        setCard({ ...current, phase: 'applied' })
        return
      }
      // Nothing moved: the card stays rejectable with the diagnostics visible.
      setCard({
        ...current,
        phase: 'blocked',
        diagnostics: outcome.diagnostics.map((d) => ({ code: d.code, message: d.message })),
      })
    } catch (error) {
      setCard({
        ...current,
        phase: 'blocked',
        diagnostics: [{ message: error instanceof Error ? error.message : 'Accept failed — nothing was written.' }],
      })
    }
  }, [executor, setCard])

  // Reject = abandon. There is NO reject endpoint (PB-CH-2 §6): zero store
  // calls, zero fetches, the pending identity cleared.
  const rejectWorkstate = useCallback(() => {
    pendingDraftRef.current = null
    compileSeqRef.current += 1 // any in-flight compile is now superseded
    setCard(null)
  }, [setCard])

  const handleAgentAction = useCallback(
    (action: AiAgentActionEnvelope): string | undefined => {
      // Narrow to the executor's typed tier-1 shape (no `as any`): a frame the
      // compiler could not have produced (open-surface without a registered
      // surface, focus without a target) is a visible diagnostic, not a guess.
      const targetRef = action.target && 'id' in action.target ? action.target : undefined
      const tier1 =
        action.action === 'open-surface'
          ? action.surface
            ? { action: 'open-surface' as const, surface: action.surface, ...(targetRef ? { target: targetRef } : {}) }
            : null
          : action.target
            ? { action: 'focus' as const, target: action.target }
            : null
      if (!tier1) {
        return 'Agent action carried no routable target — nothing was written.'
      }
      const outcome = executor.executeTier1(tier1)
      if (outcome.ok) {
        return undefined
      }
      // Conservative diagnostics are CORRECT behavior — surface the text.
      return outcome.diagnostics.map((d) => d.message).join(' ') || 'The action was not applied — nothing was written.'
    },
    [executor],
  )

  return { card, proposeWorkstate, acceptWorkstate, rejectWorkstate, handleAgentAction }
}
