import { expect, test, type Page, type Route } from '@playwright/test'

type MeasurementContextRecord = {
  kind: 'measurement-context'
  id: string
  name: string
  title?: string
  source_ref: { kind: 'record'; id: string; type?: string; label?: string }
  instrument_ref: { kind: 'record'; id: string; type?: string; label?: string }
  assay_def_ref?: { kind: 'record'; id: string; type?: string; label?: string }
  readout_def_refs: Array<{ kind: 'record'; id: string; type?: string; label?: string }>
  timepoint?: string
  series_id?: string
  notes?: string
  tags?: string[]
  measurement_count?: number
}

type WellRoleAssignmentRecord = {
  kind: 'well-role-assignment'
  id: string
  measurement_context_ref: { kind: 'record'; id: string; type?: string; label?: string }
  subject_refs: Array<{ kind: 'record'; id: string; type?: string; label?: string }>
  role_family: 'sample' | 'control' | 'calibration'
  role_type: string
  expected_behavior?: 'increase' | 'decrease' | 'present' | 'absent' | 'range' | 'stable' | 'none'
}

type RecordEnvelope = {
  recordId: string
  schemaId: string
  payload: Record<string, unknown>
  meta?: { kind?: string; path?: string; commitSha?: string }
}

type RunWorkspaceResponse = {
  run: RecordEnvelope
  eventGraph: RecordEnvelope | null
  measurementContexts: Array<RecordEnvelope>
  wellGroups: Array<RecordEnvelope>
  wellRoleAssignmentsByContext: Record<string, Array<RecordEnvelope>>
  measurements: Array<RecordEnvelope>
  claims: Array<RecordEnvelope>
  evidence: Array<RecordEnvelope>
  assertions: Array<RecordEnvelope>
}

const RUN_ID = 'RUN-E2E'
const CONTEXT_ID = 'CTX-E2E-001'

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  })
}

function writeResponse(recordId: string, payload: Record<string, unknown>) {
  return {
    record: {
      recordId,
      schemaId: 'https://computable-lab.com/schema/computable-lab/context.schema.yaml',
      payload,
    },
    validation: { valid: true, errors: [] },
    lint: { passed: true, diagnostics: [] },
  }
}

function buildReadoutNotes(expectationNotes: string, qcNotes: string, generalNotes: string = 'Mock readout context') {
  return `${generalNotes}\n\n[computable-lab/readout-meta]\n${JSON.stringify({ expectationNotes, qcNotes })}`
}

function buildContext(partial?: Partial<MeasurementContextRecord>): MeasurementContextRecord {
  return {
    kind: 'measurement-context',
    id: CONTEXT_ID,
    name: 'ROS Far-Red Readout',
    title: 'ROS Far-Red Readout',
    source_ref: { kind: 'record', id: 'fixture-source-plate', type: 'labware', label: 'Fixture Source Plate' },
    instrument_ref: { kind: 'record', id: 'INST-PLATE-1', type: 'instrument-definition', label: 'Mock Spark Reader' },
    assay_def_ref: { kind: 'record', id: 'ASSAY-ROS-1', type: 'assay-definition', label: 'ROS Reporter Assay' },
    readout_def_refs: [{ kind: 'record', id: 'READOUT-FR-ROS', type: 'readout-definition', label: 'Far-Red ROS' }],
    notes: buildReadoutNotes(
      'Positive control wells should rise above vehicle control signal.',
      'Blank wells should remain near instrument background.',
    ),
    tags: ['read_event:READ-001', 'qc:blank_background'],
    measurement_count: 1,
    ...partial,
  }
}

function contextToEnvelope(context: MeasurementContextRecord): RecordEnvelope {
  return {
    recordId: context.id,
    schemaId: 'https://computable-lab.com/schema/computable-lab/measurement-context.schema.yaml',
    payload: context,
    meta: { kind: 'measurement-context' },
  }
}

function assignmentEnvelope(record: WellRoleAssignmentRecord): RecordEnvelope {
  return {
    recordId: record.id,
    schemaId: 'https://computable-lab.com/schema/computable-lab/well-role-assignment.schema.yaml',
    payload: record,
    meta: { kind: 'well-role-assignment' },
  }
}

function buildWorkspace(): RunWorkspaceResponse {
  const context = buildContext()
  const assignments: WellRoleAssignmentRecord[] = [
    {
      kind: 'well-role-assignment',
      id: 'WRA-BLANK-1',
      measurement_context_ref: { kind: 'record', id: context.id, type: 'measurement-context', label: context.name },
      subject_refs: [{ kind: 'record', id: 'fixture-source-plate#A1', type: 'well', label: 'A1' }],
      role_family: 'control',
      role_type: 'blank',
      expected_behavior: 'stable',
    },
    {
      kind: 'well-role-assignment',
      id: 'WRA-VEHICLE-1',
      measurement_context_ref: { kind: 'record', id: context.id, type: 'measurement-context', label: context.name },
      subject_refs: [{ kind: 'record', id: 'fixture-source-plate#A2', type: 'well', label: 'A2' }],
      role_family: 'control',
      role_type: 'vehicle_control',
      expected_behavior: 'stable',
    },
    {
      kind: 'well-role-assignment',
      id: 'WRA-POSITIVE-1',
      measurement_context_ref: { kind: 'record', id: context.id, type: 'measurement-context', label: context.name },
      subject_refs: [{ kind: 'record', id: 'fixture-source-plate#A3', type: 'well', label: 'A3' }],
      role_family: 'control',
      role_type: 'positive_control',
      expected_behavior: 'increase',
    },
  ]

  return {
    run: {
      recordId: RUN_ID,
      schemaId: 'https://computable-lab.com/schema/computable-lab/run.schema.yaml',
      payload: {
        id: RUN_ID,
        title: 'E2E Mock Run',
        status: 'in_progress',
      },
      meta: { kind: 'run' },
    },
    eventGraph: null,
    measurementContexts: [contextToEnvelope(context)],
    wellGroups: [],
    wellRoleAssignmentsByContext: {
      [context.id]: assignments.map(assignmentEnvelope),
    },
    measurements: [
      {
        recordId: 'MSR-E2E-001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/measurement.schema.yaml',
        payload: {
          id: 'MSR-E2E-001',
          measurementContextRef: { kind: 'record', id: context.id, type: 'measurement-context', label: context.name },
          readEventRef: 'READ-001',
          labwareInstanceRef: { kind: 'record', id: 'fixture-source-plate', type: 'labware', label: 'Fixture Source Plate' },
          data: [
            { well: 'A1', metric: 'intensity', channelId: 'far-red', value: 0.05, unit: 'RFU' },
            { well: 'A2', metric: 'intensity', channelId: 'far-red', value: 0.2, unit: 'RFU' },
            { well: 'A3', metric: 'intensity', channelId: 'far-red', value: 1.15, unit: 'RFU' },
          ],
        },
        meta: { kind: 'measurement' },
      },
    ],
    claims: [
      {
        recordId: 'CLM-E2E-001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/claim.schema.yaml',
        payload: {
          kind: 'claim',
          id: 'CLM-E2E-001',
          statement: 'Mock run supports ROS reporter activity in far-red readout.',
        },
        meta: { kind: 'claim' },
      },
    ],
    evidence: [
      {
        recordId: 'EVD-E2E-001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/evidence.schema.yaml',
        payload: {
          kind: 'evidence',
          id: 'EVD-E2E-001',
          title: 'Existing evidence bundle',
          supports: [{ kind: 'record', id: 'ASN-E2E-001', type: 'assertion' }],
          quality: { origin: 'mock' },
        },
        meta: { kind: 'evidence' },
      },
    ],
    assertions: [
      {
        recordId: 'ASN-E2E-001',
        schemaId: 'https://computable-lab.com/schema/computable-lab/assertion.schema.yaml',
        payload: {
          kind: 'assertion',
          id: 'ASN-E2E-001',
          claim_ref: { kind: 'record', id: 'CLM-E2E-001', type: 'claim' },
          statement: 'Far-red reporter signal increases in the positive control wells.',
        },
        meta: { kind: 'assertion' },
      },
    ],
  }
}

async function gotoEditor(page: Page, targetUrl: string) {
  try {
    await page.goto(targetUrl, { waitUntil: 'commit' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('NS_ERROR_OUT_OF_MEMORY')) {
      throw error
    }
    await page.goto('about:blank')
    await page.goto(targetUrl, { waitUntil: 'commit' })
  }
}

async function installReadoutMocks(page: Page, options?: { withWorkspace?: boolean }) {
  const contexts: MeasurementContextRecord[] = []
  const workspace = buildWorkspace()

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()

    if (path.endsWith('/semantics/instruments')) {
      return json(route, {
        items: [
          {
            kind: 'instrument-definition',
            id: 'INST-PLATE-1',
            name: 'Mock Spark Reader',
            instrument_type: 'plate_reader',
          },
        ],
      })
    }

    if (path.endsWith('/semantics/assays')) {
      return json(route, {
        items: [
          {
            kind: 'assay-definition',
            id: 'ASSAY-ROS-1',
            name: 'ROS Reporter Assay',
            assay_type: 'reporter',
            instrument_type: 'plate_reader',
            readout_def_refs: [{ kind: 'record', id: 'READOUT-FR-ROS', type: 'readout-definition', label: 'Far-Red ROS' }],
          },
        ],
      })
    }

    if (path.endsWith('/semantics/readouts')) {
      return json(route, {
        items: [
          {
            kind: 'readout-definition',
            id: 'READOUT-FR-ROS',
            name: 'Far-Red ROS',
            instrument_type: 'plate_reader',
            mode: 'fluorescence',
            channel_label: 'far-red',
            units: 'RFU',
          },
        ],
      })
    }

    if (path.endsWith('/semantics/measurement-contexts') && method === 'GET') {
      return json(route, { items: contexts })
    }

    if (path.endsWith('/semantics/measurement-contexts') && method === 'POST') {
      const body = JSON.parse(request.postData() || '{}') as Record<string, unknown>
      const nextContext = buildContext({
        id: 'CTX-E2E-CREATED',
        name: typeof body.name === 'string' && body.name.trim() ? body.name : 'Created Readout Context',
        title: typeof body.name === 'string' && body.name.trim() ? body.name : 'Created Readout Context',
        source_ref: body.sourceRef as MeasurementContextRecord['source_ref'],
        instrument_ref: body.instrumentRef as MeasurementContextRecord['instrument_ref'],
        assay_def_ref: body.assayDefRef as MeasurementContextRecord['assay_def_ref'],
        readout_def_refs: (body.readoutDefRefs as MeasurementContextRecord['readout_def_refs']) || [],
        timepoint: typeof body.timepoint === 'string' ? body.timepoint : undefined,
        series_id: typeof body.seriesId === 'string' ? body.seriesId : undefined,
        notes: typeof body.notes === 'string' ? body.notes : undefined,
        tags: Array.isArray(body.tags) ? body.tags as string[] : [],
        measurement_count: 0,
      })
      contexts.splice(0, contexts.length, nextContext)
      return json(route, { success: true, measurementContextId: nextContext.id })
    }

    if (path.includes('/api/records/') && method === 'PUT') {
      const recordId = decodeURIComponent(path.split('/').pop() || '')
      const body = JSON.parse(request.postData() || '{}') as { payload?: Record<string, unknown> }
      const index = contexts.findIndex((context) => context.id === recordId)
      if (index >= 0 && body.payload) {
        contexts[index] = body.payload as unknown as MeasurementContextRecord
        return json(route, writeResponse(recordId, body.payload))
      }
      return json(route, { error: 'Record not found' }, 404)
    }

    if (path.endsWith('/semantics/well-groups')) {
      return json(route, { items: [] })
    }

    if (path.endsWith('/semantics/well-role-assignments')) {
      return json(route, { items: [] })
    }

    if (path.endsWith(`/runs/${RUN_ID}/workspace`) && options?.withWorkspace) {
      const visibleContexts = contexts.length > 0
        ? contexts.map(contextToEnvelope)
        : workspace.measurementContexts
      return json(route, {
        ...workspace,
        measurementContexts: visibleContexts,
      })
    }

    if (path.endsWith(`/runs/${RUN_ID}/method`)) {
      return json(route, {
        runId: RUN_ID,
        hasMethod: false,
        templateInputResolutions: [],
        runOutputs: [],
      })
    }

    if (path.endsWith('/library/search')) {
      return json(route, { results: [], total: 0 })
    }

    if (path.endsWith('/records') && method === 'POST') {
      const body = JSON.parse(request.postData() || '{}') as { payload?: Record<string, unknown> }
      const payload = body.payload || {}
      const kind = typeof payload.kind === 'string' ? payload.kind : 'context'
      const recordId = typeof payload.id === 'string' ? payload.id : `${kind.toUpperCase()}-MOCK`
      const schemaId = kind === 'claim'
        ? 'https://computable-lab.com/schema/computable-lab/claim.schema.yaml'
        : kind === 'assertion'
          ? 'https://computable-lab.com/schema/computable-lab/assertion.schema.yaml'
          : kind === 'evidence'
            ? 'https://computable-lab.com/schema/computable-lab/evidence.schema.yaml'
            : 'computable-lab/context'

      if (options?.withWorkspace && (kind === 'claim' || kind === 'assertion' || kind === 'evidence')) {
        const envelope = { recordId, schemaId, payload, meta: { kind } }
        if (kind === 'claim') workspace.claims.push(envelope)
        if (kind === 'assertion') workspace.assertions.push(envelope)
        if (kind === 'evidence') workspace.evidence.push(envelope)
      }

      return json(route, writeResponse(recordId, payload))
    }

    return route.fallback()
  })
}

async function installWorkspaceMocks(page: Page) {
  const workspace = buildWorkspace()

  await page.route(`**/api/runs/${RUN_ID}/workspace`, async (route) => {
    await json(route, workspace)
  })
}

test.describe('Run workflow spine', () => {
  test('workspace nav switches between overview, readouts, and claims', async ({ page }) => {
    await installWorkspaceMocks(page)
    await page.goto(`/runs/${RUN_ID}`)

    await expect(page.locator('.run-workspace-header__eyebrow')).toHaveText('Run Workspace')
    await expect(page.getByText('Readouts: 1 contexts')).toBeVisible()

    await page.getByRole('button', { name: /^Readouts/ }).click()
    await expect(page.getByRole('heading', { name: 'Readouts' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open Readouts Mode' })).toBeVisible()

    await page.getByRole('button', { name: /^Claims/ }).click()
    await expect(page.getByRole('heading', { name: 'Claims Review' })).toBeVisible()
    await expect(page.getByText('1 bundles')).toBeVisible()
  })

  test('editor mode switching keeps the same canvas while changing workflow layers', async ({ page, browserName }) => {
    test.fixme(
      browserName === 'firefox',
      'Firefox headless intermittently fails fixture navigation with NS_ERROR_OUT_OF_MEMORY before app assertions run.',
    )
    await installReadoutMocks(page)
    await gotoEditor(page, '/labware-editor?fixture=focus-demo')

    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })

    await page.getByRole('tab', { name: 'Biology' }).click()
    await expect(page).toHaveURL(/mode=biology/)
    await expect(page.getByRole('heading', { name: 'Biology Mode' })).toBeVisible()

    await page.getByRole('tab', { name: 'Readouts' }).click()
    await expect(page).toHaveURL(/mode=readouts/)
    await expect(page.getByRole('heading', { name: 'Readout Setup' })).toBeVisible()

    await page.getByRole('tab', { name: 'Results' }).click()
    await expect(page).toHaveURL(/mode=results/)
    await expect(page.getByText('Raw Data File')).toBeVisible()
  })

  test('readout contexts can be created and edited in Readouts mode', async ({ page, browserName }) => {
    test.fixme(
      browserName === 'firefox',
      'Firefox headless intermittently fails fixture navigation with NS_ERROR_OUT_OF_MEMORY before app assertions run.',
    )
    await installReadoutMocks(page)
    await gotoEditor(page, '/labware-editor?fixture=focus-demo&mode=readouts')

    await expect(page.getByRole('heading', { name: 'Readout Setup' })).toBeVisible()
    await page.getByLabel('Context Name').fill('ROS Plate Reader')
    await page.getByRole('button', { name: 'Far-Red ROS' }).click()
    await page.getByLabel('Expected Signal Behavior').fill('Positive control wells should rise above vehicle controls.')
    await page.getByLabel('QC Notes').fill('Blank wells should stay near instrument background.')
    await page.getByRole('button', { name: 'Create Readout Context' }).click()

    await expect(page.getByRole('button', { name: /ROS Plate Reader/i })).toBeVisible()
    await expect(page.getByText(/Expectations: Positive control wells should rise above vehicle controls\./)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Update Readout Context' })).toBeVisible()

    await page.getByLabel('Expected Signal Behavior').fill('Far-red signal should remain above vehicle controls by at least 5x.')
    await page.getByRole('button', { name: 'Update Readout Context' }).click()
    await expect(page.getByText(/Expectations: Far-red signal should remain above vehicle controls by at least 5x\./)).toBeVisible()
  })

  test('results mode surfaces QC review and can draft evidence from a measurement', async ({ page, browserName }) => {
    test.fixme(
      browserName === 'firefox',
      'Firefox headless intermittently fails fixture navigation with NS_ERROR_OUT_OF_MEMORY before app assertions run.',
    )
    await installReadoutMocks(page, { withWorkspace: true })
    await gotoEditor(page, `/runs/${RUN_ID}/editor/results?fixture=focus-demo`)

    await expect(page.getByText('Raw Data File')).toBeVisible()
    await page.getByRole('button', { name: 'Review' }).click()
    await expect(page.getByRole('heading', { name: 'Results Diagnostics' })).toBeVisible()
    await expect(page.getByText(/ROS Far-Red Readout/)).toBeVisible()
    await expect(page.getByText(/QC Findings/)).toBeVisible()
    await expect(page.getByText(/blank background/i)).toBeVisible()
    await expect(page.getByText('positive control', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Evidence' }).click()
    await expect(page.getByRole('heading', { name: 'Draft Evidence' })).toBeVisible()
    await page.getByRole('button', { name: 'Draft Evidence' }).click()
    await expect(page.getByText(/Saved draft claim .* assertion .* and evidence/i)).toBeVisible()
  })
})
