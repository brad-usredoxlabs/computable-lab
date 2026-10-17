/**
 * OWN-14 — Share entry point on the live record route (edit mode).
 *
 * RED AT BASE BY DESIGN: at the pre-item tip RecordHostPage has ZERO share
 * references, so the positive pins (control renders when the server declares
 * isPolicyRoot && canAdmin; clicking it opens ShareRecordDialog) fail until the
 * mount lands. The negative pins (no control when not permitted / while
 * loading / in create mode) hold at base and must keep holding.
 *
 * Gate contract (ratified Option B, OWN-14 spec bullet 1): visibility is gated
 * SOLELY on the server-declared pair from apiClient.getAccessPolicy(recordId):
 *   - {isPolicyRoot:true, canAdmin:true}  → control renders; click opens dialog
 *   - {isPolicyRoot:false}                → no control
 *   - {isPolicyRoot:true, canAdmin:false} → no control
 *   - policy still loading / fetch failed → no control
 *   - create mode (/record/new/…)         → no control AND no policy fetch
 * There is deliberately no client-side kind-list pin: none may exist.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from './useTheme'
import { OpenTabsProvider } from './OpenTabsContext'
import { defaultWorkspaceState } from '../../event-editor/workspace/types'
import type { AccessPolicyResponse } from '../../shared/api/client'

// ---------------------------------------------------------------------------
// Mocks — same seam idioms the RegistryHostPage suite uses.
// ---------------------------------------------------------------------------

const mocked = vi.hoisted(() => ({
  accessPolicy: vi.fn(),
}))

function accessPolicyResponse(
  overrides: Partial<AccessPolicyResponse> = {},
): AccessPolicyResponse {
  return {
    recordId: 'rec-1',
    kind: 'local-protocol',
    isPolicyRoot: true,
    canAdmin: true,
    canWrite: true,
    direct: {
      recordId: 'ACL-rec-1',
      visibility: 'private',
      ownerUserId: 'USR-1',
      grants: [],
    },
    effective: null,
    inherited: false,
    ...overrides,
  }
}

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    // RecordHostPage study-resolution + RecordEditPanel load
    getRecord: vi.fn().mockResolvedValue({
      recordId: 'rec-1',
      payload: { name: 'Test Record', kind: 'local-protocol' },
    }),
    getRecordEditorProjection: vi.fn().mockResolvedValue({
      schemaId: 'test-schema',
      recordId: 'rec-1',
      title: 'Test Record',
      blocks: [{ id: 'b1', kind: 'section', label: 'Section 1', slotIds: ['s1'] }],
      slots: [{ id: 's1', path: 'name', label: 'Name', widget: 'text' }],
      diagnostics: [],
    }),
    updateRecord: vi.fn().mockResolvedValue(undefined),
    // RecordCreatePanel draft-projection fetch (create-mode test)
    getEditorDraftProjection: vi.fn().mockResolvedValue({
      schemaId: 'test-schema',
      recordId: '',
      title: 'New record',
      blocks: [{ id: 'b1', kind: 'section', label: 'Section 1', slotIds: ['s1'] }],
      slots: [{ id: 's1', path: 'name', label: 'Name', widget: 'text' }],
      diagnostics: [],
    }),
    // OWN-14 gate — the ONE server-declared fact pair lives behind this call.
    getAccessPolicy: mocked.accessPolicy,
    // ShareRecordDialog payload
    listUsers: vi.fn().mockResolvedValue([]),
    listGroups: vi.fn().mockResolvedValue([]),
    getOwnershipPolicy: vi.fn().mockResolvedValue({ record: null, resolved: null }),
    // WorkspaceProvider persistence (per-study workspace.yaml)
    loadWorkspace: vi.fn().mockResolvedValue({ state: defaultWorkspaceState('STU-scratch') }),
    saveWorkspace: vi.fn().mockResolvedValue({ state: defaultWorkspaceState('STU-scratch') }),
    // SurfaceIndicator chrome
    getSurfaces: vi.fn().mockResolvedValue({ surfaces: [] }),
  },
}))

// RightPane pulls the AI-panel graph (pdfjs/DOMMatrix + the pre-existing
// missing draftChanges module) — same broken-at-base chain that fails
// RegistryHostPage.test.tsx today. The share gate lives in the page chrome,
// not the right pane, so stub the pane to keep this suite honest.
vi.mock('../../event-editor/right-pane/RightPane', () => ({
  RightPane: () => <div data-testid="right-pane" />,
}))

// The TapTab barrel pulls the full tiptap graph; the share control is
// independent of the editor body, so stub the barrel (RecordEditPanel's
// runtime imports from it are ProjectionTapTabEditor + serializeDocument).
vi.mock('../../editor/taptab', () => ({
  ProjectionTapTabEditor: () => <div data-testid="projection-taptab-editor" />,
  serializeDocument: (_json: unknown, fallback: unknown) => fallback,
}))

// Mounted through a lazy boundary exactly like App.tsx's DeferredRoute does,
// with the host appearing one commit AFTER the OpenTabsProvider (production
// order; a same-commit mount loses registration to the provider's
// mount-time loadFromStorage 'replace').
const Host = lazy(async () =>
  import('./RecordHostPage').then((m) => ({ default: m.RecordHostPage })),
)

function DeferredMount({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setReady(true)
  }, [])
  return ready ? <>{children}</> : <div data-testid="host-loading">Loading...</div>
}

function renderHost(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider>
        <OpenTabsProvider>
          {/* Same route shapes as App.tsx:202-203 so useParams resolves. */}
          <Routes>
            <Route
              path="/record/:recordId"
              element={
                <DeferredMount>
                  <Suspense fallback={<div data-testid="host-loading">Loading...</div>}>
                    <Host />
                  </Suspense>
                </DeferredMount>
              }
            />
            <Route
              path="/record/new/:nodeType/:parentId?"
              element={
                <DeferredMount>
                  <Suspense fallback={<div data-testid="host-loading">Loading...</div>}>
                    <Host />
                  </Suspense>
                </DeferredMount>
              }
            />
          </Routes>
        </OpenTabsProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

async function waitForEditPanel() {
  await waitFor(() => expect(screen.getByTestId('record-edit-panel')).toBeTruthy(), {
    timeout: 20_000,
  })
}

describe('RecordHostPage — Share entry point gated on the server-declared pair (OWN-14)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    mocked.accessPolicy.mockReset()
  })

  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  it(
    'edit mode + {isPolicyRoot:true, canAdmin:true}: the Share control renders and opens ShareRecordDialog',
    { timeout: 30_000 },
    async () => {
      mocked.accessPolicy.mockResolvedValue(accessPolicyResponse())
      renderHost('/record/rec-1')
      await waitForEditPanel()

      await waitFor(() => expect(screen.getByTestId('record-share-trigger')).toBeTruthy())
      expect(screen.getByTestId('record-share-trigger').textContent).toContain('Share')

      fireEvent.click(screen.getByTestId('record-share-trigger'))
      await waitFor(() =>
        expect(screen.getByRole('dialog', { name: /Sharing for rec-1/ })).toBeTruthy(),
      )
      // The gate consulted the server fact exactly once for this record.
      expect(mocked.accessPolicy).toHaveBeenCalledWith('rec-1')
    },
  )

  it(
    'edit mode + {isPolicyRoot:false}: no Share control',
    { timeout: 30_000 },
    async () => {
      mocked.accessPolicy.mockResolvedValue(
        accessPolicyResponse({ isPolicyRoot: false, canAdmin: true }),
      )
      renderHost('/record/rec-1')
      await waitForEditPanel()
      // Let the policy promise settle before asserting absence.
      await waitFor(() => expect(mocked.accessPolicy).toHaveBeenCalledWith('rec-1'))
      expect(screen.queryByTestId('record-share-trigger')).toBeNull()
    },
  )

  it(
    'edit mode + {canAdmin:false}: no Share control',
    { timeout: 30_000 },
    async () => {
      mocked.accessPolicy.mockResolvedValue(
        accessPolicyResponse({ isPolicyRoot: true, canAdmin: false }),
      )
      renderHost('/record/rec-1')
      await waitForEditPanel()
      await waitFor(() => expect(mocked.accessPolicy).toHaveBeenCalledWith('rec-1'))
      expect(screen.queryByTestId('record-share-trigger')).toBeNull()
    },
  )

  it(
    'while the policy is still loading: no Share control renders',
    { timeout: 30_000 },
    async () => {
      // A promise that never settles — the page must render nothing share-ish.
      mocked.accessPolicy.mockReturnValue(new Promise<AccessPolicyResponse>(() => {}))
      renderHost('/record/rec-1')
      await waitForEditPanel()
      expect(screen.queryByTestId('record-share-trigger')).toBeNull()
    },
  )

  it(
    'policy fetch failure: no Share control renders',
    { timeout: 30_000 },
    async () => {
      mocked.accessPolicy.mockRejectedValue(new Error('403 no access'))
      renderHost('/record/rec-1')
      await waitForEditPanel()
      await waitFor(() => expect(mocked.accessPolicy).toHaveBeenCalledWith('rec-1'))
      expect(screen.queryByTestId('record-share-trigger')).toBeNull()
    },
  )

  it(
    'create mode: no Share control and NO policy fetch at all',
    { timeout: 30_000 },
    async () => {
      renderHost('/record/new/study')
      await waitFor(() => expect(screen.getByTestId('record-create-panel')).toBeTruthy(), {
        timeout: 20_000,
      })
      expect(screen.queryByTestId('record-share-trigger')).toBeNull()
      expect(mocked.accessPolicy).not.toHaveBeenCalled()
    },
  )
})
