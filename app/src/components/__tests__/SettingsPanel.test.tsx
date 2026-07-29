/**
 * Unit tests for SettingsPanel component.
 *
 * Covers:
 * - Rendering different setting types (number, string, boolean, duration, temperature, volume, select)
 * - Change handling and value tracking
 * - Save callback invocation of onSave with correct changes
 * - Validation (min/max for numbers, required select, invalid input)
 * - Reset to defaults
 * - Read-only / locked settings
 * - Empty settings array
 * - Save button disabled when no changes
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SettingsPanel, validateSetting, type StepSetting } from '../SettingsPanel'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup()
})

function createSettings(overrides: Partial<StepSetting>[]): StepSetting[] {
  return overrides.map((o, i) => ({
    id: `setting-${i}`,
    name: `Setting ${i}`,
    type: 'string',
    defaultValue: '',
    options: undefined,
    ...o,
  }))
}

function renderPanel(settings: StepSetting[], onSave = vi.fn()) {
  return render(<SettingsPanel stepId="step-1" settings={settings} onSave={onSave} />)
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('rendering', () => {
  it('renders the panel with settings count', () => {
    const settings = createSettings([{ name: 'Temp' }, { name: 'Volume' }])
    renderPanel(settings)
    expect(screen.getByTestId('settings-panel')).toBeInTheDocument()
    expect(screen.getByText(/Step Settings/)).toBeInTheDocument()
    expect(screen.getByText(/\(2\)/)).toBeInTheDocument()
  })

  it('renders empty state when no settings provided', () => {
    renderPanel([])
    expect(screen.getByTestId('empty-settings')).toBeInTheDocument()
    expect(screen.getByText('No settings configured for this step.')).toBeInTheDocument()
  })

  it('renders a number input for "number" type', () => {
    const settings = createSettings([{ id: 'count', name: 'Count', type: 'number', defaultValue: 5 }])
    renderPanel(settings)
    const input = screen.getByTestId('input-count')
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('type', 'number')
    expect(input).toHaveValue(5)
  })

  it('renders a text input for "string" type', () => {
    const settings = createSettings([{ id: 'label', name: 'Label', type: 'string', defaultValue: 'test' }])
    renderPanel(settings)
    const input = screen.getByTestId('input-label')
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveValue('test')
  })

  it('renders a checkbox for "boolean" type', () => {
    const settings = createSettings([{ id: 'active', name: 'Active', type: 'boolean', defaultValue: true }])
    renderPanel(settings)
    const checkbox = screen.getByTestId('checkbox-active')
    expect(checkbox).toBeInTheDocument()
    expect(checkbox).toBeChecked()
  })

  it('renders a number input for "duration" type', () => {
    const settings = createSettings([{ id: 'dur', name: 'Duration', type: 'duration', defaultValue: 30, unit: 'min' }])
    renderPanel(settings)
    const input = screen.getByTestId('input-dur')
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('type', 'number')
    expect(screen.getByText('(min)')).toBeInTheDocument()
  })

  it('renders a number input for "temperature" type', () => {
    const settings = createSettings([{ id: 'temp', name: 'Temperature', type: 'temperature', defaultValue: 37, unit: '°C' }])
    renderPanel(settings)
    const input = screen.getByTestId('input-temp')
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('type', 'number')
  })

  it('renders a number input for "volume" type', () => {
    const settings = createSettings([{ id: 'vol', name: 'Volume', type: 'volume', defaultValue: 100, unit: 'mL' }])
    renderPanel(settings)
    const input = screen.getByTestId('input-vol')
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('type', 'number')
  })

  it('renders a select input for "select" type', () => {
    const settings = createSettings([
      {
        id: 'method',
        name: 'Method',
        type: 'select',
        defaultValue: 'option-a',
        options: ['option-a', 'option-b', 'option-c'],
      },
    ])
    renderPanel(settings)
    const select = screen.getByTestId('select-method')
    expect(select).toBeInTheDocument()
    expect(select).toHaveValue('option-a')
  })

  it('renders unit label when provided', () => {
    const settings = createSettings([{ id: 'temp', name: 'Temp', type: 'number', unit: '°C' }])
    renderPanel(settings)
    expect(screen.getByText(/\(°C\)/)).toBeInTheDocument()
  })

  it('renders "locked" badge when readOnly is true', () => {
    const settings = createSettings([{ id: 'fixed', name: 'Fixed', type: 'number', readOnly: true }])
    renderPanel(settings)
    expect(screen.getByText('locked')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Change handling
// ---------------------------------------------------------------------------

describe('change handling', () => {
  it('updates value when typing into a text input', () => {
    const settings = createSettings([{ id: 'label', name: 'Label', type: 'string', defaultValue: '' }])
    renderPanel(settings)
    const input = screen.getByTestId('input-label')
    fireEvent.change(input, { target: { value: 'new value' } })
    expect(input).toHaveValue('new value')
  })

  it('updates value when typing into a number input', () => {
    const settings = createSettings([{ id: 'count', name: 'Count', type: 'number', defaultValue: 5 }])
    renderPanel(settings)
    const input = screen.getByTestId('input-count')
    fireEvent.change(input, { target: { value: '42' } })
    expect(input).toHaveValue(42)
  })

  it('toggles a checkbox when clicked', () => {
    const settings = createSettings([{ id: 'active', name: 'Active', type: 'boolean', defaultValue: false }])
    renderPanel(settings)
    const checkbox = screen.getByTestId('checkbox-active')
    expect(checkbox).not.toBeChecked()
    fireEvent.click(checkbox)
    expect(checkbox).toBeChecked()
  })

  it('changes select value when option selected', () => {
    const settings = createSettings([
      {
        id: 'method',
        name: 'Method',
        type: 'select',
        defaultValue: 'option-a',
        options: ['option-a', 'option-b'],
      },
    ])
    renderPanel(settings)
    const select = screen.getByTestId('select-method')
    fireEvent.change(select, { target: { value: 'option-b' } })
    expect(select).toHaveValue('option-b')
  })
})

// ---------------------------------------------------------------------------
// Save behavior
// ---------------------------------------------------------------------------

describe('save behavior', () => {
  it('does not call onSave initially when no changes made', () => {
    const onSave = vi.fn()
    const settings = createSettings([{ id: 'count', name: 'Count', type: 'number', defaultValue: 5 }])
    renderPanel(settings, onSave)
    // Click save immediately
    fireEvent.click(screen.getByTestId('save-button'))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('calls onSave with correct stepId and changes', () => {
    const onSave = vi.fn()
    const settings = createSettings([
      { id: 'temp', name: 'Temperature', type: 'number', defaultValue: 25 },
      { id: 'active', name: 'Active', type: 'boolean', defaultValue: false },
    ])
    renderPanel(settings, onSave)

    // Change temperature
    fireEvent.change(screen.getByTestId('input-temp'), { target: { value: '37' } })
    // Toggle boolean
    fireEvent.click(screen.getByTestId('checkbox-active'))

    // Click save
    fireEvent.click(screen.getByTestId('save-button'))

    expect(onSave).toHaveBeenCalledWith('step-1', expect.objectContaining({ temp: '37' }))
  })

  it('calls onSave only with changed values, not defaults', () => {
    const onSave = vi.fn()
    const settings = createSettings([
      { id: 'a', name: 'A', type: 'string', defaultValue: 'hello' },
      { id: 'b', name: 'B', type: 'number', defaultValue: 10 },
    ])
    renderPanel(settings, onSave)

    // Only change 'b'
    fireEvent.change(screen.getByTestId('input-b'), { target: { value: '20' } })

    fireEvent.click(screen.getByTestId('save-button'))

    const saved = onSave.mock.calls[0][1]
    expect(saved).toHaveProperty('b')
    expect(saved).not.toHaveProperty('a')
  })

  it('enables Save button when changes are made', () => {
    const settings = createSettings([{ id: 'count', name: 'Count', type: 'number', defaultValue: 5 }])
    renderPanel(settings)

    const saveBtn = screen.getByTestId('save-button')
    expect(saveBtn).toBeDisabled()

    fireEvent.change(screen.getByTestId('input-count'), { target: { value: '42' } })
    expect(saveBtn).not.toBeDisabled()
  })

  it('shows Reset button when changes are made', () => {
    const settings = createSettings([{ id: 'count', name: 'Count', type: 'number', defaultValue: 5 }])
    renderPanel(settings)

    expect(screen.queryByTestId('reset-button')).not.toBeInTheDocument()

    fireEvent.change(screen.getByTestId('input-count'), { target: { value: '42' } })
    expect(screen.getByTestId('reset-button')).toBeInTheDocument()
  })

  it('resets values to defaults when Reset is clicked', () => {
    const onSave = vi.fn()
    const settings = createSettings([{ id: 'count', name: 'Count', type: 'number', defaultValue: 5 }])
    renderPanel(settings, onSave)

    // Change value
    fireEvent.change(screen.getByTestId('input-count'), { target: { value: '42' } })
    expect(screen.getByTestId('input-count')).toHaveValue(42)

    // Reset
    fireEvent.click(screen.getByTestId('reset-button'))
    expect(screen.getByTestId('input-count')).toHaveValue(5)

    // Save should be disabled again
    expect(screen.getByTestId('save-button')).toBeDisabled()
  })

  it('disables Save when changes are reset', () => {
    const settings = createSettings([{ id: 'count', name: 'Count', type: 'number', defaultValue: 5 }])
    renderPanel(settings)

    fireEvent.change(screen.getByTestId('input-count'), { target: { value: '42' } })
    expect(screen.getByTestId('save-button')).not.toBeDisabled()

    fireEvent.click(screen.getByTestId('reset-button'))
    expect(screen.getByTestId('save-button')).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('validation', () => {
  it('shows error when number input exceeds max', () => {
    const settings = createSettings([
      { id: 'temp', name: 'Temperature', type: 'number', defaultValue: 25, min: 0, max: 40 },
    ])
    renderPanel(settings)

    fireEvent.change(screen.getByTestId('input-temp'), { target: { value: '100' } })

    expect(screen.getByTestId('error-temp')).toBeInTheDocument()
    expect(screen.getByTestId('error-temp')).toHaveTextContent('Must be <= 40')
  })

  it('shows error when number input is below min', () => {
    const settings = createSettings([
      { id: 'count', name: 'Count', type: 'number', defaultValue: 5, min: 0, max: 100 },
    ])
    renderPanel(settings)

    fireEvent.change(screen.getByTestId('input-count'), { target: { value: '-10' } })

    expect(screen.getByTestId('error-count')).toBeInTheDocument()
    expect(screen.getByTestId('error-count')).toHaveTextContent('Must be >= 0')
  })

  it('does not show error for empty number input', () => {
    const settings = createSettings([
      { id: 'count', name: 'Count', type: 'number', defaultValue: 5, min: 0, max: 100 },
    ])
    renderPanel(settings)

    fireEvent.change(screen.getByTestId('input-count'), { target: { value: '' } })

    expect(screen.queryByTestId('error-count')).not.toBeInTheDocument()
  })

  it('catches invalid number input via validateSetting', () => {
    // jsdom sanitizes non-numeric input for type="number" inputs so we
    // can't test that path in the DOM.  Test the validator directly instead.
    const numSetting: StepSetting = { id: 'x', name: 'X', type: 'number' }
    expect(validateSetting(numSetting, 'abc')).toContain('Invalid number')
    expect(validateSetting(numSetting, '')).toBeNull() // empty is allowed
    expect(validateSetting(numSetting, 42)).toBeNull() // valid
  })

  it('does not save when validation errors exist', () => {
    const onSave = vi.fn()
    const settings = createSettings([
      { id: 'temp', name: 'Temperature', type: 'number', defaultValue: 25, min: 0, max: 100 },
    ])
    renderPanel(settings, onSave)

    // Set invalid value
    fireEvent.change(screen.getByTestId('input-temp'), { target: { value: '999' } })

    // Try to save
    fireEvent.click(screen.getByTestId('save-button'))

    expect(onSave).not.toHaveBeenCalled()
  })

  it('passes validation when value is within range', () => {
    const onSave = vi.fn()
    const settings = createSettings([
      { id: 'temp', name: 'Temperature', type: 'number', defaultValue: 25, min: 0, max: 100 },
    ])
    renderPanel(settings, onSave)

    fireEvent.change(screen.getByTestId('input-temp'), { target: { value: '50' } })

    fireEvent.click(screen.getByTestId('save-button'))

    expect(onSave).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Read-only settings
// ---------------------------------------------------------------------------

describe('read-only settings', () => {
  it('disables input for readOnly settings', () => {
    const settings = createSettings([{ id: 'fixed', name: 'Fixed', type: 'number', readOnly: true }])
    renderPanel(settings)

    const input = screen.getByTestId('input-fixed')
    expect(input).toBeDisabled()
  })

  it('disables checkbox for readOnly boolean settings', () => {
    const settings = createSettings([{ id: 'locked', name: 'Locked', type: 'boolean', readOnly: true }])
    renderPanel(settings)

    const checkbox = screen.getByTestId('checkbox-locked')
    expect(checkbox).toBeDisabled()
  })

  it('disables select for readOnly select settings', () => {
    const settings = createSettings([
      {
        id: 'method',
        name: 'Method',
        type: 'select',
        readOnly: true,
        options: ['a', 'b'],
      },
    ])
    renderPanel(settings)

    const select = screen.getByTestId('select-method')
    expect(select).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// Props propagation
// ---------------------------------------------------------------------------

describe('props', () => {
  it('passes through custom className', () => {
    const settings = createSettings([{ id: 'a', name: 'A', type: 'string' }])
    render(<SettingsPanel stepId="step-1" settings={settings} onSave={vi.fn()} className="custom-class" />)
    const panel = screen.getByTestId('settings-panel')
    expect(panel.className).toContain('custom-class')
  })

  it('passes the correct stepId to onSave', () => {
    const onSave = vi.fn()
    const settings = createSettings([{ id: 'a', name: 'A', type: 'string', defaultValue: '' }])
    render(<SettingsPanel stepId="my-step" settings={settings} onSave={onSave} />)

    fireEvent.change(screen.getByTestId('input-a'), { target: { value: 'changed' } })
    fireEvent.click(screen.getByTestId('save-button'))

    expect(onSave).toHaveBeenCalledWith('my-step', expect.any(Object))
  })
})
