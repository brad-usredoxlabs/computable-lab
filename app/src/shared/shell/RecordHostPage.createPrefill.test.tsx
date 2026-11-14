/**
 * u3defprefill (RED pin) — the record-create door opens a NON-SPINE kind with
 * the noun prefilled: /record/new/labware-definition?prefillName=… seeds the
 * kind's SCHEMA-DECLARED label slot (display_name) and injects NO `title` key
 * the schema does not declare (labware-definition is additionalProperties:false
 * and declares display_name, not title — a fabricated `title` would 422).
 *
 * This is the surface the journey declaration names (record-create,
 * config/journey/declarations/labware-definition.yaml:52) — NOT LabLabwareNewPage
 * (/lab/labware/new, u1nounprefill's different page, which is PROHIBITED here).
 *
 * Mock posture: apiClient stubs getSchemas (serves the labware-definition
 * registry entry so deriveSchemaNode resolves kind `labware-definition`),
 * getSchema (serves the REAL schema's declared properties — display_name, NOT
 * title), and getEditorDraftProjection (serves the draft projection with a
 * $.display_name slot). RightPane + SurfaceChatBridge are stubbed (this pin is
 * about the create door's prefill, not the universal chat — that is
 * RecordHostPage.surfaceChat.test.tsx). The taptab editor is a stub that
 * renders one input per projection slot so the label slot's value is
 * observable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from './useTheme'
import { OpenTabsProvider } from './OpenTabsContext'
import { defaultWorkspaceState } from '../../event-editor/workspace/types'

// The served registry metadata (GET /schemas) — EXACTLY the shape the server
// serves (reviewer-bait 5): path + $id, so deriveSchemaNode (SchemaTree.tsx:48)
// derives kind `labware-definition` from the FILE NAME (not a path-derived
// guess) and schemaId from `id`. The fixtures live inside the vi.hoisted block
// below (vi.mock factories are hoisted above const initialisation) and mirror
// the REAL schema document verbatim: additionalProperties:false, required
// [kind, id, display_name], properties declare `display_name` (NOT `title`,
// NOT `shortSlug`) — the panel resolves the prefill slot from THAT document.

// vi.hoisted: vi.mock factories are hoisted above const initialisation, so the
// fixture values are captured via a hoisted getter closure (same idiom the
// surfaceChat pin uses for its call capture) rather than referenced directly.
// `capturedData` records the `data` prop the panel hands the editor — i.e. the
// BUILT payload (the object that gets serialized + POSTed at submit). The pin
// asserts ITS KEYS, not just the rendered slot (reviewer-bait 1): a mutation
// that seeds `title` alongside the correct `display_name` still renders the
// label correctly but would fabricate a key the strict schema 422s.
const hoisted = vi.hoisted(() => ({
  capturedData: null as Record<string, unknown> | null,
  registry: () => [
    {
      path: 'schema/workflow/labware-definition.schema.yaml',
      id: 'https://computable-lab.com/schema/computable-lab/labware-definition.schema.yaml',
      title: 'Labware Definition',
    },
  ],
  schemaDoc: () => ({
    id: 'https://computable-lab.com/schema/computable-lab/labware-definition.schema.yaml',
    path: 'schema/workflow/labware-definition.schema.yaml',
    title: 'Labware Definition',
    schema: {
      $id: 'https://computable-lab.com/schema/computable-lab/labware-definition.schema.yaml',
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'id', 'display_name'],
      properties: {
        kind: { const: 'labware-definition' },
        id: { type: 'string' },
        display_name: { type: 'string' },
      },
    },
  }),
  draftProjection: () => ({
    schemaId: 'https://computable-lab.com/schema/computable-lab/labware-definition.schema.yaml',
    recordId: '__draft__',
    title: 'New record',
    blocks: [{ id: 'b1', kind: 'section', label: 'Labware definition', slotIds: ['s-display', 's-id'] }],
    slots: [
      { id: 's-display', path: '$.display_name', label: 'Display name', widget: 'text', required: true },
      { id: 's-id', path: '$.id', label: 'Identifier', widget: 'text', required: true },
    ],
    diagnostics: [],
  }),
}))

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getSchemas: vi.fn().mockImplementation(() => Promise.resolve(hoisted.registry())),
    getSchema: vi.fn().mockImplementation(() => Promise.resolve(hoisted.schemaDoc())),
    getEditorDraftProjection: vi.fn().mockImplementation(() => Promise.resolve(hoisted.draftProjection())),
    getRecord: vi.fn().mockResolvedValue({ recordId: 'rec-1', payload: {} }),
    getAccessPolicy: vi.fn().mockResolvedValue(null),
    getSurfaces: vi.fn().mockResolvedValue({ surfaces: [] }),
    loadWorkspace: vi.fn().mockResolvedValue({ state: defaultWorkspaceState('STU-1') }),
    saveWorkspace: vi.fn().mockResolvedValue({ state: defaultWorkspaceState('STU-1') }),
  },
  describeApiError: (e: unknown) => String(e),
}))

// The taptab editor is a stub that renders ONE input per projection slot,
// showing the value the panel seeded into `data` for that slot's path. This
// makes the label slot's value observable (the real editor is a TipTap
// document — overkill for this pin). It also captures the `data` object the
// panel hands it (the built payload) so the pin can assert the payload's KEYS
// directly — not only what renders.
vi.mock('../../editor/taptab', () => ({
  ProjectionTapTabEditor: (props: {
    blocks?: unknown[]
    slots?: Array<{ id: string; path: string; label?: string }>
    data?: Record<string, unknown>
  }) => {
    hoisted.capturedData = props.data ?? null
    const slots = props.slots ?? []
    return (
      <div data-testid="projection-taptab-editor">
        {slots.map((s) => {
          const field = s.path.replace(/^\$./, '')
          const v = props.data?.[field]
          return (
            <input
              key={s.id}
              data-testid={`taptab-slot:${field.replace(/[^a-zA-Z0-9]+/g, '_')}`}
              value={typeof v === 'string' ? v : ''}
            />
          )
        })}
      </div>
    )
  },
  serializeDocument: (_json: unknown, fallback: Record<string, unknown>) => fallback,
  stripSystemProvenance: (_p: Record<string, unknown>) => {},
}))

// RightPane + SurfaceChatBridge are out of scope (the surfaceChat pin covers
// the universal chat) — stub them so the create door's prefill is tested in
// isolation without the chat/pdf dependency chain.
vi.mock('../../event-editor/right-pane/RightPane', () => ({
  RightPane: () => <div data-testid="right-pane-stub" />,
}))
vi.mock('./SurfaceChatBridge', () => ({
  SurfaceChatBridge: () => null,
}))

import { RecordHostPage } from './RecordHostPage'

/**
 * Set the query on window.location (the lazy prefill initialiser reads
 * window.location.search — jsdom URL base is http://localhost:5174/) AND keep
 * MemoryRouter's history in sync (both, as LabLabwareNewPage.prefill.test.tsx
 * does), then render the record-create door.
 */
function renderAt(pathname: string) {
  history.replaceState(null, '', pathname)
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <ThemeProvider>
        <OpenTabsProvider>
          <Routes>
            <Route path="/record/new/:nodeType/:parentId?" element={<RecordHostPage />} />
          </Routes>
        </OpenTabsProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

/** The label slot's input (the $.display_name slot). */
const LABEL = 'taptab-slot:display_name'
/** A fabricated `title` slot — must NOT appear (the schema declares no title). */
const TITLE = 'taptab-slot:title'

describe('RecordHostPage create-door prefill (u3defprefill)', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => {
    cleanup()
    history.replaceState(null, '', '/')
    window.localStorage.clear()
  })

  it('(a) ?prefillName= seeds the SCHEMA-DECLARED label slot (display_name) — no fabricated `title`', { timeout: 30_000 }, async () => {
    renderAt('/record/new/labware-definition?prefillName=96-well%20deepwell%20plate')
    // The label slot is seeded once the served schema document has settled (the
    // prefill resolves the slot from the document's declared properties). Wait
    // for the editor to render AND the label to carry the prefilled noun.
    await waitFor(
      () => {
        const label = screen.queryByTestId(LABEL)
        expect(label).toBeTruthy()
        expect((label as HTMLInputElement).value).toBe('96-well deepwell plate')
      },
      { timeout: 20_000 },
    )
    // Payload-shape assertion (reviewer-bait 1): the BUILT payload (the `data`
    // the panel hands the editor — serialized + POSTed at submit) carries the
    // prefilled noun under the SCHEMA-DECLARED key `display_name` and NO
    // `title` key (additionalProperties:false + no declared `title` → a
    // fabricated title the person never stated would 422 on the server Ajv).
    expect(hoisted.capturedData).not.toBeNull()
    expect(hoisted.capturedData!.display_name).toBe('96-well deepwell plate')
    expect('title' in (hoisted.capturedData! as Record<string, unknown>)).toBe(false)
    // No fabricated `title` SLOT in the form either.
    expect(screen.queryByTestId(TITLE)).toBeNull()
  })

  it('(b) NO query / empty prefillName leaves the label slot EMPTY — no fabricated noun (AC2)', { timeout: 30_000 }, async () => {
    renderAt('/record/new/labware-definition')
    await waitFor(
      () => {
        const label = screen.queryByTestId(LABEL)
        expect(label).toBeTruthy()
        expect((label as HTMLInputElement).value).toBe('')
      },
      { timeout: 20_000 },
    )
    // No prefill → the payload seeds NEITHER a `title` nor a `display_name`
    // value: nothing is invented (AC2 — no fabricated noun, no default text).
    expect(hoisted.capturedData).not.toBeNull()
    const payloadB = hoisted.capturedData as Record<string, unknown>
    expect('title' in payloadB).toBe(false)
    const dnB = payloadB.display_name
    expect(dnB === undefined || dnB === '').toBe(true)
    expect(screen.queryByTestId(TITLE)).toBeNull()
    cleanup()
    // Empty prefillName (AC2) — same empty outcome.
    renderAt('/record/new/labware-definition?prefillName=')
    await waitFor(
      () => {
        const label = screen.queryByTestId(LABEL)
        expect(label).toBeTruthy()
        expect((label as HTMLInputElement).value).toBe('')
      },
      { timeout: 20_000 },
    )
    expect('title' in (hoisted.capturedData as Record<string, unknown>)).toBe(false)
    expect(screen.queryByTestId(TITLE)).toBeNull()
  })
})
