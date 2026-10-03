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

const stateColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  in_review: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  effective: 'bg-emerald-100 text-emerald-700',
  superseded: 'bg-gray-100 text-gray-500 line-through',
  archived: 'bg-gray-100 text-gray-500 line-through',
}

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

  const stateColor = stateColors[currentState] || 'bg-gray-100 text-gray-700'
  const hasAllowedTransitions = transitions.some(t => t.allowed)
  const isTerminal = !hasAllowedTransitions && ['superseded', 'archived'].includes(currentState)

  return (
    <div data-testid="document-control-bar" className="mb-4">
      <div className="flex flex-wrap items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <span className={`text-sm font-medium px-2.5 py-1 rounded ${stateColor}`}>
          {currentState.replace(/_/g, ' ')}
        </span>
        {loading && <span className="text-sm text-gray-500">Loading...</span>}
        {!loading && transitions.length === 0 && <span className="text-sm text-gray-500">No transitions</span>}
        {!loading &&
          transitions.map(
            t =>
              t.allowed && (
                <button
                  key={t.event}
                  onClick={() => handleTransition(t)}
                  disabled={dirty || advancing !== null}
                  title={dirty ? 'Save changes first' : undefined}
                  className="text-sm px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-50"
                >
                  {t.label}
                </button>
              )
          )}
        {!loading && !hasAllowedTransitions && isTerminal && (
          <span className="text-sm text-gray-500">This document is {currentState}</span>
        )}
        {dirty && (
          <span data-testid="save-first-hint" className="text-sm text-orange-700">
            Save changes first — transitions apply to the saved revision only.
          </span>
        )}
        {error && (
          <span data-testid="transition-error" className="text-sm text-red-600">
            {error}
          </span>
        )}
      </div>
      <div className="mt-2">
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
