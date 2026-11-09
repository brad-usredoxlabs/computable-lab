/**
 * GC-9 deliverables B/C/D/E (wiring) — AnalysisPage parameter-form integration.
 *
 * RED-first suite: written BEFORE the AnalysisPage wiring existed (the page
 * still renders only the raw-JSON input). Every fixture schema is TEST-LOCAL;
 * the GC-fixture revision (W8) is a VERBATIM transcription of the shipped
 * integration revision's parameterSchema (server/src/analysis/analysisGcIntegration.test.ts
 * createGc7Revision, base 2598e451): 9 required properties (baseline_correction
 * enum none|tangent_skim|vertical_drop|other; six numbers; saturated_min_plateau_points
 * integer minimum 2; backend enum stdlib|scipy), 2 optional strings
 * (method_label, method_revision_ref), NO title/description/x-unit/default
 * keywords anywhere — labels fall back to property names verbatim. The
 * timed_events object-array rendering stays TEST-LOCAL (a neutral-named
 * variant, since the shipped schema carries no array property).
 *
 * apiClient is mocked per the AnalysisPage.test.tsx:9 precedent.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import { apiClient } from '../shared/api/client'
import { AnalysisPage } from './AnalysisPage'

vi.mock('../shared/api/client', () => ({
  apiClient: {
    listAnalysisRevisions: vi.fn(),
    listAnalysisRuns: vi.fn(),
    createAnalysisRevision: vi.fn(),
    createAnalysisRun: vi.fn(),
    executeAnalysisRun: vi.fn(),
    getAnalysisRun: vi.fn(),
    getSurfaces: vi.fn().mockResolvedValue({ surfaces: [] }),
    draftAnalysisRevision: vi.fn(),
    promoteAnalysisArtifact: vi.fn(),
  },
}))

const P = 'analysis-param' // spec §B: testIdPrefix="analysis-param"

// --- Test-local fixtures ----------------------------------------------------

// Neutral (non-GC) schema WITH defaults + titles: pins "domain labels are data"
// and pre-fill/override behavior on a non-GC domain (spec acceptance mapping).
const NEUTRAL_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['cutoff'],
  properties: {
    cutoff: { type: 'number', title: 'Cutoff threshold', default: 0.25, minimum: 0 },
    mode: { type: 'string', enum: ['fast', 'slow', 'auto'] },
    note: { type: 'string' },
  },
}

// Verbatim copy of the SHIPPED integration revision's parameterSchema
// (createGc7Revision, analysisGcIntegration.test.ts @ 2598e451). No defaults,
// no titles — every label must be the property name verbatim.
const GC_FIXTURE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: [
    'baseline_correction',
    'baseline_window_s',
    'peak_width_s',
    'slope_sensitivity',
    'min_width_factor',
    'max_width_factor',
    'saturated_top_fraction_of_max',
    'saturated_min_plateau_points',
    'backend',
  ],
  properties: {
    baseline_correction: { type: 'string', enum: ['none', 'tangent_skim', 'vertical_drop', 'other'] },
    baseline_window_s: { type: 'number' },
    peak_width_s: { type: 'number' },
    slope_sensitivity: { type: 'number' },
    min_width_factor: { type: 'number' },
    max_width_factor: { type: 'number' },
    saturated_top_fraction_of_max: { type: 'number' },
    saturated_min_plateau_points: { type: 'integer', minimum: 2 },
    backend: { type: 'string', enum: ['stdlib', 'scipy'] },
    method_label: { type: 'string' },
    method_revision_ref: { type: 'string' },
  },
}

// TEST-LOCAL timed-event object-array (neutral names — the shipped GC fixture
// carries no array property; this pins the repeatable-row arm end-to-end).
const TIMED_EVENTS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['events'],
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: { at: { type: 'number', minimum: 0 }, kind: { type: 'string', enum: ['on', 'off'] } },
        required: ['at', 'kind'],
      },
    },
  },
}

// Unsupported-node schema: one bad node + supported siblings.
const UNSUPPORTED_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['good'],
  properties: {
    good: { type: 'number' },
    badOneOf: { oneOf: [{ type: 'number' }, { type: 'string' }] },
  },
}

// D2 probe (reviewer P2): an unsupported construct nested INSIDE an
// array-item's properties. The renderer shows the unsupported block once a
// row exists — the submit gate must see that subtree too (single authority).
const NESTED_UNSUPPORTED_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['good'],
  properties: {
    good: { type: 'number' },
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: { at: { type: 'number' }, bad: { oneOf: [{ type: 'number' }] } },
      },
    },
  },
}

// D9 probe: a required leaf TWO objects deep. The pre-forked gate stopped one
// object deep; the single exported walker must reach the leaf.
const DEEP_REQUIRED_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    a: {
      type: 'object',
      properties: {
        b: {
          type: 'object',
          default: {},
          required: ['leaf'],
          properties: { leaf: { type: 'number' } },
        },
      },
    },
  },
}

// --- Helpers ------------------------------------------------------------------

function wrap(ui: React.ReactNode) {
  return <ThemeProvider><OpenTabsProvider><MemoryRouter>{ui}</MemoryRouter></OpenTabsProvider></ThemeProvider>
}

function mockRevisions(revs: Array<{ id: string; payload: Record<string, unknown> }>) {
  vi.mocked(apiClient.listAnalysisRevisions).mockResolvedValue({
    revisions: revs.map((r) => ({ recordId: r.id, payload: r.payload })),
    total: revs.length,
  })
  vi.mocked(apiClient.listAnalysisRuns).mockResolvedValue({ runs: [], total: 0 })
}

async function selectRev(id: string) {
  await screen.findByTestId('analysis-page')
  fireEvent.change(screen.getByTestId('analysis-run-rev'), { target: { value: id } })
}

function runCreateBtn() {
  return screen.getByTestId('analysis-run-create-btn') as HTMLButtonElement
}

function previewText(): string {
  return screen.getByTestId('analysis-params-preview').textContent ?? ''
}

/** Pretty-printed sorted-keys JSON (the frozen-preview contract, spec §B). */
function sortedJson(obj: Record<string, unknown>): string {
  const sortKeys = (o: unknown): unknown => {
    if (o !== null && typeof o === 'object' && !Array.isArray(o)) {
      const out: Record<string, unknown> = {}
      for (const k of Object.keys(o as Record<string, unknown>).sort()) out[k] = sortKeys((o as Record<string, unknown>)[k])
      return out
    }
    if (Array.isArray(o)) return o.map(sortKeys)
    return o
  }
  return JSON.stringify(sortKeys(obj), null, 2)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiClient.listAnalysisRuns).mockResolvedValue({ runs: [], total: 0 })
  vi.mocked(apiClient.createAnalysisRun).mockResolvedValue({ success: true, recordId: 'ANR-PF1', run: {} })
})

describe('AnalysisPage — parameter-form wiring (GC-9 B/C/D/E)', () => {
  it('W1: submit builds parameters from the form — untouched optionals OMITTED, existing keys untouched', async () => {
    mockRevisions([{ id: 'REV-N1', payload: { id: 'REV-N1', title: 'Neutral method', parameterSchema: NEUTRAL_SCHEMA } }])
    render(wrap(<AnalysisPage />))
    await selectRev('REV-N1')
    // Pre-fill lands the default (cutoff 0.25); user overrides one number and
    // sets an enum; `note` (optional, no default) is never touched.
    fireEvent.change(screen.getByTestId(`${P}-cutoff`), { target: { value: '0.5' } })
    fireEvent.change(screen.getByTestId(`${P}-mode`), { target: { value: 'fast' } })
    await waitFor(() => expect(runCreateBtn().disabled).toBe(false))
    fireEvent.click(runCreateBtn())
    await waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(1))
    const arg = vi.mocked(apiClient.createAnalysisRun).mock.calls[0][0]
    // F7 payload shape: exactly the configured keys — optionals OMITTED, not
    // undefined/null-valued (toStrictEqual would pass on undefined values, so
    // the key-set assertion is load-bearing).
    expect(arg.parameters).toStrictEqual({ cutoff: 0.5, mode: 'fast' })
    expect(Object.keys(arg.parameters ?? {})).toEqual(['cutoff', 'mode'])
    expect(arg.revisionRef).toEqual({ kind: 'record', id: 'REV-N1', type: 'analysis-revision' })
    expect(arg.inputs).toEqual({})
  })

  it('W2: the frozen preview above Create-run equals the exact JSON that will be sent (sorted keys, pretty)', async () => {
    mockRevisions([{ id: 'REV-N2', payload: { id: 'REV-N2', title: 'Neutral method', parameterSchema: NEUTRAL_SCHEMA } }])
    render(wrap(<AnalysisPage />))
    await selectRev('REV-N2')
    fireEvent.change(screen.getByTestId(`${P}-cutoff`), { target: { value: '0.75' } })
    fireEvent.change(screen.getByTestId(`${P}-mode`), { target: { value: 'auto' } })
    await waitFor(() => expect(runCreateBtn().disabled).toBe(false))
    const expected = { cutoff: 0.75, mode: 'auto' }
    // BEFORE any click: the preview shows the exact frozen payload.
    expect(previewText()).toContain(sortedJson(expected))
    fireEvent.click(runCreateBtn())
    await waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(1))
    expect(vi.mocked(apiClient.createAnalysisRun).mock.calls[0][0].parameters).toStrictEqual(expected)
  })

  it('W3: Advanced JSON is a demoted escape — closed by default, override badge when edited, Clear restores the form path', async () => {
    mockRevisions([{ id: 'REV-N3', payload: { id: 'REV-N3', title: 'Neutral method', parameterSchema: NEUTRAL_SCHEMA } }])
    render(wrap(<AnalysisPage />))
    await selectRev('REV-N3')
    // Closed by default: the disclosure exists but is not open, no badge.
    const details = screen.getByTestId('analysis-params-advanced') as HTMLDetailsElement
    expect(details.tagName).toBe('DETAILS')
    expect(details.open).toBe(false)
    expect(screen.queryByTestId('analysis-params-override-json')).toBeNull()
    // Form-driven submit while advanced is untouched.
    fireEvent.change(screen.getByTestId(`${P}-cutoff`), { target: { value: '0.1' } })
    await waitFor(() => expect(runCreateBtn().disabled).toBe(false))
    fireEvent.click(runCreateBtn())
    await waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(1))
    expect(vi.mocked(apiClient.createAnalysisRun).mock.calls[0][0].parameters).toStrictEqual({ cutoff: 0.1 })
    // Open the disclosure (jsdom does not implement the native <summary>
    // toggle, so the test drives the `open` attribute directly — the
    // closed-by-default assert above proves the component owns the default),
    // paste JSON → visible override badge; payload = advanced JSON.
    details.open = true
    const advInput = screen.getByTestId('analysis-run-params') as HTMLInputElement
    fireEvent.change(advInput, { target: { value: '{"cutoff": 9.5, "mode": "slow"}' } })
    expect(screen.getByTestId('analysis-params-override-json')).toBeDefined()
    fireEvent.click(runCreateBtn())
    await waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(2))
    expect(vi.mocked(apiClient.createAnalysisRun).mock.calls[1][0].parameters).toStrictEqual({ cutoff: 9.5, mode: 'slow' })
    // Clear returns to the form-driven path: badge gone, payload back to form values.
    fireEvent.click(screen.getByTestId('analysis-params-clear'))
    expect(screen.queryByTestId('analysis-params-override-json')).toBeNull()
    fireEvent.click(runCreateBtn())
    await waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(3))
    expect(vi.mocked(apiClient.createAnalysisRun).mock.calls[2][0].parameters).toStrictEqual({ cutoff: 0.1 })
  })

  it('W4: a revision WITHOUT parameterSchema keeps the legacy textarea path + honest noschema line', async () => {
    mockRevisions([{ id: 'REV-L1', payload: { id: 'REV-L1', title: 'Legacy method' } }])
    render(wrap(<AnalysisPage />))
    await selectRev('REV-L1')
    expect(screen.getByTestId('analysis-params-noschema')).toBeDefined()
    expect(screen.getByTestId('analysis-params-noschema').textContent).toContain('no parameterSchema')
    // No form, no advanced disclosure, no preview — the raw input IS the path.
    expect(screen.queryByTestId(`${P}-cutoff`)).toBeNull()
    expect(screen.queryByTestId('analysis-params-advanced')).toBeNull()
    expect(screen.queryByTestId('analysis-params-preview')).toBeNull()
    // Legacy behavior intact: the demo default is in the input and submits verbatim.
    const input = screen.getByTestId('analysis-run-params') as HTMLInputElement
    expect(input.value).toBe('{"window": [0.0, 0.5]}')
    fireEvent.click(runCreateBtn())
    await waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(1))
    expect(vi.mocked(apiClient.createAnalysisRun).mock.calls[0][0].parameters).toStrictEqual({ window: [0.0, 0.5] })
  })

  it('W5: an unsupported node blocks submit with an actionable named reason; enabling the advanced override unblocks with the advanced payload', async () => {
    mockRevisions([{ id: 'REV-U1', payload: { id: 'REV-U1', title: 'Mixed method', parameterSchema: UNSUPPORTED_SCHEMA } }])
    render(wrap(<AnalysisPage />))
    await selectRev('REV-U1')
    // The unsupported block names its JSON path + construct; the sibling renders.
    const blocks = screen.getAllByTestId(`${P}-unsupported`)
    expect(blocks.some((b) => (b.textContent ?? '').includes('badOneOf') && (b.textContent ?? '').includes('oneOf'))).toBe(true)
    expect(screen.getByTestId(`${P}-good`).tagName).toBe('INPUT')
    // Fill the required supported control — still blocked by the unsupported node.
    fireEvent.change(screen.getByTestId(`${P}-good`), { target: { value: '1' } })
    expect(runCreateBtn().disabled).toBe(true)
    const reason = screen.getByTestId('analysis-params-blocked')
    expect(reason.textContent).toContain('badOneOf')
    expect(apiClient.createAnalysisRun).not.toHaveBeenCalled()
    // Enabling the advanced override unblocks; the payload is the advanced JSON.
    const details = screen.getByTestId('analysis-params-advanced') as HTMLDetailsElement
    details.open = true
    fireEvent.change(screen.getByTestId('analysis-run-params'), { target: { value: '{"good": 2, "badOneOf": 3}' } })
    await waitFor(() => expect(runCreateBtn().disabled).toBe(false))
    fireEvent.click(runCreateBtn())
    await waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(1))
    expect(vi.mocked(apiClient.createAnalysisRun).mock.calls[0][0].parameters).toStrictEqual({ good: 2, badOneOf: 3 })
  })

  it('W6: mount accounting non-regression — selection change fires ZERO apiClient calls (schema comes from the already-fetched list payload)', async () => {
    mockRevisions([
      { id: 'REV-A', payload: { id: 'REV-A', title: 'A', parameterSchema: NEUTRAL_SCHEMA } },
      { id: 'REV-B', payload: { id: 'REV-B', title: 'B', parameterSchema: TIMED_EVENTS_SCHEMA } },
    ])
    render(wrap(<AnalysisPage />))
    expect(await screen.findByTestId('analysis-page')).toBeDefined()
    expect(apiClient.listAnalysisRevisions).toHaveBeenCalledTimes(1)
    expect(apiClient.listAnalysisRuns).toHaveBeenCalledTimes(1)
    // Selecting + switching revisions reads parameterSchema from the fetched
    // payloads — zero further apiClient traffic (F2/F6 mount-spy rule).
    await selectRev('REV-A')
    await selectRev('REV-B')
    expect(apiClient.listAnalysisRevisions).toHaveBeenCalledTimes(1)
    expect(apiClient.listAnalysisRuns).toHaveBeenCalledTimes(1)
    expect(apiClient.getAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.executeAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.createAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.draftAnalysisRevision).not.toHaveBeenCalled()
    expect(apiClient.promoteAnalysisArtifact).not.toHaveBeenCalled()
    // Both schemas rendered from data (the switch actually re-rendered).
    expect(screen.getByTestId(`${P}-events-add`)).toBeDefined()
  })

  it('W7: pre-fill on selection change — values re-initialize to the selected revision\'s defaults; overrides reset', async () => {
    mockRevisions([
      { id: 'REV-D1', payload: { id: 'REV-D1', title: 'Defaults A', parameterSchema: NEUTRAL_SCHEMA } },
      {
        id: 'REV-D2',
        payload: {
          id: 'REV-D2',
          title: 'Defaults B',
          parameterSchema: {
            type: 'object',
            required: ['gain'],
            properties: { gain: { type: 'number', default: 3.5 }, tag: { type: 'string', default: 'batch-2' } },
          },
        },
      },
    ])
    render(wrap(<AnalysisPage />))
    await selectRev('REV-D1')
    // Pre-filled from schema defaults (deliverable C): the value is present.
    expect((screen.getByTestId(`${P}-cutoff`) as HTMLInputElement).value).toBe('0.25')
    // Override it → visible override badge.
    fireEvent.change(screen.getByTestId(`${P}-cutoff`), { target: { value: '9' } })
    expect(screen.getByTestId(`${P}-cutoff-overridden`)).toBeDefined()
    // Switching revisions RE-INITIALIZES to the new revision's defaults.
    await selectRev('REV-D2')
    expect((screen.getByTestId(`${P}-gain`) as HTMLInputElement).value).toBe('3.5')
    expect((screen.getByTestId(`${P}-tag`) as HTMLInputElement).value).toBe('batch-2')
    // The old revision's override state does not leak across.
    expect(screen.queryByTestId(`${P}-cutoff-overridden`)).toBeNull()
    expect(screen.queryByTestId(`${P}-gain-overridden`)).toBeNull()
  })

  it('W8: the shipped GC-integration-shape revision renders labeled controls and submits the reviewer-style payload without any JSON interaction', async () => {
    mockRevisions([{ id: 'REV-GC', payload: { id: 'REV-GC', title: 'Peak integration (shipped shape)', parameterSchema: GC_FIXTURE_SCHEMA } }])
    render(wrap(<AnalysisPage />))
    await selectRev('REV-GC')
    // Every top-level property renders a labeled control; labels = property
    // names VERBATIM (the shipped schema carries no titles).
    for (const name of [
      'baseline_correction', 'baseline_window_s', 'peak_width_s', 'slope_sensitivity',
      'min_width_factor', 'max_width_factor', 'saturated_top_fraction_of_max',
      'saturated_min_plateau_points', 'backend', 'method_label', 'method_revision_ref',
    ]) {
      expect(screen.getByText(name), `label for ${name}`).toBeDefined()
    }
    // Enum selects carry the verbatim option texts.
    const bcSel = screen.getByTestId(`${P}-baseline_correction`) as HTMLSelectElement
    expect(Array.from(bcSel.querySelectorAll('option:not([disabled])')).map((o) => o.textContent))
      .toEqual(['none', 'tangent_skim', 'vertical_drop', 'other'])
    const backendSel = screen.getByTestId(`${P}-backend`) as HTMLSelectElement
    expect(Array.from(backendSel.querySelectorAll('option:not([disabled])')).map((o) => o.textContent))
      .toEqual(['stdlib', 'scipy'])
    // Required-but-empty marks the missing controls (no defaults in the shipped schema).
    expect(screen.getByTestId(`${P}-baseline_correction-missing`)).toBeDefined()
    expect(screen.getByTestId(`${P}-backend-missing`)).toBeDefined()
    expect(runCreateBtn().disabled).toBe(true)

    // Configure via the labeled path ONLY — the raw JSON input is never read.
    fireEvent.change(bcSel, { target: { value: 'tangent_skim' } })
    fireEvent.change(screen.getByTestId(`${P}-baseline_window_s`), { target: { value: '30' } })
    fireEvent.change(screen.getByTestId(`${P}-peak_width_s`), { target: { value: '12.5' } })
    fireEvent.change(screen.getByTestId(`${P}-slope_sensitivity`), { target: { value: '0.004' } })
    fireEvent.change(screen.getByTestId(`${P}-min_width_factor`), { target: { value: '1.5' } })
    fireEvent.change(screen.getByTestId(`${P}-max_width_factor`), { target: { value: '8' } })
    fireEvent.change(screen.getByTestId(`${P}-saturated_top_fraction_of_max`), { target: { value: '0.9' } })
    fireEvent.change(screen.getByTestId(`${P}-saturated_min_plateau_points`), { target: { value: '5' } })
    fireEvent.change(backendSel, { target: { value: 'stdlib' } })
    await waitFor(() => expect(runCreateBtn().disabled).toBe(false))
    // Untouched optionals stay out of the frozen preview (omitted, not null).
    expect(previewText()).not.toContain('method_label')
    expect(previewText()).not.toContain('method_revision_ref')
    fireEvent.click(runCreateBtn())
    await waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(1))
    const arg = vi.mocked(apiClient.createAnalysisRun).mock.calls[0][0]
    expect(arg.parameters).toStrictEqual({
      baseline_correction: 'tangent_skim',
      baseline_window_s: 30,
      peak_width_s: 12.5,
      slope_sensitivity: 0.004,
      min_width_factor: 1.5,
      max_width_factor: 8,
      saturated_top_fraction_of_max: 0.9,
      saturated_min_plateau_points: 5,
      backend: 'stdlib',
    })
    expect(Object.keys(arg.parameters ?? {})).toHaveLength(9)
    // Zero JSON-textarea interaction: the advanced disclosure was never opened,
    // and its box is SEEDED FROM THE CURRENT FORM VALUES (D7: the demo literal
    // belongs to the no-schema path only — it must not appear here).
    const details = screen.getByTestId('analysis-params-advanced') as HTMLDetailsElement
    expect(details.open).toBe(false)
    const advValue = (screen.getByTestId('analysis-run-params') as HTMLInputElement).value
    expect(advValue).not.toBe('{"window": [0.0, 0.5]}')
    expect(advValue).toContain('baseline_correction')
    expect(advValue).toContain('tangent_skim')
    expect(advValue).toContain('stdlib')
  })

  it('W8b: timed-event object-array (test-local) — two rows configured in order land in the submitted payload', async () => {
    mockRevisions([{ id: 'REV-EV', payload: { id: 'REV-EV', title: 'Events method', parameterSchema: TIMED_EVENTS_SCHEMA } }])
    render(wrap(<AnalysisPage />))
    await selectRev('REV-EV')
    // Add two rows; configure row 0 then row 1 (order preserved as stored).
    fireEvent.click(screen.getByTestId(`${P}-events-add`))
    fireEvent.click(screen.getByTestId(`${P}-events-add`))
    fireEvent.change(screen.getByTestId(`${P}-events-0-at`), { target: { value: '1.5' } })
    fireEvent.change(screen.getByTestId(`${P}-events-0-kind`), { target: { value: 'on' } })
    fireEvent.change(screen.getByTestId(`${P}-events-1-at`), { target: { value: '4' } })
    fireEvent.change(screen.getByTestId(`${P}-events-1-kind`), { target: { value: 'off' } })
    await waitFor(() => expect(runCreateBtn().disabled).toBe(false))
    fireEvent.click(runCreateBtn())
    await waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(1))
    const arg = vi.mocked(apiClient.createAnalysisRun).mock.calls[0][0]
    expect(arg.parameters).toStrictEqual({ events: [{ at: 1.5, kind: 'on' }, { at: 4, kind: 'off' }] })
  })

  it('W9: (D2 probe P2) an unsupported construct nested inside an array-item subtree blocks submit — the gate sees the same paths the renderer shows', async () => {
    mockRevisions([{ id: 'REV-N2U', payload: { id: 'REV-N2U', title: 'Nested-unsupported method', parameterSchema: NESTED_UNSUPPORTED_SCHEMA } }])
    render(wrap(<AnalysisPage />))
    await selectRev('REV-N2U')
    // Fill the required supported control.
    fireEvent.change(screen.getByTestId(`${P}-good`), { target: { value: '1' } })
    // Add a row: the unsupported block (items.bad oneOf) now actually renders.
    fireEvent.click(screen.getByTestId(`${P}-events-add`))
    const blocks = screen.getAllByTestId(`${P}-unsupported`)
    expect(blocks.length).toBe(1)
    expect(blocks[0].textContent ?? '').toContain('bad')
    // The renderer shows the unsupported node — the gate MUST refuse too.
    expect(runCreateBtn().disabled, 'gate must refuse while an unsupported node exists').toBe(true)
    const reason = screen.getByTestId('analysis-params-blocked')
    expect(reason.textContent).toContain('bad')
    expect(apiClient.createAnalysisRun).not.toHaveBeenCalled()
    // The advanced override unblocks, and the payload is the advanced JSON.
    const details = screen.getByTestId('analysis-params-advanced') as HTMLDetailsElement
    details.open = true
    fireEvent.change(screen.getByTestId('analysis-run-params'), { target: { value: '{"good": 2, "events": [{"at": 3, "bad": 4}]}' } })
    await waitFor(() => expect(runCreateBtn().disabled).toBe(false))
    fireEvent.click(runCreateBtn())
    await waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(1))
    expect(vi.mocked(apiClient.createAnalysisRun).mock.calls[0][0].parameters)
      .toStrictEqual({ good: 2, events: [{ at: 3, bad: 4 }] })
  })

  it('W10: (D9 probe) a required leaf TWO objects deep is gated (single walker reaches every depth)', async () => {
    mockRevisions([{ id: 'REV-DEEP', payload: { id: 'REV-DEEP', title: 'Deep-required method', parameterSchema: DEEP_REQUIRED_SCHEMA } }])
    render(wrap(<AnalysisPage />))
    await selectRev('REV-DEEP')
    // No values configured: a.b.leaf (required, two objects deep) is empty →
    // the gate must name it and refuse.
    expect(runCreateBtn().disabled, 'gate must see the required leaf two objects deep').toBe(true)
    const reason = screen.getByTestId('analysis-params-blocked')
    expect(reason.textContent).toContain('a.b.leaf')
    expect(apiClient.createAnalysisRun).not.toHaveBeenCalled()
    // Configure the deep leaf → unblocks, payload carries only the configured path.
    fireEvent.change(screen.getByTestId(`${P}-a-b-leaf`), { target: { value: '7' } })
    await waitFor(() => expect(runCreateBtn().disabled).toBe(false))
    fireEvent.click(runCreateBtn())
    await waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(1))
    expect(vi.mocked(apiClient.createAnalysisRun).mock.calls[0][0].parameters).toStrictEqual({ a: { b: { leaf: 7 } } })
  })

  it('W11: (D3 probe P3) the Advanced-JSON override does NOT survive a revision switch — stale JSON is never submitted against the new revision', async () => {
    const schemaA = { type: 'object', properties: { a: { type: 'number' } } }
    const schemaB = { type: 'object', properties: { b: { type: 'number', default: 2 } } }
    mockRevisions([
      { id: 'REV-A', payload: { id: 'REV-A', title: 'A', parameterSchema: schemaA } },
      { id: 'REV-B', payload: { id: 'REV-B', title: 'B', parameterSchema: schemaB } },
    ])
    render(wrap(<AnalysisPage />))
    await selectRev('REV-A')
    // Author an override under revision A.
    const details = screen.getByTestId('analysis-params-advanced') as HTMLDetailsElement
    details.open = true
    fireEvent.change(screen.getByTestId('analysis-run-params'), { target: { value: '{"a": 1}' } })
    expect(screen.getByTestId('analysis-params-override-json')).toBeDefined()
    // Switch to revision B: the override is cleared back to the pristine
    // state — the badge is gone and the advanced box no longer holds A's JSON.
    await selectRev('REV-B')
    expect(screen.queryByTestId('analysis-params-override-json'), 'badge must not survive the switch').toBeNull()
    // Form values re-initialize to B's defaults; a submit sends B's values,
    // never A's stale JSON (F7 poisoned-run class, produced by the UI).
    expect((screen.getByTestId(`${P}-b`) as HTMLInputElement).value).toBe('2')
    fireEvent.click(runCreateBtn())
    await waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(1))
    const arg = vi.mocked(apiClient.createAnalysisRun).mock.calls[0][0]
    expect(arg.revisionRef).toEqual({ kind: 'record', id: 'REV-B', type: 'analysis-revision' })
    expect(arg.parameters).toStrictEqual({ b: 2 })
    // The stale A JSON was not submitted.
    expect(JSON.stringify(arg.parameters ?? {})).not.toContain('"a"')
  })

  it('W12: (D4 probe P4) with nothing configured the preview names the empty state and the payload omits the parameters key', async () => {
    const optSchema = { type: 'object', properties: { note: { type: 'string' } } }
    mockRevisions([{ id: 'REV-O1', payload: { id: 'REV-O1', title: 'All-optional method', parameterSchema: optSchema } }])
    render(wrap(<AnalysisPage />))
    await selectRev('REV-O1')
    // Nothing configured: buildParameters() → undefined → the call omits the
    // key. The preview must reflect THAT decision, not a fabricated "{}".
    const preview = previewText()
    expect(preview).not.toBe('{}')
    expect(preview).toContain('(no parameters)')
    fireEvent.click(runCreateBtn())
    await waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(1))
    const arg = vi.mocked(apiClient.createAnalysisRun).mock.calls[0][0]
    expect('parameters' in arg).toBe(false)
  })

  it('W13: (D6 probe P6) pruned payloads drop emptied nested objects and empty array elements', async () => {
    // g.x is a STRING child so clearing it leaves an empty group (a number
    // child would trip the invalid-number gate arm instead — spec §B gate (b)).
    const pruneSchema = {
      type: 'object',
      properties: {
        g: { type: 'object', properties: { x: { type: 'string' } } },
        k: { type: 'number' },
        tags: { type: 'array', items: { type: 'string' } },
      },
    }
    mockRevisions([{ id: 'REV-PR', payload: { id: 'REV-PR', title: 'Prune method', parameterSchema: pruneSchema } }])
    render(wrap(<AnalysisPage />))
    await selectRev('REV-PR')
    // Type into the group's child then clear it (group emptied), set k, and
    // add one empty-string array row.
    fireEvent.change(screen.getByTestId(`${P}-g-x`), { target: { value: '9' } })
    fireEvent.change(screen.getByTestId(`${P}-g-x`), { target: { value: '' } })
    fireEvent.change(screen.getByTestId(`${P}-k`), { target: { value: '3' } })
    fireEvent.click(screen.getByTestId(`${P}-tags-add`))
    await waitFor(() => expect(runCreateBtn().disabled).toBe(false))
    fireEvent.click(runCreateBtn())
    await waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(1))
    const arg = vi.mocked(apiClient.createAnalysisRun).mock.calls[0][0]
    // g (emptied nested object) is OMITTED entirely; the empty-string array
    // element is pruned so the array does not survive as [""].
    expect(arg.parameters).toStrictEqual({ k: 3 })
    expect(JSON.stringify(arg.parameters ?? {})).not.toContain('"g"')
    expect(JSON.stringify(arg.parameters ?? {})).not.toContain('""')
  })

  it('W14: (D7) the demo literal is the no-schema textarea default ONLY; schema-mode Advanced is seeded from the current form values (or empty)', async () => {
    const DEMO = '{"window": [0.0, 0.5]}'
    // Schema mode: the Advanced input must NOT carry the demo literal (it
    // belongs to no schema); it is seeded from the current form values.
    mockRevisions([{ id: 'REV-N14', payload: { id: 'REV-N14', title: 'Neutral method', parameterSchema: NEUTRAL_SCHEMA } }])
    render(wrap(<AnalysisPage />))
    await selectRev('REV-N14')
    const advInput = screen.getByTestId('analysis-run-params') as HTMLInputElement
    expect(advInput.value, 'schema-mode advanced must not be seeded with the no-schema demo literal').not.toBe(DEMO)
    // No override badge while untouched (seeded state is not a manual edit).
    expect(screen.queryByTestId('analysis-params-override-json')).toBeNull()
    // Edit one form value; re-opening the disclosure reflects the current
    // form values (the seed tracks the form, not a frozen demo constant).
    fireEvent.change(screen.getByTestId(`${P}-cutoff`), { target: { value: '0.5' } })
    fireEvent.change(screen.getByTestId(`${P}-mode`), { target: { value: 'fast' } })
    await waitFor(() => expect(runCreateBtn().disabled).toBe(false))
    const details = screen.getByTestId('analysis-params-advanced') as HTMLDetailsElement
    details.open = true
    expect((screen.getByTestId('analysis-run-params') as HTMLInputElement).value).toContain('cutoff')
    // …and the payload is still form-driven (the seed is not an override).
    fireEvent.click(runCreateBtn())
    await waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(1))
    expect(vi.mocked(apiClient.createAnalysisRun).mock.calls[0][0].parameters).toStrictEqual({ cutoff: 0.5, mode: 'fast' })
    // The no-schema path keeps the demo literal as the live default (W4 pins
    // that arm end-to-end; the literal is a single named constant in the page).
  })

  it('W15: (D8) invalid-advanced-JSON and gate-block reasons carry DISTINCT testids', async () => {
    mockRevisions([
      { id: 'REV-U15', payload: { id: 'REV-U15', title: 'Mixed method', parameterSchema: UNSUPPORTED_SCHEMA } },
    ])
    render(wrap(<AnalysisPage />))
    await selectRev('REV-U15')
    // Fill the required supported control so ONLY the unsupported arm blocks.
    fireEvent.change(screen.getByTestId(`${P}-good`), { target: { value: '1' } })
    // Gate-block reason (unsupported node) on its own testid.
    const gateLine = screen.getByTestId('analysis-params-blocked')
    expect(gateLine.textContent).toContain('badOneOf')
    // Invalid advanced JSON surfaces on a DIFFERENT testid, while the
    // gate-block line stays present and distinct (both conditions can coexist).
    const details = screen.getByTestId('analysis-params-advanced') as HTMLDetailsElement
    details.open = true
    fireEvent.change(screen.getByTestId('analysis-run-params'), { target: { value: '{not json' } })
    const invalidLine = screen.getByTestId('analysis-params-invalid-json')
    expect(invalidLine.textContent).toContain('invalid')
    // Still blocked (invalid JSON cannot become the override source).
    expect(runCreateBtn().disabled).toBe(true)
    // Fix the JSON → invalid line gone, badge lit, submit proceeds with the
    // advanced payload.
    fireEvent.change(screen.getByTestId('analysis-run-params'), { target: { value: '{"good": 2, "badOneOf": 3}' } })
    expect(screen.queryByTestId('analysis-params-invalid-json')).toBeNull()
    expect(screen.getByTestId('analysis-params-override-json')).toBeDefined()
    await waitFor(() => expect(runCreateBtn().disabled).toBe(false))
    fireEvent.click(runCreateBtn())
    await waitFor(() => expect(apiClient.createAnalysisRun).toHaveBeenCalledTimes(1))
    expect(vi.mocked(apiClient.createAnalysisRun).mock.calls[0][0].parameters).toStrictEqual({ good: 2, badOneOf: 3 })
  })
})
