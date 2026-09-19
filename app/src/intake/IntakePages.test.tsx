/**
 * Intake page tests — list queue + tree detail with the prompt/redraft loop.
 * apiClient is mocked; no network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { IntakeTreeListPage } from './IntakeTreeListPage';
import { IntakeTreeDetailPage } from './IntakeTreeDetailPage';
import { ThemeProvider } from '../shared/shell';
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext';
import { apiClient, type IntakeProposal, type IntakeTreeSummary } from '../shared/api/client';

// Spy on the real client's intake methods only — AppShell/WorkspaceTabStrip
// still reach their own apiClient methods.
const listTrees = vi.fn();
const getTree = vi.fn();
const setPrompt = vi.fn();
const redraft = vi.fn();

beforeEach(() => {
  listTrees.mockReset();
  getTree.mockReset();
  setPrompt.mockReset();
  redraft.mockReset();
  vi.spyOn(apiClient, 'listIntakeTrees').mockImplementation(listTrees);
  vi.spyOn(apiClient, 'getIntakeTree').mockImplementation(getTree);
  vi.spyOn(apiClient, 'setIntakeProposalPrompt').mockImplementation(setPrompt);
  vi.spyOn(apiClient, 'redraftIntakeProposal').mockImplementation(redraft);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const TREE: IntakeTreeSummary = {
  recordId: 'PDT-DOC-A',
  documentId: 'DOC-A',
  generatedAt: '2026-09-19T03:00:00Z',
  axisCount: 1,
  scaleLevels: ['manual_tubes', 'robot_deck'],
  proposalCount: 2,
  sourcePdf: { title: 'Quick-DNA Fecal/Soil Kit' },
};

const PROPOSAL: IntakeProposal = {
  kind: 'subgraph-proposal',
  recordId: 'SGP-DOC-A-b1-manual_tubes',
  documentId: 'DOC-A',
  treeRef: { kind: 'record', id: 'PDT-DOC-A', type: 'protocol-decision-tree' },
  branchPath: [{ axisId: 'dna-source', conditionId: 'buccal', label: 'Buccal swab' }],
  scaleLevel: 'manual_tubes',
  activeStepIds: ['s1', 's2', 's3'],
  eventGraphRef: { kind: 'record', id: 'EG-DRAFT-A-r1', type: 'event-graph' },
  compileStatus: 'complete',
  state: 'proposed',
  revision: 1,
};

function shell(_routeless: React.ReactElement, route: string) {
  // The page components are mounted by the Routes below; `ui` only carries
  // the element through call sites for readability.
  void _routeless;
  return render(
    <ThemeProvider>
      <OpenTabsProvider>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path="/intake" element={<IntakeTreeListPage />} />
            <Route path="/intake/:treeId" element={<IntakeTreeDetailPage />} />
          </Routes>
        </MemoryRouter>
      </OpenTabsProvider>
    </ThemeProvider>,
  );
}

describe('IntakeTreeListPage', () => {
  it('renders one card per decision tree with counts', async () => {
    listTrees.mockResolvedValue([TREE]);
    shell(<IntakeTreeListPage />, '/intake');
    await waitFor(() => screen.getByText('Quick-DNA Fecal/Soil Kit'));
    expect(screen.getByText(/proposals: 2/)).toBeInTheDocument();
  });

  it('shows the empty-state hint when the crawl has not run', async () => {
    listTrees.mockResolvedValue([]);
    shell(<IntakeTreeListPage />, '/intake');
    expect(await screen.findByText(/No decision trees yet/)).toBeInTheDocument();
  });
});

describe('IntakeTreeDetailPage', () => {
  const detail = () => ({
    tree: {
      ...TREE,
      axes: [
        {
          axisId: 'dna-source',
          question: 'What is the DNA source?',
          origin: 'document_branch',
          conditions: [
            { id: 'cell_culture', label: 'Cell culture' },
            { id: 'buccal', label: 'Buccal swab' },
          ],
        },
      ],
      scaleAxis: {
        question: 'How is the protocol executed?',
        options: [{ level: 'manual_tubes', label: 'Tubes, single channel' }],
      },
    },
    proposals: [PROPOSAL],
  });

  it('renders the question axes as chips and the proposal row', async () => {
    getTree.mockResolvedValue(detail());
    shell(<IntakeTreeDetailPage />, '/intake/PDT-DOC-A');
    expect(await screen.findByText('What is the DNA source?')).toBeInTheDocument();
    expect(screen.getByText('Cell culture')).toBeInTheDocument();
    // 'Buccal swab' appears twice: the axis chip and the proposal's branch
    // path — assert the chip scope explicitly.
    expect(screen.getAllByText('Buccal swab').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('SGP-DOC-A-b1-manual_tubes')).toBeInTheDocument();
    expect(screen.getByText('Buccal swab', { selector: '.intake-proposal__path' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in editor' })).toHaveAttribute(
      'href',
      '/event-editor/EG-DRAFT-A-r1',
    );
  });

  it('prompt -> needs_prompt -> redraft loop', async () => {
    const prompted: IntakeProposal = { ...PROPOSAL, state: 'needs_prompt', reviewPrompt: 'use 1.5 mL tubes' };
    getTree.mockResolvedValue(detail());
    setPrompt.mockResolvedValue(prompted);
    redraft.mockResolvedValue({
      success: true,
      documentId: 'DOC-A',
      proposalRecordIds: [PROPOSAL.recordId],
      eventGraphRecordIds: ['EG-DRAFT-A-r2'],
    });
    shell(<IntakeTreeDetailPage />, '/intake/PDT-DOC-A');
    const redraftBtn = await screen.findByRole('button', { name: 'Redraft' });
    expect(redraftBtn).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/redraft/i), {
      target: { value: 'use 1.5 mL tubes' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add prompt' }));
    await waitFor(() =>
      expect(setPrompt).toHaveBeenCalledWith(
        'SGP-DOC-A-b1-manual_tubes',
        'use 1.5 mL tubes',
      ),
    );
    // state flips to needs_prompt: prompt preview visible, Redraft enabled.
    expect(await screen.findByText(/prompt: use 1\.5 mL tubes/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Redraft' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Redraft' }));
    await waitFor(() =>
      expect(redraft).toHaveBeenCalledWith('SGP-DOC-A-b1-manual_tubes'),
    );
    // redraft reloads the tree.
    await waitFor(() => expect(getTree).toHaveBeenCalledTimes(2));
  });
});
