/**
 * SPINE-4 fix1 (adversarial D1) — production spine injection, RED-first.
 *
 * The reviewer's probe (/tmp/spine4-probe.mts) mirrored as a test: a
 * non-hint-eligible resolvable material (`seed.material` — shipped vocabulary
 * declares kind resolvable, domain material, NO hintEligible) must COMPILE
 * through the REAL route handlers. The routes must inject a store-backed
 * spine (the same createResolveSpineFromContext composition server.ts:733
 * builds for the resolve tools) — spec §3: "production callers inject a
 * store-backed spine via deps.spine".
 *
 * Before the wiring: the handler passes { searchLabwareByHint } only, the
 * silent `?? createResolveSpine({})` floor has no term/record provider, the
 * spine adapter (localOnly) sees nothing, and the term FALSE-BARS with
 * reason 'unknown-noun' although it lives in the lab's record store.
 * After the wiring: outcome 'complete', artifacts present, zero clarifications.
 *
 * Plus the §3 fail-loud doctrine: the provider-less floor is REMOVED — a
 * compile whose deps carry no spine throws LOUD at pass registration; a
 * provider-less spine is legal ONLY as an explicitly injected test seam.
 */
import { describe, expect, it, vi } from 'vitest';
import { parseScientistIntent } from '../scientistIntent/parseScientistIntent.js';
import { compileScientistIntent } from '../scientistIntent/compileScientistIntent.js';
import { createResolveSpine } from '../../resolve/ResolveSpine.js';
import { createIntentCompileHandlers } from '../../api/handlers/IntentCompileHandlers.js';
import { createIntentCompileFromPromptHandlers } from '../../api/handlers/IntentCompileFromPromptHandlers.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** The reviewer's probe document: seed.material is NOT hintEligible — only a
 *  store-backed spine (tier 0/1) can bind it. */
const SEED_MATERIAL_DOC = `
intentId: fix1-seed-material
actions:
  - { action: seed, material: DMEM, volumeUl: 100 }
`;

/** A record store whose tier-1 lookup CAN find the material (the lab's own
 *  record store — the term is NOT actually unresolved). */
function recordStoreWith(records: Array<{ recordId: string; name: string; kind: string }>) {
  return {
    get: vi.fn(async () => null),
    getRecord: vi.fn(async () => null),
    list: vi.fn(async (filter?: { kind?: string; schemaId?: string }) => {
      if (filter?.schemaId) return [];
      return records
        .filter((r) => !filter?.kind || r.kind === filter.kind)
        .map((r) => ({
          recordId: r.recordId,
          schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
          payload: { kind: r.kind, name: r.name },
          meta: { kind: r.kind },
        }));
    }),
  };
}

const dmemStore = () => recordStoreWith([{ recordId: 'MAT-dmem', name: 'DMEM', kind: 'material' }]);

function mockRequest(body: unknown) {
  return { body, log: { error: vi.fn() } };
}

function send() {
  const calls: Array<{ status?: number; payload?: unknown }> = [];
  let currentStatus: number | undefined;
  const r = {
    status(code: number) {
      currentStatus = code;
      return r;
    },
    send(payload: unknown) {
      calls.push({ status: currentStatus, payload });
      return r;
    },
  };
  return { r, calls };
}

/** Stub scientist-intent LLM emitting a seed/material macro (the from-prompt
 *  one-shot path). */
function stubSeedLlm() {
  return {
    complete: vi.fn(async () => ({
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            function: {
              name: 'emit_scientist_intent',
              arguments: JSON.stringify({
                intentId: 'fix1-prompt-seed',
                actions: [{ action: 'seed', material: 'DMEM', volumeUl: 100 }],
              }),
            },
          }],
        },
      }],
    })),
  };
}

// ---------------------------------------------------------------------------
// D1 leg 1 — the /intent/compile route compiles a store-resolvable material
// ---------------------------------------------------------------------------

describe('SPINE-4 D1 — production spine injection (reviewer probe mirrored)', () => {
  it('POST /intent/compile deps compile a non-hint-eligible material the store CAN bind: outcome complete, zero false-bar', async () => {
    const handlers = createIntentCompileHandlers({ store: dmemStore() as never });
    const reply = send();
    await handlers.compile(mockRequest({ intent: SEED_MATERIAL_DOC }) as never, reply.r as never);

    expect(reply.calls).toHaveLength(1);
    const payload = reply.calls[0]!.payload as {
      outcome: string;
      terminalArtifacts: { events?: Array<{ event_type: string }> };
    };
    // BEFORE the fix: 'needs-clarification' + clarification {label:'DMEM',
    // reason:'unknown-noun'} + zero artifacts — the false-bar D1 reproduced.
    expect(payload.outcome).toBe('complete');
    expect(payload.terminalArtifacts.events ?? []).not.toEqual([]);
  });

  it('POST /intent/compile-from-prompt deps compile the same material (the from-prompt route injects the same store-backed spine)', async () => {
    const ctx = {
      store: dmemStore(),
      appConfig: { ai: { inference: { baseUrl: 'http://mock:8899/v1', model: 'lfm2.5-2.6b' } } },
    } as never;
    const handlers = createIntentCompileFromPromptHandlers(ctx, { llmClient: stubSeedLlm() as never });
    const reply = send();
    await handlers.compileFromPrompt(
      mockRequest({ protocolText: 'seed the plate with DMEM', answers: { sample_type: 'bacterial' } }) as never,
      reply.r as never,
    );

    expect(reply.calls).toHaveLength(1);
    const payload = reply.calls[0]!.payload as {
      outcome: string;
      terminalArtifacts: { events?: Array<{ event_type: string }> };
    };
    expect(payload.outcome).toBe('complete');
    expect(payload.terminalArtifacts.events ?? []).not.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// D1 leg 2 — §3 fail-loud doctrine: NO silent provider-less floor
// ---------------------------------------------------------------------------

describe('SPINE-4 D1 — fail-loud registration (no degraded no-resolution mode)', () => {
  it('compileScientistIntent WITHOUT deps.spine throws at pass registration (route-like deps must not silently run a provider-less spine)', async () => {
    const doc = parseScientistIntent(SEED_MATERIAL_DOC);
    await expect(
      compileScientistIntent(doc, { searchLabwareByHint: async () => [] }),
    ).rejects.toThrow(/spine/i);
  });

  it('an EXPLICITLY injected provider-less spine is a legal test seam: hint-eligible nouns still compile (the seam is declared, never defaulted)', async () => {
    const doc = parseScientistIntent(`
intentId: seam-check
actions:
  - { action: serial_dilution, source: standards, target: fresh_plate, factor: 2, points: 4, replicates: 1 }
`);
    const result = await compileScientistIntent(doc, {
      spine: createResolveSpine({}),
      searchLabwareByHint: async (hint) => {
        const h = hint.toLowerCase();
        if (h.includes('standards')) return [{ recordId: 'LAB-standard-plate', title: 'Standard Plate' }];
        if (h.includes('fresh')) return [{ recordId: 'LAB-fresh-plate', title: 'Fresh 96-well plate' }];
        return [];
      },
    });
    expect(result.outcome).toBe('complete');
    expect(result.clarifications).toEqual([]);
  });
});
