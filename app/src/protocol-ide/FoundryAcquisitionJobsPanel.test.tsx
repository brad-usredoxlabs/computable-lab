import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FoundryAcquisitionJobsPanel } from './FoundryAcquisitionJobsPanel'

const job = {
  kind: 'foundry-acquisition-job',
  id: 'foundry-job-001',
  jobKind: 'labware-from-spec',
  status: 'needs-review',
  createdAt: '2026-05-17T10:00:00.000Z',
  updatedAt: '2026-05-17T10:10:00.000Z',
  artifactRoot: '/workspace/artifacts',
  jobRoot: '/workspace/artifacts/foundry/jobs/foundry-job-001',
  eventsPath: '/workspace/artifacts/foundry/jobs/foundry-job-001/events.jsonl',
  prompt: 'Add Thermo plate 12345 from the vendor spec sheet',
  turns: [
    { role: 'user', content: 'Add Thermo plate 12345 from the vendor spec sheet', ts: '2026-05-17T10:00:00.000Z' },
    { role: 'assistant', content: 'Summary\nDrafted a labware candidate.', ts: '2026-05-17T10:10:00.000Z' },
  ],
  outputSummary: {
    status: 'blocked',
    nextAction: 'Review blockers, then continue the job with corrections or missing source details.',
    artifacts: [{
      kind: 'labware-spec-candidate-extraction',
      path: 'artifacts/foundry/labware-spec-candidates/thermo-12345.json',
      label: 'Labware spec candidate',
      tool: 'labware_spec_extract_candidate',
    }],
    records: [{
      kind: 'labware-spec-candidate-promotion',
      recordId: 'lbw-def-thermo-12345',
      path: 'records/seed/labware-definition/lbw-def-thermo-12345.yaml',
      status: 'promoted',
    }],
    blockers: [{
      code: 'missing_well_depth',
      severity: 'error',
      message: 'Opentrons generation requires well depth in mm.',
      tool: 'opentrons_labware_generate_definition',
    }],
    toolRuns: [{
      tool: 'labware_spec_extract_candidate',
      ok: true,
      kind: 'labware-spec-candidate-extraction',
      artifactPaths: ['artifacts/foundry/labware-spec-candidates/thermo-12345.json'],
      recordIds: ['lbw-def-thermo-12345'],
    }],
  },
}

const createdJob = {
  ...job,
  id: 'foundry-job-002',
  jobKind: 'protocol-from-document',
  status: 'queued',
  createdAt: '2026-05-17T11:00:00.000Z',
  updatedAt: '2026-05-17T11:00:00.000Z',
  prompt: 'Grab the Zymo MagBead DNA extraction PDF and draft an event graph',
  turns: [
    { role: 'user', content: 'Grab the Zymo MagBead DNA extraction PDF and draft an event graph', ts: '2026-05-17T11:00:00.000Z' },
  ],
  outputSummary: undefined,
}

describe('FoundryAcquisitionJobsPanel', () => {
  beforeEach(() => {
    let created = false
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/foundry/jobs') && init?.method === 'POST') {
        created = true
        return {
          ok: true,
          json: async () => ({
            job: createdJob,
            events: [{ source: 'server', phase: 'queued', message: 'Queued job', ts: '2026-05-17T11:00:00.000Z' }],
          }),
        } as Response
      }
      if (url.endsWith('/api/foundry/jobs')) {
        return {
          ok: true,
          json: async () => ({ jobs: created ? [createdJob, job] : [job] }),
        } as Response
      }
      if (url.endsWith('/api/foundry/jobs/foundry-job-002')) {
        return {
          ok: true,
          json: async () => ({
            job: createdJob,
            events: [{ source: 'server', phase: 'queued', message: 'Queued job', ts: '2026-05-17T11:00:00.000Z' }],
          }),
        } as Response
      }
      if (url.endsWith('/api/foundry/jobs/foundry-job-001')) {
        return {
          ok: true,
          json: async () => ({
            job,
            events: [
              { source: 'server', phase: 'queued', message: 'Queued job', ts: '2026-05-17T10:00:00.000Z' },
              { source: 'tool', phase: 'tool_finished', message: 'labware_spec_extract_candidate finished', ts: '2026-05-17T10:05:00.000Z' },
            ],
          }),
        } as Response
      }
      return {
        ok: false,
        statusText: 'not found',
        text: async () => 'not found',
      } as Response
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders structured acquisition job outputs', async () => {
    render(
      <MemoryRouter>
        <FoundryAcquisitionJobsPanel />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('foundry-acquisition-jobs-panel')).toBeTruthy()
    })

    expect(screen.getByText('Foundry Jobs')).toBeTruthy()
    expect(screen.getByText('labware-from-spec')).toBeTruthy()
    expect(screen.getByTestId('foundry-output-summary')).toBeTruthy()
    expect(screen.getByText('Labware spec candidate')).toBeTruthy()
    expect(screen.getByText('artifacts/foundry/labware-spec-candidates/thermo-12345.json')).toBeTruthy()
    expect(screen.getByText('lbw-def-thermo-12345')).toBeTruthy()
    expect(screen.getByText('missing_well_depth')).toBeTruthy()
    expect(screen.getByText('Opentrons generation requires well depth in mm.')).toBeTruthy()
    expect(screen.getAllByText('labware_spec_extract_candidate').length).toBeGreaterThan(0)
  })

  it('creates a new acquisition job and selects it', async () => {
    render(
      <MemoryRouter>
        <FoundryAcquisitionJobsPanel />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('foundry-acquisition-jobs-panel')).toBeTruthy()
    })

    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'protocol-from-document' } })
    fireEvent.change(screen.getByLabelText('Request'), {
      target: { value: 'Grab the Zymo MagBead DNA extraction PDF and draft an event graph' },
    })
    fireEvent.click(screen.getByText('Start job'))

    await waitFor(() => {
      expect(screen.getAllByText('Grab the Zymo MagBead DNA extraction PDF and draft an event graph').length).toBeGreaterThan(0)
    })

    expect(global.fetch).toHaveBeenCalledWith('/api/foundry/jobs', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        kind: 'protocol-from-document',
        prompt: 'Grab the Zymo MagBead DNA extraction PDF and draft an event graph',
      }),
    }))
  })
})
