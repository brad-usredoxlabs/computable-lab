/**
 * Tests for GhostLabwarePane component
 */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { GhostLabwarePane } from './GhostLabwarePane'

describe('GhostLabwarePane', () => {
  it('returns null for empty array', () => {
    const { container } = render(<GhostLabwarePane ghostLabwares={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders stub card when format is missing', () => {
    const ghostLabwares = [
      {
        recordId: 'plate-001',
        reason: 'proposed from prompt',
        labwareType: 'plate',
      },
    ]
    const { container, getByText } = render(<GhostLabwarePane ghostLabwares={ghostLabwares} />)
    
    // Check that the recordId is rendered
    expect(getByText('plate-001')).toBeTruthy()
    
    // Check that the reason is rendered
    expect(getByText('proposed from prompt')).toBeTruthy()
    
    // Check that the Proposed badge is present (query within container to avoid conflicts)
    const badge = container.querySelector('.ghost-labware-card__badge')
    expect(badge?.textContent).toBe('Proposed')
  })

  it('renders ghost pane for one addition with format', () => {
    const ghostLabwares = [
      {
        recordId: 'plate-002',
        title: '96-Well Plate',
        reason: 'AI suggested this plate',
        labwareType: 'plate',
        format: { rows: 8, cols: 12, wellCount: 96 },
      },
    ]
    const { container, getByText } = render(<GhostLabwarePane ghostLabwares={ghostLabwares} />)
    
    // Check that the title is rendered
    expect(getByText('96-Well Plate')).toBeTruthy()
    
    // Check that the format info is shown
    expect(getByText('8x12 labware')).toBeTruthy()
    
    // Check that the Proposed badge is present (query within container to avoid conflicts)
    const badge = container.querySelector('.ghost-labware-card__badge')
    expect(badge?.textContent).toBe('Proposed')
  })
})
