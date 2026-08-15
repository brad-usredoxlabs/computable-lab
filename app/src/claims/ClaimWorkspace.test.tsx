/**
 * Tests for ClaimWorkspace — the individual claim view at /claims/:claimId.
 *
 * Coverage: rendering the claim payload, and the workspace tab strip staying
 * visible on the claim detail surface (the "zero tabs on every surface"
 * regression fix).
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import { apiClient } from '../shared/api/client'
import type { RecordEnvelope } from '../types/kernel'
import { ClaimWorkspace } from './ClaimWorkspace'

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
  },
}))

afterEach(() => {
  cleanup()
})

function renderClaimRoute() {
  return render(
    <MemoryRouter initialEntries={['/claims/CLM-1']}>
      <Routes>
        <Route
          path="/claims/:claimId"
          element={
            <ThemeProvider>
              <OpenTabsProvider>
                <ClaimWorkspace />
              </OpenTabsProvider>
            </ThemeProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

function claimRecord(payload: Record<string, unknown>): RecordEnvelope {
  return {
    recordId: 'CLM-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/claim.schema.yaml',
    meta: { kind: 'claim' },
    payload,
  }
}

describe('ClaimWorkspace', () => {
  it('renders the claim statement and status', async () => {
    vi.mocked(apiClient.getRecord).mockResolvedValue(
      claimRecord({
        recordId: 'CLM-1',
        statement: 'Rotenone increases ROS in viable cells',
        status: 'proposed',
      }),
    )
    renderClaimRoute()
    expect(await screen.findByText('Rotenone increases ROS in viable cells')).toBeDefined()
    expect(screen.getByText('proposed')).toBeDefined()
    expect(screen.getByTestId('claim-workspace')).toBeDefined()
  })

  it('keeps the workspace tab strip visible (reported "zero tabs" bug)', async () => {
    vi.mocked(apiClient.getRecord).mockResolvedValue(
      claimRecord({ recordId: 'CLM-1', statement: 'x', status: 'proposed' }),
    )
    renderClaimRoute()
    await screen.findByTestId('claim-workspace')
    expect(screen.getByTestId('workspace-tab-strip')).toBeDefined()
  })
})
