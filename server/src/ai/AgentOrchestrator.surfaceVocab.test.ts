/**
 * PB-CH-4b — the registered surface ids REACH the offered forced tool def,
 * and the def is computed ONCE per orchestrator instance.
 *
 * The warm/real prefix parity contract (AgentOrchestrator buildToolDefs comment):
 * the chat template renders tool schemas into the prompt, so the warm render
 * and the real request must carry the IDENTICAL tools or their token prefixes
 * diverge. Hence the registry-derived def must be reference-stable across
 * calls — a per-request rebuild is a defect, not a detail.
 *
 * Contract under test:
 *  1. With a stub registry, buildPrefixRequest(forceDraftTool: true) offers a
 *     def whose two surface descriptions name the stub ids (the vocabulary
 *     reaches the model's menu).
 *  2. Two calls return the SAME tool object reference (computed once at
 *     construction, not rebuilt per request).
 *  3. Without a registry, the offered def is AGENT_INTENT_TOOL_DEF by
 *     reference (byte-identical fallback — existing pins unaffected).
 */
import { describe, expect, it } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { AGENT_INTENT_TOOL_DEF, AGENT_INTENT_TOOL_NAME } from './submitSuggestionTool.js';
import type { InferenceClient, ToolBridge } from './types.js';
import type { SurfacesRegistry } from '../surfaces/surfaces.js';

/** Stub registry: only `list()` matters for the vocabulary injection. */
function stubRegistry(ids: string[]): SurfacesRegistry {
  return {
    list: () => ids.map((id) => ({
      id: id as never,
      label: id,
      path: `/${id}`,
      objectTypes: [],
      selectableKinds: [],
    })),
    get: (id: string) => (ids.includes(id) ? { id: id as never, label: id, path: `/${id}`, objectTypes: [], selectableKinds: [] } : null),
  } as unknown as SurfacesRegistry;
}

function inertClient(): InferenceClient {
  return {
    complete: () => Promise.reject(new Error('must not be called')),
    completeStream: async function* () {
      throw new Error('must not be called');
    },
  };
}

function inertBridge(): ToolBridge {
  return {
    getToolDefinitions: () => [],
    executeTool: () => Promise.reject(new Error('must not be called')),
  };
}

function makeOrchestrator(surfaces?: SurfacesRegistry) {
  return createAgentOrchestrator(
    inertClient(),
    inertBridge(),
    { model: 'test-model', temperature: 0.1, maxTokens: 512 },
    { maxTurns: 2, draftFlowMode: 'forced-tool' },
    surfaces ? { surfaces } : {},
  );
}

const CONTEXT = {
  labwares: [],
  eventSummary: 'No events yet.',
  vocabPackId: 'liquid-handling/v1',
  availableVerbs: ['transfer'],
};

describe('AgentOrchestrator — forced tool def carries the registered surface ids (PB-CH-4b)', () => {
  it('stub registry ids appear in BOTH surface descriptions of the offered def', () => {
    const orchestrator = makeOrchestrator(stubRegistry(['alpha', 'beta']));
    const prefix = orchestrator.buildPrefixRequest!({
      context: CONTEXT,
      forceDraftTool: true,
    });
    expect(prefix.tools).toHaveLength(1);
    const def = prefix.tools![0];
    expect(def.function.name).toBe(AGENT_INTENT_TOOL_NAME);

    const params = def.function.parameters as {
      properties: Record<string, {
        properties?: Record<string, {
          description?: string;
          items?: { properties?: Record<string, { description?: string }> };
        }>;
      }>;
    };
    const actionSurface = params.properties.action?.properties?.surface?.description ?? '';
    const tabSurface = params.properties.workstate?.properties?.tabs?.items?.properties?.surface?.description ?? '';
    expect(actionSurface).toContain('registered ids: alpha, beta');
    expect(tabSurface).toContain('registered ids: alpha, beta');
    expect(actionSurface).not.toContain('run-design');
    expect(tabSurface).not.toContain('run-design');
  });

  it('the offered def is REFERENCE-STABLE across two forced renders (warm/real parity)', () => {
    const orchestrator = makeOrchestrator(stubRegistry(['alpha', 'beta']));
    const first = orchestrator.buildPrefixRequest!({ context: CONTEXT, forceDraftTool: true });
    const second = orchestrator.buildPrefixRequest!({ context: CONTEXT, forceDraftTool: true });
    expect(first.tools![0]).toBe(second.tools![0]);
  });

  it('no registry: the offered def is AGENT_INTENT_TOOL_DEF by reference (fallback intact)', () => {
    const orchestrator = makeOrchestrator();
    const prefix = orchestrator.buildPrefixRequest!({ context: CONTEXT, forceDraftTool: true });
    expect(prefix.tools![0]).toBe(AGENT_INTENT_TOOL_DEF);
  });
});
