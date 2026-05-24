/**
 * Phase 4 — TapTab posture flag tests.
 *
 * The renderer applies `.taptab--prose` or `.taptab--form` to its container
 * based on (1) an explicit `style` prop, (2) `uiSpec.taptab.style` /
 * `projection.taptab.style`, or (3) the prose default. These tests assert
 * that policy at the DOM boundary without exercising the whole editor.
 */

import { describe, expect, it, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SelectionProvider } from '../../shared/context/SelectionContext'
import { ProjectionTapTabEditor, TapTabEditor } from './TapTabEditor'
import type { UISpec } from '../../types/uiSpec'

function wrap(ui: React.ReactNode) {
  return (
    <MemoryRouter>
      <SelectionProvider>{ui}</SelectionProvider>
    </MemoryRouter>
  )
}

const minimalProjection = {
  blocks: [{ id: 'b1', kind: 'section', label: 'Identity', slotIds: ['s1'] }],
  slots: [{ id: 's1', path: '$.title', label: 'Title', widget: 'text' }],
  data: { title: 'Hello' },
}

const minimalSpec: UISpec = {
  uiVersion: 1,
  schemaId: 'test',
  form: {
    layout: 'sections',
    sections: [
      {
        title: 'Identity',
        fields: [{ path: '$.title', widget: 'text', label: 'Title' }],
      },
    ],
  },
}

afterEach(() => {
  cleanup()
})

describe('TapTabEditor — taptab.style flag', () => {
  it('defaults the projection editor to prose mode', () => {
    const { container } = render(
      wrap(<ProjectionTapTabEditor {...minimalProjection} />),
    )
    expect(container.querySelector('.taptab--prose')).toBeTruthy()
    expect(container.querySelector('.taptab--form')).toBeFalsy()
  })

  it('switches to form mode when the prop is explicit', () => {
    const { container } = render(
      wrap(<ProjectionTapTabEditor {...minimalProjection} style="form" />),
    )
    expect(container.querySelector('.taptab--form')).toBeTruthy()
    expect(container.querySelector('.taptab--prose')).toBeFalsy()
  })

  it('TapTabEditor reads taptab.style from the UI spec by default', () => {
    const { container } = render(
      wrap(
        <TapTabEditor
          data={{ title: 'Hello' }}
          schema={{}}
          uiSpec={{ ...minimalSpec, taptab: { style: 'form' } }}
        />,
      ),
    )
    expect(container.querySelector('.taptab--form')).toBeTruthy()
  })

  it('an explicit prop wins over the UI spec flag', () => {
    const { container } = render(
      wrap(
        <TapTabEditor
          data={{ title: 'Hello' }}
          schema={{}}
          uiSpec={{ ...minimalSpec, taptab: { style: 'form' } }}
          style="prose"
        />,
      ),
    )
    expect(container.querySelector('.taptab--prose')).toBeTruthy()
    expect(container.querySelector('.taptab--form')).toBeFalsy()
  })
})
