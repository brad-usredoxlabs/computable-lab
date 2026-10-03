/**
 * QMS-6 — signature-aware DocumentControlBar guard-branch tests.
 *
 * The bar's signature-required-ness comes ONLY from transition.requires
 * (QMS-1A declarative guard facts). No TS policy inference: the tests assert
 * that the bar NEVER prompts when requires is absent/signatureRequired=false,
 * ALWAYS prompts once (and only once) per signature-gated transition,
 * mints WITH targetState, and maps each server rejection token to its own
 * instruction — never to a "wrong password" message.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react'
import { DocumentControlBar } from './DocumentControlBar'
import { ApiError } from '../../shared/api/errors'

// ---------------------------------------------------------------------------
// apiClient mock — keep the REAL isReauthFailure / isSignatureRejection
// predicates (they are the contract under test), replace only the client.
// ---------------------------------------------------------------------------

const mocked = vi.hoisted(() => ({
  getValidTransitions: vi.fn(),
  updateRecord: vi.fn(),
  createSignature: vi.fn(),
  listRecordsByKind: vi.fn(),
}))

vi.mock('../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/client')>()
  return {
    ...actual,
    apiClient: {
      getValidTransitions: mocked.getValidTransitions,
      updateRecord: mocked.updateRecord,
      createSignature: mocked.createSignature,
      listRecordsByKind: mocked.listRecordsByKind,
    },
  }
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const docRecord = {
  recordId: 'DOC-DEMO-SOP',
  payload: {
    kind: 'controlled-document',
    recordId: 'DOC-DEMO-SOP',
    title: 'Demo SOP',
    lifecycleId: 'document-controlled-signing',
    state: 'in_review',
  },
}

const unguardedTransition = {
  event: 'SUBMIT_FOR_REVIEW',
  targetState: 'in_review',
  label: 'Submit for review',
  role: 'author',
  allowed: true,
}

const gatedApproveTransition = {
  event: 'APPROVE',
  targetState: 'approved',
  label: 'Approve',
  role: 'reviewer',
  allowed: true,
  requires: { signatureRequired: true, signatureAction: 'approved' },
}

function signatureApiError(token: string, message: string, status: number): ApiError {
  // Wire shape (RecordHandlers.ts:747-753): { error: TOKEN, message } with NO
  // `code` field — ApiError.fromResponse puts the token into the message and
  // degrades code to HTTP_<status>. Mirror exactly that.
  return new ApiError({ status, code: `HTTP_${status}`, message: `${token}: ${message}` })
}

function reauthError(): ApiError {
  return new ApiError({ status: 403, code: 'HTTP_403', message: 'REAUTH_FAILED: Re-authentication failed' })
}

function emptyReceipt() {
  mocked.listRecordsByKind.mockImplementation(async (kind: string) => {
    if (kind === 'signature') return { records: [], total: 0 }
    if (kind === 'audit-event') return { records: [], total: 0 }
    return { records: [], total: 0 }
  })
}

beforeEach(() => {
  // mockReset (not clearAllMocks): clears the queued once-implementations too,
  // so an unconsumed mockRejectedValueOnce from one test can never leak into
  // the next test's updateRecord/createSignature calls.
  mocked.getValidTransitions.mockReset()
  mocked.updateRecord.mockReset()
  mocked.createSignature.mockReset()
  mocked.listRecordsByKind.mockReset()
  mocked.getValidTransitions.mockResolvedValue({ transitions: [] })
  mocked.updateRecord.mockResolvedValue({ record: { recordId: docRecord.recordId, schemaId: 'x', payload: {} }, validation: { valid: true, errors: [] }, lint: { valid: true, violations: [] } })
  mocked.createSignature.mockResolvedValue({
    success: true,
    signatureId: 'SIG-NEW-1',
    subject: {
      recordId: docRecord.recordId,
      revisionRef: { kind: 'record', type: 'record-revision', id: 'REV-1' },
      contentHash: 'abc123',
    },
  })
  emptyReceipt()
})

afterEach(() => {
  cleanup()
})

function renderBar(overrides: Partial<{ dirty: boolean }> = {}) {
  return render(
    <DocumentControlBar
      record={docRecord}
      dirty={overrides.dirty ?? false}
      onStateChanged={vi.fn()}
    />
  )
}

// ---------------------------------------------------------------------------

describe('DocumentControlBar — unguarded transitions', () => {
  it('requires absent → direct PUT, NO signatureRefs, NO password modal', async () => {
    mocked.getValidTransitions.mockResolvedValue({ transitions: [unguardedTransition] })
    renderBar()

    await screen.findByRole('button', { name: 'Submit for review' })
    fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }))

    await waitFor(() => expect(mocked.updateRecord).toHaveBeenCalledTimes(1))
    expect(mocked.updateRecord).toHaveBeenCalledWith(
      'DOC-DEMO-SOP',
      expect.objectContaining({ state: 'in_review' })
    )
    // Third argument (signatureRefs carrier) must be absent entirely.
    expect(mocked.updateRecord.mock.calls[0][2]).toBeUndefined()
    expect(mocked.createSignature).not.toHaveBeenCalled()
    expect(screen.queryByTestId('signature-password-modal')).toBeNull()
  })

  it('requires.signatureRequired=false → no modal', async () => {
    mocked.getValidTransitions.mockResolvedValue({
      transitions: [{ ...unguardedTransition, requires: { signatureRequired: false } }],
    })
    renderBar()

    fireEvent.click(await screen.findByRole('button', { name: 'Submit for review' }))

    await waitFor(() => expect(mocked.updateRecord).toHaveBeenCalledTimes(1))
    expect(mocked.updateRecord.mock.calls[0][2]).toBeUndefined()
    expect(screen.queryByTestId('signature-password-modal')).toBeNull()
  })
})

describe('DocumentControlBar — signature-gated transitions', () => {
  it('opens ONE modal; createSignature carries targetState; success → PUT with signatureRefs', async () => {
    mocked.getValidTransitions.mockResolvedValue({ transitions: [gatedApproveTransition] })
    renderBar()

    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))

    const modal = await screen.findByTestId('signature-password-modal')
    const passwordInput = screen.getByLabelText('Password')
    fireEvent.change(passwordInput, { target: { value: 'hunter2' } })
    fireEvent.click(screen.getByRole('button', { name: /sign/i }))

    await waitFor(() =>
      expect(mocked.createSignature).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'approved',
          subjectRecordId: 'DOC-DEMO-SOP',
          lifecycleId: 'document-controlled-signing',
          targetState: 'approved', // both gates share action 'approved' — targetState separates them
          password: 'hunter2',
        })
      )
    )
    await waitFor(() =>
      expect(mocked.updateRecord).toHaveBeenCalledWith(
        'DOC-DEMO-SOP',
        expect.objectContaining({ state: 'approved' }),
        { signatureRefs: ['SIG-NEW-1'] }
      )
    )
    // Exactly one modal per gated transition.
    expect(mocked.createSignature).toHaveBeenCalledTimes(1)
    expect(modal).toBeTruthy()
  })

  it('cancel → nothing is sent', async () => {
    mocked.getValidTransitions.mockResolvedValue({ transitions: [gatedApproveTransition] })
    renderBar()

    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    await screen.findByTestId('signature-password-modal')
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(mocked.createSignature).not.toHaveBeenCalled()
    expect(mocked.updateRecord).not.toHaveBeenCalled()
    expect(screen.queryByTestId('signature-password-modal')).toBeNull()
  })
})

describe('DocumentControlBar — visibility rule (round-2 fix)', () => {
  // The permissive preview (LifecycleHandlers.ts:66, presentedSignatures: [])
  // reports signature-gated transitions allowed:false for EVERY actor. The bar
  // must still render them — they are actionable via the password modal. The
  // distinction is the declarative `requires` fact, not TS policy.
  const gatedButDisallowed = {
    event: 'APPROVE',
    targetState: 'approved',
    label: 'Approve',
    role: 'reviewer',
    allowed: false,
    requires: { signatureRequired: true, signatureAction: 'approved', differentPersonThan: 'author' },
  }

  it('allowed:false + requires.signatureRequired=true → button MUST render', async () => {
    mocked.getValidTransitions.mockResolvedValue({ transitions: [gatedButDisallowed] })
    renderBar()

    const btn = await screen.findByRole('button', { name: 'Approve' })
    expect(btn).toBeEnabled()

    // And it is actionable: clicking it opens the password modal (not a dead button).
    fireEvent.click(btn)
    await screen.findByTestId('signature-password-modal')
    expect(mocked.updateRecord).not.toHaveBeenCalled() // nothing sent before signing
  })

  it('allowed:false with no requires (e.g. missing role) → button must NOT render', async () => {
    mocked.getValidTransitions.mockResolvedValue({
      transitions: [{ event: 'MAKE_EFFECTIVE', targetState: 'effective', label: 'Make effective', role: 'approver', allowed: false }],
    })
    renderBar()

    // Wait until the preview resolves (loading spinner gone), then assert absence.
    await waitFor(() => expect(mocked.getValidTransitions).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull())
    expect(screen.queryByRole('button', { name: 'Make effective' })).toBeNull()
  })

  it('gated transition denied post-mint (422 LIFECYCLE_TRANSITION_DENIED) → server message, NOT a password error', async () => {
    // Different-person guard: author signs, PUT is refused. The bar must show
    // the server's actual message, never a password-related one.
    mocked.getValidTransitions.mockResolvedValue({ transitions: [gatedButDisallowed] })
    mocked.updateRecord.mockRejectedValueOnce(
      new ApiError({
        status: 422,
        code: 'HTTP_422',
        message: 'LIFECYCLE_TRANSITION_DENIED: You do not have the required role for this transition.',
      })
    )
    renderBar()

    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2' } })
    fireEvent.click(screen.getByRole('button', { name: /sign/i }))

    await waitFor(() => expect(mocked.createSignature).toHaveBeenCalledTimes(1))
    const err = await screen.findByTestId('transition-error')
    expect(err.textContent).toMatch(/You do not have the required role for this transition/)
    expect(err.textContent).toMatch(/did not change/)
    expect(document.body.textContent).not.toMatch(/password/i) // modal is closed; no password-error text anywhere
  })
})

describe('DocumentControlBar — dirty editor gate', () => {
  it('dirty=true disables every transition button and shows a save-first hint', async () => {
    mocked.getValidTransitions.mockResolvedValue({
      transitions: [unguardedTransition, gatedApproveTransition],
    })
    renderBar({ dirty: true })

    await screen.findByRole('button', { name: 'Approve' })
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Submit for review' })).toBeDisabled()
    expect(screen.getByText(/save changes first/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(mocked.updateRecord).not.toHaveBeenCalled()
    expect(mocked.createSignature).not.toHaveBeenCalled()
  })
})

describe('DocumentControlBar — signature rejection mapping (never "wrong password")', () => {
  async function driveGatedPutRejection(err: ApiError) {
    mocked.getValidTransitions.mockResolvedValue({ transitions: [gatedApproveTransition] })
    mocked.updateRecord.mockRejectedValueOnce(err)
    renderBar()

    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2' } })
    fireEvent.click(screen.getByRole('button', { name: /sign/i }))

    await waitFor(() => expect(mocked.updateRecord).toHaveBeenCalled())
  }

  it('STALE_SIGNATURE → re-sign the current saved revision', async () => {
    await driveGatedPutRejection(signatureApiError('STALE_SIGNATURE', 'The document changed after signing. Sign its current saved revision.', 409))
    const msg = await screen.findByText(/sign its current saved revision|re-sign the current saved revision/i)
    expect(msg).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/wrong password/i)
  })

  it('SIGNED_CONTENT_CHANGED → save edits first', async () => {
    await driveGatedPutRejection(signatureApiError('SIGNED_CONTENT_CHANGED', 'Save content edits before signing; a signed transition may only change state.', 409))
    const msg = await screen.findByText(/save (content )?edits? first|save content edits before signing/i)
    expect(msg).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/wrong password/i)
  })

  it('SIGNATURE_TARGET_MISMATCH → signature belongs to a different transition', async () => {
    await driveGatedPutRejection(signatureApiError('SIGNATURE_TARGET_MISMATCH', 'The signature is for a different transition.', 422))
    const msg = await screen.findByText(/belongs to a different transition|signature is for a different transition/i)
    expect(msg).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/wrong password/i)
  })

  it('REAUTH_FAILED at signing → distinct "password rejected" message, no PUT sent', async () => {
    mocked.getValidTransitions.mockResolvedValue({ transitions: [gatedApproveTransition] })
    mocked.createSignature.mockRejectedValueOnce(reauthError())
    renderBar()

    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'bad' } })
    fireEvent.click(screen.getByRole('button', { name: /sign/i }))

    const msg = await screen.findByText(/password rejected|password was rejected/i)
    expect(msg).toBeInTheDocument()
    expect(mocked.updateRecord).not.toHaveBeenCalled()
  })
})

describe('DocumentControlBar — rendering contract', () => {
  it('renders NO chrome without lifecycleId', () => {
    render(
      <DocumentControlBar
        record={{ recordId: 'TRR-1', payload: { kind: 'training-record', state: 'completed' } }}
        dirty={false}
        onStateChanged={vi.fn()}
      />
    )
    expect(screen.queryByTestId('document-control-bar')).toBeNull()
  })

  it('a failed PUT after a mint does NOT present the SIG as an applied approval', async () => {
    mocked.getValidTransitions.mockResolvedValue({ transitions: [gatedApproveTransition] })
    mocked.updateRecord.mockRejectedValueOnce(
      signatureApiError('STALE_SIGNATURE', 'The document changed after signing.', 409)
    )
    // The minted SIG exists; an OLD applied SIG has a matching transition event,
    // the fresh one does not → the fresh one is an orphan, never "applied".
    mocked.listRecordsByKind.mockImplementation(async (kind: string) => {
      if (kind === 'signature') {
        return {
          records: [
            {
              recordId: 'SIG-OLD-APPLIED',
              schemaId: 'signature',
              payload: {
                kind: 'signature',
                recordId: 'SIG-OLD-APPLIED',
                signedBy: 'USR-REV',
                action: 'approved',
                subject: {
                  recordId: 'DOC-DEMO-SOP',
                  targetState: 'approved',
                  revisionRef: { kind: 'record', type: 'record-revision', id: 'REV-0' },
                  contentHash: 'old000',
                },
              },
            },
            {
              recordId: 'SIG-NEW-1',
              schemaId: 'signature',
              payload: {
                kind: 'signature',
                recordId: 'SIG-NEW-1',
                signedBy: 'USR-X',
                action: 'approved',
                subject: {
                  recordId: 'DOC-DEMO-SOP',
                  targetState: 'approved',
                  revisionRef: { kind: 'record', type: 'record-revision', id: 'REV-1' },
                  contentHash: 'abc123',
                },
              },
            },
          ],
          total: 2,
        }
      }
      if (kind === 'audit-event') {
        return {
          records: [
            {
              recordId: 'EVT-1',
              schemaId: 'audit-event',
              payload: {
                kind: 'audit-event',
                recordId: 'EVT-1',
                actor: 'USR-REV',
                action: 'lifecycle_transition',
                subjectId: 'DOC-DEMO-SOP',
                subjectType: 'controlled-document',
                data: { from: 'draft', to: 'in_review', event: 'SUBMIT_FOR_REVIEW', signatureRefs: ['SIG-OLD-APPLIED'] },
              },
            },
          ],
          total: 1,
        }
      }
      return { records: [], total: 0 }
    })
    renderBar()

    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2' } })
    fireEvent.click(screen.getByRole('button', { name: /sign/i }))

    await screen.findByText(/saved revision/i) // STALE_SIGNATURE surfaced

    const receipt = await screen.findByTestId('sign-off-receipt')
    // Fresh mint: orphan. Old SIG with a matching event: applied.
    expect(within(receipt).getByText(/SIG-NEW-1/).closest('li')).toHaveTextContent(/orphan/i)
    expect(within(receipt).getByText(/SIG-NEW-1/).closest('li')).not.toHaveTextContent(/applied/i)
    expect(within(receipt).getByText(/SIG-OLD-APPLIED/).closest('li')).toHaveTextContent(/applied/i)
  })
})
