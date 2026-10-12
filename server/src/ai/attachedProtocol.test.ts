/**
 * PROTO-AI-6 — attached-protocol context injection + prompt contract.
 *
 * Acceptance (verbatim from the task list):
 *   "Tests with a mocked inference client: attached-protocol request capture
 *    contains protocol identity + all stepIds + role list; no-attachment
 *    capture lacks both."
 *
 * Two layers are exercised:
 *  1. buildSystemPrompt — the rendered prompt carries the compact ground-truth
 *     block + the protocol_edit section ONLY when a protocol is attached.
 *  2. AgentOrchestrator.run with a mocked InferenceClient — the OUTBOUND
 *     CompletionRequest (system message) is captured and asserted.
 *
 * The op vocabulary asserted here mirrors schema/workflow/protocol-edit-op.schema.yaml
 * (PROTO-AI-2) exactly: step_update | step_insert | step_delete | labware_add |
 * labware_update | labware_delete | equipment_add | equipment_update |
 * equipment_delete.
 */

import { describe, expect, it, vi } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSystemPrompt } from './systemPrompt.js';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import type { CompletionRequest, InferenceClient, ToolBridge } from './types.js';

const testDir = dirname(fileURLToPath(import.meta.url));

const attachedProtocol = {
  recordId: 'PRT-000123',
  sha: 'a1b2c3d4e5f6',
  steps: [
    { stepId: 'lyse-cells', ordinal: 1, label: 'Lyse cells', kind: 'add_material' },
    { stepId: 'wash-2', ordinal: 2, label: 'Wash ×2', kind: 'wash' },
    { stepId: 'read-plate', ordinal: 3, label: 'Read plate', kind: 'read' },
  ],
  labwareRoles: [
    { roleId: 'plate_reader_96', description: '96-well black plate', expectedLabwareKinds: ['LBW-96WELL-BLACK'] },
    { roleId: 'reservoir' },
  ],
  instrumentRoles: [
    { roleId: 'plate_reader', description: 'BMG PHERAstar', allowedInstrumentIds: ['INS-PHERA'] },
  ],
};

const baseContext = {
  labwares: [],
  eventSummary: 'No events yet.',
  vocabPackId: 'liquid-handling/v1',
  availableVerbs: ['transfer'],
};

describe('buildSystemPrompt — attached protocol block', () => {
  it('renders protocol identity, all steps (ordinal/stepId/label/kind) and declared roles when attached', () => {
    const prompt = buildSystemPrompt({ ...baseContext, attachedProtocol });

    // Protocol identity: recordId + current sha
    expect(prompt).toContain('ATTACHED PROTOCOL');
    expect(prompt).toContain('PRT-000123');
    expect(prompt).toContain('a1b2c3d4e5f6');

    // ALL stepIds with ordinal, label, kind
    for (const step of attachedProtocol.steps) {
      expect(prompt).toContain(step.stepId);
      expect(prompt).toContain(step.label);
      expect(prompt).toContain(step.kind);
    }
    expect(prompt).toContain('1 | lyse-cells');
    expect(prompt).toContain('2 | wash-2');
    expect(prompt).toContain('3 | read-plate');

    // Declared roles with their design refs
    expect(prompt).toContain('plate_reader_96');
    expect(prompt).toContain('96-well black plate');
    expect(prompt).toContain('LBW-96WELL-BLACK');
    expect(prompt).toContain('reservoir');
    expect(prompt).toContain('plate_reader');
    expect(prompt).toContain('INS-PHERA');

    // The never-invent rule is stated against the provided ids
    expect(prompt).toContain('Cite ONLY the stepIds and roleIds listed above');
  });

  it('includes the protocol_edit op vocabulary mirroring the PROTO-AI-2 envelope', () => {
    const prompt = buildSystemPrompt({ ...baseContext, attachedProtocol });

    expect(prompt).toContain('protocol_edit');
    for (const op of [
      'step_update',
      'step_insert',
      'step_delete',
      'labware_add',
      'labware_update',
      'labware_delete',
      'equipment_add',
      'equipment_update',
      'equipment_delete',
    ]) {
      expect(prompt).toContain(op);
    }
    // Envelope rulings mirrored, not paraphrased away:
    // settings is ALWAYS the Setting[] array form
    expect(prompt).toContain('array');
    // EQUIPMENT ops carry allowedInstrumentIds, LABWARE ops expectedLabwareKinds
    expect(prompt).toContain('expectedLabwareKinds');
    expect(prompt).toContain('allowedInstrumentIds');
    // Hard rules
    expect(prompt).toContain('Never invent stepIds or roleIds');
    expect(prompt).toContain('Propose, never write');
    expect(prompt).toContain('reload');
    // roleId is NOT hyphen-only (underscore/digit-tolerant)
    expect(prompt).toMatch(/roleId[^\n]*[a-z0-9_-]/);
    // The gating markers must never leak into a rendered prompt.
    expect(prompt).not.toContain('protocol-edit:begin');
    expect(prompt).not.toContain('protocol-edit:end');
  });

  it('renders NO attached-protocol block and NO protocol_edit guidance when nothing is attached', () => {
    const prompt = buildSystemPrompt({ ...baseContext });
    expect(prompt).not.toContain('ATTACHED PROTOCOL');
    expect(prompt).not.toContain('protocol_edit');
    expect(prompt).not.toContain('step_insert');
    expect(prompt).not.toContain('equipment_update');
    // The gating markers must never leak into a rendered prompt either way.
    expect(prompt).not.toContain('protocol-edit:begin');
    expect(prompt).not.toContain('protocol-edit:end');
  });

  it('renders the guidance for attachment and not for absence from the SAME template (render purity)', () => {
    const withProtocol = buildSystemPrompt({ ...baseContext, attachedProtocol });
    const without = buildSystemPrompt({ ...baseContext });
    expect(withProtocol.length).toBeGreaterThan(without.length);
    expect(without).not.toContain('protocol_edit');
    // Golden-prefix guarantee: the no-attachment render must stay
    // byte-identical to the pre-PROTO-AI-6 template render (KV-cache prefix
    // for every non-attached chat is unchanged). Pinned to the trunk base
    // commit this branch was cut from — HEAD moves when this work commits.
    const trunkTemplate = execSync('git show 51419ada:server/prompts/event-graph-agent.md', {
      cwd: resolve(testDir, '../../..'),
      encoding: 'utf-8',
    });
    const currentTemplate = readFileSync(resolve(testDir, '../../../server/prompts/event-graph-agent.md'), 'utf-8');
    const stripped = currentTemplate.replace(/\n?<!--\s*protocol-edit:begin\s*-->[\s\S]*?<!--\s*protocol-edit:end\s*-->\n?/, '');
    expect(stripped).toBe(trunkTemplate);
  });
});

/** Mocked inference client capturing the OUTBOUND request, stopped on a plain-text answer. */
function captureClient(): { client: InferenceClient; captured: () => CompletionRequest | null } {
  let captured: CompletionRequest | null = null;
  const completeStream = vi.fn(async function* (request: CompletionRequest) {
    captured = request;
    yield {
      id: 'resp-1',
      choices: [{
        index: 0,
        delta: { role: 'assistant', content: '{"events":[],"notes":[]}' },
        finish_reason: 'stop' as const,
      }],
    };
  });
  return {
    client: { complete: vi.fn(), completeStream },
    captured: () => captured,
  };
}

const toolBridge: ToolBridge = {
  getToolDefinitions: () => [],
  executeTool: vi.fn(),
};

async function runCapture(context: Parameters<typeof buildSystemPrompt>[0]): Promise<string> {
  const { client, captured } = captureClient();
  const orchestrator = createAgentOrchestrator(
    client,
    toolBridge,
    { baseUrl: 'http://fake', model: 'test-model', temperature: 0.1, maxTokens: 512 },
    { maxTurns: 2, draftFlowMode: 'preflight-llm' },
  );
  await orchestrator.run({
    prompt: 'Rename the wash step.',
    surface: 'event-editor',
    context,
  });
  const request = captured();
  expect(request).not.toBeNull();
  const system = request!.messages.find((m) => m.role === 'system');
  expect(system).toBeDefined();
  return system!.content ?? '';
}

describe('outbound request capture — mocked inference client', () => {
  it('attached-protocol request capture contains protocol identity + all stepIds + role list', async () => {
    const system = await runCapture({ ...baseContext, attachedProtocol });
    expect(system).toContain('ATTACHED PROTOCOL');
    expect(system).toContain('PRT-000123'); // protocol identity
    expect(system).toContain('a1b2c3d4e5f6'); // current sha
    for (const step of attachedProtocol.steps) {
      expect(system).toContain(step.stepId); // ALL stepIds
    }
    // role list (labware + instrument declarations)
    expect(system).toContain('plate_reader_96');
    expect(system).toContain('reservoir');
    expect(system).toContain('plate_reader');
    // protocol_edit guidance rides with the attachment
    expect(system).toContain('protocol_edit');
    expect(system).toContain('equipment_delete');
  });

  it('no-attachment capture lacks BOTH the context block and the protocol_edit guidance', async () => {
    const system = await runCapture({ ...baseContext });
    expect(system).not.toContain('ATTACHED PROTOCOL');
    expect(system).not.toContain('protocol_edit');
    expect(system).not.toContain('PRT-000123');
    expect(system).not.toContain('lyse-cells');
  });
});
