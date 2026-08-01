import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InterpretationPanel } from './InterpretationPanel'

describe('InterpretationPanel', () => {
  it('renders operations with resolved and unresolved markers', () => {
    render(
      <InterpretationPanel
        interpretation={{
          operations: [
            { type: 'dispense', material: 'complete DMEM', resolved: true },
            { type: 'agitate', parameters: { speed: 'unresolved' }, resolved: false },
            { type: 'incubate', parameters: { temperature: '37°C' }, resolved: true },
          ]
        }}
      />,
    )
    expect(screen.getByText('DISPENSE')).toBeDefined()
    expect(screen.getByText(/complete DMEM/)).toBeDefined()
    expect(screen.getByText('AGITATE')).toBeDefined()
    expect(screen.getByText('INCUBATE')).toBeDefined()
  })

  it('shows empty state when no operations', () => {
    render(<InterpretationPanel interpretation={{ operations: [] }} />)
    expect(screen.getByText(/No operations parsed yet/)).toBeDefined()
  })

  it('renders parameters as key-value pairs', () => {
    render(
      <InterpretationPanel
        interpretation={{
          operations: [
            { type: 'incubate', parameters: { temperature: '37°C', duration: '16 hours' }, resolved: true },
          ]
        }}
      />,
    )
    expect(screen.getByText('temperature')).toBeDefined()
    expect(screen.getByText('37°C')).toBeDefined()
    expect(screen.getByText('duration')).toBeDefined()
    expect(screen.getByText('16 hours')).toBeDefined()
  })
})
