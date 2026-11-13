/**
 * u1nounprefill — /lab/labware/new seeds its name input from ?prefillName=.
 *
 * The journey opens the definition-create surface with the noun already
 * resolved, so the name input must render that value on first paint — no
 * re-typing (D8 ghost-first). No query, or empty/whitespace-only prefillName,
 * leaves the input exactly '' as before. Kept in a separate file from the
 * spec-sheet suite (LabLabwareNewPage.test.tsx) so neither can mask the other.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import { LabLabwareNewPage } from './LabLabwareNewPage'

afterEach(() => {
  cleanup()
  history.replaceState(null, '', '/')
})

/**
 * The lazy initialiser reads window.location.search (jsdom URL base is
 * http://localhost:5174/), so the query must be set on window.location, not
 * only on MemoryRouter's history — both are kept in sync here.
 */
function renderAt(pathname: string) {
  history.replaceState(null, '', pathname)
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route
          path="/lab/labware/new"
          element={
            <ThemeProvider>
              <OpenTabsProvider>
                <LabLabwareNewPage />
              </OpenTabsProvider>
            </ThemeProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('LabLabwareNewPage prefillName (u1nounprefill)', () => {
  it('seeds the name input from the declared ?prefillName= query value', () => {
    renderAt('/lab/labware/new?prefillName=96-well%20deepwell%20plate')
    const nameInput = screen.getByTestId('lab-labware-name-input') as HTMLInputElement
    expect(nameInput.value).toBe('96-well deepwell plate')
  })

  it('leaves the name input empty with no query and with empty prefillName (AC2)', () => {
    renderAt('/lab/labware/new')
    expect((screen.getByTestId('lab-labware-name-input') as HTMLInputElement).value).toBe('')
    cleanup()
    renderAt('/lab/labware/new?prefillName=')
    expect((screen.getByTestId('lab-labware-name-input') as HTMLInputElement).value).toBe('')
  })

  it('trims surrounding whitespace off the prefill value before seeding (M1 pin)', () => {
    renderAt('/lab/labware/new?prefillName=%20%20deepwell%20plate%20%20')
    const nameInput = screen.getByTestId('lab-labware-name-input') as HTMLInputElement
    expect(nameInput.value).toBe('deepwell plate')
  })

  it('leaves the name input empty when prefillName is whitespace-only (AC2, M1 pin)', () => {
    renderAt('/lab/labware/new?prefillName=%20%20%20')
    expect((screen.getByTestId('lab-labware-name-input') as HTMLInputElement).value).toBe('')
  })

  it('caps the prefilled value at 120 characters (M2 pin; display_name has no maxLength)', () => {
    renderAt(`/lab/labware/new?prefillName=${'a'.repeat(200)}`)
    expect((screen.getByTestId('lab-labware-name-input') as HTMLInputElement).value.length).toBe(120)
    cleanup()
    renderAt(`/lab/labware/new?prefillName=${'a'.repeat(121)}`)
    expect((screen.getByTestId('lab-labware-name-input') as HTMLInputElement).value.length).toBe(120)
    cleanup()
    renderAt(`/lab/labware/new?prefillName=${'a'.repeat(120)}`)
    expect((screen.getByTestId('lab-labware-name-input') as HTMLInputElement).value.length).toBe(120)
  })
})
