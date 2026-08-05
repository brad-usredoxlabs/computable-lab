/**
 * Tests for LabEntityWorkspace protocol rendering — the protocol branch must
 * lead with the CONCISE step list as the main view, with the full long-form
 * text tucked inside a collapsed <details> (not the dominant flow).
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import { apiClient } from '../shared/api/client'
import type { RecordEnvelope } from '../types/kernel'
import { LabEntityWorkspace } from './LabEntityWorkspace'

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    getRecordEditorProjection: vi.fn(),
  },
}))

afterEach(() => {
  cleanup()
})

function renderProtocolRoute() {
  return render(
    <MemoryRouter initialEntries={['/lab/protocols/PRT-1']}>
      <Routes>
        <Route
          path="/lab/:category/:entityId"
          element={
            <ThemeProvider>
              <OpenTabsProvider>
                <LabEntityWorkspace />
              </OpenTabsProvider>
            </ThemeProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

function protocolRecord(payload: Record<string, unknown>): RecordEnvelope {
  return {
    recordId: 'PRT-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml',
    meta: { kind: 'protocol' },
    payload,
  }
}

describe('LabEntityWorkspace — protocol entity view', () => {
  beforeEach(() => {
    vi.mocked(apiClient.getRecord).mockResolvedValue(
      protocolRecord({
        kind: 'protocol',
        recordId: 'PRT-1',
        title: 'ROS Assay',
        steps: [
          { stepId: 'step-add', ordinal: 1, label: 'Add cells', kind: 'add_material', description: 'Seed 96-well plate' },
          { stepId: 'step-seal', ordinal: 2, label: 'Seal and read', kind: 'read', description: 'Seal plate and read fluorescence' },
        ],
        humanStepsText: '1. Add MatLyLu cells to a 96-well plate.\n2. Seal the plate and read fluorescence over 60 min.',
      }),
    )
    vi.mocked(apiClient.getRecordEditorProjection).mockResolvedValue({
      schemaId: 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml',
      recordId: 'PRT-1',
      title: 'ROS Assay',
      blocks: [],
      slots: [],
      diagnostics: [],
    } as never)
  })

  it('renders the concise step list as the primary main view', async () => {
    renderProtocolRoute()
    const list = await screen.findByTestId('protocol-steps-main')
    expect(list).toBeDefined()
    // Both concise step labels are visible in the main list.
    expect(await screen.findByText('Add cells')).toBeDefined()
    expect(screen.getByText('Seal and read')).toBeDefined()
  })

  it('keeps the full protocol text inside a collapsed details block', async () => {
    renderProtocolRoute()
    const details = await screen.findByTestId('protocol-full-text')
    // <details> is collapsed by default — the pre body is not open/visible.
    expect((details as HTMLDetailsElement).open).toBe(false)
    expect(screen.getByText('Full protocol text')).toBeDefined()
    // Long-form text is present but inside the collapsible block.
    expect(details.textContent).toContain('Add MatLyLu cells')
  })

  it('does not render the collapsible block when there is no humanStepsText', async () => {
    vi.mocked(apiClient.getRecord).mockResolvedValue(
      protocolRecord({
        kind: 'protocol',
        recordId: 'PRT-1',
        title: 'ROS Assay',
        steps: [{ stepId: 's1', ordinal: 1, label: 'Add cells', kind: 'add_material' }],
      }),
    )
    renderProtocolRoute()
    expect(await screen.findByTestId('protocol-steps-main')).toBeDefined()
    expect(screen.queryByTestId('protocol-full-text')).toBeNull()
  })
})
