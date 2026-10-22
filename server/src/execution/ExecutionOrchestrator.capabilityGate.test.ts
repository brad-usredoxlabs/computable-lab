/**
 * INSTR-COLLAPSE-1 FIX-1 (adv defect 2, MAJOR) — the capability gate is
 * exercised through the PLANNED-RUN WRITE PATH, not only the pure function.
 *
 * OQ-1 decision RED shape item 3, driven through
 * ExecutionOrchestrator.createPlannedRun (the call site at
 * ExecutionOrchestrator.ts:308 — the single service that persists a planned
 * run carrying compiled steps, per the OQ-1 R3 finding):
 *   1. a compiled step whose equipmentRef/verbRef pair does NOT resolve to a
 *      declared capability -> ExecutionError code `capability_gate_unsupported`
 *      statusCode 400, and NOTHING is persisted;
 *   2. the ACCEPT leg: a pair the capability data supports passes the gate
 *      (the gate throws no capability_gate_* code).
 *
 * Driver shape (all data, no TS policy): the equipment's only capability
 * binding is METHOD-SCOPED (capabilities[].methodIds). The protocol compiler
 * resolves support WITH the step's methodId (ProtocolCompiler.ts:489) and
 * selects the instrument backend, so the compiled step carries BOTH
 * verbRef and equipmentRef; the declared gate interprets the annotation as
 * the OQ-1 decision specifies — resolveEquipmentSupport({equipmentId, verbId})
 * (capabilityAuthorization shape, no methodId) — and rejects. That divergence
 * is exactly what only a write-path test can surface: the pure-function suite
 * never builds a real compiled payload.
 *
 * Harness: real initializeApp booted against the REAL schema tree
 * (schemaDir '../schema') so the REAL planned-run.schema.yaml — the file that
 * DECLARES x-capability-gate on CompiledProtocolStep.equipmentRef — is the
 * schema the interpreter reads. CONFIG_PATH pinned to a throwaway /tmp
 * dataDir (W25 precedent); assertions are on the ERROR CODE, never on minted
 * record ids (no durable-counter dependence).
 *
 * NOTE (recorded, pre-existing trunk debt, NOT introduced by this item): the
 * ACCEPT leg cannot reach store.create against the REAL planned-run schema —
 * createPlannedRun persists the FULL compiler result (localProtocol,
 * activePolicy.origins/trace) which planned-run.schema.yaml
 * protocolCompilation additionalProperties:false rejects with
 * VALIDATION_ERROR 422. Verified identical at base dad6bbdc (probe
 * artifacts/INSTR-COLLAPSE-1/fix1-probe-plannedrun-persistence-debt-*.txt).
 * The accept leg therefore pins that the gate PASSED (the surfaced error is
 * the recorded 422 debt, never a capability_gate_* code).
 *
 * RED posture (captured by reverting the ExecutionOrchestrator gate call
 * site, raw saved as fix1-RED-defect2-plannedrun-*.txt): with the call site
 * absent the reject leg does not reject with capability_gate_unsupported.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp } from '../server.js';
import type { AppContext } from '../server.js';
import { ExecutionOrchestrator, ExecutionError } from './ExecutionOrchestrator.js';

const EQUIPMENT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/equipment.schema.yaml';
const EQUIPMENT_CAPABILITY_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/equipment-capability.schema.yaml';
const PROTOCOL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml';

const testDir = resolve(process.cwd(), 'tmp/execution-orchestrator-capgate');
const dataDir = resolve('/tmp', 'cl-ic1f1-plr-gate-data');

let ctx: AppContext;

async function seed(input: {
  equipmentId: string;
  capabilityId: string;
  verbId: string;
  methodIds?: string[];
}): Promise<void> {
  // A ghost class keeps the equipment out of the seed capability corpus
  // (CL:plate_reader etc. would rescue it through ECP-PLATE-READER): the ONLY
  // declared capability for this equipment is the one this test seeds.
  const classRef = { kind: 'ontology', id: 'CL:ic1f1-ghost-instrument', namespace: 'CL', label: 'IC1F1 probe instrument' };
  const r1 = await ctx.store.create({
    envelope: {
      recordId: input.equipmentId,
      schemaId: EQUIPMENT_SCHEMA_ID,
      payload: { kind: 'equipment', id: input.equipmentId, name: input.equipmentId, equipmentClassRef: classRef },
    },
    message: `seed equipment ${input.equipmentId} for FIX-1 planned-run gate test`,
  });
  expect(r1.success, `seed equipment failed: ${r1.error}`).toBe(true);
  const r2 = await ctx.store.create({
    envelope: {
      recordId: input.capabilityId,
      schemaId: EQUIPMENT_CAPABILITY_SCHEMA_ID,
      payload: {
        kind: 'equipment-capability',
        id: input.capabilityId,
        status: 'active',
        equipmentRef: { kind: 'record', type: 'equipment', id: input.equipmentId },
        capabilities: [{
          verbRef: { kind: 'record', type: 'verb-definition', id: input.verbId },
          ...(input.methodIds ? { methodIds: input.methodIds } : {}),
        }],
      },
    },
    message: `seed capability ${input.capabilityId} for FIX-1 planned-run gate test`,
  });
  expect(r2.success, `seed capability failed: ${r2.error}`).toBe(true);
}

async function seedProtocol(recordId: string, methodId?: string): Promise<void> {
  const methodRequirement: Record<string, unknown> = { instrumentRole: 'plate-reader' };
  if (methodId) methodRequirement.methodId = methodId;
  const result = await ctx.store.create({
    envelope: {
      recordId,
      schemaId: PROTOCOL_SCHEMA_ID,
      payload: {
        kind: 'protocol',
        recordId,
        title: `FIX-1 gate probe protocol ${recordId}`,
        roles: { instrumentRoles: [{ roleId: 'plate-reader', description: 'the reader' }] },
        steps: [{
          stepId: 'read-plate',
          label: 'Read the plate',
          ordinal: 1,
          kind: 'read',
          methodRequirement,
          intent: { semanticVerb: { ref: { kind: 'record', type: 'verb-definition', id: 'VERB-READ' }, canonical: 'read' } },
        }],
      },
    },
    message: `seed protocol ${recordId} for FIX-1 planned-run gate test`,
  });
  expect(result.success, `seed protocol failed: ${result.error} ${JSON.stringify(result.validation?.errors ?? []).slice(0, 400)}`).toBe(true);
}

beforeAll(async () => {
  await rm(testDir, { recursive: true, force: true });
  await rm(dataDir, { recursive: true, force: true });
  await mkdir(testDir, { recursive: true });
  await writeFile(resolve(testDir, 'config.yaml'), [
    'server:',
    '  logLevel: error',
    '  dataDir: ' + dataDir,
    '  workspaceDir: ' + dataDir + '/workspaces',
    'repositories: []',
    'logging: { level: error }',
    'extraction: { enabled: false, runner: { enabled: false } }',
  ].join('\n') + '\n');
  process.env.CONFIG_PATH = resolve(testDir, 'config.yaml');

  // Boot against the REAL schema tree: the gate fires because the REAL
  // planned-run.schema.yaml declares x-capability-gate on the compiled step.
  ctx = await initializeApp(process.cwd(), {
    schemaDir: '../schema',
    recordsDir: 'records',
    logLevel: 'silent',
  });

  // Method-scoped-only binding: the compiler (method-aware) supports it, the
  // declared gate (verb-only per the OQ-1 decision) does not.
  await seed({ equipmentId: 'EQP-IC1F1-PLRGATE', capabilityId: 'ECP-IC1F1-PLRGATE', verbId: 'VERB-READ', methodIds: ['M-IC1F1-SCAN'] });
  await seedProtocol('PRT-IC1F1-PLRGATE', 'M-IC1F1-SCAN');
}, 600000);

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  delete process.env.CONFIG_PATH;
});

describe('FIX-1 defect 2: ExecutionOrchestrator.createPlannedRun enforces the declared capability gate (write path)', () => {
  it('REJECTS a compiled step whose equipment lacks the declared verb capability: code capability_gate_unsupported, 400, nothing persisted', async () => {
    const orchestrator = new ExecutionOrchestrator(ctx);
    const before = await ctx.store.list({ kind: 'planned-run' });
    let error: unknown;
    try {
      await orchestrator.createPlannedRun({
        title: 'FIX-1 gate probe run',
        sourceType: 'protocol',
        sourceRef: { kind: 'record', id: 'PRT-IC1F1-PLRGATE', type: 'protocol' },
        bindings: {
          instruments: [{
            roleId: 'plate-reader',
            instrumentRef: { kind: 'record', type: 'equipment', id: 'EQP-IC1F1-PLRGATE' },
          }],
        },
      });
    } catch (err) {
      error = err;
    }
    expect(error, 'createPlannedRun must reject a compiled step the capability data does not support').toBeInstanceOf(ExecutionError);
    const gateError = error as ExecutionError;
    expect(gateError.code).toBe('capability_gate_unsupported');
    expect(gateError.statusCode).toBe(400);
    const after = await ctx.store.list({ kind: 'planned-run' });
    expect(after.length, 'the rejected write must persist nothing').toBe(before.length);
  });

  it('the gate is capability-resolved, not kind-resolved: the same step passes the gate once the equipment declares the verb unscoped (surfaced error is the recorded persistence debt, never a capability_gate_* code)', async () => {
    // Second equipment: the SAME verb declared WITHOUT method scoping. The
    // gate's resolveEquipmentSupport({equipmentId, verbId}) now supports it —
    // proof the rejection above came from the resolved capability data, not
    // from the equipment kind or a name.
    await seed({ equipmentId: 'EQP-IC1F1-PLRGATE-OK', capabilityId: 'ECP-IC1F1-PLRGATE-OK', verbId: 'VERB-READ' });
    const orchestrator = new ExecutionOrchestrator(ctx);
    let error: unknown;
    try {
      await orchestrator.createPlannedRun({
        title: 'FIX-1 gate pass probe run',
        sourceType: 'protocol',
        sourceRef: { kind: 'record', id: 'PRT-IC1F1-PLRGATE', type: 'protocol' },
        bindings: {
          instruments: [{
            roleId: 'plate-reader',
            instrumentRef: { kind: 'record', type: 'equipment', id: 'EQP-IC1F1-PLRGATE-OK' },
          }],
        },
      });
    } catch (err) {
      error = err;
    }
    if (error) {
      const surfaced = error as ExecutionError;
      // The gate PASSED: whatever surfaces must not be a gate code. The
      // known shape is the pre-existing VALIDATION_ERROR 422 persistence debt
      // (compiler result fields the planned-run schema does not declare).
      expect(surfaced.code).not.toMatch(/^capability_gate_/);
      expect(surfaced.code).toBe('VALIDATION_ERROR');
      expect(surfaced.statusCode).toBe(422);
    }
    // If a future fix lets the payload persist, that is also a pass: the gate
    // never rejected it.
  });
});
