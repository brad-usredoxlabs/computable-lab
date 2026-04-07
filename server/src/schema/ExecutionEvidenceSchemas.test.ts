import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';

const EVIDENCE_SCHEMA_PATHS = [
  'core/common.schema.yaml',
  'core/datatypes/ref.schema.yaml',
  'workflow/planned-run.schema.yaml',
  'workflow/execution-remediation-decision.schema.yaml',
  'workflow/execution-deviation.schema.yaml',
  'workflow/execution-observation.schema.yaml',
] as const;

async function loadEvidenceSchemas() {
  const schemaRoot = join(process.cwd(), 'schema');
  const contents = new Map<string, string>();

  for (const path of EVIDENCE_SCHEMA_PATHS) {
    contents.set(path, await readFile(join(schemaRoot, path), 'utf8'));
  }

  return loadSchemasFromContent(contents);
}

describe('Execution evidence schemas', () => {
  it('load into the schema registry with correct dependencies', async () => {
    const result = await loadEvidenceSchemas();
    expect(result.errors).toEqual([]);

    const registry = createSchemaRegistry();
    registry.addSchemas(result.entries);

    expect(registry.has('https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml')).toBe(true);
    expect(registry.has('https://computable-lab.com/schema/computable-lab/execution-remediation-decision.schema.yaml')).toBe(true);
    expect(registry.has('https://computable-lab.com/schema/computable-lab/execution-deviation.schema.yaml')).toBe(true);
    expect(registry.has('https://computable-lab.com/schema/computable-lab/execution-observation.schema.yaml')).toBe(true);
  });

  it('validate representative payloads for execution evidence record types', async () => {
    const result = await loadEvidenceSchemas();
    expect(result.errors).toEqual([]);

    const validator = createValidator({ strict: false });
    for (const entry of result.entries) {
      validator.addSchema(entry.schema, entry.id);
    }

    const ref = (type: string, id: string) => ({ kind: 'record', type, id });

    const remediationDecision = validator.validate(
      {
        kind: 'execution-remediation-decision',
        recordId: 'ERD-000001',
        executionRunRef: ref('execution-run', 'EXR-000001'),
        plannedRunRef: ref('planned-run', 'PLR-000001'),
        robotPlanRef: ref('robot-plan', 'RPL-000001'),
        decision: 'accepted',
        proposedRemediation: {
          code: 'manual-backend',
          stepId: 'step-1',
          action: 'switch-backend',
        },
        acceptedDiff: {
          target: 'protocol-step',
          path: '/steps/0/selectedBackendId',
          op: 'replace',
          previousValue: 'backend-a',
          value: 'manual-backend',
        },
        actor: { actorId: 'PER-ALICE', role: 'supervisor' },
        authority: 'supervisor',
        rationale: 'Accepted switch to manual backend for step-1',
        decidedAt: '2026-01-15T10:00:00Z',
        activePolicy: {
          scope: { organizationId: 'org-1', runId: 'EXR-000001' },
          profileIds: ['run-policy-1'],
          approvalAuthority: 'supervisor',
          originProfileId: 'run-policy-1',
          settings: { approvalAuthority: 'supervisor' },
        },
      },
      'https://computable-lab.com/schema/computable-lab/execution-remediation-decision.schema.yaml',
    );
    expect(remediationDecision.valid).toBe(true);

    const deviation = validator.validate(
      {
        kind: 'execution-deviation',
        recordId: 'EXD-000001',
        executionRunRef: ref('execution-run', 'EXR-000001'),
        plannedRunRef: ref('planned-run', 'PLR-000001'),
        robotPlanRef: ref('robot-plan', 'RPL-000001'),
        deviationType: 'remediation',
        status: 'accepted',
        compiledIntent: {
          stepId: 'step-1',
          source: 'protocol-compilation',
          snapshot: { selectedBackendId: 'backend-a' },
        },
        diff: {
          stepId: 'step-1',
          target: 'protocol-step',
          path: '/steps/0/selectedBackendId',
          op: 'replace',
          previousValue: 'backend-a',
          value: 'manual-backend',
        },
        actor: { actorId: 'PER-ALICE', role: 'supervisor' },
        authority: 'supervisor',
        rationale: 'Backend switched per remediation decision ERD-000001',
        recordedAt: '2026-01-15T10:01:00Z',
        remediationDecisionRef: ref('execution-remediation-decision', 'ERD-000001'),
        activePolicy: {
          scope: { organizationId: 'org-1', runId: 'EXR-000001' },
          profileIds: ['run-policy-1'],
          approvalAuthority: 'supervisor',
          originProfileId: 'run-policy-1',
          settings: { approvalAuthority: 'supervisor' },
        },
      },
      'https://computable-lab.com/schema/computable-lab/execution-deviation.schema.yaml',
    );
    expect(deviation.valid).toBe(true);

    const observation = validator.validate(
      {
        kind: 'execution-observation',
        recordId: 'EXO-000001',
        executionRunRef: ref('execution-run', 'EXR-000001'),
        plannedRunRef: ref('planned-run', 'PLR-000001'),
        robotPlanRef: ref('robot-plan', 'RPL-000001'),
        observationType: 'step-outcome',
        observedOutcome: {
          stepId: 'step-1',
          outcomeCode: 'completed',
          status: 'success',
          details: { mixCount: 3 },
        },
        actor: { actorId: 'PER-ALICE', role: 'run-operator' },
        recordedAt: '2026-01-15T10:05:00Z',
        deviationRef: ref('execution-deviation', 'EXD-000001'),
      },
      'https://computable-lab.com/schema/computable-lab/execution-observation.schema.yaml',
    );
    expect(observation.valid).toBe(true);
  });

  it('rejects invalid payloads with missing required fields', async () => {
    const result = await loadEvidenceSchemas();
    expect(result.errors).toEqual([]);

    const validator = createValidator({ strict: false });
    for (const entry of result.entries) {
      validator.addSchema(entry.schema, entry.id);
    }

    const missingDecision = validator.validate(
      {
        kind: 'execution-remediation-decision',
        recordId: 'ERD-BAD',
        // missing executionRunRef, plannedRunRef, robotPlanRef, decision, etc.
      },
      'https://computable-lab.com/schema/computable-lab/execution-remediation-decision.schema.yaml',
    );
    expect(missingDecision.valid).toBe(false);

    const missingDeviation = validator.validate(
      {
        kind: 'execution-deviation',
        recordId: 'EXD-BAD',
        // missing required fields
      },
      'https://computable-lab.com/schema/computable-lab/execution-deviation.schema.yaml',
    );
    expect(missingDeviation.valid).toBe(false);

    const missingObservation = validator.validate(
      {
        kind: 'execution-observation',
        recordId: 'EXO-BAD',
        // missing required fields
      },
      'https://computable-lab.com/schema/computable-lab/execution-observation.schema.yaml',
    );
    expect(missingObservation.valid).toBe(false);
  });
});
