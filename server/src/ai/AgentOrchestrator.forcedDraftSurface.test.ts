/**
 * SH-PROMPT-HYGIENE-1 (RED-first): the forced-draft instruction must stop
 * mandating legacy `event_graph` / labwareRequirements vocabulary on surfaces
 * that have migrated to shorthand drafting, while staying byte-identical for
 * every non-migrated surface.
 *
 * Design (spec RECOMMENDED option (a)): the exported FORCED_DRAFT_TOOL_INSTRUCTION
 * const stays byte-identical (legacy surfaces keep it verbatim); a shorthand
 * variant is selected at the ONE push site in buildPrefixRequest via the existing
 * DATA seam surfaceDraftsShorthand(...) — zero surface-name literals in TS, no
 * new policy branch, no YAML-schema change.
 *
 * PIN-SCOPE NOTE (deliberate, spec bait #1): the criterion "prompt no longer
 * names event_graph vocabulary" is asserted on the FORCED SECTION ONLY — the
 * section of the composed system message that startsWith 'EVENT-EDITOR DRAFT
 * MODE'. SUBMIT_SUGGESTION_INSTRUCTION (pushed at :1154, a ratchet string, out
 * of scope) also names event_graph, so a whole-message assertion would be
 * unfalsifiable-by-design. The section-scoped form is the honest falsifiable
 * form for the owned file; the residual whole-message contradiction is reported
 * (OQ-2), not silently absorbed.
 *
 * Pins (spec §RED-first test plan):
 *  1. [RED at base] surface=workspace.deck, forceDraftTool:true -> the composed
 *     forced section contains NO event_graph / labwareRequirements token.
 *  2. [GREEN at base, must stay GREEN] surface=event-editor and surface absent
 *     (legacy no-surface callers) -> the composed forced section === the exported
 *     const, strict string equality (byte-stability).
 *  3. Warm/real parity: buildPrefixRequest (warm) equals the section captured
 *     from a real run() on the same surface — the selection must live INSIDE
 *     buildPrefixRequest (spec bait #5: do not weaken to a contains-check).
 *  4. Variant disclosure parity: the shorthand variant carries the generated
 *     contractBlock EXACTLY ONCE (mirror shorthandContractDisclosure.test.ts:48-51;
 *     derived from vocab.contractBlock(), never typed-out text — bait #2).
 *  5. Literal hygiene: AgentOrchestrator.ts source carries no quoted surface-name
 *     literal (extends AgentOrchestrator.repeatEcho.test.ts:373's src-grep idiom).
 *  6. Refusal-pin regression (shorthandChat :217/:252/:290/:349) is covered by
 *     the targeted family run — no edits to that file.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createAgentOrchestrator, FORCED_DRAFT_TOOL_INSTRUCTION } from './AgentOrchestrator.js';
import { defaultScientistIntentVocabulary } from '../compiler/scientistIntent/vocabulary.js';
import type { CompletionRequest, InferenceClient, ToolBridge } from './types.js';
import type { AiSurface } from './systemPrompt.js';
import type { RecordEnvelope, RecordFilter, RecordStore } from '../store/types.js';

// ---------------------------------------------------------------------------
// Outbound-request capture (runCapture idiom copied from
// workstateComposeRules.test.ts:167-186; stubbed client, captured request)
// ---------------------------------------------------------------------------

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
  return { client: { complete: vi.fn(), completeStream }, captured: () => captured };
}

const toolBridge: ToolBridge = {
  getToolDefinitions: () => [],
  executeTool: vi.fn(),
};

const baseContext = {
  labwares: [],
  eventSummary: 'No events yet.',
  vocabPackId: 'liquid-handling/v1',
  availableVerbs: ['transfer'],
};

function stubStore(): RecordStore {
  return {
    list: vi.fn(async (_filter?: RecordFilter) => [] as RecordEnvelope[]),
  } as unknown as RecordStore;
}

/** Real run() -> the composed system message. `surface` absent-or-value
 *  (exactOptionalPropertyTypes — never `surface: undefined`). */
async function runSystem(surface?: AiSurface): Promise<string> {
  const { client, captured } = captureClient();
  const orchestrator = createAgentOrchestrator(
    client,
    toolBridge,
    { baseUrl: 'http://fake', model: 'test-model', temperature: 0.1, maxTokens: 512 },
    { maxTurns: 1, draftFlowMode: 'forced-tool' },
    { store: stubStore() },
  );
  await orchestrator.run({
    prompt: 'add 100 uL of test reagent to A1:A12',
    ...(surface ? { surface } : {}),
    forceDraftTool: true,
    context: baseContext,
  });
  const request = captured();
  expect(request).not.toBeNull();
  const system = request!.messages.find((m) => m.role === 'system');
  expect(system).toBeDefined();
  return system!.content ?? '';
}

/** buildPrefixRequest (warm path) -> the composed system message. */
async function warmSystem(surface?: AiSurface): Promise<string> {
  const { client } = captureClient();
  const orchestrator = createAgentOrchestrator(
    client,
    toolBridge,
    { baseUrl: 'http://fake', model: 'test-model', temperature: 0.1, maxTokens: 512 },
    { maxTurns: 1, draftFlowMode: 'forced-tool' },
    { store: stubStore() },
  );
  const prefix = await orchestrator.buildPrefixRequest!({
    context: baseContext,
    forceDraftTool: true,
    ...(surface ? { surface } : {}),
  });
  const system = prefix.messages.find((m) => m.role === 'system');
  expect(system).toBeDefined();
  return system!.content ?? '';
}

/** The composed system message is systemSections.join('\n\n---\n\n')
 *  (AgentOrchestrator.ts:1170) — isolate the forced section by splitting on
 *  the separator and taking the section that startsWith the draft-mode header. */
function forcedSection(system: string): string {
  const sections = system.split('\n\n---\n\n');
  const forced = sections.filter((s) => s.startsWith('EVENT-EDITOR DRAFT MODE'));
  expect(forced.length, 'exactly one forced-draft section expected in the composed system message').toBe(1);
  return forced[0]!;
}

describe('SH-PROMPT-HYGIENE-1 — forced-draft instruction per drafting surface', () => {
  it('pin 1 [RED at base]: the shorthand surface (workspace.deck) forced section names NO event_graph / labwareRequirements token', async () => {
    const section = forcedSection(await runSystem('workspace.deck'));
    expect(section).not.toMatch(/event_graph|labwareRequirements/);
  });

  it('pin 2 [byte-stability]: event-editor and no-surface callers get the exported const VERBATIM (strict equality)', async () => {
    expect(forcedSection(await runSystem('event-editor'))).toBe(FORCED_DRAFT_TOOL_INSTRUCTION);
    expect(forcedSection(await runSystem())).toBe(FORCED_DRAFT_TOOL_INSTRUCTION);
  });

  it('pin 3 [warm/real parity]: buildPrefixRequest and run() render the identical forced section on workspace.deck (selection lives inside buildPrefixRequest — bait #5)', async () => {
    const warm = forcedSection(await warmSystem('workspace.deck'));
    const real = forcedSection(await runSystem('workspace.deck'));
    expect(warm).toBe(real);
    // Parity extends to the non-migrated arm too.
    expect(forcedSection(await warmSystem('event-editor'))).toBe(forcedSection(await runSystem('event-editor')));
  });

  it('pin 4 [variant disclosure parity]: the shorthand variant is exported, carries the generated contractBlock EXACTLY ONCE, and its disclosed verb set equals the tool enum BOTH directions (bait #2)', async () => {
    const mod = await import('./AgentOrchestrator.js');
    const variant = (mod as Record<string, unknown>).FORCED_DRAFT_TOOL_INSTRUCTION_SHORTHAND;
    expect(typeof variant, 'the shorthand variant export is missing').toBe('string');
    const text = variant as string;
    const vocab = defaultScientistIntentVocabulary();
    const block = vocab.contractBlock();
    expect(text).toContain(block);
    expect(text.split(block).length - 1).toBe(1);
    // Same generated-verb derivation shorthandContractDisclosure.test.ts:63-78 uses
    // (bait 1 discipline: derived from vocab.toolActionEnum(), never typed-out names).
    const disclosed = text
      .split('\n')
      .filter((l) => (l.startsWith('- ') && l.includes(' — ')) || (l.startsWith('- ') && !l.includes(':')))
      .map((l) => l.slice(2).split(' — ')[0]!.trim())
      .filter((v) => /^[a-z_]+$/.test(v));
    const enumVerbs = vocab.toolActionEnum();
    const setE = new Set(enumVerbs);
    const onlyDisclosed = disclosed.filter((v) => !setE.has(v));
    const onlyEnum = enumVerbs.filter((v) => !new Set(disclosed).has(v));
    expect(onlyDisclosed, `variant discloses a verb outside the enum: ${onlyDisclosed.join(', ')}`).toEqual([]);
    expect(onlyEnum, `variant omits an enum verb: ${onlyEnum.join(', ')}`).toEqual([]);
    // The variant is what the deck surface actually composes.
    expect(forcedSection(await runSystem('workspace.deck'))).toBe(text);
  });

  it('pin 5 [literal hygiene]: AgentOrchestrator.ts source carries NO quoted surface-name literal (repeatEcho.test.ts:373 idiom)', () => {
    const src = readFileSync(resolve(process.cwd(), 'src', 'ai', 'AgentOrchestrator.ts'), 'utf-8');
    expect(src).not.toMatch(/['"]workspace\.deck['"]/);
    expect(src).not.toMatch(/['"]event-editor['"]/);
    expect(src).not.toMatch(/surface\s*===?\s*['"]workspace\.deck['"]/);
    expect(src).not.toMatch(/surface\s*===?\s*['"]event-editor['"]/);
  });
});
