import { afterEach, describe, expect, it } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { useMentionNavigation } from './useMentionNavigation'
import type { SlashMention } from './types'

function MentionHost({ mention }: { mention: SlashMention }) {
  useMentionNavigation()
  return (
    <span
      data-mention={JSON.stringify(mention)}
      data-testid="mention-pill"
      style={{ cursor: 'pointer' }}
    >
      {mention.label}
    </span>
  )
}

function LocationProbe() {
  const loc = useLocation()
  return <span data-testid="loc">{`${loc.pathname}${loc.search}`}</span>
}

afterEach(() => {
  cleanup()
})

describe('useMentionNavigation', () => {
  it('navigates to /browser?id=...&type=... when a material mention is clicked', () => {
    const mention: SlashMention = {
      type: 'material',
      entityKind: 'material',
      id: 'MAT-1',
      label: 'Tris',
    }
    const { getByTestId } = render(
      <MemoryRouter>
        <MentionHost mention={mention} />
        <LocationProbe />
      </MemoryRouter>,
    )
    fireEvent.click(getByTestId('mention-pill'))
    expect(getByTestId('loc').textContent).toBe('/browser?id=MAT-1&type=material')
  })

  it('passes labware kind through as type', () => {
    const mention: SlashMention = {
      type: 'labware',
      id: 'LBW-96',
      label: '96 plate',
    }
    const { getByTestId } = render(
      <MemoryRouter>
        <MentionHost mention={mention} />
        <LocationProbe />
      </MemoryRouter>,
    )
    fireEvent.click(getByTestId('mention-pill'))
    expect(getByTestId('loc').textContent).toBe('/browser?id=LBW-96&type=labware')
  })

  it('ignores selection mentions (no record target)', () => {
    const mention: SlashMention = {
      type: 'selection',
      selectionKind: 'source',
      labwareId: 'lbw-1',
      wells: ['A1'],
      label: 'src',
    }
    const { getByTestId } = render(
      <MemoryRouter initialEntries={['/somewhere']}>
        <MentionHost mention={mention} />
        <LocationProbe />
      </MemoryRouter>,
    )
    fireEvent.click(getByTestId('mention-pill'))
    expect(getByTestId('loc').textContent).toBe('/somewhere')
  })

  it('does not intercept cmd-click', () => {
    const mention: SlashMention = {
      type: 'material',
      entityKind: 'material',
      id: 'MAT-2',
      label: 'NaCl',
    }
    const { getByTestId } = render(
      <MemoryRouter initialEntries={['/somewhere']}>
        <MentionHost mention={mention} />
        <LocationProbe />
      </MemoryRouter>,
    )
    fireEvent.click(getByTestId('mention-pill'), { metaKey: true })
    expect(getByTestId('loc').textContent).toBe('/somewhere')
  })

  it('does nothing when data-mention is malformed', () => {
    function BrokenHost() {
      useMentionNavigation()
      return <span data-mention="not-json" data-testid="broken" />
    }
    const { getByTestId } = render(
      <MemoryRouter initialEntries={['/somewhere']}>
        <BrokenHost />
        <LocationProbe />
      </MemoryRouter>,
    )
    expect(() => fireEvent.click(getByTestId('broken'))).not.toThrow()
    expect(getByTestId('loc').textContent).toBe('/somewhere')
  })
})
