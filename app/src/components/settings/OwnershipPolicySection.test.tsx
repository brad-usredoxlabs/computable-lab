/**
 * OwnershipPolicySection contract tests (§T11 / OWN-11).
 *
 * Mirrors the mocked-client harness of shared/sharing/useRecordVisibility.test.tsx.
 * Fixtures are built from the real seed doc (records/seed/identity/
 * OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml): local-protocol is
 * creator/private/filed-to-active-project; material is lab/public.
 *
 * Array-vs-map law (spec reviewer-bait 2): record.payload.kindRules is an ARRAY
 * (what the YAML editor and PUT carry); resolved.kindRules is a KEYED MAP
 * (what the table reads). Case 3 guards the direction.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { act } from 'react'
import { EditorView } from '@codemirror/view'
import { OwnershipPolicySection } from './OwnershipPolicySection'
import { apiClient, type OwnershipPolicyDocView } from '../../shared/api/client'
import { ApiError } from '../../shared/api/errors'

// NOTE: the spec draft wrote the mock path as '../../../shared/api/client';
// from src/components/settings/ that resolves above src/. The correct relative
// path (matching the component's own import) is '../../shared/api/client'.
vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getOwnershipPolicy: vi.fn(),
    putOwnershipPolicy: vi.fn(),
  },
}))

// ---- fixtures (test-data only: local-protocol / USR-LOCAL-ADMIN live HERE,
// never in the component — D9 hardcode boundary) ----

const PAYLOAD = {
  $schema: 'https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml',
  kind: 'ownership-policy',
  recordId: 'OWN-LAB-DEFAULT',
  title: 'Lab Ownership & Sharing Policy',
  scope: { type: 'lab', id: 'lab' },
  labOwnerUserId: 'USR-LOCAL-ADMIN',
  fallback: {
    owner: 'creator',
    visibility: 'private',
    filedTo: 'none',
    editRoles: ['owner', 'editor'],
    shareTargets: ['user', 'group', 'project', 'lab'],
  },
  kindRules: [
    {
      kind: 'local-protocol',
      owner: 'creator',
      visibility: 'private',
      filedTo: 'active-project',
      editRoles: ['owner', 'editor'],
      shareTargets: ['project', 'lab', 'user', 'group'],
    },
    {
      kind: 'material',
      owner: 'lab',
      visibility: 'public',
      filedTo: 'none',
      editRoles: ['owner', 'admin'],
      shareTargets: ['user', 'group', 'lab'],
      defaultGrants: [{ principalType: 'group', principalId: 'GRP-LAB-ADMINS', role: 'admin' }],
    },
  ],
}

const RESOLVED: OwnershipPolicyDocView = {
  recordId: 'OWN-LAB-DEFAULT',
  scope: { type: 'lab', id: 'lab' },
  labOwnerUserId: 'USR-LOCAL-ADMIN',
  fallback: {
    owner: 'creator',
    visibility: 'private',
    filedTo: 'none',
    editRoles: ['owner', 'editor'],
    shareTargets: ['user', 'group', 'project', 'lab'],
  },
  // KEYED MAP keyed by kind (OwnershipPolicyService.ts:46) — not the payload array.
  kindRules: {
    'local-protocol': {
      owner: 'creator',
      visibility: 'private',
      filedTo: 'active-project',
      editRoles: ['owner', 'editor'],
      shareTargets: ['project', 'lab', 'user', 'group'],
    },
    material: {
      owner: 'lab',
      visibility: 'public',
      filedTo: 'none',
      editRoles: ['owner', 'admin'],
      shareTargets: ['user', 'group', 'lab'],
      defaultGrants: [{ principalType: 'group', principalId: 'GRP-LAB-ADMINS', role: 'admin' }],
    },
  },
}

function policyResponse(payload = PAYLOAD, resolved = RESOLVED) {
  return {
    record: {
      recordId: 'OWN-LAB-DEFAULT',
      schemaId: 'computable-lab/ownership-policy',
      payload,
      meta: { kind: 'ownership-policy' },
    },
    resolved,
  }
}

function openAdvancedEditor() {
  fireEvent.click(screen.getByTestId('policy-advanced-toggle'))
  const wrapper = document.querySelector('.codemirror-wrapper') as HTMLElement
  expect(wrapper).toBeTruthy()
  const view = EditorView.findFromDOM(wrapper)
  if (!view) throw new Error('CodeMirror view not found on .codemirror-wrapper')
  return view
}

function replaceDoc(view: EditorView, content: string) {
  act(() => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } })
  })
}

beforeEach(() => { vi.clearAllMocks() })

describe('OwnershipPolicySection', () => {
  it('renders the resolved policy table from the keyed kindRules map', async () => {
    vi.mocked(apiClient.getOwnershipPolicy).mockResolvedValue(policyResponse())
    render(<OwnershipPolicySection />)

    const row = await screen.findByTestId('policy-row-local-protocol')
    expect(row.textContent).toContain('private')
    expect(row.textContent).toContain('active-project')

    const material = screen.getByTestId('policy-row-material')
    expect(material.textContent).toContain('lab')
    expect(material.textContent).toContain('public')

    // shareTargets joined with ", " per spec §2
    expect(row.textContent).toContain('project, lab, user, group')

    // fallback row labeled "(fallback)"
    const fallback = screen.getByTestId('policy-fallback-row')
    expect(fallback.textContent).toContain('(fallback)')
    expect(fallback.textContent).toContain('private')
  })

  it('disables save while the YAML is unparseable and re-enables when fixed', async () => {
    vi.mocked(apiClient.getOwnershipPolicy).mockResolvedValue(policyResponse())
    render(<OwnershipPolicySection />)
    await screen.findByTestId('policy-row-local-protocol')

    // table-only mode offers no save path
    expect(screen.queryByTestId('policy-save')).toBeNull()

    const view = openAdvancedEditor()

    // Guard against a mount that never parses the initial doc: save must be
    // enabled for the valid payload BEFORE any edit (mutation probe: dropping
    // the initial parse leaves save disabled here).
    await waitFor(() => expect(screen.getByTestId('policy-save')).not.toBeDisabled())

    replaceDoc(view, 'kind: [unclosed')
    await waitFor(() => expect(screen.getByTestId('policy-save')).toBeDisabled())
    expect(screen.getByTestId('policy-parse-error').textContent).toBeTruthy()

    replaceDoc(view, 'kind: ownership-policy')
    await waitFor(() => expect(screen.getByTestId('policy-save')).not.toBeDisabled())
  })

  it('save PUTs the parsed payload whose kindRules is an ARRAY carrying the edit', async () => {
    vi.mocked(apiClient.getOwnershipPolicy).mockResolvedValue(policyResponse())
    vi.mocked(apiClient.putOwnershipPolicy).mockResolvedValue({
      success: true,
      record: { recordId: 'OWN-LAB-DEFAULT', schemaId: 'computable-lab/ownership-policy', payload: PAYLOAD },
    })
    render(<OwnershipPolicySection />)
    await screen.findByTestId('policy-row-local-protocol')

    const view = openAdvancedEditor()
    await waitFor(() => expect(screen.getByTestId('policy-save')).not.toBeDisabled())

    // Valid edit: material visibility public -> shared (payload ARRAY form).
    replaceDoc(view, `
$schema: "https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml"
kind: ownership-policy
recordId: OWN-LAB-DEFAULT
scope: { type: lab, id: lab }
labOwnerUserId: USR-LOCAL-ADMIN
fallback: { owner: creator, visibility: private, filedTo: none, editRoles: [owner, editor], shareTargets: [user, group, project, lab] }
kindRules:
  - { kind: local-protocol, owner: creator, visibility: private, filedTo: active-project, editRoles: [owner, editor], shareTargets: [project, lab, user, group] }
  - { kind: material, owner: lab, visibility: shared, filedTo: none, editRoles: [owner, admin], shareTargets: [user, group, lab] }
`)
    await waitFor(() => expect(screen.getByTestId('policy-save')).not.toBeDisabled())
    fireEvent.click(screen.getByTestId('policy-save'))

    await waitFor(() => expect(apiClient.putOwnershipPolicy).toHaveBeenCalledTimes(1))
    const putArg = vi.mocked(apiClient.putOwnershipPolicy).mock.calls[0][0] as Record<string, unknown>
    // Array-vs-map guard (mutation probe: PUTting the coerced resolved doc — a
    // keyed map — flips this RED).
    expect(Array.isArray(putArg.kindRules)).toBe(true)
    const rules = putArg.kindRules as Array<Record<string, unknown>>
    const material = rules.find((r) => r.kind === 'material')
    expect(material?.visibility).toBe('shared')
  })

  it('surfaces a 422 INVALID_POLICY verbatim without replacing the table or editor', async () => {
    vi.mocked(apiClient.getOwnershipPolicy).mockResolvedValue(policyResponse())
    vi.mocked(apiClient.putOwnershipPolicy).mockRejectedValue(new ApiError({
      status: 422,
      code: 'HTTP_422',
      message: 'INVALID_POLICY: /kindRules/0: must have required property \'visibility\'',
      validation: {
        valid: false,
        errors: [{ path: '/kindRules/0', message: 'must have required property \'visibility\'' }],
      },
    }))
    render(<OwnershipPolicySection />)
    await screen.findByTestId('policy-row-local-protocol')

    const view = openAdvancedEditor()
    await waitFor(() => expect(screen.getByTestId('policy-save')).not.toBeDisabled())
    replaceDoc(view, 'kind: ownership-policy')
    await waitFor(() => expect(screen.getByTestId('policy-save')).not.toBeDisabled())
    fireEvent.click(screen.getByTestId('policy-save'))

    const errRow = await screen.findByTestId('policy-save-error')
    expect(errRow.textContent).toContain('INVALID_POLICY')
    expect(errRow.textContent).toContain('/kindRules/0')

    // FIX-RUN-1 defect-5: the refusal renders ABOVE the control; the table and
    // editor stay operable for retry on the same page.
    expect(screen.getByTestId('policy-row-local-protocol')).toBeTruthy()
    expect(document.querySelector('.codemirror-wrapper')).toBeTruthy()
    expect(screen.getByTestId('policy-save')).not.toBeDisabled()

    // A refused save must NOT trigger a refetch (table unchanged).
    expect(apiClient.getOwnershipPolicy).toHaveBeenCalledTimes(1)
  })

  it('renders an honest "Not configured" row when the policy is absent', async () => {
    vi.mocked(apiClient.getOwnershipPolicy).mockResolvedValue({ record: null, resolved: null, defaults: null })
    render(<OwnershipPolicySection />)

    const row = await screen.findByTestId('policy-not-configured')
    expect(row.textContent).toContain('Not configured')
    expect(screen.queryByTestId('policy-row-local-protocol')).toBeNull()
    expect(screen.queryByTestId('policy-save')).toBeNull()
    expect(screen.queryByTestId('policy-advanced-toggle')).toBeNull()
  })

  it('refetches GET after a successful save and re-renders the table from the server copy', async () => {
    const updatedPayload = {
      ...PAYLOAD,
      kindRules: PAYLOAD.kindRules.map((r) => (r.kind === 'material' ? { ...r, visibility: 'shared' } : r)),
    }
    const updatedResolved: OwnershipPolicyDocView = {
      ...RESOLVED,
      kindRules: { ...RESOLVED.kindRules, material: { ...RESOLVED.kindRules.material, visibility: 'shared' as const } },
    }
    vi.mocked(apiClient.getOwnershipPolicy)
      .mockResolvedValueOnce(policyResponse())
      .mockResolvedValueOnce(policyResponse(updatedPayload, updatedResolved))
    vi.mocked(apiClient.putOwnershipPolicy).mockResolvedValue({
      success: true,
      record: { recordId: 'OWN-LAB-DEFAULT', schemaId: 'computable-lab/ownership-policy', payload: updatedPayload },
    })
    render(<OwnershipPolicySection />)
    await screen.findByTestId('policy-row-local-protocol')

    const view = openAdvancedEditor()
    await waitFor(() => expect(screen.getByTestId('policy-save')).not.toBeDisabled())
    replaceDoc(view, 'kind: ownership-policy')
    await waitFor(() => expect(screen.getByTestId('policy-save')).not.toBeDisabled())
    fireEvent.click(screen.getByTestId('policy-save'))

    // Success = refetch the GET (single source of truth — no local splice).
    await waitFor(() => expect(apiClient.getOwnershipPolicy).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByTestId('policy-row-material').textContent).toContain('shared'))
  })
})
