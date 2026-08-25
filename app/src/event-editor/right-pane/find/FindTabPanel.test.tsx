/**
 * FindTabPanel tests — Phase 12 right-pane in-project navigator.
 * Renamed from BrowseTabPanel; now also renders an experiments/runs
 * tree above the artifact-by-kind sections.
 *
 *  - artifacts: load → group → click-to-open + filters by studyId
 *  - artifacts: saved-prompt visible but disabled (no viewer kind yet)
 *  - artifacts: empty + error states
 *  - tree: renders experiments / runs scoped to the active study
 *  - tree: hint when no experiments
 *  - tree: clicking a run resolves the method event graph
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { WorkspaceProvider, useWorkspace } from '../../workspace/WorkspaceContext'
import { defaultWorkspaceState } from '../../workspace/types'

const listRecordsByKind = vi.fn()
const getStudyInventoryUsage = vi.fn()
const getProtocolContext = vi.fn()
vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    listRecordsByKind: (...args: unknown[]) => listRecordsByKind(...args),
    getStudyInventoryUsage: (...args: unknown[]) => getStudyInventoryUsage(...args),
    getProtocolContext: (...args: unknown[]) => getProtocolContext(...args),
  },
}))

const getStudyTree = vi.fn()
const getRunMethod = vi.fn()
vi.mock('../../../shared/api/treeClient', () => ({
  getStudyTree: () => getStudyTree(),
  getRunMethod: (runId: string) => getRunMethod(runId),
}))

import { FindTabPanel } from './FindTabPanel'

const sampleArtifacts = [
  {
    recordId: 'ART-000001',
    schemaId: 'artifact',
    meta: { kind: 'artifact' },
    payload: {
      kind: 'artifact',
      recordId: 'ART-000001',
      studyId: 'STU-000001',
      artifactKind: 'pdf',
      title: 'Vendor protocol',
      extractedText: [{ pageNumber: 1, text: 'page 1 body' }],
    },
  },
  {
    recordId: 'ART-000002',
    schemaId: 'artifact',
    meta: { kind: 'artifact' },
    payload: {
      kind: 'artifact',
      recordId: 'ART-000002',
      studyId: 'STU-000001',
      artifactKind: 'protocol',
      title: 'Buffer prep protocol',
    },
  },
  {
    recordId: 'ART-000003',
    schemaId: 'artifact',
    meta: { kind: 'artifact' },
    payload: {
      kind: 'artifact',
      recordId: 'ART-000003',
      studyId: 'STU-OTHER',
      artifactKind: 'pdf',
      title: 'Other study PDF',
    },
  },
  {
    recordId: 'ART-000004',
    schemaId: 'artifact',
    meta: { kind: 'artifact' },
    payload: {
      kind: 'artifact',
      recordId: 'ART-000004',
      studyId: 'STU-000001',
      artifactKind: 'saved-prompt',
      title: 'Saved prompt',
      promptText: 'something',
    },
  },
]

const sampleTree = {
  studies: [
    {
      recordId: 'STU-000001',
      title: 'Hepatocyte toxicity',
      path: 'records/studies/STU-000001',
      experiments: [
        {
          recordId: 'EXP-001',
          title: 'Exp 1 dose response',
          studyId: 'STU-000001',
          path: 'records/studies/STU-000001/experiments/EXP-001',
          runs: [
            {
              recordId: 'RUN-001',
              title: 'Run 1',
              studyId: 'STU-000001',
              experimentId: 'EXP-001',
              path: 'records/studies/STU-000001/experiments/EXP-001/runs/RUN-001',
              recordCounts: {
                eventGraphs: 1,
                plates: 0,
                contexts: 0,
                claims: 0,
                materials: 0,
                attachments: 0,
                other: 0,
              },
            },
          ],
        },
      ],
    },
  ],
}

// Surfaces the open workspace tabs so a test can assert a record-edit tab opened.
function TabsProbe() {
  const ws = useWorkspace()
  return (
    <div data-testid="tabs">
      {ws.state.tabs.map((t) => `${t.kind}:${t.id}`).join(' ')}
    </div>
  )
}

// Surfaces the current route so a test can assert navigation happened.
function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>
}

function renderFind() {
  return render(
    <MemoryRouter>
      <WorkspaceProvider
        studyId="STU-000001"
        saveDebounceMs={0}
        loadFn={async () => ({ state: defaultWorkspaceState('STU-000001') })}
        saveFn={async (_id, s) => ({ state: s })}
      >
        <FindTabPanel />
        <TabsProbe />
        <LocationProbe />
      </WorkspaceProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  listRecordsByKind.mockReset()
  getStudyInventoryUsage.mockReset()
  getProtocolContext.mockReset()
  getStudyInventoryUsage.mockResolvedValue({ studyId: 'STU-000001', materials: [], labwares: [] })
  getProtocolContext.mockResolvedValue({ projectTemplates: [], experimentProtocols: [] })
  getStudyTree.mockReset()
  getRunMethod.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('FindTabPanel', () => {
  it('loads only artifacts for the active study', async () => {
    listRecordsByKind.mockResolvedValue({
      records: sampleArtifacts,
      total: sampleArtifacts.length,
    })
    getStudyTree.mockResolvedValue(sampleTree)
    renderFind()
    await waitFor(() =>
      expect(screen.getByTestId('find-tab-row-ART-000001')).toBeTruthy(),
    )
    expect(screen.getByTestId('find-tab-row-ART-000002')).toBeTruthy()
    expect(screen.getByTestId('find-tab-row-ART-000004')).toBeTruthy()
    expect(screen.queryByTestId('find-tab-row-ART-000003')).toBeNull()
  })

  it('saved-prompt rows render but are disabled (no viewer kind yet)', async () => {
    listRecordsByKind.mockResolvedValue({
      records: sampleArtifacts,
      total: sampleArtifacts.length,
    })
    getStudyTree.mockResolvedValue(sampleTree)
    renderFind()
    const row = await screen.findByTestId('find-tab-row-ART-000004')
    expect((row as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows empty state when the active study has no artifacts', async () => {
    listRecordsByKind.mockResolvedValue({ records: [], total: 0 })
    getStudyTree.mockResolvedValue(sampleTree)
    renderFind()
    await waitFor(() =>
      expect(screen.getByText(/No artifacts yet/)).toBeTruthy(),
    )
  })

  it('shows error inline when artifacts API rejects', async () => {
    listRecordsByKind.mockRejectedValue(new Error('records endpoint is down'))
    getStudyTree.mockResolvedValue(sampleTree)
    renderFind()
    await waitFor(() =>
      expect(screen.getByText('records endpoint is down')).toBeTruthy(),
    )
  })

  it('renders the tree with experiments and runs for the active study', async () => {
    listRecordsByKind.mockResolvedValue({ records: [], total: 0 })
    getStudyTree.mockResolvedValue(sampleTree)
    renderFind()
    expect(await screen.findByTestId('find-tab-experiment-EXP-001')).toBeTruthy()
    expect(await screen.findByTestId('find-tab-run-RUN-001')).toBeTruthy()
  })

  it('shows a hint when the study has no experiments or runs', async () => {
    listRecordsByKind.mockResolvedValue({ records: [], total: 0 })
    getStudyTree.mockResolvedValue({
      studies: [
        {
          recordId: 'STU-000001',
          title: 'Empty study',
          path: 'records/studies/STU-000001',
          experiments: [],
        },
      ],
    })
    renderFind()
    expect(await screen.findByText(/No runs yet/)).toBeTruthy()
  })

  it('shows study-level runs (no experiment) in the Runs section', async () => {
    // Flattened ownership (2026-08-15 schema audit): the run schema makes
    // experiment optional grouping, so a run with only studyId must be
    // visible in the Find tree — not just under experiments.
    listRecordsByKind.mockResolvedValue({ records: [], total: 0 })
    getStudyTree.mockResolvedValue({
      studies: [
        {
          recordId: 'STU-000001',
          title: 'Hepatocyte toxicity',
          path: 'records/studies/STU-000001',
          experiments: [],
          runs: [
            {
              recordId: 'RUN-DIRECT',
              title: 'Direct run',
              studyId: 'STU-000001',
              path: 'records/run/RUN-DIRECT',
              recordCounts: {
                eventGraphs: 1,
                plates: 0,
                contexts: 0,
                claims: 0,
                materials: 0,
                attachments: 0,
                other: 0,
              },
            },
          ],
        },
      ],
    })
    renderFind()
    expect(await screen.findByTestId('find-tab-run-RUN-DIRECT')).toBeTruthy()
    expect(screen.getByTestId('find-tab-runs-heading').textContent).toContain('Runs (1)')
  })

  it('hides the Runs section when a study has no study-level runs', async () => {
    listRecordsByKind.mockResolvedValue({ records: [], total: 0 })
    getStudyTree.mockResolvedValue(sampleTree)
    renderFind()
    expect(await screen.findByTestId('find-tab-experiment-EXP-001')).toBeTruthy()
    expect(screen.queryByTestId('find-tab-runs-heading')).toBeNull()
  })

  it('clicking a study-level run opens it in a run tab', async () => {
    listRecordsByKind.mockResolvedValue({ records: [], total: 0 })
    getStudyTree.mockResolvedValue({
      studies: [
        {
          recordId: 'STU-000001',
          title: 'S',
          path: 'p',
          experiments: [],
          runs: [
            {
              recordId: 'RUN-DIRECT',
              title: 'Direct run',
              studyId: 'STU-000001',
              path: 'records/run/RUN-DIRECT',
              recordCounts: {
                eventGraphs: 0, plates: 0, contexts: 0, claims: 0,
                materials: 0, attachments: 0, other: 0,
              },
            },
          ],
        },
      ],
    })
    renderFind()
    const runRow = await screen.findByTestId('find-tab-run-RUN-DIRECT')
    fireEvent.click(runRow)
    // Browser model: clicking a run navigates the current tab to /runs/:runId.
    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe('/runs/RUN-DIRECT'),
    )
  })

  it('clicking a run resolves the method event graph', async () => {
    listRecordsByKind.mockResolvedValue({ records: [], total: 0 })
    getStudyTree.mockResolvedValue(sampleTree)
    getRunMethod.mockResolvedValue({
      runId: 'RUN-001',
      hasMethod: true,
      methodEventGraphId: 'EVG-RUN-001',
      templateInputResolutions: [],
      runOutputs: [],
    })
    renderFind()
    const runRow = await screen.findByTestId('find-tab-run-RUN-001')
    fireEvent.click(runRow)
    await waitFor(() =>
      expect(getRunMethod).toHaveBeenCalledWith('RUN-001'),
    )
  })

  it('clicking the experiment title opens its record (not just expand/collapse)', async () => {
    listRecordsByKind.mockResolvedValue({ records: [], total: 0 })
    getStudyTree.mockResolvedValue(sampleTree)
    renderFind()
    const expRow = await screen.findByTestId('find-tab-experiment-EXP-001')
    fireEvent.click(expRow)
    expect(screen.getByTestId('tabs').textContent).toContain(
      'record-edit:record:EXP-001',
    )
  })

  it('the chevron toggle expands/collapses without opening a record', async () => {
    listRecordsByKind.mockResolvedValue({ records: [], total: 0 })
    getStudyTree.mockResolvedValue(sampleTree)
    renderFind()
    // Tree starts expanded, so the run is visible.
    expect(await screen.findByTestId('find-tab-run-RUN-001')).toBeTruthy()
    const toggle = screen.getByTestId('find-tab-experiment-toggle-EXP-001')
    fireEvent.click(toggle)
    // Collapsed: the run is gone and no record-edit tab was opened.
    expect(screen.queryByTestId('find-tab-run-RUN-001')).toBeNull()
    expect(screen.getByTestId('tabs').textContent).not.toContain('record-edit')
  })

  it('clicking the study heading opens the study record', async () => {
    listRecordsByKind.mockResolvedValue({ records: [], total: 0 })
    getStudyTree.mockResolvedValue(sampleTree)
    renderFind()
    const studyBtn = await screen.findByTestId('find-tab-open-study')
    fireEvent.click(studyBtn)
    expect(screen.getByTestId('tabs').textContent).toContain(
      'record-edit:record:STU-000001',
    )
  })

  it('shows "no method" when the run has no method event graph', async () => {
    listRecordsByKind.mockResolvedValue({ records: [], total: 0 })
    getStudyTree.mockResolvedValue(sampleTree)
    getRunMethod.mockResolvedValue({
      runId: 'RUN-001',
      hasMethod: false,
      templateInputResolutions: [],
      runOutputs: [],
    })
    renderFind()
    const runRow = await screen.findByTestId('find-tab-run-RUN-001')
    fireEvent.click(runRow)
    expect(await screen.findByText('no method')).toBeTruthy()
  })
})
