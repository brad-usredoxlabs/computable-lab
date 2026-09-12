import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useEffect } from 'react'
import { ProtocolSelectionProvider, useProtocolSelection } from '../../protocol/ProtocolSelectionContext'
import { ProtocolNavPanel } from './ProtocolNavPanel'

afterEach(() => {
  cleanup()
})

type Step = { stepId: string; label: string; ordinal: number; description?: string }
type FocusChange = { stepId: string; label: string; ordinal?: number } | null
type Graph = { id: string; events: Record<string, unknown>[]; labwares: Record<string, unknown>[] }

function renderNav(opts: {
  steps?: Step[]
  graphs?: Record<string, Graph>
  onFocusChange?: (f: FocusChange) => void
}) {
  const { steps = [], graphs = {}, onFocusChange } = opts
  const seedDone = { current: false }
  const reportDone = { current: false }
  return render(
    <ProtocolSelectionProvider>
      <Harness
        steps={steps}
        graphs={graphs}
        seedDone={seedDone}
        reportDone={reportDone}
        onFocusChange={onFocusChange}
      />
      <ProtocolNavPanel title="CellROX Run" />
    </ProtocolSelectionProvider>,
  )
}

/** Seeds the nav state once, then reports every focus change via effect. */
function Harness({
  steps,
  graphs,
  seedDone,
  reportDone,
  onFocusChange,
}: {
  steps: Step[]
  graphs: Record<string, Graph>
  seedDone: { current: boolean }
  reportDone: { current: boolean }
  onFocusChange?: (f: FocusChange) => void
}) {
  const sel = useProtocolSelection()
  useEffect(() => {
    if (seedDone.current) return
    seedDone.current = true
    sel?.setSteps(steps)
    for (const [id, g] of Object.entries(graphs)) sel?.setStepGraph(id, g)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!onFocusChange) return
    if (!reportDone.current) {
      reportDone.current = true
      return
    }
    onFocusChange(sel?.focusedStep ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.focusedStep])
  return null
}

describe('ProtocolNavPanel (left navigation rail)', () => {
  it('renders the protocol step concepts with ordinals', () => {
    renderNav({
      steps: [
        { stepId: 's1', label: 'Seed cells', ordinal: 1 },
        { stepId: 's2', label: 'Add Compound B', ordinal: 2 },
      ],
    })
    expect(screen.getByTestId('protocol-nav-list')).not.toBeNull()
    expect(screen.getByTestId('protocol-nav-step-s2').textContent).toContain('Add Compound B')
    expect(screen.getByTestId('protocol-nav-step-s2').textContent).toContain('2')
  })

  it('shows a realize badge for steps with a committed sub-graph', () => {
    renderNav({
      steps: [{ stepId: 's1', label: 'Seed cells', ordinal: 1 }],
      graphs: { s1: { id: 'EVG-1', events: [], labwares: [] } },
    })
    expect(screen.getByTestId('protocol-nav-step-s1').textContent).toContain('✓')
  })

  it('clicking a step focuses it on the deck (writes the shared context)', () => {
    const focusEvents: FocusChange[] = []
    renderNav({
      steps: [{ stepId: 's1', label: 'Seed cells', ordinal: 1 }],
      onFocusChange: (f) => focusEvents.push(f),
    })
    fireEvent.click(screen.getByTestId('protocol-nav-step-s1'))
    expect(focusEvents).toContainEqual({ stepId: 's1', label: 'Seed cells', ordinal: 1 })
    expect(screen.getByTestId('protocol-nav-step-s1').getAttribute('aria-pressed')).toBe('true')
  })

  it('clicking the already-focused step clears focus (restore flat ghosting)', () => {
    const focusEvents: FocusChange[] = []
    renderNav({
      steps: [{ stepId: 's1', label: 'Seed cells', ordinal: 1 }],
      onFocusChange: (f) => focusEvents.push(f),
    })
    const step = screen.getByTestId('protocol-nav-step-s1')
    fireEvent.click(step)
    fireEvent.click(step)
    expect(focusEvents).toContainEqual({ stepId: 's1', label: 'Seed cells', ordinal: 1 })
    expect(focusEvents).toContainEqual(null)
    expect(screen.getByTestId('protocol-nav-step-s1').getAttribute('aria-pressed')).toBe('false')
  })

  it('renders an empty hint before any protocol is attached', () => {
    renderNav({})
    expect(screen.getByTestId('protocol-nav')).not.toBeNull()
    expect(screen.getByText(/Attach a protocol/i)).not.toBeNull()
  })

  it('shows a tooltip with the full step text on hover', () => {
    renderNav({
      steps: [
        {
          stepId: 's1',
          label: 'Seed cells',
          ordinal: 1,
          description: 'Seed 25,000 HepG2 cells per T25 flask in DMEM + 10% FBS and grow to sub-confluency.',
        },
      ],
    })
    const step = screen.getByTestId('protocol-nav-step-s1')
    expect(screen.queryByTestId('protocol-nav-tooltip')).toBeNull()
    fireEvent.mouseEnter(step)
    const tip = screen.getByTestId('protocol-nav-tooltip')
    expect(tip).not.toBeNull()
    expect(tip.textContent).toContain('Seed 25,000 HepG2 cells per T25 flask')
    fireEvent.mouseLeave(step)
    expect(screen.queryByTestId('protocol-nav-tooltip')).toBeNull()
  })

  it('shows no tooltip for a step without a description', () => {
    renderNav({ steps: [{ stepId: 's2', label: 'Add Compound B', ordinal: 2 }] })
    fireEvent.mouseEnter(screen.getByTestId('protocol-nav-step-s2'))
    expect(screen.queryByTestId('protocol-nav-tooltip')).toBeNull()
  })

  it('shows a tooltip on keyboard focus (accessibility)', () => {
    renderNav({
      steps: [
        {
          stepId: 's3',
          label: 'Induce',
          ordinal: 3,
          description: 'Add 1 uM clofibrate to induce PPARa target genes.',
        },
      ],
    })
    const step = screen.getByTestId('protocol-nav-step-s3')
    fireEvent.focus(step)
    expect(screen.getByTestId('protocol-nav-tooltip').textContent).toContain('clofibrate')
  })
})
