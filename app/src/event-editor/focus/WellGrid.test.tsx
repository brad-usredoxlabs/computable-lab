import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLabware } from '../../types/labware'
import { WellGrid } from './WellGrid'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('WellGrid', () => {
  it('selects a range while pointer capture retargets moves to the svg', () => {
    const labware = createLabware('plate_96', 'plate')
    const onWellRangeSelect = vi.fn()
    const onWellClick = vi.fn()
    const { container } = render(
      <WellGrid
        labware={labware}
        orientation="landscape"
        size={300}
        hoveredWellId={null}
        selectedWellIds={new Set()}
        onHover={() => undefined}
        onWellClick={onWellClick}
        onWellRangeSelect={onWellRangeSelect}
      />,
    )

    const svg = container.querySelector('svg') as SVGSVGElement
    const a1 = container.querySelector('[data-well-id="A1"]') as Element
    const b3 = container.querySelector('[data-well-id="B3"]') as Element
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => b3),
    })

    fireEvent.pointerDown(a1, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 10,
      clientY: 10,
    })
    fireEvent.pointerMove(svg, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 40,
      clientY: 40,
    })
    fireEvent.pointerUp(svg, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 40,
      clientY: 40,
    })

    expect(document.elementFromPoint).toHaveBeenCalledWith(40, 40)
    expect(onWellRangeSelect).toHaveBeenCalledTimes(1)
    expect(onWellRangeSelect.mock.calls[0][0]).toBe('A1')
    expect(onWellRangeSelect.mock.calls[0][1]).toBe('B3')
  })

  it('starts range feedback after drag threshold even before reaching another well', () => {
    const labware = createLabware('plate_96', 'plate')
    const onWellRangeSelect = vi.fn()
    const { container } = render(
      <WellGrid
        labware={labware}
        orientation="landscape"
        size={300}
        hoveredWellId={null}
        selectedWellIds={new Set()}
        onHover={() => undefined}
        onWellRangeSelect={onWellRangeSelect}
      />,
    )

    const svg = container.querySelector('svg') as SVGSVGElement
    const a1 = container.querySelector('[data-well-id="A1"]') as Element
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => a1),
    })

    fireEvent.pointerDown(a1, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 10,
      clientY: 10,
    })
    fireEvent.pointerMove(svg, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 20,
      clientY: 10,
    })

    expect(onWellRangeSelect).toHaveBeenCalledTimes(1)
    expect(onWellRangeSelect.mock.calls[0][0]).toBe('A1')
    expect(onWellRangeSelect.mock.calls[0][1]).toBe('A1')
  })

  it('keeps selecting when mobile browsers deliver drag moves at window', () => {
    const labware = createLabware('plate_96', 'plate')
    const onWellRangeSelect = vi.fn()
    const { container } = render(
      <WellGrid
        labware={labware}
        orientation="landscape"
        size={300}
        hoveredWellId={null}
        selectedWellIds={new Set()}
        onHover={() => undefined}
        onWellRangeSelect={onWellRangeSelect}
      />,
    )

    const a1 = container.querySelector('[data-well-id="A1"]') as Element
    const c4 = container.querySelector('[data-well-id="C4"]') as Element
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => c4),
    })

    fireEvent.pointerDown(a1, {
      pointerId: 3,
      pointerType: 'touch',
      clientX: 10,
      clientY: 10,
    })
    fireEvent.pointerMove(window, {
      pointerId: 3,
      pointerType: 'touch',
      clientX: 60,
      clientY: 60,
    })
    fireEvent.pointerUp(window, {
      pointerId: 3,
      pointerType: 'touch',
      clientX: 60,
      clientY: 60,
    })

    expect(document.elementFromPoint).toHaveBeenCalledWith(60, 60)
    expect(onWellRangeSelect).toHaveBeenCalledTimes(1)
    expect(onWellRangeSelect.mock.calls[0][0]).toBe('A1')
    expect(onWellRangeSelect.mock.calls[0][1]).toBe('C4')
  })

})
