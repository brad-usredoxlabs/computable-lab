import { describe, expect, it } from 'vitest';
import type { ActivePolicyScope, PolicyProfile } from '../policy/types.js';
import type { RecordStore } from '../store/types.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import { OperationalAdmissibilityService } from './OperationalAdmissibilityService.js';

function envelope<T extends { id: string; kind: string }>(schemaId: string, payload: T): RecordEnvelope<T> {
  return {
    recordId: payload.id,
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

const scope: ActivePolicyScope = {
  organizationId: 'org-1',
};

const strictProfiles: PolicyProfile[] = [
  {
    id: 'org-strict',
    scope: 'organization',
    scopeId: 'org-1',
    settings: {
      allowSupervisedUse: 'deny',
      allowExpiredTraining: 'deny',
      allowExpiredAuthorization: 'deny',
      allowOutOfCalibrationEquipment: 'deny',
      allowUnqualifiedEquipment: 'deny',
    },
  },
];

const permissiveProfiles: PolicyProfile[] = [
  {
    id: 'org-permissive',
    scope: 'organization',
    scopeId: 'org-1',
    settings: {
      allowSupervisedUse: 'confirm',
      allowExpiredTraining: 'confirm',
      allowExpiredAuthorization: 'confirm',
      allowOutOfCalibrationEquipment: 'confirm',
      allowUnqualifiedEquipment: 'confirm',
    },
  },
];

function baselineRecords(): RecordEnvelope[] {
  return [
    envelope('schema://person', {
      kind: 'person',
      id: 'PER-ALICE',
      displayName: 'Alice Analyst',
      status: 'active',
    }),
    envelope('schema://person', {
      kind: 'person',
      id: 'PER-SUPERVISOR',
      displayName: 'Sam Supervisor',
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
      name: 'Orbital Shaker',
      readinessRequirements: {
        calibrationRequired: true,
        qualificationRequired: true,
      },
    }),
    envelope('schema://equipment', {
      kind: 'equipment',
      id: 'EQP-SHAKER-1',
      name: 'Orbital Shaker 1',
      status: 'active',
      equipmentClassRef: {
        kind: 'record',
        type: 'equipment-class',
        id: 'EQC-SHAKER',
      },
    }),
    envelope('schema://equipment-capability', {
      kind: 'equipment-capability',
      id: 'ECP-SHAKER-MIX',
      status: 'active',
      equipmentClassRef: {
        kind: 'record',
        type: 'equipment-class',
        id: 'EQC-SHAKER',
      },
      capabilities: [
        {
          verbRef: {
            kind: 'record',
            type: 'verb-definition',
            id: 'VERB-MIX',
          },
          methodIds: ['METHOD-MIX-01'],
          backendImplementations: ['orbital_shaker'],
        },
      ],
    }),
    envelope('schema://training-material', {
      kind: 'training-material',
      id: 'TRM-SHAKER',
      title: 'Orbital shaker SOP',
      materialType: 'sop',
    }),
    envelope('schema://equipment-training-requirement', {
      kind: 'equipment-training-requirement',
      id: 'ETR-SHAKER',
      equipmentClassRef: {
        kind: 'record',
        type: 'equipment-class',
        id: 'EQC-SHAKER',
      },
      verbRefs: [
        {
          kind: 'record',
          type: 'verb-definition',
          id: 'VERB-MIX',
        },
      ],
      methodIds: ['METHOD-MIX-01'],
      requiredTrainingMaterialRefs: [
        {
          kind: 'record',
          type: 'training-material',
          id: 'TRM-SHAKER',
        },
      ],
    }),
    envelope('schema://training-record', {
      kind: 'training-record',
      id: 'TRR-ALICE-SHAKER',
      personRef: {
        kind: 'record',
        type: 'person',
        id: 'PER-ALICE',
      },
      trainingMaterialRef: {
        kind: 'record',
        type: 'training-material',
        id: 'TRM-SHAKER',
      },
      status: 'passed',
      completedAt: '2026-01-10T00:00:00Z',
      expiresAt: '2027-01-10T00:00:00Z',
    }),
    envelope('schema://competency-authorization', {
      kind: 'competency-authorization',
      id: 'AUTH-ALICE-MIX',
      personRef: {
        kind: 'record',
        type: 'person',
        id: 'PER-ALICE',
      },
      status: 'active',
      effectiveAt: '2026-01-01T00:00:00Z',
      expiresAt: '2027-01-01T00:00:00Z',
      scope: {
        verbRefs: [
          {
            kind: 'record',
            type: 'verb-definition',
            id: 'VERB-MIX',
          },
        ],
        methodIds: ['METHOD-MIX-01'],
        equipmentClassRefs: [
          {
            kind: 'record',
            type: 'equipment-class',
            id: 'EQC-SHAKER',
          },
        ],
      },
    }),
    envelope('schema://competency-authorization', {
      kind: 'competency-authorization',
      id: 'AUTH-SUPERVISOR-MIX',
      personRef: {
        kind: 'record',
        type: 'person',
        id: 'PER-SUPERVISOR',
      },
      status: 'active',
      effectiveAt: '2026-01-01T00:00:00Z',
      expiresAt: '2027-01-01T00:00:00Z',
      scope: {
        verbRefs: [
          {
            kind: 'record',
            type: 'verb-definition',
            id: 'VERB-MIX',
          },
        ],
        methodIds: ['METHOD-MIX-01'],
        equipmentClassRefs: [
          {
            kind: 'record',
            type: 'equipment-class',
            id: 'EQC-SHAKER',
          },
        ],
      },
    }),
    envelope('schema://calibration-record', {
      kind: 'calibration-record',
      id: 'CAL-SHAKER-1',
      equipmentRef: {
        kind: 'record',
        type: 'equipment',
        id: 'EQP-SHAKER-1',
      },
      performedAt: '2026-01-01T00:00:00Z',
      dueAt: '2027-01-01T00:00:00Z',
      status: 'pass',
    }),
    envelope('schema://qualification-record', {
      kind: 'qualification-record',
      id: 'QUAL-SHAKER-1',
      equipmentRef: {
        kind: 'record',
        type: 'equipment',
        id: 'EQP-SHAKER-1',
      },
      performedAt: '2026-01-01T00:00:00Z',
      dueAt: '2027-01-01T00:00:00Z',
      status: 'pass',
    }),
  ];
}

describe('OperationalAdmissibilityService', () => {
  it('allows an activity when authorization, training, capability, and readiness all match', async () => {
    const service = new OperationalAdmissibilityService(createStore(baselineRecords()));
    const result = await service.evaluate({
      policyProfiles: strictProfiles,
      scope,
      personId: 'PER-ALICE',
      equipmentId: 'EQP-SHAKER-1',
      verbId: 'VERB-MIX',
      methodId: 'METHOD-MIX-01',
      at: '2026-04-05T00:00:00Z',
    });

    expect(result.admissible).toBe(true);
    expect(result.disposition).toBe('allowed');
    expect(result.findings).toEqual([]);
    expect(result.capability?.supported).toBe(true);
  });

  it('returns needs-confirmation for supervised-only authorization under a permissive profile', async () => {
    const records = baselineRecords().map((record) =>
      record.recordId === 'AUTH-ALICE-MIX'
        ? ({
            ...record,
            payload: {
              ...(record.payload as Record<string, unknown>),
              restrictions: { supervisedOnly: true },
            },
          } as RecordEnvelope)
        : record,
    );

    const service = new OperationalAdmissibilityService(createStore(records));
    const result = await service.evaluate({
      policyProfiles: permissiveProfiles,
      scope,
      personId: 'PER-ALICE',
      equipmentId: 'EQP-SHAKER-1',
      verbId: 'VERB-MIX',
      methodId: 'METHOD-MIX-01',
      at: '2026-04-05T00:00:00Z',
    });

    expect(result.admissible).toBe(true);
    expect(result.disposition).toBe('needs-confirmation');
    expect(result.findings.some((finding) => finding.code === 'SUPERVISION_REQUIRED')).toBe(true);
  });

  it('treats expired training differently under strict and permissive profiles', async () => {
    const records = baselineRecords().map((record) =>
      record.recordId === 'TRR-ALICE-SHAKER'
        ? ({
            ...record,
            payload: {
              ...(record.payload as Record<string, unknown>),
              expiresAt: '2026-02-01T00:00:00Z',
            },
          } as RecordEnvelope)
        : record,
    );
    const service = new OperationalAdmissibilityService(createStore(records));

    const strict = await service.evaluate({
      policyProfiles: strictProfiles,
      scope,
      personId: 'PER-ALICE',
      equipmentId: 'EQP-SHAKER-1',
      verbId: 'VERB-MIX',
      methodId: 'METHOD-MIX-01',
      at: '2026-04-05T00:00:00Z',
    });
    const permissive = await service.evaluate({
      policyProfiles: permissiveProfiles,
      scope,
      personId: 'PER-ALICE',
      equipmentId: 'EQP-SHAKER-1',
      verbId: 'VERB-MIX',
      methodId: 'METHOD-MIX-01',
      at: '2026-04-05T00:00:00Z',
    });

    expect(strict.disposition).toBe('blocked');
    expect(permissive.disposition).toBe('needs-confirmation');
    expect(strict.findings.some((finding) => finding.code === 'TRAINING_EXPIRED')).toBe(true);
  });

  it('blocks expired authorization when the active profile denies it', async () => {
    const records = baselineRecords().map((record) =>
      record.recordId === 'AUTH-ALICE-MIX'
        ? ({
            ...record,
            payload: {
              ...(record.payload as Record<string, unknown>),
              expiresAt: '2026-02-01T00:00:00Z',
            },
          } as RecordEnvelope)
        : record,
    );

    const service = new OperationalAdmissibilityService(createStore(records));
    const result = await service.evaluate({
      policyProfiles: strictProfiles,
      scope,
      personId: 'PER-ALICE',
      equipmentId: 'EQP-SHAKER-1',
      verbId: 'VERB-MIX',
      methodId: 'METHOD-MIX-01',
      at: '2026-04-05T00:00:00Z',
    });

    expect(result.admissible).toBe(false);
    expect(result.disposition).toBe('blocked');
    expect(result.findings.some((finding) => finding.code === 'AUTHORIZATION_EXPIRED')).toBe(true);
  });

  it('blocks unsupported capabilities even when policy is permissive', async () => {
    const service = new OperationalAdmissibilityService(createStore(baselineRecords()));
    const result = await service.evaluate({
      policyProfiles: permissiveProfiles,
      scope,
      personId: 'PER-ALICE',
      equipmentId: 'EQP-SHAKER-1',
      verbId: 'VERB-HEAT',
      methodId: 'METHOD-MIX-01',
      at: '2026-04-05T00:00:00Z',
    });

    expect(result.admissible).toBe(false);
    expect(result.disposition).toBe('blocked');
    expect(result.findings.some((finding) => finding.code === 'CAPABILITY_UNSUPPORTED')).toBe(true);
  });

  it('surfaces calibration and qualification status through profile-controlled permissiveness', async () => {
    const records = baselineRecords().map((record) => {
      if (record.recordId === 'CAL-SHAKER-1') {
        return {
          ...record,
          payload: {
            ...(record.payload as Record<string, unknown>),
            dueAt: '2026-03-01T00:00:00Z',
          },
        } as RecordEnvelope;
      }
      if (record.recordId === 'QUAL-SHAKER-1') {
        return {
          ...record,
          payload: {
            ...(record.payload as Record<string, unknown>),
            dueAt: '2026-03-01T00:00:00Z',
          },
        } as RecordEnvelope;
      }
      return record;
    });

    const service = new OperationalAdmissibilityService(createStore(records));
    const strict = await service.evaluate({
      policyProfiles: strictProfiles,
      scope,
      personId: 'PER-ALICE',
      equipmentId: 'EQP-SHAKER-1',
      verbId: 'VERB-MIX',
      methodId: 'METHOD-MIX-01',
      at: '2026-04-05T00:00:00Z',
    });
    const permissive = await service.evaluate({
      policyProfiles: permissiveProfiles,
      scope,
      personId: 'PER-ALICE',
      equipmentId: 'EQP-SHAKER-1',
      verbId: 'VERB-MIX',
      methodId: 'METHOD-MIX-01',
      at: '2026-04-05T00:00:00Z',
    });

    expect(strict.disposition).toBe('blocked');
    expect(permissive.disposition).toBe('needs-confirmation');
    expect(strict.findings.some((finding) => finding.code === 'CALIBRATION_NOT_CURRENT')).toBe(true);
    expect(strict.findings.some((finding) => finding.code === 'QUALIFICATION_NOT_CURRENT')).toBe(true);
  });
});
