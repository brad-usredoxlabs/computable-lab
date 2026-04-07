import { describe, expect, it } from 'vitest';
import type { RecordEnvelope, RecordStore, StoreResult, GetRecordOptions } from '../../store/types.js';
import type { ValidationResult, LintResult } from '../../types/common.js';
import { MaterialCompilerService } from './MaterialCompiler.js';
import type { MaterialCompilerPolicyProfile, NormalizedMaterialIntentPayload } from './types.js';
import type { NormalizedIntent } from '../types.js';

const SCHEMA_IDS = {
  material: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
  materialSpec: 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml',
  materialInstance: 'https://computable-lab.com/schema/computable-lab/material-instance.schema.yaml',
} as const;

class MemoryRecordStore implements RecordStore {
  private readonly records = new Map<string, RecordEnvelope>();

  constructor(records: RecordEnvelope[] = []) {
    for (const record of records) this.records.set(record.recordId, structuredClone(record));
  }

  async get(recordId: string): Promise<RecordEnvelope | null> {
    return structuredClone(this.records.get(recordId) ?? null);
  }

  async getWithValidation(_options: GetRecordOptions): Promise<StoreResult> {
    throw new Error('not implemented in test store');
  }

  async list(filter: { kind?: string; schemaId?: string; idPrefix?: string; limit?: number; offset?: number } = {}): Promise<RecordEnvelope[]> {
    let values = [...this.records.values()];
    if (filter.schemaId) values = values.filter((record) => record.schemaId === filter.schemaId);
    if (filter.kind) values = values.filter((record) => ((record.payload as Record<string, unknown>).kind) === filter.kind);
    if (filter.idPrefix) values = values.filter((record) => record.recordId.startsWith(filter.idPrefix!));
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? values.length;
    return structuredClone(values.slice(offset, offset + limit));
  }

  async create(options: { envelope: RecordEnvelope }): Promise<StoreResult> {
    this.records.set(options.envelope.recordId, structuredClone(options.envelope));
    return { success: true, envelope: structuredClone(options.envelope) };
  }

  async update(options: { envelope: RecordEnvelope }): Promise<StoreResult> {
    this.records.set(options.envelope.recordId, structuredClone(options.envelope));
    return { success: true, envelope: structuredClone(options.envelope) };
  }

  async delete(options: { recordId: string }): Promise<StoreResult> {
    this.records.delete(options.recordId);
    return { success: true };
  }

  async validate(_envelope: RecordEnvelope): Promise<ValidationResult> {
    return { valid: true, errors: [] };
  }

  async lint(_envelope: RecordEnvelope): Promise<LintResult> {
    return { valid: true, violations: [] };
  }

  async exists(recordId: string): Promise<boolean> {
    return this.records.has(recordId);
  }
}

function material(recordId: string, name: string): RecordEnvelope {
  return {
    recordId,
    schemaId: SCHEMA_IDS.material,
    payload: {
      kind: 'material',
      id: recordId,
      name,
      domain: 'chemical',
    },
  };
}

function materialSpec(recordId: string, analyteId: string, analyteName: string, solventId: string, solventName: string, value: number, unit: string): RecordEnvelope {
  return {
    recordId,
    schemaId: SCHEMA_IDS.materialSpec,
    payload: {
      kind: 'material-spec',
      id: recordId,
      name: `${value} ${unit} ${analyteName} in ${solventName}`,
      material_ref: { kind: 'record', id: analyteId, type: 'material', label: analyteName },
      formulation: {
        concentration: { value, unit, basis: 'molar' },
        solvent_ref: { kind: 'record', id: solventId, type: 'material', label: solventName },
        composition: [
          {
            component_ref: { kind: 'record', id: analyteId, type: 'material', label: analyteName },
            role: 'solute',
            concentration: { value, unit, basis: 'molar' },
          },
          {
            component_ref: { kind: 'record', id: solventId, type: 'material', label: solventName },
            role: 'solvent',
          },
        ],
      },
    },
  };
}

function materialInstance(recordId: string, formulationId: string, label: string): RecordEnvelope {
  return {
    recordId,
    schemaId: SCHEMA_IDS.materialInstance,
    payload: {
      kind: 'material-instance',
      id: recordId,
      name: label,
      material_spec_ref: { kind: 'record', id: formulationId, type: 'material-spec', label },
      status: 'available',
    },
  };
}

function normalizedIntent(payload: Partial<NormalizedMaterialIntentPayload>): NormalizedIntent<NormalizedMaterialIntentPayload> {
  const finalPayload: NormalizedMaterialIntentPayload = {
    intentType: 'add_material_to_well',
    analyteName: 'Fenofibrate',
    targetRole: 'target_plate',
    targetWell: 'B2',
    quantity: { value: 10, unit: 'uL' },
    ...payload,
  };
  return {
    domain: 'materials',
    intentId: 'intent-1',
    version: '1',
    summary: `Add ${finalPayload.analyteName}`,
    payload: finalPayload,
    requiredFacts: ['targetRole', 'targetWell'],
  };
}

function profiles(overrides?: {
  allowAutoCreate?: 'allow' | 'confirm' | 'deny';
  allowPlaceholders?: 'allow' | 'confirm' | 'deny';
  allowRemediation?: 'allow' | 'confirm' | 'deny';
  allowSubstitutions?: 'allow' | 'confirm' | 'deny';
  mode?: 'semantic-planning' | 'execution-planning' | 'strict-inventory';
  clarificationBehavior?: 'confirm-near-match' | 'diagnostic-only';
  remediationBehavior?: 'suggest' | 'suppress';
}): MaterialCompilerPolicyProfile[] {
  return [
    {
      id: 'org-default',
      scope: 'organization',
      scopeId: 'org-1',
      settings: {
        allowAutoCreate: overrides?.allowAutoCreate ?? 'deny',
        allowPlaceholders: overrides?.allowPlaceholders ?? 'deny',
        allowRemediation: overrides?.allowRemediation ?? 'allow',
        allowSubstitutions: overrides?.allowSubstitutions ?? 'confirm',
      },
      materialSettings: {
        mode: overrides?.mode ?? 'execution-planning',
        clarificationBehavior: overrides?.clarificationBehavior ?? 'confirm-near-match',
        remediationBehavior: overrides?.remediationBehavior ?? 'suggest',
      },
    },
  ];
}

describe('MaterialCompilerService', () => {
  it('reuses exact semantic, formulation, and instance matches', async () => {
    const store = new MemoryRecordStore([
      material('MAT-FEN', 'Fenofibrate'),
      material('MAT-DMSO', 'DMSO'),
      materialSpec('MSP-FEN-1MM', 'MAT-FEN', 'Fenofibrate', 'MAT-DMSO', 'DMSO', 1, 'mM'),
      materialInstance('MINST-FEN-1MM', 'MSP-FEN-1MM', 'Fenofibrate stock'),
    ]);
    const compiler = new MaterialCompilerService(store);

    const result = await compiler.compile({
      normalizedIntent: normalizedIntent({
        solventName: 'DMSO',
        concentration: { value: 1, unit: 'mM', basis: 'molar' },
      }),
      activeScope: { organizationId: 'org-1' },
      policyProfiles: profiles(),
    });

    expect(result.resolved.analyte.recordId).toBe('MAT-FEN');
    expect(result.resolved.formulation?.recordId).toBe('MSP-FEN-1MM');
    expect(result.resolved.materialSource?.recordId).toBe('MINST-FEN-1MM');
    expect(result.createdRecordIds).toEqual([]);
    expect((result.eventDraft?.details.material_instance_ref as { id: string }).id).toBe('MINST-FEN-1MM');
    expect(result.outcome).toBe('ready');
  });

  it('creates a missing semantic material when auto-create is allowed', async () => {
    const store = new MemoryRecordStore([]);
    const compiler = new MaterialCompilerService(store);

    const result = await compiler.compile({
      normalizedIntent: normalizedIntent({
        analyteName: 'Fenofibrate',
      }),
      activeScope: { organizationId: 'org-1' },
      policyProfiles: profiles({
        allowAutoCreate: 'allow',
        allowPlaceholders: 'allow',
        mode: 'semantic-planning',
      }),
    });

    expect(result.resolved.analyte.resolution).toBe('new-record');
    expect(result.resolved.analyte.recordId).toBe('MAT-FENOFIBRATE');
    expect(result.createdRecordIds).toContain('MAT-FENOFIBRATE');
    expect(await store.get('MAT-FENOFIBRATE')).not.toBeNull();
  });

  it('creates a missing formulation when exact semantic layers exist', async () => {
    const store = new MemoryRecordStore([
      material('MAT-FEN', 'Fenofibrate'),
      material('MAT-DMSO', 'DMSO'),
    ]);
    const compiler = new MaterialCompilerService(store);

    const result = await compiler.compile({
      normalizedIntent: normalizedIntent({
        analyteName: 'Fenofibrate',
        solventName: 'DMSO',
        concentration: { value: 1, unit: 'mM', basis: 'molar' },
      }),
      activeScope: { organizationId: 'org-1' },
      policyProfiles: profiles({
        allowAutoCreate: 'allow',
        allowPlaceholders: 'allow',
        mode: 'semantic-planning',
      }),
    });

    expect(result.resolved.formulation?.resolution).toBe('new-record');
    expect(result.resolved.formulation?.recordId).toContain('MSP-');
    expect(result.createdRecordIds.some((id) => id.startsWith('MSP-'))).toBe(true);
    const createdId = result.resolved.formulation?.recordId;
    expect(createdId ? await store.get(createdId) : null).not.toBeNull();
  });

  it('does not silently substitute a near concentration match', async () => {
    const store = new MemoryRecordStore([
      material('MAT-FEN', 'Fenofibrate'),
      material('MAT-DMSO', 'DMSO'),
      materialSpec('MSP-FEN-1UM', 'MAT-FEN', 'Fenofibrate', 'MAT-DMSO', 'DMSO', 1, 'uM'),
    ]);
    const compiler = new MaterialCompilerService(store);

    const result = await compiler.compile({
      normalizedIntent: normalizedIntent({
        solventName: 'DMSO',
        concentration: { value: 1, unit: 'mM', basis: 'molar' },
      }),
      activeScope: { organizationId: 'org-1' },
      policyProfiles: profiles({
        allowAutoCreate: 'deny',
        allowPlaceholders: 'allow',
        mode: 'semantic-planning',
      }),
    });

    expect(result.resolved.formulation?.recordId).not.toBe('MSP-FEN-1UM');
    expect(result.candidateBindings.some((binding) => binding.slot === 'formulation' && binding.candidateId === 'MSP-FEN-1UM')).toBe(false);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'FORMULATION_EXACT_MATCH_REQUIRED')).toBe(true);
  });

  it('blocks in strict inventory mode when no exact source instance exists', async () => {
    const store = new MemoryRecordStore([
      material('MAT-FEN', 'Fenofibrate'),
      material('MAT-DMSO', 'DMSO'),
      materialSpec('MSP-FEN-1MM', 'MAT-FEN', 'Fenofibrate', 'MAT-DMSO', 'DMSO', 1, 'mM'),
    ]);
    const compiler = new MaterialCompilerService(store);

    const result = await compiler.compile({
      normalizedIntent: normalizedIntent({
        solventName: 'DMSO',
        concentration: { value: 1, unit: 'mM', basis: 'molar' },
      }),
      activeScope: { organizationId: 'org-1' },
      policyProfiles: profiles({
        allowPlaceholders: 'allow',
        allowRemediation: 'allow',
        mode: 'strict-inventory',
      }),
    });

    expect(result.outcome).toBe('execution-blocked');
    const diagnostic = result.diagnostics.find((entry) => entry.code === 'STRICT_INVENTORY_MISSING_SOURCE');
    expect(diagnostic?.outcome).toBe('execution-blocked');
    expect(diagnostic?.remediation?.some((item) => item.actionLabel === 'Use planning mode')).toBe(true);
  });

  it('creates a placeholder source in semantic planning mode when policy permits', async () => {
    const store = new MemoryRecordStore([
      material('MAT-FEN', 'Fenofibrate'),
      material('MAT-DMSO', 'DMSO'),
      materialSpec('MSP-FEN-1MM', 'MAT-FEN', 'Fenofibrate', 'MAT-DMSO', 'DMSO', 1, 'mM'),
    ]);
    const compiler = new MaterialCompilerService(store);

    const result = await compiler.compile({
      normalizedIntent: normalizedIntent({
        solventName: 'DMSO',
        concentration: { value: 1, unit: 'mM', basis: 'molar' },
      }),
      activeScope: { organizationId: 'org-1' },
      policyProfiles: profiles({
        allowPlaceholders: 'allow',
        mode: 'semantic-planning',
      }),
    });

    expect(result.resolved.materialSource?.resolution).toBe('placeholder');
    expect(result.policy.decisions.some((decision) => decision.action === 'use-placeholder' && decision.disposition === 'allowed')).toBe(true);
  });

  it('emits structured remediation suggestions and provenance for near-match failures', async () => {
    const store = new MemoryRecordStore([
      material('MAT-FEN', 'Fenofibrate'),
      material('MAT-DMSO', 'DMSO'),
      materialSpec('MSP-FEN-1UM', 'MAT-FEN', 'Fenofibrate', 'MAT-DMSO', 'DMSO', 1, 'uM'),
    ]);
    const compiler = new MaterialCompilerService(store);

    const result = await compiler.compile({
      normalizedIntent: normalizedIntent({
        solventName: 'DMSO',
        concentration: { value: 1, unit: 'mM', basis: 'molar' },
      }),
      activeScope: { organizationId: 'org-1' },
      policyProfiles: profiles({
        allowAutoCreate: 'deny',
        allowPlaceholders: 'allow',
        allowRemediation: 'allow',
        mode: 'semantic-planning',
      }),
      actor: 'test-suite',
    });

    const diagnostic = result.diagnostics.find((entry) => entry.code === 'FORMULATION_EXACT_MATCH_REQUIRED');
    expect(diagnostic?.remediation?.length).toBeGreaterThan(0);
    expect(diagnostic?.provenance?.[0]?.id).toBe('MSP-FEN-1UM');
    expect(result.provenance.actor).toBe('test-suite');
    expect(result.provenance.notes.some((note) => note.message.includes('Compiling material intent'))).toBe(true);
  });
});
