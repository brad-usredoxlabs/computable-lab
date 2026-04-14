/**
 * Golden end-to-end test for AgentOrchestrator with REAL seed records.
 * 
 * This test verifies that the compiler bypass path works correctly when:
 * - A material-spec mention is resolved
 * - A labware hint is resolved via REAL searchLabwareByHint against seed records
 * - The inference client is never called
 * 
 * Prompt: 'Add 100uL of [[material-spec:MSP-MMIITWMZ-93SU5Y|Clofibrate, 1 mM in DMSO]] to well A1 of a 12-well reservoir and add it to the source location.'
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import type { InferenceClient, ToolBridge, ResolveMentionDeps } from './types.js';
import { createLabwareLookup } from './compiler/labwareLookup.js';
import { RecordStoreImpl } from '../store/RecordStoreImpl.js';
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { createValidator } from '../validation/AjvValidator.js';
import { createLintEngine } from '../lint/LintEngine.js';
import { loadAllLintSpecs } from '../lint/LintSpecLoader.js';
import { loadPredicateRegistry } from '../registry/PredicateRegistry.js';
import { createLintEngine as createLintEngineFromFactory } from '../lint/LintEngine.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, rm, copyFile, readdir } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('AgentOrchestrator - golden test with real seed records', () => {
  let tempDir: string;
  let store: RecordStoreImpl;
  let searchLabwareByHint: (hint: string) => Promise<{ recordId: string; title: string }[]>;

  beforeAll(async () => {
    // Create a temporary directory for test records
    tempDir = join(__dirname, '../../../.tmp/test-seed-records');
    await mkdir(tempDir, { recursive: true });

    // Copy seed labware records to temp directory under records/labware
    const seedLabwareDir = join(__dirname, '../../../records/seed/labware');
    const targetLabwareDir = join(tempDir, 'records', 'labware');
    await mkdir(targetLabwareDir, { recursive: true });

    const files = await readdir(seedLabwareDir);
    for (const file of files) {
      if (file.endsWith('.yaml')) {
        await copyFile(join(seedLabwareDir, file), join(targetLabwareDir, file));
      }
    }

    // Also copy material records for the material-spec lookup
    const seedMaterialsDir = join(__dirname, '../../../records/seed/materials');
    const targetMaterialsDir = join(tempDir, 'records', 'materials');
    await mkdir(targetMaterialsDir, { recursive: true });

    if (seedMaterialsDir) {
      try {
        const materialFiles = await readdir(seedMaterialsDir);
        for (const file of materialFiles) {
          if (file.endsWith('.yaml')) {
            await copyFile(join(seedMaterialsDir, file), join(targetMaterialsDir, file));
          }
        }
      } catch {
        // Materials directory might not exist, that's ok for this test
      }
    }

    // Initialize minimal store components
    const repoAdapter = createLocalRepoAdapter({ basePath: tempDir });
    const validator = createValidator();
    
    // Load lint specs
    const lintEngine = createLintEngineFromFactory();
    const lintLoadResult = await loadAllLintSpecs({ basePath: join(__dirname, '../../../schema'), recursive: true });
    for (const { spec } of lintLoadResult.specs) {
      lintEngine.addSpec(spec.id, spec);
    }

    // Create the store
    store = new RecordStoreImpl(repoAdapter, validator, lintEngine, {
      baseDir: 'records',
    });

    // Build the index
    await store.list({ kind: 'labware' });

    // Create the labware lookup function
    searchLabwareByHint = createLabwareLookup(store);
  });

  afterAll(async () => {
    // Clean up temp directory
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it('should bypass LLM and compile events with REAL seed records', async () => {
    // Fake InferenceClient that throws if called
    const inferenceClient: InferenceClient = {
      complete: vi.fn().mockRejectedValue(new Error('Should not be called')),
      completeStream: vi.fn().mockRejectedValue(new Error('Should not be called')),
    };

    // Stub tool bridge with no tools
    const toolBridge: ToolBridge = {
      getToolDefinitions: () => [],
      executeTool: vi.fn().mockRejectedValue(new Error('No tools available')),
    };

    // REAL searchLabwareByHint backed by seed records
    const deps: ResolveMentionDeps = {
      fetchMaterialSpec: async (id: string) => {
        if (id === 'MSP-MMIITWMZ-93SU5Y') {
          return { id: 'MSP-MMIITWMZ-93SU5Y', name: 'Clofibrate, 1 mM in DMSO' };
        }
        return null;
      },
      searchLabwareByHint,
    };

    // Create orchestrator
    const orchestrator = createAgentOrchestrator(
      inferenceClient,
      toolBridge,
      { baseUrl: 'http://fake', model: 'fake-model' },
      {},
      deps,
    );

    // The golden prompt
    const prompt = 'Add 100uL of [[material-spec:MSP-MMIITWMZ-93SU5Y|Clofibrate, 1 mM in DMSO]] to well A1 of a 12-well reservoir and add it to the source location.';

    const result = await orchestrator.run({
      prompt,
      context: {
        labwares: [],
        eventSummary: '',
        vocabPackId: 'default',
        availableVerbs: [],
      },
    });

    // Assert success
    expect(result.success).toBe(true);

    // Assert exactly one event
    expect(result.events).toHaveLength(1);
    const event = result.events![0]!;

    // Assert event type
    expect(event.event_type).toBe('add_material');

    // Assert wells
    expect(event.details.wells).toEqual(['A1']);

    // Assert volume
    expect(event.details.volume).toEqual({ value: 100, unit: 'uL' });

    // Assert material spec ref
    expect(event.details.material_spec_ref).toBe('MSP-MMIITWMZ-93SU5Y');

    // Assert labwareId starts with synthetic prefix
    expect(event.details.labwareId).toMatch(/^lwi-compiler-/);

    // Assert labwareAdditions contains the REAL seed record
    expect(result.labwareAdditions).toHaveLength(1);
    expect(result.labwareAdditions![0]!.recordId).toBe('lbw-seed-reservoir-12-well');

    // Assert notes mention set_source_location
    expect(result.notes).toBeDefined();
    expect(result.notes!.some((n) => n.includes('set_source_location'))).toBe(true);

    // Assert inference client was never called
    expect(inferenceClient.completeStream).not.toHaveBeenCalled();
    expect(inferenceClient.complete).not.toHaveBeenCalled();
  });
});
