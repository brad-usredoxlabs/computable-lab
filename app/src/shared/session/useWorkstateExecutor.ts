/**
 * useWorkstateExecutor — the ONE client executor hook (PB-CH-3).
 *
 * Wires the pure core (workstateExecutor) to the live seams:
 *  - useOptionalOpenTabs()  — null outside a provider ⇒ NO_TAB_STORE (conservative,
 *    no window-hack fallback — OQ3 resolution; PB-CH-4 owns any fallback strategy);
 *  - useNavigate()          — the router side of openContent / tab adoption;
 *  - useSurfaceRegistry()   — null until loaded ⇒ diagnostics, never a throw;
 *  - useProtocolSelection() — null outside a provider ⇒ NO_FOCUS_PROVIDER path;
 *  - useApplySessionDocument() — the ONLY writer (OpenTabsContext.replaceState).
 *
 * Tier 2 (applyAcceptedWorkstate) enforces the accept contract in its API
 * shape: the {accepted:true} attestation is a REQUIRED argument, the accept
 * identity (draftId/revision/reviewHash — separate params, the response body
 * does not carry them) drives the duplicate guard, and the raw replaceState is
 * never re-exported. An unaccepted document therefore has no path into the tab
 * store, and the only push is useSessionSync's existing debounced state effect
 * (this hook performs ZERO putSession calls — the accepted apply pushes
 * exactly once through that effect, thanks to its payload-equality skip).
 */
import { useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOptionalOpenTabs } from '../shell/OpenTabsContext'
import { tabPath } from '../shell/WorkspaceTabStrip'
import { useSurfaceRegistry } from '../surfaces/registry'
import { useProtocolSelection } from '../../event-editor/protocol/ProtocolSelectionContext'
import { useApplySessionDocument } from './useSessionSync'
import { sessionDocumentToState, type SessionDocument } from './sessionYaml'
import { stableTabId } from './tabId'
import {
  peekAcceptGuard,
  recordAcceptedApply,
  applyTier1Action,
  planTier1Action,
  validateAcceptedWorkstate,
  type AcceptGuardKey,
  type AcceptedWorkstateIdentity,
  type ExecutorOutcome,
  type Tier1ActionLike,
} from './workstateExecutor'

export interface AcceptAttestation {
  accepted: true
}

export interface WorkstateExecutor {
  executeTier1(action: Tier1ActionLike): ExecutorOutcome
  applyAcceptedWorkstate(
    body: unknown,
    attestation: AcceptAttestation,
    identity: AcceptedWorkstateIdentity,
  ): ExecutorOutcome
}

export function useWorkstateExecutor(): WorkstateExecutor {
  const openTabs = useOptionalOpenTabs()
  const navigate = useNavigate()
  const registry = useSurfaceRegistry()
  const protocolSelection = useProtocolSelection()
  const applyDocument = useApplySessionDocument()

  // Executor-level duplicate guard (NOT an effect-level one: React StrictMode
  // double-mount would fight an effect-level guard, and the guard must not
  // suppress user edits after an accept — it guards executor applies only).
  const seenKeys = useRef(new Set<AcceptGuardKey>()).current

  const executeTier1 = useCallback(
    (action: Tier1ActionLike): ExecutorOutcome => {
      const plan = planTier1Action(action, registry)
      return applyTier1Action(plan, {
        openTabs,
        navigate,
        ...(protocolSelection ? { focusProtocolStep: protocolSelection.setFocusedStep } : {}),
      })
    },
    [registry, openTabs, navigate, protocolSelection],
  )

  const applyAcceptedWorkstate = useCallback(
    (body: unknown, attestation: AcceptAttestation, identity: AcceptedWorkstateIdentity): ExecutorOutcome => {
      // API-shape half of "only accepted proposals": the attestation is a
      // required typed argument; refusing without it is a diagnostic, not a
      // dialog. The push-side half is structural — a doc that never entered
      // the store can never reach the sync effect.
      if (!attestation || attestation.accepted !== true) {
        return {
          ok: false,
          kind: 'noop',
          diagnostics: [
            { code: 'ACCEPT_ATTESTATION_MISSING', message: 'applyAcceptedWorkstate requires an explicit { accepted: true } attestation', path: 'attestation' },
          ],
        }
      }
      if (peekAcceptGuard(identity, seenKeys) === 'duplicate') {
        return { ok: true, kind: 'duplicate-ignored', diagnostics: [] }
      }
      const validated = validateAcceptedWorkstate(body)
      if (!validated.ok) {
        // A malformed delivery must NOT consume the identity key (D1): the
        // key is recorded only after a successful apply below.
        return { ok: false, kind: 'noop', diagnostics: [validated.diagnostic] }
      }
      const doc: SessionDocument = validated.doc
      applyDocument(doc)
      recordAcceptedApply(identity, seenKeys)
      // The hook's dispatch is async, so the post-apply route is computed from
      // the SAME sessionDocumentToState result the hook just applied —
      // mirroring the adopt pattern (useSessionSync.ts activeTabPath).
      const next = sessionDocumentToState(doc, stableTabId)
      const active = next.tabs.find((t) => t.tab.id === next.activeTabId)
      const nextRoute = active ? tabPath(active.tab) : null
      if (nextRoute) navigate(nextRoute)
      return {
        ok: true,
        kind: 'replaced',
        ...(nextRoute ? { route: nextRoute } : {}),
        diagnostics: [],
      }
    },
    [applyDocument, navigate, seenKeys],
  )

  return { executeTier1, applyAcceptedWorkstate }
}
