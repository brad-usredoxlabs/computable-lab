/**
 * GC-16 (W3) — RecordCreatePanel de-hardcoded kind→schemaId resolution:
 * a kind's schema $id comes from the SERVED schema registry (GET /schemas +
 * deriveSchemaNode, the same single resolver /browser and /registry use),
 * not a client-side kind→schema map that dead-ends on non-spine kinds.
 *
 * Contract this suite pins (the pre-GC-16 defect was `SCHEMA_IDS` literal
 * indexing: any non-spine kind resolved to `undefined` → the panel rendered
 * "New undefined" / "Create undefined" dead chrome and POSTed to
 * `createRecord(undefined, …)` — SCHEMA_NOT_FOUND):
 * - A SERVED non-spine kind (the knowledge triplet) resolves its schema $id
 *   from the served registry and renders the schema-backed form — NO
 *   "undefined" anywhere in the panel chrome (dead-chrome ban).
 * - An UNSERVED kind gets a LOUD NAMED refusal that names the kind — never
 *   "Create undefined", no editor, no create.
 * - The identity field is the schema-declared one: the spine mints into
 *   `recordId`; the knowledge triplet mints into `id`. A knowledge draft
 *   carries the kind + id and carries NO spine-only fields (studyId /
 *   experimentId / state / status — the knowledge schemas are
 *   unevaluatedProperties:false and declare none of them).
 * - The spine is unchanged (byte-identical): a spine kind does not touch the
 *   registry (no getSchemas call) and resolves its schema $id from the spine
 *   fallback literal — so a registry outage never regresses spine creation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { RecordCreatePanel } from './RecordCreatePanel'

const sid = (kind: string) =>
  `https://computable-lab.com/schema/computable-lab/${kind}.schema.yaml`

const mocked = vi.hoisted(() => ({
  createCalls: [] as Array<[string | undefined, Record<string, unknown>]>,
}))

function projectionFor(kind: string): Record<string, unknown> {
  // Mirror the live editor-draft shape: spine → $.recordId slot, knowledge →
  // $.id slot (verified against POST /api/ui/schema/:id/editor-draft).
  const idPath = kind === 'study' || kind === 'experiment' || kind === 'run'
    ? '$.recordId'
    : '$.id'
  return {
    schemaId: sid(kind),
    recordId: '__draft__',
    title: 'New record',
    blocks: [{ id: 'b1', kind: 'section', label: 'Body', slotIds: ['s1'] }],
    slots: [
      { id: 's-id', path: idPath, label: 'ID', widget: 'text', readOnly: true },
      { id: 's1', path: '$.title', label: 'Title', widget: 'text' },
      ...(kind === 'claim'
        ? [{ id: 's2', path: '$.statement', label: 'Statement', widget: 'text' }]
        : []),
    ],
    diagnostics: [],
  }
}

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    // The served registry metadata — the three knowledge kinds (the non-spine
    // kinds under test). Spine kinds are intentionally ABSENT: the spine must
    // not depend on the registry (spine safety net + no regression).
    getSchemas: vi.fn(() =>
      Promise.resolve(
        ['assertion', 'claim', 'evidence'].map((kind) => ({
          id: sid(kind),
          path: `knowledge/${kind}.schema.yaml`,
          title: kind,
        })),
      ),
    ),
    getEditorDraftProjection: vi.fn((schemaId: string) =>
      Promise.resolve(projectionFor(String(schemaId).split('/').pop() ?? '')),
    ),
    createRecord: vi.fn((schemaId: string, payload: Record<string, unknown>) => {
      mocked.createCalls.push([schemaId, payload])
      return Promise.resolve({ recordId: payload.recordId ?? payload.id })
    }),
  },
  // The real client barrel also exports describeApiError (used by the panel).
  describeApiError: (e: unknown) => String(e),
}))

vi.mock('../../editor/taptab', () => ({
  ProjectionTapTabEditor: React.forwardRef(
    (_props: unknown, ref: React.Ref<unknown>) => {
      React.useImperativeHandle(ref, () => ({
        getEditor: () => null,
      }))
      return <div data-testid="projection-taptab-editor" />
    },
  ),
  serializeDocument: (_json: unknown, fallback: Record<string, unknown>) =>
    fallback,
  stripSystemProvenance: (_p: Record<string, unknown>) => {},
}))

const onCreated = () => {}

describe('GC-16 W3 — RecordCreatePanel resolves kind→schemaId via the served registry', () => {
  beforeEach(() => {
    mocked.createCalls = []
    vi.clearAllMocks()
  })
  afterEach(() => cleanup())

  it('a served knowledge kind (claim) resolves its schema $id from the registry and renders the schema-backed form — no "undefined" chrome', async () => {
    const { apiClient } = await import('../../shared/api/client')
    render(
      <RecordCreatePanel nodeType="claim" draftTitle="my claim" onCreated={onCreated} />,
    )
    // Resolved from the served registry (GET /schemas) — not a client map.
    // The editor only mounts once BOTH the registry resolution and the
    // draft projection have settled (the projection effect keys on the
    // resolved schemaId), so waiting for the editor awaits the registry.
    await waitFor(() =>
      expect(screen.getByTestId('projection-taptab-editor')).toBeTruthy(),
    )
    expect(apiClient.getSchemas).toHaveBeenCalledTimes(1)
    expect(apiClient.getEditorDraftProjection).toHaveBeenCalledWith(sid('claim'))
    // Dead-chrome ban: the panel chrome never renders "undefined".
    const panel = screen.getByTestId('record-create-panel')
    expect(panel.textContent).not.toMatch(/undefined/i)
    expect(screen.getByText('Create claim')).toBeTruthy()
  })

  it('a knowledge draft carries kind + id (the schema-declared field) and NO spine-only fields', async () => {
    render(
      <RecordCreatePanel nodeType="assertion" draftTitle="ctx assertion" onCreated={onCreated} />,
    )
    await waitFor(() =>
      expect(screen.getByTestId('projection-taptab-editor')).toBeTruthy(),
    )
    fireEvent.click(screen.getByTestId('record-create-submit'))
    await waitFor(() => expect(mocked.createCalls).toHaveLength(1))
    const [schemaId, payload] = mocked.createCalls[0]
    expect(schemaId).toBe(sid('assertion'))
    expect(payload.kind).toBe('assertion')
    // The identity field is the schema-declared one (assertion declares `id`).
    expect(typeof payload.id).toBe('string')
    expect(payload.id).toMatch(/^ASN-/)
    expect(payload.recordId).toBeUndefined()
    // No spine-only fields: the knowledge schemas are unevaluatedProperties:false
    // and declare none of these — a knowledge draft must not carry them.
    expect(payload.studyId).toBeUndefined()
    expect(payload.experimentId).toBeUndefined()
    expect(payload.state).toBeUndefined()
    expect(payload.status).toBeUndefined()
  })

  it('an unserved kind is refused LOUD and NAMED — never "Create undefined", no editor, no create', async () => {
    render(
      <RecordCreatePanel nodeType="not-a-real-kind" onCreated={onCreated} />,
    )
    const refusal = await screen.findByTestId('record-create-refusal')
    expect(refusal.textContent).toContain('not-a-real-kind')
    expect(refusal.textContent).toContain('No registered schema')
    // Dead-chrome ban: the refusal NAMES the kind; "Create undefined" never appears.
    const panel = screen.getByTestId('record-create-panel')
    expect(panel.textContent).not.toContain('Create undefined')
    expect(panel.textContent).not.toContain('New undefined')
    expect(screen.queryByTestId('projection-taptab-editor')).toBeNull()
    expect(mocked.createCalls).toEqual([])
  })

  it('the spine is unchanged: no registry call, schema $id from the spine fallback, id minted into recordId + spine lifecycle fields', async () => {
    const { apiClient } = await import('../../shared/api/client')
    render(
      <RecordCreatePanel
        nodeType="experiment"
        studyId="STU-000001"
        draftTitle="my experiment"
        onCreated={onCreated}
      />,
    )
    // Spine does not depend on the registry (safety net — byte-identical to
    // pre-GC-16 even if the registry is unavailable).
    expect(apiClient.getSchemas).not.toHaveBeenCalled()
    expect(apiClient.getEditorDraftProjection).toHaveBeenCalledWith(sid('experiment'))
    await waitFor(() =>
      expect(screen.getByTestId('projection-taptab-editor')).toBeTruthy(),
    )
    fireEvent.click(screen.getByTestId('record-create-submit'))
    await waitFor(() => expect(mocked.createCalls).toHaveLength(1))
    const [schemaId, payload] = mocked.createCalls[0]
    expect(schemaId).toBe(sid('experiment'))
    expect(payload.kind).toBe('experiment')
    expect(payload.recordId).toMatch(/^EXP-/)
    expect(payload.id).toBeUndefined()
    // Spine lifecycle/hierarchy fields are preserved (unchanged behavior).
    expect(payload.studyId).toBe('STU-000001')
    expect(payload.state).toBe('draft')
  })
})
