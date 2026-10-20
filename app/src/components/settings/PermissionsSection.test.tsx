/**
 * QMS8-A — PermissionsSection contract tests (RED-first).
 *
 * Mocked-client harness (OwnershipPolicySection.test.tsx pattern). Fixtures
 * are test data only: 'doc-flow', 'ops-flow', 'GRANT-TEST-*', 'quality_manager'
 * live HERE, never in the component (D9 no-literal boundary — the component
 * renders whatever the aggregate says; the inert flag is computed from the
 * aggregate's own declaredRoles, not from a hardcoded witness id).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { PermissionsSection } from './PermissionsSection'
import { apiClient, type PermissionsResponse } from '../../shared/api/client'

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getPermissions: vi.fn(),
    listUsers: vi.fn(),
  },
}))

const AGGREGATE: PermissionsResponse = {
  grants: [
    {
      recordId: 'GRANT-TEST-A',
      userId: 'USR-TEST-ONE',
      roles: ['author'],
      lifecycleId: 'doc-flow',
      grantedBy: 'USR-TEST-ADMIN',
      notes: 'demo grant',
      label: 'One author grant',
    },
    {
      // Wrong-binding witness (test fixture for the GRANT-QMS7-REGOPS class):
      // quality_manager is NOT in doc-flow's declaredRoles -> inert flag.
      recordId: 'GRANT-TEST-B',
      userId: 'USR-TEST-TWO',
      roles: ['quality_manager'],
      lifecycleId: 'doc-flow',
      grantedBy: 'USR-TEST-ADMIN',
    },
    {
      // Unscoped grant: blank lifecycleId renders as "all lifecycles".
      recordId: 'GRANT-TEST-C',
      userId: 'USR-TEST-ONE',
      roles: ['author'],
      grantedBy: 'USR-TEST-ADMIN',
    },
  ],
  lifecycles: [
    { id: 'doc-flow', declaredRoles: ['author', 'reviewer'], kinds: [] },
    { id: 'ops-flow', declaredRoles: ['author'], kinds: ['widget', 'gadget'] },
  ],
  coverage: { lifecycleId: 'ops-flow', kinds: ['widget', 'gadget'] },
  bundle: { policyBundleId: 'POL-TEST', label: 'Test bundle', level: 2 },
}

const USERS = [
  { recordId: 'USR-TEST-ONE', username: 'one', displayName: 'One Person' },
  { recordId: 'USR-TEST-TWO', username: 'two', displayName: 'Two Person' },
  { recordId: 'USR-TEST-ADMIN', displayName: 'Admin Person' },
]

beforeEach(() => {
  vi.mocked(apiClient.getPermissions).mockReset()
  vi.mocked(apiClient.listUsers).mockReset()
  vi.mocked(apiClient.getPermissions).mockResolvedValue(AGGREGATE)
  vi.mocked(apiClient.listUsers).mockResolvedValue(USERS)
})

describe('PermissionsSection', () => {
  it('renders one row per grant with user label, lifecycle binding, grantedBy and notes', async () => {
    render(<PermissionsSection />)

    const rowA = await screen.findByTestId('permissions-grant-row-GRANT-TEST-A')
    expect(rowA).toHaveTextContent('One Person')
    expect(rowA).toHaveTextContent('author')
    expect(rowA).toHaveTextContent('doc-flow')
    expect(rowA).toHaveTextContent('Admin Person')
    expect(rowA).toHaveTextContent('demo grant')
  })

  it('renders an unscoped grant (no lifecycleId) honestly as "all lifecycles" and never inert', async () => {
    render(<PermissionsSection />)

    const rowC = await screen.findByTestId('permissions-grant-row-GRANT-TEST-C')
    expect(rowC).toHaveTextContent('all lifecycles')
    // Directional pin (adv review defect 2): the inert rule applies ONLY to
    // grants bound to a lifecycle. An unscoped role must NEVER be flagged
    // inert — a substring check on "all lifecycles" alone would let a
    // regression that flags unscoped roles inert pass.
    expect(screen.queryByTestId('permissions-role-inert-GRANT-TEST-C-author')).toBeNull()
  })

  it('flags a role that the bound lifecycle does not declare as inert', async () => {
    render(<PermissionsSection />)

    const inert = await screen.findByTestId('permissions-role-inert-GRANT-TEST-B-quality_manager')
    expect(inert).toHaveTextContent('quality_manager — not declared by doc-flow (inert)')
    // A declared role on the same lifecycle is NOT flagged.
    expect(screen.queryByTestId('permissions-role-inert-GRANT-TEST-A-author')).toBeNull()
  })

  it('narrows rows with the client-side user filter', async () => {
    render(<PermissionsSection />)

    await screen.findByTestId('permissions-grant-row-GRANT-TEST-A')
    fireEvent.change(screen.getByTestId('permissions-user-filter'), { target: { value: 'Two' } })

    expect(screen.queryByTestId('permissions-grant-row-GRANT-TEST-A')).toBeNull()
    expect(screen.getByTestId('permissions-grant-row-GRANT-TEST-B')).toBeInTheDocument()
  })

  it('governance panel maps each lifecycle to its declared roles and covered kinds, and shows the active bundle', async () => {
    render(<PermissionsSection />)

    const gov = await screen.findByTestId('permissions-governance')
    const opsRow = screen.getByTestId('permissions-lifecycle-row-ops-flow')
    expect(opsRow).toHaveTextContent('ops-flow')
    expect(opsRow).toHaveTextContent('widget, gadget')
    expect(opsRow).toHaveTextContent('author')
    expect(gov).toHaveTextContent('POL-TEST')
  })

  it('shows the honest empty state when there are no grants', async () => {
    vi.mocked(apiClient.getPermissions).mockResolvedValue({
      grants: [],
      lifecycles: AGGREGATE.lifecycles,
      coverage: AGGREGATE.coverage,
      bundle: AGGREGATE.bundle,
    })

    render(<PermissionsSection />)

    const empty = await screen.findByTestId('permissions-empty')
    expect(empty).toHaveTextContent('no grants: everyone resolves to no-role; drafts-only is the only power')
  })

  it('renders a server refusal as a row ABOVE the controls and keeps Refresh operable (OwnershipPolicySection error law)', async () => {
    vi.mocked(apiClient.getPermissions).mockRejectedValue(new Error('Server refused: 500 boom'))

    render(<PermissionsSection />)

    const errorRow = await screen.findByTestId('permissions-load-error')
    expect(errorRow).toHaveTextContent('500 boom')
    // No data claims on a refusal (adv review defect 1/2): the aggregate
    // never loaded, so the section must not assert "no grants: everyone
    // resolves to no-role", nor "no lifecycle coverage loaded" / "no policy
    // bundle configured" — those are only truthful when a response arrived.
    expect(screen.queryByTestId('permissions-empty')).toBeNull()
    expect(screen.queryByTestId('permissions-governance')).toBeNull()
    const refresh = screen.getByTestId('permissions-refresh')
    expect(refresh).not.toBeDisabled()
    // Controls are not dead chrome: Refresh re-fetches and clears the error.
    vi.mocked(apiClient.getPermissions).mockResolvedValue(AGGREGATE)
    fireEvent.click(refresh)
    await waitFor(() => expect(screen.getByTestId('permissions-grant-row-GRANT-TEST-A')).toBeInTheDocument())
    expect(screen.queryByTestId('permissions-load-error')).toBeNull()
  })

  it('degrades honestly when coverage/bundle are null (no crash, honest rows)', async () => {
    vi.mocked(apiClient.getPermissions).mockResolvedValue({
      grants: AGGREGATE.grants,
      lifecycles: [{ id: 'doc-flow', declaredRoles: ['author'], kinds: [] }],
      coverage: null,
      bundle: null,
    })

    render(<PermissionsSection />)

    const gov = await screen.findByTestId('permissions-governance')
    expect(gov).toHaveTextContent('no lifecycle coverage loaded')
    expect(gov).toHaveTextContent('no policy bundle configured')
    expect(screen.getByTestId('permissions-grant-row-GRANT-TEST-A')).toBeInTheDocument()
  })
})
