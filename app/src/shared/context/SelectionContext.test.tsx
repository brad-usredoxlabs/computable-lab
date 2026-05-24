import { describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  SelectionProvider,
  useRequiredSelection,
  useSelection,
} from './SelectionContext'

function withProvider({ children }: { children: ReactNode }) {
  return <SelectionProvider>{children}</SelectionProvider>
}

describe('SelectionContext', () => {
  it('starts with null source and target', () => {
    const { result } = renderHook(() => useRequiredSelection(), {
      wrapper: withProvider,
    })
    expect(result.current.source).toBeNull()
    expect(result.current.target).toBeNull()
  })

  it('accepts wells and records selections', () => {
    const { result } = renderHook(() => useRequiredSelection(), {
      wrapper: withProvider,
    })

    act(() => {
      result.current.setSource({
        kind: 'wells',
        labwareId: 'lab-1',
        wells: ['A1', 'A2'],
        label: 'Source plate',
      })
      result.current.setTarget({
        kind: 'records',
        refs: [{ recordId: 'mat-7', kind: 'material' }],
      })
    })

    expect(result.current.source).toMatchObject({
      kind: 'wells',
      labwareId: 'lab-1',
      wells: ['A1', 'A2'],
    })
    expect(result.current.target).toMatchObject({
      kind: 'records',
      refs: [{ recordId: 'mat-7' }],
    })
  })

  it('clear() resets both source and target', () => {
    const { result } = renderHook(() => useRequiredSelection(), {
      wrapper: withProvider,
    })

    act(() => {
      result.current.setSource({ kind: 'wells', labwareId: 'l', wells: ['A1'] })
      result.current.setTarget({ kind: 'wells', labwareId: 'l', wells: ['B1'] })
      result.current.clear()
    })

    expect(result.current.source).toBeNull()
    expect(result.current.target).toBeNull()
  })

  it('useSelection returns null outside any provider (legacy surfaces)', () => {
    const { result } = renderHook(() => useSelection())
    expect(result.current).toBeNull()
  })

  it('useRequiredSelection throws outside a provider', () => {
    expect(() => renderHook(() => useRequiredSelection())).toThrow(
      /SelectionProvider/,
    )
  })
})
