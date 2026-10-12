/**
 * QMS-8-POLICY-BUNDLE-SWITCH FIX-RUN-1 (adversarial defect 5) —
 * SettingsPage policy-bundle error path must NOT dead-end.
 *
 * Defect: the `labSettingsError ?` branch REPLACED the PolicyBundleSelector
 * entirely, so after a refused switch (e.g. the 403 FORBIDDEN the admin gate
 * returns) the user could not re-attempt the sandbox->regulated->sandbox
 * round trip without a full page reload.
 *
 * Required behavior (fix spec): the error renders as a row ABOVE the bundle
 * control, the selector stays usable, and the next attempt clears the error.
 * The acceptance round-trip must survive a refusal.
 *
 * fetch is mocked module-globally (style: client.labSettings.test.ts); the
 * page itself (SettingsPage) is rendered for real. The selector is located by
 * its existing `.policy-bundle-selector` class (the component is not owned by
 * this item — no testid is added to it).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// The bare-host <Slot> renders NullSlot (defaultManifest is empty). Mock the
// extensions barrel so SettingsPage's import chain never pulls loadOverlay's
// `virtual:cla-ai-overlay` (a pre-existing vitest collection failure class —
// src/extensions/ExtensionContext.test.tsx is in the pinned baseline fail-SET
// for exactly this reason). Faithful to bare-CL behavior: the AI slot renders
// nothing; the Policy Bundle section under test is unaffected.
vi.mock('../extensions', () => ({ Slot: () => null }))

import { SettingsPage } from './SettingsPage'
import { CurrentUserProvider } from '../shared/identity/CurrentUserProvider'

// Merged wire shape: the data-driven PolicyBundleSelector (main's Oct 3-6
// rework) renders the level cards from availablePolicyBundles — the merged
// GET/PATCH /settings/lab always carries the catalog (bundleService.listBundles).
const BUNDLE_CATALOG = [
  { id: 'POL-SANDBOX', label: 'Sandbox', level: 0 },
  { id: 'POL-REGULATED', label: 'Regulated', level: 3 },
]
const SANDBOX_BODY = {
  materialTracking: { mode: 'relaxed', allowAdHocEventInstances: true },
  policyBundleId: 'POL-SANDBOX',
  activePolicyBundle: { id: 'POL-SANDBOX', label: 'Sandbox', level: 0 },
  availablePolicyBundles: BUNDLE_CATALOG,
}
const REGULATED_BODY = {
  materialTracking: { mode: 'relaxed', allowAdHocEventInstances: true },
  policyBundleId: 'POL-REGULATED',
  activePolicyBundle: { id: 'POL-REGULATED', label: 'Regulated', level: 3 },
  availablePolicyBundles: BUNDLE_CATALOG,
}

const META_BODY = {
  server: { version: 'test', uptime: '0s', uptimeMs: 0 },
  schemas: { source: 'bundled', count: 0 },
  lint: { ruleCount: 0 },
  jsonld: { context: '{}' },
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 403 ? 'Forbidden' : '',
    json: async () => body,
  } as Response
}

/** Mutable switch: 'deny' makes the PATCH 403, 'allow' makes it 200. */
let mode: 'deny' | 'allow'
let patchCalls: Array<{ method: string; body?: unknown }>

function routeFetch(input: unknown, init?: RequestInit) {
  const url = String(input)
  const method = (init?.method ?? 'GET').toUpperCase()
  const path = new URL(url, 'http://localhost:5174').pathname

  if (path === '/api/settings/lab' && method === 'PATCH') {
    patchCalls.push({ method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (mode === 'deny') {
      return Promise.resolve(jsonResponse(403, {
        error: 'FORBIDDEN',
        message: 'Policy bundle change forbidden: user USR-BRAD does not hold the admin role.',
      }))
    }
    return Promise.resolve(jsonResponse(200, REGULATED_BODY))
  }
  if (path === '/api/settings/lab') return Promise.resolve(jsonResponse(200, SANDBOX_BODY))
  if (path === '/api/meta') return Promise.resolve(jsonResponse(200, META_BODY))
  if (path === '/api/config') return Promise.resolve(jsonResponse(200, { repositories: [] }))
  if (path === '/api/users') return Promise.resolve(jsonResponse(200, { users: [] }))
  if (path === '/api/groups') return Promise.resolve(jsonResponse(200, { groups: [] }))
  if (path === '/api/me') return Promise.resolve(jsonResponse(200, { userId: null, groups: [] }))
  return Promise.resolve(jsonResponse(404, { error: 'Not Found', message: `stub: ${method} ${path}` }))
}

beforeEach(() => {
  mode = 'deny'
  patchCalls = []
  vi.stubGlobal('fetch', vi.fn(routeFetch))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <CurrentUserProvider>
        <SettingsPage />
      </CurrentUserProvider>
    </MemoryRouter>,
  )
}

describe('SettingsPage policy-bundle error path (FIX-RUN-1 defect 5)', () => {
  it('a refused switch shows the server message AND keeps the bundle selector usable (retry without reload)', async () => {
    const { container } = renderPage()

    // The selector renders from the initial GET (Policy Bundle section).
    await screen.findByText('Enforcement Level')
    const selectorBefore = container.querySelector<HTMLElement>('.policy-bundle-selector')
    expect(selectorBefore).not.toBeNull()

    // Attempt 1: click "Regulated" — the server refuses with 403 FORBIDDEN.
    fireEvent.click(within(selectorBefore!).getByText('Regulated').closest('button')!)
    const errorRow = await screen.findByTestId('lab-settings-error')
    expect(errorRow.textContent).toContain('FORBIDDEN')
    expect(errorRow.textContent).toContain('admin role')

    // THE DEFECT: the selector must NOT be replaced by the error.
    const selectorAfter = container.querySelector<HTMLElement>('.policy-bundle-selector')
    expect(selectorAfter).not.toBeNull()
    expect(within(selectorAfter!).getByText('Regulated')).toBeDefined()
    expect(within(selectorAfter!).getByText('Sandbox')).toBeDefined()

    // The error row sits ABOVE the control (document order), not instead of it:
    // errorRow.compareDocumentPosition(selector) reports the selector as FOLLOWING.
    const position = errorRow.compareDocumentPosition(selectorAfter!)
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // Attempt 2 (retry on the SAME page, no reload): now allowed -> 200.
    mode = 'allow'
    fireEvent.click(within(selectorAfter!).getByText('Regulated').closest('button')!)
    await waitFor(() => expect(patchCalls.length).toBe(2))
    expect(patchCalls[1]!.body).toEqual({ policyBundleId: 'POL-REGULATED' })

    // Success clears the error and the selector reflects the new bundle.
    await waitFor(() => expect(container.querySelector('[data-testid="lab-settings-error"]')).toBeNull())
    const finalSelector = container.querySelector<HTMLElement>('.policy-bundle-selector')!
    // Merged data-driven selector marks the active card with data-active +
    // inline accent (the Tailwind level classes belonged to the superseded
    // hardcoded selector).
    const regulatedBtn = within(finalSelector).getByText('Regulated').closest('button')!
    expect(regulatedBtn.getAttribute('data-active')).toBe('true')
  })
})
