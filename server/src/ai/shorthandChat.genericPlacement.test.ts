import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import {
  compileShorthandDeterministically,
  clarificationsFromUnresolvedFacts,
  factRequestId,
  holdShorthandIntent,
  foldAnswersIntoShorthand,
  parseShorthandForChat,
} from './shorthandChat.js';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { deriveContextCacheKey } from './systemPrompt.js';
import type { RecordStore } from '../store/types.js';

const definition = parse(readFileSync(new URL('../../../records/seed/labware-definition/lbw-def-generic-96-well-plate.yaml', import.meta.url), 'utf8'));
const chosenDefinition = { ...definition, recordId: 'test-imaging-definition', display_name: 'Imaging 96-well plate' };
const records = [
  { recordId: definition.recordId, payload: definition },
  { recordId: 'LBW-legacy-generic', payload: { kind: 'labware', name: 'Generic 96-well plate legacy' } },
  { recordId: chosenDefinition.recordId, payload: chosenDefinition },
  { recordId: 'test-imaging-twin', payload: { ...chosenDefinition, recordId: 'test-imaging-twin' } },
];
function storeForTest() {
  return {
    get: vi.fn(async (id: string) => records.find((record) => record.recordId === id) ?? null),
    list: vi.fn(async (query?: { kind?: string; schemaId?: string }) => records.filter((record) => !query?.schemaId && (!query?.kind || record.payload.kind === query.kind))),
  } as unknown as RecordStore;
}
const yaml = 'intentId: generic-placement\nactions:\n  - action: create_container\n    labware: "96-well plate"\n';

describe('generic placement through the real compiler and chat answer contract', () => {
  it('uses the declared generic definition without asking the user to choose a vendor', async () => {
    const result = await compileShorthandDeterministically(parseShorthandForChat(yaml), { store: storeForTest() });
    expect(result?.clarifications).toEqual([]);
    expect(result?.terminalArtifacts.events).toHaveLength(1);
    expect(result?.terminalArtifacts.resolvedLabwares).toEqual([expect.objectContaining({ recordId: definition.recordId })]);
    expect(result?.terminalArtifacts.events[0]).toMatchObject({
      event_type: 'create_container',
      details: { labwareType: '96-well-plate' },
    });
  });

  it.each([false, true])('carries the selected definition into fold compilation (legacy saved card: %s)', async (legacy) => {
    // The r14 receipt has optionId + label but no ref. Do not manufacture
    // answer.ref in this test: it must come from the production card mapper.
    const doc = parseShorthandForChat(yaml);
    const fact = {
      label: '96-well plate', reason: 'ambiguous-noun',
      actionLocation: { actionIndex: 0, action: 'create_container', argument: 'labware' },
      candidates: records.map((record) => ({ ref: record.recordId, label: record.payload.display_name ?? record.payload.name })),
    };
    const [card] = clarificationsFromUnresolvedFacts([fact]);
    // Two records share this label, and it is not a generic-default alias.
    // Recompilation can succeed only if the selected identity survives.
    const option = card!.options.find((option) => option.id === chosenDefinition.recordId)!;
    const answer = {
      requestId: card!.id, optionId: option.id, label: option.label,
      ...(!legacy && option.ref ? { ref: option.ref } : {}),
    };
    expect(option.ref).toMatchObject({ id: chosenDefinition.recordId });
    const request = {
      prompt: 'Use Imaging 96-well plate for labware.',
      surface: 'run-workspace' as const,
      forceDraftTool: true,
      context: { labwares: [], eventSummary: 'No events yet.', vocabPackId: 'liquid-handling/v1', availableVerbs: ['create_container'], runId: 'RUN-generic-placement-test' },
    };
    const key = deriveContextCacheKey(request.surface as never, request.context as never);
    expect(card!.id).toBe(factRequestId(fact));
    holdShorthandIntent(key, { yaml, doc, clarifications: [fact] });
    const completeStream = vi.fn(async function* () { throw new Error('A selection must not call the model'); });
    const orchestrator = createAgentOrchestrator(
      { client: { complete: vi.fn(), completeStream } } as never,
      { getToolDefinitions: () => [], executeTool: vi.fn() } as never,
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2 }, { store: storeForTest() },
    );
    const result = await orchestrator.run({ ...request, clarificationAnswers: [answer] } as never);
    expect(completeStream).not.toHaveBeenCalled();
    expect(result).toMatchObject({ events: expect.any(Array) });
    expect(result.events).toHaveLength(1);
    expect(result.resolvedLabwares).toEqual([expect.objectContaining({ recordId: chosenDefinition.recordId })]);
    expect(result.clarificationRequests ?? []).toEqual([]);
  });

  it('does not treat an unoffered optionId as record identity on a legacy card', () => {
    const fact = { label: '96-well plate', reason: 'ambiguous-noun',
      actionLocation: { actionIndex: 0, action: 'create_container', argument: 'labware' },
      candidates: [{ ref: definition.recordId, label: definition.display_name }] };
    const folded = foldAnswersIntoShorthand({ yaml, doc: parseShorthandForChat(yaml), clarifications: [fact] },
      [{ requestId: factRequestId(fact), optionId: 'not-offered', label: definition.display_name }]);
    expect(folded?.bindings).toEqual([]);
  });
});
