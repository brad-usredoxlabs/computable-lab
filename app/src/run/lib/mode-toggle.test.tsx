import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ModeToggle, useModeToggle, type RunMode } from './mode-toggle'

afterEach(() => {
  cleanup()
})

function HookProbe() {
  const { mode, setMode } = useModeToggle()
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <ModeToggle mode={mode} onChange={setMode} />
    </div>
  )
}

describe('ModeToggle', () => {
  it('renders three buttons (Protocol Planning / Design / Execute)', () => {
    render(
      <MemoryRouter initialEntries={['/runs/RUN-1']}>
        <HookProbe />
      </MemoryRouter>,
    )
    expect(screen.getByText('Protocol Planning')).toBeDefined()
    expect(screen.getByText('Design')).toBeDefined()
    expect(screen.getByText('Execute')).toBeDefined()
  })

  it('defaults to plan (Design) when no mode param is present', () => {
    render(
      <MemoryRouter initialEntries={['/runs/RUN-1']}>
        <HookProbe />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('mode').textContent).toBe('plan')
  })

  it('clicking the third button sets ?mode=protocol-planning', () => {
    render(
      <MemoryRouter initialEntries={['/runs/RUN-1']}>
        <HookProbe />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText('Protocol Planning'))
    expect(screen.getByTestId('mode').textContent).toBe('protocol-planning')
  })

  it('reads protocol-planning from the URL param on load', () => {
    const probe = ({ mode }: { mode: RunMode }) => <span data-testid="mode">{mode}</span>
    render(
      <MemoryRouter initialEntries={['/runs/RUN-1?mode=protocol-planning']}>
        <UseModeProbe render={probe} />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('mode').textContent).toBe('protocol-planning')
  })
})

function UseModeProbe({ render: renderFn }: { render: (m: { mode: RunMode }) => React.ReactNode }) {
  const { mode } = useModeToggle()
  return <>{renderFn({ mode })}</>
}
