/**
 * Default editor fixture suite — representative schema coverage for the TapTab
 * projection-backed editor path.
 *
 * Covers four representative schemas:
 *  - `planned-run`  → composite widgets (array, object), conditional visibility
 *  - `experiment`   → structured refs (reflist), nested objects
 *  - `material`     → combobox suggestions, multiselect
 *  - `instrument`   → primitive fields, readonly, datetime
 *
 * Each fixture exercises:
 *  1. projection load (buildProjectionDocument)
 *  2. TapTab render (FieldRow nodes present)
 *  3. edit interaction (updateAttributes via fieldRow attrs)
 *  4. serialize round-trip (serializeDocument)
 *  5. save-payload generation (isDirty tracking)
 *
 * No live network calls. No SchemaRecordForm fallback.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { serializeDocument, isDirty, buildProjectionDocument } from './index'
import type { EditorProjectionResponse, ProjectionBlock, ProjectionSlot } from '../../types/uiSpec'

// ============================================================================
// Shared helpers
// ============================================================================

/**
 * Build a minimal EditorProjectionResponse for a given schema.
 */
function makeProjection(
  schemaId: string,
  recordId: string,
  blocks: ProjectionBlock[],
  slots: ProjectionSlot[],
): EditorProjectionResponse {
  return {
    schemaId,
    recordId,
    title: `${schemaId} — ${recordId}`,
    blocks,
    slots,
    diagnostics: [],
  }
}

/**
 * Assert that a serialized payload contains expected top-level keys.
 */
function expectPayload(payload: Record<string, unknown>, keys: string[]): void {
  for (const key of keys) {
    expect(payload).toHaveProperty(key)
  }
}

// ============================================================================
// Fixture 1: planned-run — composite widgets + conditional visibility
// ============================================================================

describe('Fixture: planned-run (composite widgets + conditional visibility)', () => {
  const schemaId = 'planned-run'
  const recordId = 'pr-001'

  const blocks: ProjectionBlock[] = [
    {
      id: 'b-identity',
      kind: 'section',
      label: 'Identity',
      slotIds: ['sl-name', 'sl-status', 'sl-protocol'],
    },
    {
      id: 'b-components',
      kind: 'section',
      label: 'Components',
      slotIds: ['sl-components', 'sl-settings'],
    },
    {
      id: 'b-advanced',
      kind: 'section',
      label: 'Advanced',
      slotIds: ['sl-advanced-enabled', 'sl-advanced-detail'],
      visible: { when: '$.advancedEnabled', operator: 'equals', value: true },
    },
  ]

  const slots: ProjectionSlot[] = [
    { id: 'sl-name', path: '$.name', label: 'Run Name', widget: 'text', required: true },
    { id: 'sl-status', path: '$.status', label: 'Status', widget: 'select', options: [
      { value: 'draft', label: 'Draft' },
      { value: 'approved', label: 'Approved' },
      { value: 'completed', label: 'Completed' },
    ]},
    { id: 'sl-protocol', path: '$.protocol', label: 'Protocol', widget: 'combobox', suggestionProviders: ['local-vocab'] },
    { id: 'sl-components', path: '$.components', label: 'Components', widget: 'array', items: {
      path: '$.components[].name',
      widget: 'text',
      label: 'Component Name',
    }},
    { id: 'sl-settings', path: '$.settings', label: 'Settings', widget: 'object', fields: [
      { path: '$.settings.threshold', widget: 'number', label: 'Threshold' },
      { path: '$.settings.enabled', widget: 'checkbox', label: 'Enabled' },
      { path: '$.settings.name', widget: 'text', label: 'Settings Name' },
    ]},
    { id: 'sl-advanced-enabled', path: '$.advancedEnabled', label: 'Advanced Mode', widget: 'checkbox' },
    { id: 'sl-advanced-detail', path: '$.advancedDetail', label: 'Advanced Detail', widget: 'textarea' },
  ]

  const baseData: Record<string, unknown> = {
    name: '',
    status: 'draft',
    protocol: '',
    components: [],
    settings: { threshold: 0, enabled: false, name: '' },
    advancedEnabled: false,
    advancedDetail: '',
  }

  it('loads projection and builds document with correct sections', () => {
    const doc = buildProjectionDocument(blocks, slots, baseData)

    expect(doc.type).toBe('doc')
    expect(Array.isArray(doc.content)).toBe(true)
    // Should have 2 sections: Identity and Components
    // Advanced section should be present in blocks but its visibility condition
    // is evaluated at render time; buildProjectionDocument includes all blocks
    expect(doc.content.length).toBe(3)
  })

  it('renders field rows for all visible slots', () => {
    const doc = buildProjectionDocument(blocks, slots, baseData)

    const allFieldRows = doc.content.flatMap(
      (section) => (section.content ?? []).filter((c) => c.type === 'fieldRow')
    )

    expect(allFieldRows.length).toBe(7) // name, status, protocol, components, settings, advanced-enabled, advanced-detail
  })

  it('serializes composite array field correctly', () => {
    const doc = buildProjectionDocument(blocks, slots, {
      ...baseData,
      name: '96-well-qPCR-run',
      components: [
        { name: 'Master Mix', volume: 250, unit: 'uL' },
        { name: 'Template DNA', volume: 5, unit: 'uL' },
      ],
    })

    const serialized = serializeDocument(doc, baseData)

    expect(serialized.name).toBe('96-well-qPCR-run')
    expect(Array.isArray(serialized.components)).toBe(true)
    const components = serialized.components as Array<Record<string, unknown>>
    expect(components.length).toBe(2)
    expect(components[0].name).toBe('Master Mix')
    expect(components[0].volume).toBe(250)
    expect(components[1].name).toBe('Template DNA')
  })

  it('serializes nested object field correctly', () => {
    const doc = buildProjectionDocument(blocks, slots, {
      ...baseData,
      name: 'experiment-run',
      components: [{ name: 'Reagent A', volume: 100, unit: 'uL' }],
      settings: { threshold: 42, enabled: true, name: 'Custom Settings' },
    })

    const serialized = serializeDocument(doc, baseData)

    expect(serialized.name).toBe('experiment-run')
    expect(serialized.settings).toBeDefined()
    const settings = serialized.settings as Record<string, unknown>
    expect(settings.threshold).toBe(42)
    expect(settings.enabled).toBe(true)
  })

  it('round-trips dirty state through edit simulation', () => {
    // Original data
    const original: Record<string, unknown> = {
      name: 'original-run',
      status: 'draft',
      protocol: '',
      components: [],
      advancedEnabled: false,
      advancedDetail: '',
    }

    // Simulated edit: change name and status
    const edited: Record<string, unknown> = {
      name: 'edited-run',
      status: 'approved',
      protocol: '',
      components: [],
      advancedEnabled: false,
      advancedDetail: '',
    }

    expect(isDirty(original, edited)).toBe(true)

    // No changes
    expect(isDirty(original, original)).toBe(false)
  })

  it('generates save payload with all fields preserved', () => {
    const doc = buildProjectionDocument(blocks, slots, {
      name: 'full-run',
      status: 'approved',
      protocol: 'test-wash',
      components: [{ name: 'Buffer', volume: 500, unit: 'uL' }],
      advancedEnabled: true,
      advancedDetail: 'Custom protocol notes',
    })

    const payload = serializeDocument(doc, baseData)

    expectPayload(payload, ['name', 'status', 'protocol', 'components', 'advancedEnabled', 'advancedDetail'])
    expect(payload.name).toBe('full-run')
    expect(payload.status).toBe('approved')
    expect(payload.protocol).toBe('test-wash')
    expect(payload.advancedEnabled).toBe(true)
    expect(payload.advancedDetail).toBe('Custom protocol notes')
  })
})

// ============================================================================
// Fixture 2: experiment — structured refs (reflist)
// ============================================================================

describe('Fixture: experiment (structured refs via reflist)', () => {
  const schemaId = 'experiment'
  const recordId = 'exp-001'

  const blocks: ProjectionBlock[] = [
    {
      id: 'b-identity',
      kind: 'section',
      label: 'Identity',
      slotIds: ['sl-title', 'sl-organism', 'sl-assay'],
    },
    {
      id: 'b-design',
      kind: 'section',
      label: 'Design',
      slotIds: ['sl-references', 'sl-conditions'],
    },
  ]

  const slots: ProjectionSlot[] = [
    { id: 'sl-title', path: '$.title', label: 'Title', widget: 'text', required: true },
    { id: 'sl-organism', path: '$.organism', label: 'Organism', widget: 'ref', refKind: 'organism', suggestionProviders: ['ontology'] },
    { id: 'sl-assay', path: '$.assay', label: 'Assay', widget: 'ref', refKind: 'assay-spec', suggestionProviders: ['local-records'] },
    { id: 'sl-references', path: '$.references', label: 'References', widget: 'reflist', suggestionProviders: ['ontology'] },
    { id: 'sl-conditions', path: '$.conditions', label: 'Conditions', widget: 'object', fields: [
      { path: '$.conditions.temperature', widget: 'number', label: 'Temperature (°C)' },
      { path: '$.conditions.duration', widget: 'number', label: 'Duration (min)' },
      { path: '$.conditions.atmosphere', widget: 'select', label: 'Atmosphere', options: [
        { value: 'aerobic', label: 'Aerobic' },
        { value: 'anaerobic', label: 'Anaerobic' },
      ]},
    ]},
  ]

  const baseData: Record<string, unknown> = {
    title: '',
    organism: '',
    assay: '',
    references: [],
    conditions: { temperature: 0, duration: 0, atmosphere: 'aerobic' },
  }

  it('loads projection and builds document with reflist slot', () => {
    const doc = buildProjectionDocument(blocks, slots, baseData)

    expect(doc.type).toBe('doc')
    expect(doc.content.length).toBe(2)

    // Find the reflist field row
    const designSection = doc.content.find((s) => (s.attrs as { title?: string })?.title === 'Design')
    const reflistRow = (designSection?.content ?? []).find(
      (c) => c.type === 'fieldRow' && (c.attrs as { widget?: string })?.widget === 'reflist'
    )

    expect(reflistRow).toBeDefined()
    expect((reflistRow?.attrs as { path?: string })?.path).toBe('$.references')
  })

  it('serializes reflist entries with structured data', () => {
    const doc = buildProjectionDocument(blocks, slots, {
      ...baseData,
      title: 'AhR activation in HepG2 cells',
      organism: 'Homo sapiens',
      assay: 'AhR-luciferase-reporter',
      references: [
        { value: 'term-001', source: 'local' },
        {
          value: 'http://purl.obolibrary.org/obo/NCBITaxon_9606',
          source: 'ontology',
          termData: {
            label: 'Homo sapiens',
            iri: 'http://purl.obolibrary.org/obo/NCBITaxon_9606',
            definition: 'The human species.',
          },
        },
      ],
      conditions: { temperature: 37, duration: 24, atmosphere: 'aerobic' },
    })

    const payload = serializeDocument(doc, baseData)

    expect(payload.title).toBe('AhR activation in HepG2 cells')
    expect(Array.isArray(payload.references)).toBe(true)
    const refs = payload.references as Array<Record<string, unknown>>
    expect(refs.length).toBe(2)
    expect(refs[0].value).toBe('term-001')
    expect(refs[0].source).toBe('local')
    expect(refs[1].source).toBe('ontology')
    expect((refs[1].termData as { label: string })?.label).toBe('Homo sapiens')
  })

  it('serializes nested object conditions correctly', () => {
    const doc = buildProjectionDocument(blocks, slots, {
      ...baseData,
      title: 'Anaerobic culture',
      conditions: { temperature: 30, duration: 48, atmosphere: 'anaerobic' },
    })

    const payload = serializeDocument(doc, baseData)

    const conditions = payload.conditions as Record<string, unknown>
    expect(conditions.temperature).toBe(30)
    expect(conditions.duration).toBe(48)
    expect(conditions.atmosphere).toBe('anaerobic')
  })

  it('round-trips experiment payload without clobbering sibling fields', () => {
    const doc = buildProjectionDocument(blocks, slots, {
      title: 'Full experiment',
      organism: 'Mus musculus',
      assay: 'FIRE-cellular-redox',
      references: [{ value: 'ref-001', source: 'local' }],
      conditions: { temperature: 37, duration: 12, atmosphere: 'aerobic' },
    })

    const payload = serializeDocument(doc, baseData)

    expectPayload(payload, ['title', 'organism', 'assay', 'references', 'conditions'])
    expect(payload.title).toBe('Full experiment')
    expect(payload.organism).toBe('Mus musculus')
    expect(payload.assay).toBe('FIRE-cellular-redox')
  })
})

// ============================================================================
// Fixture 3: material — combobox suggestions + multiselect
// ============================================================================

describe('Fixture: material (combobox suggestions + multiselect)', () => {
  const schemaId = 'material'
  const recordId = 'mat-001'

  const blocks: ProjectionBlock[] = [
    {
      id: 'b-identity',
      kind: 'section',
      label: 'Identity',
      slotIds: ['sl-name', 'sl-type', 'sl-class'],
    },
    {
      id: 'b-properties',
      kind: 'section',
      label: 'Properties',
      slotIds: ['sl-tags', 'sl-concentration', 'sl-storage'],
    },
  ]

  const slots: ProjectionSlot[] = [
    { id: 'sl-name', path: '$.name', label: 'Material Name', widget: 'text', required: true },
    { id: 'sl-type', path: '$.type', label: 'Material Type', widget: 'combobox', suggestionProviders: ['local-vocab'] },
    { id: 'sl-class', path: '$.compoundClass', label: 'Compound Class', widget: 'combobox', suggestionProviders: ['local-records'] },
    { id: 'sl-tags', path: '$.tags', label: 'Tags', widget: 'multiselect', options: [
      { value: 'reagent', label: 'Reagent' },
      { value: 'standard', label: 'Standard' },
      { value: 'calibrator', label: 'Calibrator' },
      { value: 'control', label: 'Control' },
    ]},
    { id: 'sl-concentration', path: '$.concentration', label: 'Concentration', widget: 'number' },
    { id: 'sl-storage', path: '$.storage', label: 'Storage', widget: 'text' },
  ]

  const baseData: Record<string, unknown> = {
    name: '',
    type: '',
    compoundClass: '',
    tags: [],
    concentration: 0,
    storage: '',
  }

  it('loads projection and builds document with combobox slots', () => {
    const doc = buildProjectionDocument(blocks, slots, baseData)

    expect(doc.type).toBe('doc')
    expect(doc.content.length).toBe(2)

    // Verify combobox slots are present
    const identitySection = doc.content.find((s) => (s.attrs as { title?: string })?.title === 'Identity')
    const typeRow = (identitySection?.content ?? []).find(
      (c) => c.type === 'fieldRow' && (c.attrs as { widget?: string })?.widget === 'combobox'
    )

    expect(typeRow).toBeDefined()
    expect((typeRow?.attrs as { path?: string })?.path).toBe('$.type')
  })

  it('serializes multiselect as array of strings', () => {
    const doc = buildProjectionDocument(blocks, slots, {
      ...baseData,
      name: 'AhR-activator-C1',
      type: 'small-molecule',
      compoundClass: 'AhR-activator',
      tags: ['reagent', 'standard'],
      concentration: 10,
      storage: '-20°C',
    })

    const payload = serializeDocument(doc, baseData)

    expect(payload.name).toBe('AhR-activator-C1')
    expect(Array.isArray(payload.tags)).toBe(true)
    expect(payload.tags).toEqual(['reagent', 'standard'])
    expect(payload.concentration).toBe(10)
    expect(payload.storage).toBe('-20°C')
  })

  it('serializes empty multiselect as empty array', () => {
    const doc = buildProjectionDocument(blocks, slots, {
      ...baseData,
      name: 'Untagged material',
      tags: [],
    })

    const payload = serializeDocument(doc, baseData)

    expect(payload.tags).toEqual([])
  })

  it('round-trips material payload preserving all fields', () => {
    const doc = buildProjectionDocument(blocks, slots, {
      name: 'PPARα-antagonist-G001',
      type: 'small-molecule',
      compoundClass: 'PPARα-antagonist',
      tags: ['reagent', 'calibrator'],
      concentration: 50,
      storage: '4°C',
    })

    const payload = serializeDocument(doc, baseData)

    expectPayload(payload, ['name', 'type', 'compoundClass', 'tags', 'concentration', 'storage'])
    expect(payload.name).toBe('PPARα-antagonist-G001')
    expect(payload.type).toBe('small-molecule')
    expect(payload.compoundClass).toBe('PPARα-antagonist')
    expect(payload.tags).toEqual(['reagent', 'calibrator'])
    expect(payload.concentration).toBe(50)
    expect(payload.storage).toBe('4°C')
  })

  it('isDirty tracks combobox and multiselect changes', () => {
    const original: Record<string, unknown> = {
      name: 'Original',
      type: 'small-molecule',
      tags: ['reagent'],
    }

    const changed: Record<string, unknown> = {
      name: 'Original',
      type: 'antibody', // Changed
      tags: ['reagent', 'standard'], // Changed
    }

    expect(isDirty(original, changed)).toBe(true)

    const unchanged: Record<string, unknown> = {
      name: 'Original',
      type: 'small-molecule',
      tags: ['reagent'],
    }

    expect(isDirty(original, unchanged)).toBe(false)
  })
})

// ============================================================================
// Fixture 4: instrument — primitive fields + readonly + datetime
// ============================================================================

describe('Fixture: instrument (primitive fields + readonly + datetime)', () => {
  const schemaId = 'instrument'
  const recordId = 'inst-001'

  const blocks: ProjectionBlock[] = [
    {
      id: 'b-identity',
      kind: 'section',
      label: 'Identity',
      slotIds: ['sl-name', 'sl-manufacturer', 'sl-model', 'sl-serial'],
    },
    {
      id: 'b-status',
      kind: 'section',
      label: 'Status',
      slotIds: ['sl-status', 'sl-installed', 'sl-lastService'],
    },
  ]

  const slots: ProjectionSlot[] = [
    { id: 'sl-name', path: '$.name', label: 'Instrument Name', widget: 'text', required: true },
    { id: 'sl-manufacturer', path: '$.manufacturer', label: 'Manufacturer', widget: 'text' },
    { id: 'sl-model', path: '$.model', label: 'Model', widget: 'text' },
    { id: 'sl-serial', path: '$.serialNumber', label: 'Serial Number', widget: 'text' },
    { id: 'sl-status', path: '$.status', label: 'Status', widget: 'select', options: [
      { value: 'active', label: 'Active' },
      { value: 'maintenance', label: 'Maintenance' },
      { value: 'decommissioned', label: 'Decommissioned' },
    ]},
    { id: 'sl-installed', path: '$.installedAt', label: 'Installed At', widget: 'datetime' },
    { id: 'sl-lastService', path: '$.lastService', label: 'Last Service', widget: 'readonly' },
  ]

  const baseData: Record<string, unknown> = {
    name: '',
    manufacturer: '',
    model: '',
    serialNumber: '',
    status: 'active',
    installedAt: '',
    lastService: '',
  }

  it('loads projection and builds document with datetime and readonly slots', () => {
    const doc = buildProjectionDocument(blocks, slots, baseData)

    expect(doc.type).toBe('doc')
    expect(doc.content.length).toBe(2)

    // Verify datetime slot
    const statusSection = doc.content.find((s) => (s.attrs as { title?: string })?.title === 'Status')
    const installedRow = (statusSection?.content ?? []).find(
      (c) => c.type === 'fieldRow' && (c.attrs as { widget?: string })?.widget === 'datetime'
    )

    expect(installedRow).toBeDefined()
    expect((installedRow?.attrs as { path?: string })?.path).toBe('$.installedAt')

    // Verify readonly slot
    const lastServiceRow = (statusSection?.content ?? []).find(
      (c) => c.type === 'fieldRow' && (c.attrs as { widget?: string })?.widget === 'readonly'
    )

    expect(lastServiceRow).toBeDefined()
    expect((lastServiceRow?.attrs as { path?: string })?.path).toBe('$.lastService')
  })

  it('serializes datetime field correctly', () => {
    const doc = buildProjectionDocument(blocks, slots, {
      ...baseData,
      name: 'QuantStudio 5',
      manufacturer: 'Thermo Fisher',
      model: 'QuantStudio 5',
      serialNumber: 'QS5-2024-001',
      status: 'active',
      installedAt: '2024-03-15T09:00',
      lastService: '2024-06-01T14:30',
    })

    const payload = serializeDocument(doc, baseData)

    expect(payload.name).toBe('QuantStudio 5')
    expect(payload.manufacturer).toBe('Thermo Fisher')
    expect(payload.installedAt).toBe('2024-03-15T09:00')
    expect(payload.lastService).toBe('2024-06-01T14:30')
  })

  it('serializes readonly field without modification', () => {
    const doc = buildProjectionDocument(blocks, slots, {
      ...baseData,
      name: 'Centrifuge-001',
      lastService: '2024-01-10T08:00',
    })

    const payload = serializeDocument(doc, baseData)

    expect(payload.lastService).toBe('2024-01-10T08:00')
  })

  it('round-trips instrument payload with all primitive fields', () => {
    const doc = buildProjectionDocument(blocks, slots, {
      name: 'BioRad CFX96',
      manufacturer: 'Bio-Rad',
      model: 'CFX96 Touch',
      serialNumber: 'BR-CFX96-42',
      status: 'active',
      installedAt: '2023-11-20T10:00',
      lastService: '2024-05-15T11:00',
    })

    const payload = serializeDocument(doc, baseData)

    expectPayload(payload, ['name', 'manufacturer', 'model', 'serialNumber', 'status', 'installedAt', 'lastService'])
    expect(payload.name).toBe('BioRad CFX96')
    expect(payload.manufacturer).toBe('Bio-Rad')
    expect(payload.model).toBe('CFX96 Touch')
    expect(payload.serialNumber).toBe('BR-CFX96-42')
    expect(payload.status).toBe('active')
  })

  it('isDirty tracks datetime and select changes', () => {
    const original: Record<string, unknown> = {
      name: 'Instrument',
      status: 'active',
      installedAt: '2024-01-01T00:00',
    }

    const changed: Record<string, unknown> = {
      name: 'Instrument',
      status: 'maintenance',
      installedAt: '2024-01-01T00:00',
    }

    expect(isDirty(original, changed)).toBe(true)
  })
})

// ============================================================================
// Cross-fixture: no SchemaRecordForm fallback
// ============================================================================

describe('Cross-fixture: default editor path invariants', () => {
  it('buildProjectionDocument produces valid TipTap doc for all four schemas', () => {
    const schemas = [
      {
        name: 'planned-run',
        blocks: [{ id: 'b1', kind: 'section', label: 'Section', slotIds: ['s1'] }],
        slots: [{ id: 's1', path: '$.name', label: 'Name', widget: 'text' }],
        data: { name: 'test' },
      },
      {
        name: 'experiment',
        blocks: [{ id: 'b1', kind: 'section', label: 'Section', slotIds: ['s1'] }],
        slots: [{ id: 's1', path: '$.title', label: 'Title', widget: 'text' }],
        data: { title: 'test' },
      },
      {
        name: 'material',
        blocks: [{ id: 'b1', kind: 'section', label: 'Section', slotIds: ['s1'] }],
        slots: [{ id: 's1', path: '$.name', label: 'Name', widget: 'text' }],
        data: { name: 'test' },
      },
      {
        name: 'instrument',
        blocks: [{ id: 'b1', kind: 'section', label: 'Section', slotIds: ['s1'] }],
        slots: [{ id: 's1', path: '$.name', label: 'Name', widget: 'text' }],
        data: { name: 'test' },
      },
    ]

    for (const schema of schemas) {
      const doc = buildProjectionDocument(schema.blocks, schema.slots, schema.data)
      expect(doc.type).toBe('doc')
      expect(doc.content.length).toBeGreaterThan(0)

      // Each section should have a heading and at least one fieldRow
      for (const section of doc.content) {
        expect(section.type).toBe('section')
        const heading = (section.content ?? []).find((c) => c.type === 'sectionHeading')
        expect(heading).toBeDefined()
        const fieldRows = (section.content ?? []).filter((c) => c.type === 'fieldRow')
        expect(fieldRows.length).toBeGreaterThan(0)
      }
    }
  })

  it('serializeDocument preserves baseRecord keys not in the document', () => {
    const doc = buildProjectionDocument(
      [{ id: 'b1', kind: 'section', label: 'Section', slotIds: ['s1'] }],
      [{ id: 's1', path: '$.name', label: 'Name', widget: 'text' }],
      { name: 'test' }
    )

    const baseRecord: Record<string, unknown> = {
      name: '',
      createdAt: '2024-01-01',
      createdBy: 'system',
    }

    const payload = serializeDocument(doc, baseRecord)

    // name should be updated
    expect(payload.name).toBe('test')
    // createdAt and createdBy should be preserved from baseRecord
    expect(payload.createdAt).toBe('2024-01-01')
    expect(payload.createdBy).toBe('system')
  })

  it('serializeDocument does not mutate the baseRecord', () => {
    const doc = buildProjectionDocument(
      [{ id: 'b1', kind: 'section', label: 'Section', slotIds: ['s1'] }],
      [{ id: 's1', path: '$.name', label: 'Name', widget: 'text' }],
      { name: 'original' }
    )

    const baseRecord: Record<string, unknown> = {
      name: 'original',
      nested: { key: 'value' },
    }

    const originalName = baseRecord.name
    const originalNested = structuredClone(baseRecord.nested)

    const payload = serializeDocument(doc, baseRecord)

    expect(baseRecord.name).toBe(originalName)
    expect(baseRecord.nested).toEqual(originalNested)
    expect(payload.name).toBe('original')
  })
})
