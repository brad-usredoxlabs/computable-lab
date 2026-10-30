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
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import yaml from 'yaml'
import Ajv2020Module from 'ajv/dist/2020.js'
import { RecordCreatePanel } from './RecordCreatePanel'

const Ajv2020 = (Ajv2020Module as unknown as { default: typeof Ajv2020Module }).default

const SCHEMA_ROOT = resolve(process.cwd(), '..', 'schema')

/** Walk schema/** for .schema.yaml and register every $id (mirrors the
 *  server's Ajv registration; cross-file $refs resolve by $id). Same
 *  options as the server: strict:false, allErrors:true. */
function loadKnowledgeAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e)
      if (statSync(p).isDirectory()) walk(p, out)
      else if (p.endsWith('.schema.yaml')) out.push(p)
    }
    return out
  }
  for (const f of walk(SCHEMA_ROOT)) {
    const doc = yaml.parse(readFileSync(f, 'utf-8')) as { $id?: string }
    if (doc && doc.$id) {
      try {
        ajv.addSchema(doc)
      } catch {
        // A duplicate $id (mirrored copy) is not load-bearing here.
      }
    }
  }
  return ajv
}

type Ajv = ReturnType<typeof loadKnowledgeAjv>

/** Validate a payload against the REAL schema/knowledge/<kind>.schema.yaml. */
function ajvErrorsFor(ajv: Ajv, kind: string, payload: Record<string, unknown>) {
  const validate = ajv.getSchema(sid(kind))!
  return validate(payload) ? [] : (validate.errors ?? [])
}

const sid = (kind: string) =>
  `https://computable-lab.com/schema/computable-lab/${kind}.schema.yaml`

const mocked = vi.hoisted(() => ({
  createCalls: [] as Array<[string | undefined, Record<string, unknown>]>,
  // GC-16 FIX RUN 2 (defect 5): the fallback-on-failure leg flips the
  // registry to a failing call (setRegistryMode('fail')) — the spine must
  // then resolve from the SPINE_SCHEMA_IDS literal; every other mode serves.
  registryMode: 'ok' as 'ok' | 'fail',
  // GC-16 FIX RUN 2 (D6): the author's committed fields (reported through the
  // mock editor's onUpdate, the serializeDocument path). null = no authored
  // fields beyond the panel's own seed.
  authorUpdate: null as Record<string, unknown> | null,
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
    // The served registry metadata (GET /schemas). GC-16 FIX RUN 2 (defect 5):
    // the registry is the PRIMARY resolver for EVERY kind (spine included) —
    // the mock now serves the knowledge triplet AND the three spine kinds, so
    // the spine resolves through the registry like every other kind. The
    // SPINE_SCHEMA_IDS literal is exercised only by the fallback-on-failure
    // leg (setRegistryMode('fail')).
    getSchemas: vi.fn(() =>
      mocked.registryMode === 'fail'
        ? Promise.reject(new Error('registry unavailable'))
        : Promise.resolve(
            ['assertion', 'claim', 'evidence', 'study', 'experiment', 'run'].map(
              (kind) => ({
                id: sid(kind),
                path: `${kind === 'study' || kind === 'experiment' || kind === 'run' ? 'studies' : 'knowledge'}/${kind}.schema.yaml`,
                title: kind,
              }),
            ),
          ),
    ),
    getEditorDraftProjection: vi.fn((schemaId: string) =>
      Promise.resolve(projectionFor(String(schemaId).split('/').pop() ?? '')),
    ),
    createRecord: vi.fn((schemaId: string, payload: Record<string, unknown>) => {
      mocked.createCalls.push([schemaId, payload])
      return Promise.resolve({ recordId: payload.recordId ?? payload.id })
    }),
    // GET /schemas/:id — the served schema document. GC-16 FIX RUN 2
    // (defects 1/4/9): the panel reads the declared `properties` (shortSlug?)
    // and top-level `required` (title?) from THIS document. Shapes mirror the
    // real schemas: the spine declares + requires shortSlug and (study/
    // experiment) require title; the knowledge triplet declares neither.
    getSchema: vi.fn((schemaId: string) => {
      const base = String(schemaId).split('/').pop() ?? ''
      const kind = base.replace(/\.schema\.yaml$/, '')
      const spine = kind === 'study' || kind === 'experiment' || kind === 'run'
      const properties: Record<string, unknown> = { id: { type: 'string' }, kind: { const: kind } }
      const required = spine ? ['kind', 'recordId'] : ['kind', 'id']
      if (spine) {
        properties.recordId = { type: 'string' }
        properties.shortSlug = { type: 'string' }
        required.push('shortSlug')
      }
      if (spine && (kind === 'study' || kind === 'experiment')) {
        properties.title = { type: 'string' }
        required.push('title')
      }
      return Promise.resolve({
        id: schemaId,
        path: `schema/${kind}.schema.yaml`,
        title: kind,
        schema: { $id: schemaId, type: 'object', properties, required },
      })
    }),
  },
  // The real client barrel also exports describeApiError (used by the panel).
  describeApiError: (e: unknown) => String(e),
}))

vi.mock('../../editor/taptab', () => ({
  ProjectionTapTabEditor: React.forwardRef(
    (props: { onUpdate?: (p: Record<string, unknown>) => void }, ref: React.Ref<unknown>) => {
      // GC-16 FIX RUN 2 (D6): the author's committed fields arrive through the
      // editor's onUpdate (serializeDocument) path — exactly how a real
      // projection-backed editor reports an authored value. The test sets
      // `mocked.authorUpdate` and the (mock) editor reports it on mount so
      // the panel's formData (the payload it POSTs when getEditor() is null)
      // carries the authored fields.
      React.useEffect(() => {
        if (mocked.authorUpdate) props.onUpdate?.(mocked.authorUpdate)
      }, [])
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
    mocked.authorUpdate = null
    mocked.registryMode = 'ok'
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

  it('a knowledge draft is schema-driven: NO client-stamped shortSlug, NO client-minted id — and the captured payload is VALID against the REAL assertion.schema.yaml (Ajv)', async () => {
    // GC-16 FIX RUN 2 — the D1 (shortSlug) + D4 (id mint) + D6 (payload
    // schema-validity) leg. The D6 Ajv assertion is the D1 proof: at 1f7a92fe
    // the panel stamped shortSlug + an ASN- id on every knowledge payload and
    // this Ajv leg REDs on unevaluatedProperties:shortSlug (and the /id
    // shape); with the schema-driven fix the same assertion is GREEN.
    //
    // D13 DISCLOSURE (review cycle 2): the id + scope below are INJECTED
    // through the mocked editor's onUpdate (mocked.authorUpdate — the
    // serializeDocument path), NOT driven through the real taptab inputs.
    // The REAL-FORM acceptance leg — the $.id slot editable for
    // assertion+claim (the D10 data fix), the id authored through the real
    // input, and a real-form assertion payload valid against the REAL
    // assertion.schema.yaml — lives in
    // RecordCreatePanel.gc16-widget-commit.test.tsx
    // ("GC-16 FIX RUN 3 D10 + D13"), over the real projection + real
    // serializer. This mocked leg pins the PANEL's own identity behavior
    // (no client stamp, no mint) against that real-form witness.
    mocked.authorUpdate = { id: 'ASN-0001', scope: 'global' }
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
    expect(payload.recordId).toBeUndefined()
    // D4 (provisional D-A): NO client-minted id — the captured id is the
    // AUTHOR's (supplied through the form), not a client-fabricated ASN-<rand>.
    expect(payload.id).toBe('ASN-0001')
    // D1: the assertion schema is unevaluatedProperties:false and declares no
    // shortSlug → the captured payload carries NO shortSlug.
    expect(payload.shortSlug, 'no client-stamped shortSlug on a knowledge payload').toBeUndefined()
    // No spine-only fields: the knowledge schemas declare none of these.
    expect(payload.studyId).toBeUndefined()
    expect(payload.experimentId).toBeUndefined()
    expect(payload.state).toBeUndefined()
    expect(payload.status).toBeUndefined()
    // D6: validate the CAPTURED payload against the REAL
    // schema/knowledge/assertion.schema.yaml (Ajv2020, the server's own
    // config). Fails on any unevaluated property (shortSlug) / required miss.
    const ajv = loadKnowledgeAjv()
    const errors = ajvErrorsFor(ajv, 'assertion', payload)
    console.log('D6 RAW AJV (assertion knowledge payload):', JSON.stringify(errors))
    expect(
      errors,
      'the captured knowledge payload must be VALID against the REAL assertion.schema.yaml',
    ).toEqual([])
  })

  it('an unserved kind is refused LOUD and NAMED — never "Create undefined", no editor, no create', async () => {
    render(
      <RecordCreatePanel nodeType="not-a-real-kind" onCreated={onCreated} />
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

  it('D5: the spine resolves through the SERVED REGISTRY (primary) — registry consulted, $id from it, recordId + shortSlug + lifecycle stamped, spine fields valid against the REAL experiment.schema.yaml', async () => {
    const { apiClient } = await import('../../shared/api/client')
    render(
      <RecordCreatePanel
        nodeType="experiment"
        studyId="STU-000001"
        draftTitle="my experiment"
        onCreated={onCreated}
      />,
    )
    // D5 (FIX RUN 2): the registry is the PRIMARY path for the spine too —
    // getSchemas IS consulted (the old "not called" pin is replaced).
    await waitFor(() => expect(apiClient.getSchemas).toHaveBeenCalled())
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
    // Spine lifecycle/hierarchy fields preserved (unchanged behavior).
    expect(payload.studyId).toBe('STU-000001')
    expect(payload.state).toBe('draft')
    // D1 (schema-driven): the experiment schema declares + requires shortSlug
    // → it IS stamped (spine behavior preserved).
    expect(typeof payload.shortSlug).toBe('string')
    // The spine payload is valid against the REAL experiment.schema.yaml.
    const ajv = loadKnowledgeAjv()
    expect(
      ajvErrorsFor(ajv, 'experiment', payload),
      'the captured spine payload must be valid against the REAL experiment.schema.yaml',
    ).toEqual([])
  })

  it('D5 fallback-on-failure: when the registry call FAILS the spine resolves from the SPINE_SCHEMA_IDS literal (no regression), and the form still mints recordId', async () => {
    const { apiClient } = await import('../../shared/api/client')
    // Registry outage → the documented fallback path.
    mocked.registryMode = 'fail'
    render(
      <RecordCreatePanel
        nodeType="experiment"
        studyId="STU-000001"
        draftTitle="my experiment"
        onCreated={onCreated}
      />,
    )
    // The registry IS attempted (primary) and FAILS…
    await waitFor(() => expect(apiClient.getSchemas).toHaveBeenCalled())
    // …yet the spine still resolves its schema $id from the fallback literal
    // (the SPINE_SCHEMA_IDS value — byte-identical to pre-GC-16) and mounts
    // the editor. This is the defect-5 "fallback used ONLY on failure" pin.
    await waitFor(() =>
      expect(screen.getByTestId('projection-taptab-editor')).toBeTruthy(),
    )
    expect(apiClient.getEditorDraftProjection).toHaveBeenCalledWith(sid('experiment'))
    fireEvent.click(screen.getByTestId('record-create-submit'))
    await waitFor(() => expect(mocked.createCalls).toHaveLength(1))
    const [schemaId, payload] = mocked.createCalls[0]
    expect(schemaId).toBe(sid('experiment'))
    expect(payload.recordId).toMatch(/^EXP-/)
    expect(payload.state).toBe('draft')
  })

  it('D9: the client-side "Title is required" gate applies ONLY when the served schema requires title — a knowledge kind without a required title is NOT blocked client-side (the server speaks)', async () => {
    // knowledge (assertion) schema does NOT require title → no client block.
    render(
      <RecordCreatePanel nodeType="assertion" onCreated={onCreated} />,
    )
    await waitFor(() =>
      expect(screen.getByTestId('projection-taptab-editor')).toBeTruthy(),
    )
    // No title authored, no client "Title is required" block: the submit
    // proceeds to the create path (the schema-required id/scope are missing,
    // so the SERVER's required-check is the authority — no client title gate).
    fireEvent.click(screen.getByTestId('record-create-submit'))
    await new Promise((r) => setTimeout(r, 50))
    const panel = screen.getByTestId('record-create-panel')
    expect(panel.textContent).not.toContain('Title is required')
    // The spine (experiment, which REQUIRES title) still gets the client gate.
    cleanup()
    render(
      <RecordCreatePanel nodeType="experiment" studyId="STU-1" onCreated={onCreated} />,
    )
    await waitFor(() =>
      expect(screen.getByTestId('projection-taptab-editor')).toBeTruthy(),
    )
    fireEvent.click(screen.getByTestId('record-create-submit'))
    await waitFor(() =>
      expect(screen.getByTestId('record-create-panel').textContent).toContain(
        'Title is required',
      ),
    )
  })
})
