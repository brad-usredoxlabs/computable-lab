/**
 * QMS-6 — SignaturePasswordModal: the ONE password modal per signature-gated
 * lifecycle transition.
 *
 * Password material lives ONLY in this component's local state and the single
 * `createSignature` request body (hard rule 4). It is cleared whenever the
 * modal opens (fresh subject) — never persisted to editor state, storage, or
 * logs. `targetState` is REQUIRED: both gates of
 * document-controlled-signing declare `signatureAction: approved`, so the two
 * signature gates are separated ONLY by the signature's targetState
 * (RecordHandlers.ts:752-753 SIGNATURE_TARGET_MISMATCH).
 */

import { useEffect, useState } from 'react'
import {
  apiClient,
  isReauthFailure,
  isSignatureRejection,
  type SignatureRejection,
} from '../../shared/api/client'
import { describeApiError } from '../../shared/api/errors'

interface SignaturePasswordModalProps {
  open: boolean
  /** Lifecycle guard fact (transition.requires.signatureAction), e.g. 'approved'. */
  action: string
  targetState: string
  subjectRecordId: string
  lifecycleId: string
  onCancel: () => void
  onSuccess: (signatureId: string) => void
}

/**
 * Token → instruction map (delta D5). These rejections mean "this signature no
 * longer fits this document", NEVER "wrong password" — the password verified,
 * the server refused the binding.
 */
export function signatureRejectionInstruction(token: SignatureRejection): string {
  switch (token) {
    case 'STALE_SIGNATURE':
      return 'The document changed after signing. Re-sign its current saved revision.'
    case 'SIGNED_CONTENT_CHANGED':
      return 'Save content edits first — a signed transition may only change state.'
    case 'SIGNATURE_TARGET_MISMATCH':
      return 'That signature belongs to a different transition. Sign again for this transition.'
  }
}

export function SignaturePasswordModal({
  open,
  action,
  targetState,
  subjectRecordId,
  lifecycleId,
  onCancel,
  onSuccess,
}: SignaturePasswordModalProps) {
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fresh open → wipe any prior password material and error state.
  useEffect(() => {
    if (open) {
      setPassword('')
      setError(null)
      setSubmitting(false)
    }
  }, [open])

  if (!open) return null

  const handleSubmit = async () => {
    if (submitting || !password) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await apiClient.createSignature({
        action,
        subjectRecordId,
        lifecycleId,
        targetState,
        password,
      })
      // Success: hand back the minted id; the password leaves local state now.
      setPassword('')
      onSuccess(result.signatureId)
    } catch (err) {
      // QMS-3 finding: check isReauthFailure BEFORE describeApiError, whose
      // generic 403 copy would otherwise swallow "wrong password" into a
      // project-ownership message.
      if (isReauthFailure(err)) {
        setError('Password rejected — re-authentication failed. Nothing was signed.')
        setSubmitting(false)
        return
      }
      if (isSignatureRejection(err)) {
        const token = (['STALE_SIGNATURE', 'SIGNED_CONTENT_CHANGED', 'SIGNATURE_TARGET_MISMATCH'] as const).find(
          t => isSignatureRejection(err, t)
        )
        setError(token ? signatureRejectionInstruction(token) : 'The signature was rejected.')
        setSubmitting(false)
        return
      }
      setError(describeApiError(err))
      setSubmitting(false)
    }
  }

  return (
    <div
      data-testid="signature-password-modal"
      role="dialog"
      aria-label="Sign transition"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="w-96 max-w-[90vw] rounded-lg bg-white p-5 shadow-xl">
        <h2 className="text-base font-semibold text-gray-900">
          Sign to move to {targetState.replace(/_/g, ' ')}
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          This transition is signature-gated (action: {action}). Re-authenticate with your
          password — the signature binds this record&apos;s current saved revision.
        </p>
        <label htmlFor="signature-password-input" className="mt-4 block text-sm font-medium text-gray-700">
          Password
        </label>
        <input
          id="signature-password-input"
          type="password"
          value={password}
          autoFocus
          disabled={submitting}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') void handleSubmit()
          }}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
        />
        {error && (
          <p data-testid="signature-modal-error" className="mt-3 text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={submitting || !password}
            className="rounded bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {submitting ? 'Signing...' : 'Sign'}
          </button>
        </div>
      </div>
    </div>
  )
}
