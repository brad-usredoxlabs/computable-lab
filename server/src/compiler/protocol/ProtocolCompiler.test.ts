import { describe, expect, it } from 'vitest';
import { ProtocolCompiler } from './ProtocolCompiler.js';
import type { RecordStore } from '../../store/types.js';
import type { RecordEnvelope } from '../../types/RecordEnvelope.js';
import type { PolicyProfile } from '../../policy/types.js';

function envelope<T extends { id?: string; recordId?: string; kind: string }>(schemaId: string, payload: T): RecordEnvelope<T> {
  return {
    recordId: payload.id ?? payload.recordId ?? `${payload.kind}-record`,
    schemaId,
    payload,
    meta: { kind: payload.kind },
  };
}

function createStore(records: RecordEnvelope[]): Pick<RecordStore, 'list'> {
  return {
    async list(filter) {
      return records.filter((record) => {
        if (!filter?.kind) return true;
        return (record.payload as { kind?: string }).kind === filter.kind;
      });
    },
  };
}

function protocolEnvelope(steps: unknown[]): RecordEnvelope {
  return {
    recordId: 'PRO-000001',
    schemaId: 'schema://protocol',
    payload: {
      protocolLayer: 'universal',
      kind: 'protocol',
      recordId: 'PRO-000001',
      title: 'Protocol under test',
      steps,
    },
    meta: { kind: 'protocol' },
  };
}

const permissiveRemediation: PolicyProfile[] = [
  {
    id: 'org-remediation-allow',
    scope: 'organization',
    scopeId: 'org-1',
    settings: {
      allowRemediation: 'allow',
    },
  },
];

describe('ProtocolCompiler', () => {
  it('lowers a universal step into an instrument-backed lab protocol step using capability matches', async () => {
    const records = [
      envelope('schema://verb', {
        kind: 'verb-definition',
        id: 'VERB-MIX',
        canonical: 'mix',
        label: 'Mix',
        backendHints: ['orbital_shaker'],
      }),
      envelope('schema://equipment-class', {
        kind: 'equipment-class',
        id: 'EQC-SHAKER',
        name: 'Orbital shaker',
        executionBackends: ['orbital_shaker'],
      }),
      envelope('schema://equipment', {
        kind: 'equipment',
        id: 'EQP-SHAKER-1',
        name: 'Shaker 1',
        status: 'active',
        equipmentClassRef: { kind: 'record', type: 'equipment-class', id: 'EQC-SHAKER' },
      }),
      envelope('schema://equipment-capability', {
        kind: 'equipment-capability',
        id: 'ECP-SHAKER-MIX',
        status: 'active',
        equipmentClassRef: { kind: 'record', type: 'equipment-class', id: 'EQC-SHAKER' },
        capabilities: [
          {
            verbRef: { kind: 'record', type: 'verb-definition', id: 'VERB-MIX' },
            methodIds: ['METHOD-MIX-01'],
            backendImplementations: ['orbital_shaker'],
          },
        ],
      }),
    ];

    const compiler = new ProtocolCompiler(createStore(records));
    const result = await compiler.lowerToLabProtocol({
      protocolEnvelope: protocolEnvelope([
        {
          stepId: 'mix-1',
          kind: 'mix',
          semanticVerb: { canonical: 'mix' },
          methodRequirement: {
            methodId: 'METHOD-MIX-01',
            instrumentRole: 'shaker',
          },
        },
      ]),
      bindings: {
        instruments: [
          {
            roleId: 'shaker',
            instrumentRef: { kind: 'record', type: 'equipment', id: 'EQP-SHAKER-1' },
          },
        ],
      },
      context: {
        scope: { organizationId: 'org-1' },
      },
    });

    expect(result.status).toBe('ready');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]?.selectedBackendId).toBe('orbital_shaker');
    expect(result.steps[0]?.executionMode).toBe('instrument');
    expect(result.steps[0]?.disposition).toBe('allowed');
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'NO_ADMISSIBLE_BACKEND')).toBe(false);
  });

  it('falls back to a manual backend when remediation is allowed and no equipment path is available', async () => {
    const records = [
      envelope('schema://verb', {
        kind: 'verb-definition',
        id: 'VERB-READ',
        canonical: 'read',
        label: 'Read',
      }),
      envelope('schema://equipment', {
        kind: 'equipment',
        id: 'EQP-READER-1',
        name: 'Reader 1',
        status: 'active',
      }),
    ];

    const compiler = new ProtocolCompiler(createStore(records));
    const result = await compiler.lowerToLabProtocol({
      protocolEnvelope: protocolEnvelope([
        {
          stepId: 'read-1',
          kind: 'read',
          semanticVerb: { canonical: 'read' },
          methodRequirement: {
            instrumentRole: 'reader',
          },
        },
      ]),
      bindings: {
        instruments: [
          {
            roleId: 'reader',
            instrumentRef: { kind: 'record', type: 'equipment', id: 'EQP-READER-1' },
          },
        ],
      },
      context: {
        scope: { organizationId: 'org-1' },
        policyProfiles: permissiveRemediation,
      },
    });

    expect(result.status).toBe('ready');
    expect(result.steps[0]?.selectedBackendId).toBe('manual');
    expect(result.steps[0]?.executionMode).toBe('manual');
    expect(result.steps[0]?.disposition).toBe('allowed');
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'CAPABILITY_UNSUPPORTED')).toBe(true);
  });

  it('blocks lowering when no admissible backend or operator path exists', async () => {
    const records = [
      envelope('schema://person', {
        kind: 'person',
        id: 'PER-ALICE',
        displayName: 'Alice Analyst',
        status: 'active',
      }),
      envelope('schema://verb', {
        kind: 'verb-definition',
        id: 'VERB-MIX',
        canonical: 'mix',
        label: 'Mix',
      }),
      envelope('schema://equipment-class', {
        kind: 'equipment-class',
        id: 'EQC-SHAKER',
        name: 'Orbital shaker',
      }),
      envelope('schema://equipment', {
        kind: 'equipment',
        id: 'EQP-SHAKER-1',
        name: 'Shaker 1',
        status: 'active',
        equipmentClassRef: { kind: 'record', type: 'equipment-class', id: 'EQC-SHAKER' },
      }),
      envelope('schema://equipment-capability', {
        kind: 'equipment-capability',
        id: 'ECP-SHAKER-MIX',
        status: 'active',
        equipmentClassRef: { kind: 'record', type: 'equipment-class', id: 'EQC-SHAKER' },
        capabilities: [
          {
            verbRef: { kind: 'record', type: 'verb-definition', id: 'VERB-MIX' },
            backendImplementations: ['orbital_shaker'],
          },
        ],
      }),
    ];

    const compiler = new ProtocolCompiler(createStore(records));
    const result = await compiler.lowerToLabProtocol({
      protocolEnvelope: protocolEnvelope([
        {
          stepId: 'mix-1',
          kind: 'mix',
          semanticVerb: { canonical: 'mix' },
          executionPreference: { manualAllowed: false },
          methodRequirement: {
            instrumentRole: 'shaker',
          },
        },
      ]),
      bindings: {
        instruments: [
          {
            roleId: 'shaker',
            instrumentRef: { kind: 'record', type: 'equipment', id: 'EQP-SHAKER-1' },
          },
        ],
      },
      context: {
        scope: { organizationId: 'org-1' },
        operatorPersonId: 'PER-ALICE',
      },
    });

    expect(result.status).toBe('blocked');
    expect(result.steps[0]?.disposition).toBe('blocked');
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'AUTHORIZATION_MISSING')).toBe(true);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'NO_ADMISSIBLE_BACKEND')).toBe(true);
  });

  it('produces a labware-incompatible warning when step labware is not in capability acceptedLabware', async () => {
    const records = [
      envelope('schema://verb', {
        kind: 'verb-definition',
        id: 'VERB-CENTRIFUGE',
        canonical: 'centrifuge',
        label: 'Centrifuge',
      }),
      envelope('schema://equipment-class', {
        kind: 'equipment-class',
        id: 'EQC-CENTRIFUGE',
        name: 'Centrifuge',
        executionBackends: ['centrifuge'],
      }),
      envelope('schema://equipment', {
        kind: 'equipment',
        id: 'EQP-CENTRIFUGE-1',
        name: 'Centrifuge 1',
        status: 'active',
        equipmentClassRef: { kind: 'record', type: 'equipment-class', id: 'EQC-CENTRIFUGE' },
      }),
      envelope('schema://equipment-capability', {
        kind: 'equipment-capability',
        id: 'ECP-CENTRIFUGE-TUBE',
        status: 'active',
        equipmentClassRef: { kind: 'record', type: 'equipment-class', id: 'EQC-CENTRIFUGE' },
        capabilities: [
          {
            verbRef: { kind: 'record', type: 'verb-definition', id: 'VERB-CENTRIFUGE' },
            backendImplementations: ['centrifuge'],
            constraints: {
              acceptedLabware: [
                {
                  labwareRef: { kind: 'record', type: 'labware', id: 'LAB-1-5ML-TUBE' },
                },
              ],
            },
          },
        ],
      }),
    ];

    const compiler = new ProtocolCompiler(createStore(records));
    const result = await compiler.lowerToLabProtocol({
      protocolEnvelope: protocolEnvelope([
        {
          stepId: 'centrifuge-1',
          kind: 'other',
          semanticVerb: { canonical: 'centrifuge' },
          labwareRef: { id: 'LAB-96-WELL-PLATE' },
          methodRequirement: {
            instrumentRole: 'centrifuge',
          },
        },
      ]),
      bindings: {
        instruments: [
          {
            roleId: 'centrifuge',
            instrumentRef: { kind: 'record', type: 'equipment', id: 'EQP-CENTRIFUGE-1' },
          },
        ],
      },
      context: {
        scope: { organizationId: 'org-1' },
      },
    });

    expect(result.status).toBe('ready');
    expect(result.diagnostics.some((d) => d.code === 'labware-incompatible')).toBe(true);
    const labwareDiag = result.diagnostics.find((d) => d.code === 'labware-incompatible');
    expect(labwareDiag?.severity).toBe('warning');
    expect(labwareDiag?.message).toContain('LAB-96-WELL-PLATE');
    expect(labwareDiag?.message).toContain('EQP-CENTRIFUGE-1');
    expect(labwareDiag?.message).toContain('centrifuge');
  });

  it('passes silently when capability has no acceptedLabware constraint', async () => {
    const records = [
      envelope('schema://verb', {
        kind: 'verb-definition',
        id: 'VERB-CENTRIFUGE',
        canonical: 'centrifuge',
        label: 'Centrifuge',
      }),
      envelope('schema://equipment-class', {
        kind: 'equipment-class',
        id: 'EQC-CENTRIFUGE',
        name: 'Centrifuge',
        executionBackends: ['centrifuge'],
      }),
      envelope('schema://equipment', {
        kind: 'equipment',
        id: 'EQP-CENTRIFUGE-1',
        name: 'Centrifuge 1',
        status: 'active',
        equipmentClassRef: { kind: 'record', type: 'equipment-class', id: 'EQC-CENTRIFUGE' },
      }),
      envelope('schema://equipment-capability', {
        kind: 'equipment-capability',
        id: 'ECP-CENTRIFUGE-UNCONSTRAINED',
        status: 'active',
        equipmentClassRef: { kind: 'record', type: 'equipment-class', id: 'EQC-CENTRIFUGE' },
        capabilities: [
          {
            verbRef: { kind: 'record', type: 'verb-definition', id: 'VERB-CENTRIFUGE' },
            backendImplementations: ['centrifuge'],
            // No constraints.acceptedLabware - open world assumption
          },
        ],
      }),
    ];

    const compiler = new ProtocolCompiler(createStore(records));
    const result = await compiler.lowerToLabProtocol({
      protocolEnvelope: protocolEnvelope([
        {
          stepId: 'centrifuge-1',
          kind: 'other',
          semanticVerb: { canonical: 'centrifuge' },
          labwareRef: { id: 'LAB-96-WELL-PLATE' },
          methodRequirement: {
            instrumentRole: 'centrifuge',
          },
        },
      ]),
      bindings: {
        instruments: [
          {
            roleId: 'centrifuge',
            instrumentRef: { kind: 'record', type: 'equipment', id: 'EQP-CENTRIFUGE-1' },
          },
        ],
      },
      context: {
        scope: { organizationId: 'org-1' },
      },
    });

    expect(result.status).toBe('ready');
    expect(result.diagnostics.some((d) => d.code === 'labware-incompatible')).toBe(false);
  });

  it('passes silently when step has no labware reference', async () => {
    const records = [
      envelope('schema://verb', {
        kind: 'verb-definition',
        id: 'VERB-CENTRIFUGE',
        canonical: 'centrifuge',
        label: 'Centrifuge',
      }),
      envelope('schema://equipment-class', {
        kind: 'equipment-class',
        id: 'EQC-CENTRIFUGE',
        name: 'Centrifuge',
        executionBackends: ['centrifuge'],
      }),
      envelope('schema://equipment', {
        kind: 'equipment',
        id: 'EQP-CENTRIFUGE-1',
        name: 'Centrifuge 1',
        status: 'active',
        equipmentClassRef: { kind: 'record', type: 'equipment-class', id: 'EQC-CENTRIFUGE' },
      }),
      envelope('schema://equipment-capability', {
        kind: 'equipment-capability',
        id: 'ECP-CENTRIFUGE-TUBE',
        status: 'active',
        equipmentClassRef: { kind: 'record', type: 'equipment-class', id: 'EQC-CENTRIFUGE' },
        capabilities: [
          {
            verbRef: { kind: 'record', type: 'verb-definition', id: 'VERB-CENTRIFUGE' },
            backendImplementations: ['centrifuge'],
            constraints: {
              acceptedLabware: [
                {
                  labwareRef: { kind: 'record', type: 'labware', id: 'LAB-1-5ML-TUBE' },
                },
              ],
            },
          },
        ],
      }),
    ];

    const compiler = new ProtocolCompiler(createStore(records));
    const result = await compiler.lowerToLabProtocol({
      protocolEnvelope: protocolEnvelope([
        {
          stepId: 'centrifuge-1',
          kind: 'other',
          semanticVerb: { canonical: 'centrifuge' },
          // No labwareRef - should pass silently
          methodRequirement: {
            instrumentRole: 'centrifuge',
          },
        },
      ]),
      bindings: {
        instruments: [
          {
            roleId: 'centrifuge',
            instrumentRef: { kind: 'record', type: 'equipment', id: 'EQP-CENTRIFUGE-1' },
          },
        ],
      },
      context: {
        scope: { organizationId: 'org-1' },
      },
    });

    expect(result.status).toBe('ready');
    expect(result.diagnostics.some((d) => d.code === 'labware-incompatible')).toBe(false);
  });
});
