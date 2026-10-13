/**
 * ShareRecordDialog — preset-row contract (§T12 / OWN-12).
 *
 * Harness: mirrors useRecordVisibility.test.tsx (vi.mock the api client) PLUS a
 * mocked OpenTabsContext — the CONTEXT is mocked, NOT the pure activeProject
 * helper (its mapping logic stays real; it is already pinned by
 * activeProject.test.ts). Fixtures use the KEYED kindRules map shape the server
 * GET actually returns (OwnershipPolicyService.ts:115-120 array→map coercion);
 * a schema-array fixture would prove nothing about the client-side lookup.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ShareRecordDialog } from './ShareRecordDialog'
import {
  apiClient,
  type AccessGrant,
  type AccessPolicyResponse,
  type OwnershipPolicyResponse,
  type Visibility,
} from '../api/client'
import type { OpenTabsState } from '../shell/OpenTabsContext'
import type { WorkspaceTab } from '../../event-editor/workspace/types'

vi.mock('../api/client', () => ({
  apiClient: {
    getAccessPolicy: vi.fn(),
    listUsers: vi.fn(),
    listGroups: vi.fn(),
    getRecord: vi.fn(),
    putAccessPolicy: vi.fn(),
    getOwnershipPolicy: vi.fn(),
  },
}))

// The open-tabs session the dialog sees. Mutated per test; read lazily by the
// mocked hook (never at factory time).
let mockTabsState: OpenTabsState | null = null
vi.mock('../shell/OpenTabsContext', () => ({
  useOptionalOpenTabs: () => (mockTabsState ? { state: mockTabsState } : null),
}))

// ── fixtures ─────────────────────────────────────────────────────────

const GRANT_GROUP: AccessGrant = { principalType: 'group', principalId: 'GRP-LAB-ADMINS', role: 'admin' }
const GRANT_USER: AccessGrant = { principalType: 'user', principalId: 'USR-B', role: 'editor' }
const GRANT_PROJECT: AccessGrant = { principalType: 'project', principalId: 'STU-A', role: 'editor' }

const NOTE = 'policy unavailable — showing all targets'

function accessPolicy(
  grants: AccessGrant[],
  visibility: Visibility = 'shared',
  canAdmin = true,
): AccessPolicyResponse {
  return {
    recordId: 'PRT-1',
    kind: 'local-protocol',
    isPolicyRoot: true,
    canAdmin,
    canWrite: canAdmin,
    direct: { recordId: 'ACL-PRT-1', visibility, ownerUserId: 'USR-1', grants },
    effective: null,
    inherited: false,
  }
}

/** Resolved doc in the KEYED-map shape the GET actually returns. */
function policyDoc(shareTargets: string[]): OwnershipPolicyResponse {
  const rule = (targets: string[]) => ({
    owner: 'creator' as const,
    visibility: 'shared' as const,
    filedTo: 'none' as const,
    editRoles: ['editor'],
    shareTargets: targets,
  })
  return {
    record: null,
    resolved: {
      recordId: 'OWN-LAB-DEFAULT',
      scope: { type: 'lab', id: 'lab' },
      labOwnerUserId: 'USR-1',
      fallback: rule(['user', 'group', 'project', 'lab']),
      kindRules: { 'local-protocol': rule(shareTargets) },
    },
  }
}

const projectTab = (id: string, studyId: string, title: string): WorkspaceTab => ({
  id,
  kind: 'project',
  studyId,
  title,
})
const claimTab = (id: string): WorkspaceTab => ({ id, kind: 'claim', claimId: 'CLM-1', title: 'a claim' })

function tabsState(tabs: WorkspaceTab[], activeTabId: string | null, history: string[] = []): OpenTabsState {
  return {
    tabs: tabs.map((tab) => ({
      tab,
      activeRightPaneMode: 'chat',
      breadcrumb: [],
      contentHistory: [tab],
      contentCursor: 0,
    })),
    activeTabId,
    history,
    historyCursor: history.length - 1,
  } as unknown as OpenTabsState
}

function renderDialog() {
  return render(<ShareRecordDialog recordId="PRT-1" onClose={() => {}} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockTabsState = tabsState([projectTab('p1', 'STU-A', 'Alpha Study')], 'p1')
  vi.mocked(apiClient.getAccessPolicy).mockResolvedValue(accessPolicy([GRANT_GROUP, GRANT_USER]))
  vi.mocked(apiClient.listUsers).mockResolvedValue([{ recordId: 'USR-B', displayName: 'B' }])
  vi.mocked(apiClient.listGroups).mockResolvedValue([
    { recordId: 'GRP-LAB-ADMINS', displayName: 'Lab Admins', memberUserIds: [], memberGroupIds: [] },
  ])
  vi.mocked(apiClient.getRecord).mockResolvedValue({
    recordId: 'PRT-1',
    schemaId: 'protocol',
    payload: { links: { studyId: 'STU-A' } },
  })
  vi.mocked(apiClient.getOwnershipPolicy).mockResolvedValue(policyDoc(['project', 'lab', 'user', 'group']))
  vi.mocked(apiClient.putAccessPolicy).mockResolvedValue({
    recordId: 'ACL-PRT-1',
    visibility: 'shared',
    ownerUserId: 'USR-1',
    grants: [],
  })
})

describe('ShareRecordDialog preset row (§T12)', () => {
  it('case 1: renders only the presets the policy allows for the kind', async () => {
    // local-protocol restricted to user+group → only the withdrawal renders.
    vi.mocked(apiClient.getOwnershipPolicy).mockResolvedValue(policyDoc(['user', 'group']))
    const { unmount } = renderDialog()
    expect(await screen.findByRole('button', { name: 'Private to me' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Share with whole lab' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Share with project members' })).toBeNull()
    expect(screen.queryByText(NOTE)).toBeNull()
    unmount()

    // lab allowed, project not → whole-lab present, project-members absent.
    vi.mocked(apiClient.getOwnershipPolicy).mockResolvedValue(policyDoc(['lab', 'user']))
    renderDialog()
    expect(await screen.findByRole('button', { name: 'Share with whole lab' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Share with project members' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Private to me' })).toBeInTheDocument()
  })

  it('case 2: policy fetch failure shows all three presets + the verbatim note, never the error state', async () => {
    vi.mocked(apiClient.getOwnershipPolicy).mockRejectedValue(new Error('boom'))
    renderDialog()
    expect(await screen.findByRole('button', { name: 'Share with whole lab' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share with project members' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Private to me' })).toBeInTheDocument()
    // Exact string, em dash U+2014, lowercase — verbatim from the task list.
    expect(screen.getByText(NOTE)).toBeInTheDocument()
    // The policy failure must NOT trip the dialog's top-level error state:
    // the body (and its Save control) is still rendered.
    expect(screen.queryByRole('button', { name: 'Save sharing' })).toBeInTheDocument()
  })

  it('case 3: project-members appends exactly one STU grant; visibility + group grant untouched; no auto-save', async () => {
    renderDialog()
    const btn = await screen.findByRole('button', { name: 'Share with project members' })
    expect(btn).not.toBeDisabled()
    fireEvent.click(btn)
    fireEvent.click(btn) // dedup probe (D10): a double click must not duplicate the grant
    expect(apiClient.putAccessPolicy).not.toHaveBeenCalled() // presets mutate the working copy only
    fireEvent.click(screen.getByRole('button', { name: 'Save sharing' }))
    await waitFor(() => expect(apiClient.putAccessPolicy).toHaveBeenCalled())
    expect(apiClient.putAccessPolicy).toHaveBeenCalledWith('PRT-1', {
      visibility: 'shared', // UNTOUCHED by the preset
      grants: [GRANT_GROUP, GRANT_USER, { principalType: 'project', principalId: 'STU-A', role: 'editor' }],
    })
  })

  it('case 4: project-members is disabled with a reason without an active project or links.studyId', async () => {
    // (a) no project tab open (record IS filed to a project)
    mockTabsState = tabsState([claimTab('t1')], 't1')
    const { unmount } = renderDialog()
    const btn = await screen.findByRole('button', { name: 'Share with project members' })
    expect(btn).toBeDisabled()
    expect(btn.getAttribute('title')).toBe('No active project')
    unmount()

    // (b) active project present, record NOT filed to a project
    vi.mocked(apiClient.getRecord).mockResolvedValue({ recordId: 'PRT-1', schemaId: 'protocol', payload: {} })
    renderDialog()
    const btn2 = await screen.findByRole('button', { name: 'Share with project members' })
    expect(btn2).toBeDisabled()
    expect(btn2.getAttribute('title')).toBe("This record isn't filed to a project")
  })

  it('case 5: private-to-me drops EXACTLY project grants; user + group survive verbatim', async () => {
    vi.mocked(apiClient.getAccessPolicy).mockResolvedValue(
      accessPolicy([GRANT_PROJECT, GRANT_USER, GRANT_GROUP]),
    )
    renderDialog()
    fireEvent.click(await screen.findByRole('button', { name: 'Private to me' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save sharing' }))
    await waitFor(() => expect(apiClient.putAccessPolicy).toHaveBeenCalled())
    expect(apiClient.putAccessPolicy).toHaveBeenCalledWith('PRT-1', {
      visibility: 'private',
      grants: [GRANT_USER, GRANT_GROUP], // GRP-LAB-ADMINS admin group SURVIVES (no overreach)
    })
  })

  it('case 6: Add-principal select gains Project only when targets allow; option label is the active project title', async () => {
    const { container, unmount } = renderDialog()
    await screen.findByRole('button', { name: 'Share with project members' })
    const typeSelect = container.querySelector('.share-dialog__add select') as HTMLSelectElement
    expect(Array.from(typeSelect.options).map((o) => o.value)).toContain('project')
    fireEvent.change(typeSelect, { target: { value: 'project' } })
    const principalSelect = container.querySelectorAll('.share-dialog__add select')[1] as HTMLSelectElement
    expect(Array.from(principalSelect.options).map((o) => o.value)).toContain('STU-A')
    expect(Array.from(principalSelect.options).map((o) => o.textContent)).toContain('Alpha Study')
    unmount()

    // Policy loaded and project NOT allowed → no Project option.
    vi.mocked(apiClient.getOwnershipPolicy).mockResolvedValue(policyDoc(['user', 'group']))
    const second = renderDialog()
    await second.findByText('Access grants')
    const typeSelect2 = second.container.querySelector('.share-dialog__add select') as HTMLSelectElement
    expect(Array.from(typeSelect2.options).map((o) => o.value)).not.toContain('project')
  })

  it('case 7: read-only view (canAdmin false) renders no preset row, no note, no Project option', async () => {
    vi.mocked(apiClient.getAccessPolicy).mockResolvedValue(accessPolicy([GRANT_GROUP], 'shared', false))
    const { container } = renderDialog()
    await screen.findByText('Access grants')
    expect(screen.queryByRole('button', { name: 'Share with whole lab' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Share with project members' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Private to me' })).toBeNull()
    expect(screen.queryByText(NOTE)).toBeNull()
    expect(container.querySelectorAll('.share-dialog__add select').length).toBe(0)
  })
})
