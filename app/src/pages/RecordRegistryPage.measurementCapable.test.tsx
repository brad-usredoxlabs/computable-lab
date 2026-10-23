/**
 * INSTR-COLLAPSE-2 C5 (RED-first) — UI survival of the retired instrument kind.
 *
 * Spec: .hermes/plans/2026-10-22_instr-collapse-2-kind-deletion-spec.md C5,
 * OQ answers: OQ-A(i) client-side derivation from the three existing
 * listRecordsByKind reads; OQ-B predicate — a machine qualifies iff it resolves
 * (instance OR class join, EquipmentCapabilityService shape) at least one ACTIVE
 * capability whose verbRef verb-definition declares `domain:
 * analytical_readout` (resolved from verb-definition RECORD data, never a verb
 * id literal); OQ-C(1) a 'Measurement-capable' toggle/pill on the Equipment
 * tab (no kind-shaped pseudo-tab for a retired kind).
 *
 * RED at base (this commit): REGISTRY_TABS still carries the instruments tab;
 * no measurement-capable affordance exists on the page.
 *
 * Discriminators (spec bait 2 / bait-6):
 * - the liquid_handling-only machine has a capability but must NOT appear —
 *   the filter resolves verbs through declared verb-definition data, not
 *   presence-of-any-capability;
 * - the class join (EQC- record AND ontology CURIE) and the instance join
 *   (equipmentRef) must both resolve;
 * - the capability RECORD must be named in the view (VERDICT-critical), not
 *   just the machine;
 * - implementation-source guard: no 'INSTR-' / 'VERB-READ' / equipment-id
 *   literals and no prefix sniffs in RecordRegistryPage.tsx (H1/H2).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import React from 'react'
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react'
import RecordRegistryPage, { REGISTRY_TABS } from './RecordRegistryPage'

// ---------------------------------------------------------------------------
// Mock fixtures — mirror the REAL seed shapes (records/seed/equipment*,
// records/seed/verb-definition) without copying the whole corpus. Payload
// shapes are the envelope payloads the page already reads.
// ---------------------------------------------------------------------------

const envelope = (id: string, schemaName: string, payload: Record<string, unknown>) => ({
  recordId: id,
  schemaId: `https://computable-lab.com/schema/computable-lab/${schemaName}`,
  payload,
})

// Analytical-readout-capable via CLASS join (EQC- record): mirrors
// eqp-quantstudio5.yaml + ecp-quantstudio5.yaml (equipmentClassRef EQC-
// QUANTSTUDIO5, capabilities[].verbRef VERB-READ).
const EQP_QS5 = envelope('EQP-QUANTSTUDIO5', 'equipment.schema.yaml', {
  kind: 'equipment', id: 'EQP-QUANTSTUDIO5', name: 'QuantStudio 5 qPCR system',
  equipmentClassRef: { kind: 'record', type: 'equipment-class', id: 'EQC-QUANTSTUDIO5' },
})
// Analytical-readout-capable via CLASS join where the class is an ontology
// CURIE (mirrors eqp-plate-reader.yaml: equipmentClassRef kind:ontology
// id:CL:plate_reader; ECP-PLATE-READER binds the same CURIE).
const EQP_READER = envelope('EQP-PLATE-READER', 'equipment.schema.yaml', {
  kind: 'equipment', id: 'EQP-PLATE-READER', name: 'Plate reader',
  equipmentClassRef: { kind: 'ontology', id: 'CL:plate_reader', namespace: 'CL', label: 'Plate reader' },
})
// Capability-bearing but ONLY liquid_handling: the bait-6 discriminator.
const EQP_SHAKER = envelope('EQP-HEATER-SHAKER', 'equipment.schema.yaml', {
  kind: 'equipment', id: 'EQP-HEATER-SHAKER', name: 'Heater shaker',
  equipmentClassRef: { kind: 'record', type: 'equipment-class', id: 'EQC-HEATER_SHAKER' },
})
// Capability-bearing via INSTANCE join (equipmentRef, not classRef).
const EQP_NANODROP = envelope('EQP-NANODROP', 'equipment.schema.yaml', {
  kind: 'equipment', id: 'EQP-NANODROP', name: 'NanoDrop spectrophotometer',
  equipmentClassRef: { kind: 'ontology', id: 'CL:spectrophotometer', namespace: 'CL', label: 'Spectrophotometer' },
})
// No capabilities at all.
const EQP_PIPETTE = envelope('EQP-PIPETTE', 'equipment.schema.yaml', {
  kind: 'equipment', id: 'EQP-PIPETTE', name: 'Pipette',
  equipmentClassRef: { kind: 'ontology', id: 'CL:micropipette', namespace: 'CL', label: 'Micropipette' },
})

const ECP_QS5 = envelope('ECP-QUANTSTUDIO5', 'equipment-capability.schema.yaml', {
  kind: 'equipment-capability', id: 'ECP-QUANTSTUDIO5', status: 'active',
  equipmentClassRef: { kind: 'record', type: 'equipment-class', id: 'EQC-QUANTSTUDIO5' },
  capabilities: [{ verbRef: { kind: 'record', type: 'verb-definition', id: 'VERB-READ' } }],
})
const ECP_READER = envelope('ECP-PLATE-READER', 'equipment-capability.schema.yaml', {
  kind: 'equipment-capability', id: 'ECP-PLATE-READER', status: 'active',
  equipmentClassRef: { kind: 'ontology', id: 'CL:plate_reader', namespace: 'CL', label: 'Plate reader' },
  capabilities: [{ verbRef: { kind: 'record', type: 'verb-definition', id: 'VERB-READ' } }],
})
const ECP_SHAKER = envelope('ECP-HEATER-SHAKER', 'equipment-capability.schema.yaml', {
  kind: 'equipment-capability', id: 'ECP-HEATER-SHAKER', status: 'active',
  equipmentClassRef: { kind: 'record', type: 'equipment-class', id: 'EQC-HEATER_SHAKER' },
  capabilities: [{ verbRef: { kind: 'record', type: 'verb-definition', id: 'VERB-MIX' } }],
})
// INSTANCE-join capability (equipmentRef points at the machine itself).
const ECP_NANODROP = envelope('ECP-NANODROP', 'equipment-capability.schema.yaml', {
  kind: 'equipment-capability', id: 'ECP-NANODROP', status: 'active',
  equipmentRef: { kind: 'record', type: 'equipment', id: 'EQP-NANODROP' },
  capabilities: [{ verbRef: { kind: 'record', type: 'verb-definition', id: 'VERB-READ' } }],
})
// Inactive capability on a machine that has no other — must not qualify.
const ECP_PIPETTE_DRAFT = envelope('ECP-PIPETTE-OLD', 'equipment-capability.schema.yaml', {
  kind: 'equipment-capability', id: 'ECP-PIPETTE-OLD', status: 'draft',
  equipmentClassRef: { kind: 'ontology', id: 'CL:micropipette', namespace: 'CL', label: 'Micropipette' },
  capabilities: [{ verbRef: { kind: 'record', type: 'verb-definition', id: 'VERB-READ' } }],
})

// Verb-definition RECORDS carry the domain the filter must resolve through
// (verb-definition.schema.yaml enum: liquid_handling, sample_prep, thermal,
// analytical_readout, manual, other).
const VERB_READ = envelope('VERB-READ', 'verb-definition.schema.yaml', {
  kind: 'verb-definition', id: 'VERB-READ', canonical: 'read', domain: 'analytical_readout',
})
const VERB_MIX = envelope('VERB-MIX', 'verb-definition.schema.yaml', {
  kind: 'verb-definition', id: 'VERB-MIX', canonical: 'mix', domain: 'liquid_handling',
})

const mocked = vi.hoisted(() => ({
  listByKind: null as ((kind: string) => Promise<{ records: unknown[]; total: number }>) | null,
}))

vi.mock('../shared/api/client', () => ({
  apiClient: {
    listRecordsByKind: vi.fn((kind: string) =>
      mocked.listByKind
        ? mocked.listByKind(kind)
        : Promise.resolve({ records: [], total: 0 }),
    ),
    searchRecordsByKind: vi.fn().mockResolvedValue({ records: [] }),
    updateRecord: vi.fn().mockResolvedValue(undefined),
    createRecord: vi.fn().mockResolvedValue(undefined),
    getRecordEditorProjection: vi.fn().mockResolvedValue(null),
    getEditorDraftProjection: vi.fn().mockResolvedValue(null),
    getValidTransitions: vi.fn().mockResolvedValue({ transitions: [] }),
    getRecord: vi.fn(),
    createDraftCopy: vi.fn(),
    createSignature: vi.fn(),
    listRecordRevisions: vi.fn().mockResolvedValue({ records: [] }),
    getSchemas: vi.fn().mockResolvedValue([]),
    getSchema: vi.fn().mockResolvedValue(null),
    getLifecycleTerminalStates: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('../components/registry/RecordSearchCombobox', () => ({
  RecordSearchCombobox: () => <div data-testid="record-search-combobox" />,
}))

vi.mock('../components/registry/RelatedRecordsCard', () => ({
  RelatedRecordsCard: () => null,
}))

vi.mock('../editor/taptab/TapTabEditor', () => ({
  ProjectionTapTabEditor: () => <div data-testid="projection-taptab-editor" />,
}))

function fixture() {
  mocked.listByKind = async (kind: string) => {
    switch (kind) {
      case 'equipment':
        return { records: [EQP_QS5, EQP_READER, EQP_SHAKER, EQP_NANODROP, EQP_PIPETTE], total: 5 }
      case 'equipment-capability':
        return { records: [ECP_QS5, ECP_READER, ECP_SHAKER, ECP_NANODROP, ECP_PIPETTE_DRAFT], total: 5 }
      case 'verb-definition':
        return { records: [VERB_READ, VERB_MIX], total: 2 }
      default:
        return { records: [], total: 0 }
    }
  }
}

async function openEquipmentTab() {
  fireEvent.click(screen.getByText('Equipment'))
  await screen.findByText('EQP-QUANTSTUDIO5')
}

async function toggleMeasurementCapable() {
  const pill = screen.getByTestId('registry-measurement-capable-toggle') as HTMLInputElement
  await act(async () => {
    fireEvent.click(pill)
  })
  return pill
}

describe('INSTR-COLLAPSE-2 C5: the retired instrument kind leaves no kind-shaped UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fixture()
  })

  afterEach(() => {
    cleanup()
  })

  // (a) RED at base: REGISTRY_TABS carries { id:'instruments', kinds:['instrument'] }.
  it('REGISTRY_TABS has no instruments tab and no instrument kind (Create entry gone by construction)', () => {
    expect(REGISTRY_TABS.some((tab) => tab.id === 'instruments')).toBe(false)
    expect(REGISTRY_TABS.some((tab) => (tab.kinds as readonly string[]).includes('instrument'))).toBe(false)
    // The surviving tabs are untouched (retirement, not shrinkage).
    expect(REGISTRY_TABS.some((tab) => tab.id === 'equipment')).toBe(true)
    expect(REGISTRY_TABS.some((tab) => tab.id === 'capabilities')).toBe(true)
  })

  it('the page renders no Instruments tab in the tab strip', async () => {
    render(<RecordRegistryPage />)
    await openEquipmentTab()
    expect(screen.queryByText('Instruments')).toBeNull()
  })

  it('the Equipment tab Create picker offers no instrument kind', async () => {
    render(<RecordRegistryPage />)
    await openEquipmentTab()
    await act(async () => {
      fireEvent.click(screen.getByTestId('registry-create-button'))
    })
    const picker = await screen.findByTestId('registry-create-kind-picker')
    const chips = picker.querySelectorAll('.registry-kind-chip')
    const kinds = Array.from(chips).map((c) => c.textContent ?? '')
    expect(kinds.length).toBeGreaterThan(0)
    expect(kinds.some((k) => /instrument/.test(k))).toBe(false)
  })

  // (b) RED at base: no measurement-capable affordance exists.
  it('the Equipment tab carries a Measurement-capable toggle (OQ-C(1): pill on the tab, not a pseudo-tab)', async () => {
    render(<RecordRegistryPage />)
    await openEquipmentTab()
    const pill = screen.getByTestId('registry-measurement-capable-toggle')
    expect(pill).toBeTruthy()
    // Default OFF: the one-row-per-machine default view is untouched.
    expect((pill as HTMLInputElement).checked ?? pill.getAttribute('aria-pressed')).toBe('false')
  })

  it('the derived filter shows EXACTLY the analytical-readout-capable machines and names their capability records', async () => {
    render(<RecordRegistryPage />)
    await openEquipmentTab()
    await toggleMeasurementCapable()

    // Class join via an EQC- record: EQP-QUANTSTUDIO5 via ECP-QUANTSTUDIO5.
    await screen.findByText('EQP-QUANTSTUDIO5')
    expect(screen.getByText(/ECP-QUANTSTUDIO5/)).toBeTruthy()
    // Class join via an ontology CURIE: EQP-PLATE-READER via ECP-PLATE-READER.
    expect(screen.getByText('EQP-PLATE-READER')).toBeTruthy()
    expect(screen.getByText(/ECP-PLATE-READER/)).toBeTruthy()
    // Instance join (equipmentRef): EQP-NANODROP via ECP-NANODROP.
    expect(screen.getByText('EQP-NANODROP')).toBeTruthy()
    expect(screen.getByText(/ECP-NANODROP/)).toBeTruthy()

    // bait-6 discrimination: capability-bearing but liquid_handling-only —
    // the verb resolves through verb-definition RECORD data, not presence.
    expect(screen.queryByText('EQP-HEATER-SHAKER')).toBeNull()
    // No capabilities at all (its only capability is an inactive draft).
    expect(screen.queryByText('EQP-PIPETTE')).toBeNull()
    // Non-qualifying capability records are not named either.
    expect(screen.queryByText(/ECP-HEATER-SHAKER/)).toBeNull()
    expect(screen.queryByText(/ECP-PIPETTE-OLD/)).toBeNull()
  })

  it('toggling the filter OFF restores the full one-row-per-machine list (render-level, cf. QMS7-6 bait 6)', async () => {
    render(<RecordRegistryPage />)
    await openEquipmentTab()

    await toggleMeasurementCapable()
    await screen.findByText('EQP-QUANTSTUDIO5')
    expect(screen.queryByText('EQP-HEATER-SHAKER')).toBeNull()

    await toggleMeasurementCapable()
    await screen.findByText('EQP-HEATER-SHAKER')
    await screen.findByText('EQP-PIPETTE')
  })

  // (c) implementation-source guard (spec C5 RED (c); H1/H2 mechanically checkable).
  it('RecordRegistryPage.tsx carries no name-literals or prefix sniffs in the filter logic', () => {
    const src = readFileSync(path.resolve(process.cwd(), 'src/pages/RecordRegistryPage.tsx'), 'utf8')
    expect(src).not.toContain('INSTR-')
    expect(src).not.toContain('VERB-READ')
    expect(src).not.toContain('EQP-QUANTSTUDIO5')
    expect(src).not.toContain('ECP-')
    expect(src).not.toMatch(/startsWith\(['"]EQP/)
    expect(src).not.toMatch(/startsWith\(['"]ECP/)
    expect(src).not.toMatch(/\/EQP-\//)
    expect(src).not.toMatch(/\/ECP-\//)
    // The retired kind must not sneak back as a tab or filter key.
    expect(src).not.toContain("kinds: ['instrument']")
  })
})
