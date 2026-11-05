/**
 * Orchestrator-level tests for the tube-event detail gate wiring.
 *
 * The agent's submit path (submit_suggestion terminal turn) must run drafted
 * events through gateTubeEventDetails when deps.eventDetailValidator is
 * supplied: repairing AI-drifted tube details against the real event
 * contracts, dropping what cannot be repaired (with a user-visible note),
 * and staying completely inert when the dep is omitted (the 15 pre-existing
 * orchestrator test files rely on gate-off behavior).
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { SUBMIT_SUGGESTION_TOOL_NAME } from './submitSuggestionTool.js';
import { createValidator } from '../validation/AjvValidator.js';
import type { InferenceClient, ToolBridge } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVENTS_DIR = resolve(__dirname, '../../../schema/workflow/events');
const SCHEMA_FILES = [
  resolve(EVENTS_DIR, 'plate-event.place-tube.schema.yaml'),
  resolve(EVENTS_DIR, 'plate-event.move-tube.schema.yaml'),
  resolve(EVENTS_DIR, 'plate-event.remove-tube.schema.yaml'),
  resolve(__dirname, '../../../schema/core/datatypes/ref.schema.yaml'),
];

/**
 * The real Ajv over the actual event-contract YAMLs — the same wiring
 * server.ts uses via ctx.validator, minus the full registry load.
 */
function makeTubeGateValidator() {
  const validator = createValidator({ strict: false });
  for (const file of SCHEMA_FILES) {
    validator.addSchema(parseYaml(readFileSync(file, 'utf8')) as object);
  }
  return async (data: unknown, schemaId: string) => {
    const r = validator.validate(data, schemaId);
    return { valid: r.valid, errors: r.errors ?? [] };
  };
}

function makeToolBridge(): ToolBridge {
  return {
    getToolDefinitions: () => [],
    executeTool: vi.fn(),
  };
}

/** Stream one assistant turn that terminalizes via submit_suggestion. */
function makeSubmitClient(args: Record<string, unknown>): InferenceClient {
  return {
    complete: vi.fn(),
    completeStream: vi.fn(async function* () {
      yield {
        id: 'resp-tube-gate',
        choices: [{
          index: 0,
          delta: {
            role: 'assistant',
            tool_calls: [{
              index: 0,
              id: 'call-tube',
              type: 'function',
              function: {
                name: SUBMIT_SUGGESTION_TOOL_NAME,
                arguments: JSON.stringify(args),
              },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      } as any;
    }),
  };
}

function placeTubeArgs(details: Record<string, unknown>): Record<string, unknown> {
  return {
    events: [{
      eventId: 'ai-tube-1',
      event_type: 'place_tube',
      verb: 'place_tube',
      vocabPackId: 'general',
      details,
    }],
    notes: [],
    unresolvedRefs: [],
    clarification: null,
    labwareAdditions: [],
  };
}

function runAgent(eventDetailValidator?: (data: unknown, schemaId: string) => Promise<{ valid: boolean; errors?: Array<{ path?: string; message?: string }> }>, details: Record<string, unknown> = {
  labwareId: 'rack-1',
  wells: ['A1'],
  tubeVolumeClass: '1.5ml',
}) {
  const orchestrator = createAgentOrchestrator(
    makeSubmitClient(placeTubeArgs(details)),
    makeToolBridge(),
    { model: 'test-model', temperature: 0.1, maxTokens: 512 },
    { maxTurns: 2, draftFlowMode: 'forced-tool' },
    // forced-tool mode skips the compiler preflight and the post-tool
    // re-compile — the submit path under test runs standalone.
    eventDetailValidator ? { eventDetailValidator } : {},
  );
  return orchestrator.run({
    prompt: 'Place a 1.5ml tube in rack A1',
    forceDraftTool: true,
    context: {
      labwares: [],
      eventSummary: 'No events yet.',
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['place_tube'],
    },
  });
}

describe('AgentOrchestrator tube-event detail gate wiring', () => {
  it('repairs tubeVolumeClass → details.tube through the real event schemas', async () => {
    const result = await runAgent(makeTubeGateValidator());
    expect(result.success).toBe(true);
    expect(result.events).toHaveLength(1);
    const details = result.events![0]!.details as Record<string, unknown>;
    expect(details.tube).toEqual({ sizeLabel: '1.5 mL', maxVolume_uL: 1500, wellShape: 'round' });
    expect('tubeVolumeClass' in details).toBe(false);
  });

  it('drops an unrepairable tube event and surfaces a Dropped note', async () => {
    const result = await runAgent(makeTubeGateValidator(), {
      wells: ['A1'],
      tubeVolumeClass: 'unicorn',
    });
    expect(result.success).toBe(true);
    expect(result.events?.some((e) => e.verb === 'place_tube')).toBe(false);
    expect(result.notes?.some((n) => /Dropped place_tube/.test(n))).toBe(true);
  });

  it('leaves drafts untouched when eventDetailValidator is omitted (gate off)', async () => {
    const result = await runAgent();
    expect(result.success).toBe(true);
    expect(result.events).toHaveLength(1);
    const details = result.events![0]!.details as Record<string, unknown>;
    expect(details.tubeVolumeClass).toBe('1.5ml');
    expect(details.tube).toBeUndefined();
  });
});
