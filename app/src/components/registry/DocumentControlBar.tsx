/**
 * QMS-6 — Signature-aware DocumentControlBar.
 *
 * The obsolete signature-unaware direct-state PUT path is GONE. Signature
 * required-ness comes ONLY from `transition.requires` (QMS-1A guard facts
 * populated by the lifecycle YAML) — there is no state/role policy in TS.
 *
 * Contract:
 *  - renders only for lifecycle-bearing records (plain TRR/CAL show no chrome);
 *  - a dirty editor disables every transition (save-first hint);
 *  - unguarded transition → plain updateRecord PUT, no prompt;
 *  - signature-gated transition → exactly ONE password modal; the minted
 *    signature id rides the PUT as body-top-level `signatureRefs`;
 *  - sign-ok / PUT-fail split: a failed PUT after a mint is NOT an applied
 *    approval — the rejection reason is surfaced, state refetched, and the
 *    orphan SIG shows as an ORPHAN in the receipt (never "applied");
 *  - STALE_SIGNATURE / SIGNED_CONTENT_CHANGED / SIGNATURE_TARGET_MISMATCH get
 *    their own instructions — NEVER a "wrong password" message.
 */

import { useEffect, useState } from 'react'
import { apiClient, isSignatureRejection } from '../../shared/api/client'
import { describeApiError } from '../../shared/api/errors'
import { SignaturePasswordModal, signatureRejectionInstruction } from './SignaturePasswordModal'
import { SignOffReceipt } from './SignOffReceipt'
import './DocumentControlBar.css'

type Transition = {
  event: string
  targetState: string
  label: string
  role: string
  allowed: boolean
  /** QMS-1A: declarative guard facts from the lifecycle YAML (present only when declared). */
  requires?: {
    signatureRequired: boolean
    signatureAction?: string
    differentPersonThan?: string
  }
}

interface DocumentControlBarProps {
  record: {
    recordId: string
    payload: Record<string, unknown>;
  }
  /** Editor has unsaved changes — every transition is blocked until saved. */
  dirty: boolean
  onStateChanged: () => void
}

// REG-1 D1: pill states differentiate via token CSS classes (see
// DocumentControlBar.css), never fixed palette shades. Unknown states fall
// back to the base pill.
const pillStates = new Set([
  'draft',
  'in_review',
  'approved',
  'effective',
  'superseded',
  'archived',
])

export function DocumentControlBar({ record, dirty, onStateChanged }: DocumentControlBarProps) {
  const lifecycleId = record.payload.lifecycleId as string | undefined
  const stateValue = record.payload.state as string | undefined
  const currentState = stateValue || 'draft'

  // Hooks must run before any conditional return (Rules of Hooks).
  const [transitions, setTransitions] = useState<Transition[]>([])
  const [loading, setLoading] = useState(false)
  const [advancing, setAdvancing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [signTarget, setSignTarget] = useState<Transition | null>(null)
  const [receiptKey, setReceiptKey] = useState(0)

  useEffect(() => {
    if (!lifecycleId) return
    setLoading(true)
    apiClient
      .getValidTransitions(record.recordId, lifecycleId)
      .then(data => setTransitions(data.transitions || []))
      .catch(() => setTransitions([]))
      .finally(() => setLoading(false))
  }, [record.recordId, lifecycleId])

  // Early return after all hooks.
  if (!lifecycleId) return null

  const refetch = () => {
    setReceiptKey(k => k + 1)
    apiClient
      .getValidTransitions(record.recordId, lifecycleId)
      .then(data => setTransitions(data.transitions || []))
      .catch(() => {})
  }

  const commitTransition = async (transition: Transition, signatureRefs?: string[]) => {
    setAdvancing(transition.event)
    setError(null)
    try {
      await apiClient.updateRecord(
        record.recordId,
        { ...record.payload, state: transition.targetState },
        ...(signatureRefs ? [{ signatureRefs }] : [])
      )
      onStateChanged()
      refetch()
    } catch (err) {
      // Sign-ok / PUT-fail split: the minted SIG stays (append-only) but is NOT
      // an applied approval. Surface the server's ACTUAL rejection and refetch.
      if (isSignatureRejection(err)) {
        const token = (
          ['STALE_SIGNATURE', 'SIGNED_CONTENT_CHANGED', 'SIGNATURE_TARGET_MISMATCH'] as const
        ).find(t => isSignatureRejection(err, t))
        setError(
          token
            ? signatureRejectionInstruction(token)
            : 'The signature was rejected by the server; no state change was made.'
        )
      } else {
        setError(`${describeApiError(err)} — the document's state did not change.`)
      }
      refetch()
    } finally {
      setAdvancing(null)
    }
  }

  const handleTransition = (transition: Transition) => {
    setError(null)
    if (transition.requires?.signatureRequired) {
      // ONE modal per signature-gated transition. The action comes from the
      // declarative guard fact; targetState separates the two gates that share
      // signatureAction 'approved' (RecordHandlers.ts:752-753).
      setSignTarget(transition)
      return
    }
    void commitTransition(transition)
  }

  const statePillClass = pillStates.has(currentState)
    ? `dcb__state-pill dcb__state-pill--${currentState}`
    : 'dcb__state-pill'
  const hasAllowedTransitions = transitions.some(t => t.allowed)
  const isTerminal = !hasAllowedTransitions && ['superseded', 'archived'].includes(currentState)

  return (
    <div data-testid="document-control-bar" className="dcb">
      <div className="dcb__card">
        <span className={statePillClass}>
          {currentState.replace(/_/g, ' ')}
        </span>
        {loading && <span className="dcb__note">Loading...</span>}
        {!loading && transitions.length === 0 && <span className="dcb__note">No transitions</span>}
        {!loading &&
          transitions.map(
            t =>
              // VISIBILITY RULE (QMS-1A permissive preview): the preview
              // evaluates guards with presentedSignatures: [] (LifecycleHandlers.ts:66),
              // so a signature-gated transition is ALWAYS allowed:false for every
              // actor. It is still actionable — the password modal mints the
              // signature. A transition hidden for a NON-signature reason (missing
              // role) stays hidden. The distinction is the declarative `requires`
              // fact, not TS policy.
              (t.allowed || t.requires?.signatureRequired === true) && (
                <button
                  key={t.event}
                  onClick={() => handleTransition(t)}
                  disabled={dirty || advancing !== null}
                  title={dirty ? 'Save changes first' : undefined}
                  className="dcb__btn"
                >
                  {t.label}
                </button>
              )
          )}
        {!loading && !hasAllowedTransitions && isTerminal && (
          <span className="dcb__terminal">This document is {currentState}</span>
        )}
        {dirty && (
          <span data-testid="save-first-hint" className="dcb__save-hint">
            Save changes first — transitions apply to the saved revision only.
          </span>
        )}
        {error && (
          <span data-testid="transition-error" className="dcb__error">
            {error}
          </span>
        )}
      </div>
      <div className="dcb__receipt">
        <SignOffReceipt recordId={record.recordId} refreshKey={receiptKey} />
      </div>
      <SignaturePasswordModal
        open={signTarget !== null}
        action={signTarget?.requires?.signatureAction ?? signTarget?.targetState ?? ''}
        targetState={signTarget?.targetState ?? ''}
        subjectRecordId={record.recordId}
        lifecycleId={lifecycleId}
        onCancel={() => setSignTarget(null)}
        onSuccess={signatureId => {
          const target = signTarget
          setSignTarget(null)
          if (target) void commitTransition(target, [signatureId])
        }}
      />
    </div>
  )
}
