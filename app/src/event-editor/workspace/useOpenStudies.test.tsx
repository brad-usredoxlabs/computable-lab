/**
 * Tests for useOpenStudies — the reactive wrapper around the
 * openStudiesStorage helpers. Verifies that:
 *  - the hook returns the current list on render
 *  - calling openStudy / closeStudy via the hook re-renders subscribers
 *  - cross-tab `storage` events trigger a re-render
 *
 * The underlying storage tests live in openStudiesStorage.test.ts;
 * these focus on the React-reactivity layer.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import {
  clearOpenStudies,
  OPEN_STUDIES_STORAGE_KEY,
} from './openStudiesStorage'
import { useOpenStudies } from './useOpenStudies'

beforeEach(() => {
  clearOpenStudies()
})

afterEach(() => {
  cleanup()
  clearOpenStudies()
})

function Consumer() {
  const { studies, openStudy, closeStudy } = useOpenStudies()
  return (
    <div>
      <ul data-testid="list">
        {studies.map((s) => (
          <li key={s.studyId}>{s.studyId}</li>
        ))}
      </ul>
      <button
        type="button"
        data-testid="open-a"
        onClick={() => openStudy('STU-A', 'A')}
      >
        open A
      </button>
      <button
        type="button"
        data-testid="close-a"
        onClick={() => closeStudy('STU-A')}
      >
        close A
      </button>
    </div>
  )
}

describe('useOpenStudies', () => {
  it('returns the current list on first render', () => {
    render(<Consumer />)
    expect(screen.getByTestId('list').textContent).toBe('')
  })

  it('re-renders after openStudy', () => {
    render(<Consumer />)
    act(() => {
      screen.getByTestId('open-a').click()
    })
    expect(screen.getByTestId('list').textContent).toBe('STU-A')
  })

  it('re-renders after closeStudy', () => {
    render(<Consumer />)
    act(() => {
      screen.getByTestId('open-a').click()
    })
    act(() => {
      screen.getByTestId('close-a').click()
    })
    expect(screen.getByTestId('list').textContent).toBe('')
  })

  it('re-renders after a cross-tab storage event', () => {
    render(<Consumer />)
    act(() => {
      // Simulate another browser tab writing to localStorage.
      window.localStorage.setItem(
        OPEN_STUDIES_STORAGE_KEY,
        JSON.stringify([
          { studyId: 'STU-FROM-OTHER-TAB', openedAt: '2026-01-01T00:00:00Z' },
        ]),
      )
      window.dispatchEvent(
        new StorageEvent('storage', { key: OPEN_STUDIES_STORAGE_KEY }),
      )
    })
    expect(screen.getByTestId('list').textContent).toBe('STU-FROM-OTHER-TAB')
  })

  it('two consumers stay in sync via the shared notifier', () => {
    function TwoConsumers() {
      return (
        <>
          <Consumer />
          <Consumer />
        </>
      )
    }
    render(<TwoConsumers />)
    // Click open in the first consumer; both lists should update.
    const [openA] = screen.getAllByTestId('open-a')
    act(() => {
      openA.click()
    })
    const lists = screen.getAllByTestId('list')
    expect(lists[0].textContent).toBe('STU-A')
    expect(lists[1].textContent).toBe('STU-A')
  })
})
