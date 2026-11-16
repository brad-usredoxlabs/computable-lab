/**
 * AI-deliverable-channels COVERAGE TRIPWIRE (L2-AI-CHANNEL-COVERAGE-TRIPWIRE-1,
 * u2consumer). Decision AI-DELIVERABLE-CHANNELS-ARE-DATA rules 3, 4 and 5:
 * every declared channel has a treatment, the emptiness rule derives from the
 * declaration, and a tripwire enforces coverage — deleting a render arm or a
 * naming string must FAIL a test, never ship as silence (the silent-drop
 * class: prompt-1's record proposal invisible under "No events generated").
 *
 * Four legs:
 *   TEST A  — every declared channel has a treatment AND a handler this test
 *             can find (declaration + a per-treatment source probe; the map
 *             lives HERE, keeping the registry pure data).
 *   TEST B  — REVERSE coverage: every channel-shaped field of the client
 *             result types maps to a declared channel id. A new field with no
 *             declaration fails (documented allow-list for non-channel fields).
 *   TEST C  — EMPTINESS DERIVATION: the server checked set equals the
 *             declaration-derived set; each counted channel flips the helper.
 *   TEST D  — WIRING: assertChannelTreated on the live consumer path
 *             (the server boot gate in draftArgDiagnostics, always imported).
 *
 * Source probing is readFileSync + substring: a probe string that ceases to
 * exist in the named source file is a deleted arm — the test fails loudly.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assertChannelTreated, loadDefaultAiDeliverableChannels } from './channels.js';
import { derivedServerGuardChannels, draftProducedNothingOnServer } from '../ai/draftArgDiagnostics.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const SCHEMA_DIR = resolve(REPO_ROOT, 'schema');

const src = (rel: string): string => readFileSync(resolve(REPO_ROOT, rel), 'utf8');
const assistStreamSrc = src('app/src/event-editor/right-pane/ai/assistStream.ts');
const aiAgentResultSrc = src('app/src/types/ai.ts');
const draftDiagnosticsSrc = src('server/src/ai/draftArgDiagnostics.ts');
const draftEmptinessSrc = src('app/src/event-editor/right-pane/ai/draftEmptiness.ts');

/**
 * TEST A — handler location per declared channel: the REAL source location
 * that presents (answer/card) or NAMES (wall) the channel.
 *   answer — the events/prose render arms in the live hook (treatment probes);
 *   card   — the clarification render arm (ChatLog) + the typed-requests arm;
 *   wall   — the runtime string in useAiChat.ts that NAMES the channel on the
 *            honest wall (a wall channel whose naming string does not exist in
 *            source FAILS — the silent-drop class made impossible);
 *   sequenceProposal — the hand-off arm; protocolEdit — the diff arm
 *            (ChangesPanel). A per-channel entry overrides the treatment probe.
 */
const HANDLER_MAP: Record<string, string | { file: string; needle: string }> = {
  events: 'app/src/shared/hooks/useAiChat.ts',
  proseDeliverable: 'app/src/shared/hooks/useAiChat.ts',
  clarification: { file: 'app/src/agent/ChatLog.tsx', needle: 'message.clarification' },
  labwareAdditions: {
    file: 'app/src/shared/hooks/useAiChat.ts',
    needle: 'proposed ${labwareWallCount} new labware, which this surface cannot mount without events',
  },
  equipmentRequirements: {
    file: 'app/src/shared/hooks/useAiChat.ts',
    needle: "'bench-equipment requirements'",
  },
  recordCreations: {
    file: 'app/src/shared/hooks/useAiChat.ts',
    needle: "'records to create'",
  },
  labwareRequirements: {
    file: 'app/src/shared/hooks/useAiChat.ts',
    needle: "'labware requirements'",
  },
  deckLayout: {
    file: 'app/src/shared/hooks/useAiChat.ts',
    needle: "'a deck layout'",
  },
  sequenceProposal: {
    file: 'app/src/shared/hooks/useAiChat.ts',
    needle: 'result.sequenceProposal && submittedProposalScope === proposalScopeRef.current',
  },
  protocolEdit: {
    file: 'app/src/event-editor/right-pane/ai/ChangesPanel.tsx',
    needle: 'export function protocolEditDiffFrom(',
  },
  instrumentJob: {
    file: 'app/src/shared/hooks/useAiChat.ts',
    needle: "'appliance jobs'",
  },
};

const TREATMENT_PROBES: Record<string, Array<{ file: string; needle: string }>> = {
  answer: [
    { file: 'app/src/shared/hooks/useAiChat.ts', needle: 'normalizedPreviewEvents' },
    { file: 'app/src/shared/hooks/useAiChat.ts', needle: 'clarificationNeeded ?? content' },
  ],
  card: [
    { file: 'app/src/agent/ChatLog.tsx', needle: 'message.clarification' },
    { file: 'app/src/shared/hooks/useAiChat.ts', needle: 'legacyClarificationFromRequests' },
  ],
  wall: [
    { file: 'app/src/shared/hooks/useAiChat.ts', needle: 'const unmountable = [' },
  ],
};

const { channels } = loadDefaultAiDeliverableChannels(SCHEMA_DIR);
const TREATMENTS = new Set(['card', 'mount', 'navigate', 'wall', 'answer']);

describe('TEST A — coverage: every declared channel has a treatment and a findable handler', () => {
  it('loads the declaration with exactly the 11 expected channels', () => {
    expect(channels).toHaveLength(11);
    expect(channels.map((c) => c.id).sort()).toEqual(
      ['events', 'clarification', 'recordCreations', 'labwareAdditions', 'equipmentRequirements',
        'labwareRequirements', 'deckLayout', 'sequenceProposal', 'protocolEdit', 'proseDeliverable', 'instrumentJob'].sort(),
    );
  });

  it('every declared channel has an enum treatment and a named handler entry', () => {
    for (const channel of channels) {
      expect(TREATMENTS.has(channel.treatment), `channel "${channel.id}" treatment "${channel.treatment}"`).toBe(true);
      const handler = HANDLER_MAP[channel.id];
      expect(handler, `channel "${channel.id}" has no handler entry — add one before merging`).toBeTruthy();
    }
  });

  it('every handler resolves to a real source location (readFileSync + substring)', () => {
    for (const channel of channels) {
      const handler = HANDLER_MAP[channel.id];
      if (!handler) throw new Error(`no handler entry for declared channel "${channel.id}"`);
      const location = typeof handler === 'string' ? { file: handler } : handler;
      const file = location.file;
      const text = src(file);
      const needle = location.needle;
      if (channel.treatment === 'wall') {
        // A wall channel is honest only while it is NAMED in source.
        expect(needle, `wall channel "${channel.id}" needs a naming-string probe`).toBeTruthy();
        expect(text.includes(needle!), `wall channel "${channel.id}" is no longer named in ${file}`).toBe(true);
      } else if (needle) {
        expect(text.includes(needle), `channel "${channel.id}" handler ${needle} not found in ${file}`).toBe(true);
      } else {
        // answer channels: every treatment probe must exist in the named file.
        for (const probe of TREATMENT_PROBES[channel.treatment] ?? []) {
          expect(text.includes(probe.needle),
            `channel "${channel.id}" (treatment ${channel.treatment}): probe ${probe.needle} not found in ${file}`).toBe(true);
        }
      }
    }
  });
});

/**
 * TEST B — REVERSE coverage: every channel-shaped field of the client result
 * types the live hook consumes maps to a declared channel id; the allow-lists
 * are DOCUMENTED (non-channel fields named here, so a silent addition is
 * impossible). A new field without a declaration fails.
 *   AssistDraftResult (assistStream.ts) — "the slice of the backend's
 *     AgentResult the chat panel can render";
 *   AiAgentResult (types/ai.ts) — the done-payload type of the LIVE wall
 *     consumer useAiChat.ts (where instrumentApplianceJobs lives; declared
 *     mapping -> instrumentJob);
 *   clarificationRequests rides BOTH and is declared under `clarification`
 *     (one channel, two field names — the typed + legacy arms of ChatLog).
 */
const FIELD_TO_CHANNEL: Record<string, string> = {
  // channel id === field name:
  events: 'events',
  labwareAdditions: 'labwareAdditions',
  labwareRequirements: 'labwareRequirements',
  equipmentRequirements: 'equipmentRequirements',
  recordCreations: 'recordCreations',
  deckLayout: 'deckLayout',
  sequenceProposal: 'sequenceProposal',
  protocolEdit: 'protocolEdit',
  proseDeliverable: 'proseDeliverable',
  clarification: 'clarification',
  clarificationRequests: 'clarification',
  // declared mapping where the client field name != the channel id:
  instrumentApplianceJobs: 'instrumentJob',
};
/** Documented allow-list — NOT deliverable channels. */
const ASSIST_DRAFT_RESULT_NON_CHANNEL_FIELDS = [
  'success', // turn status, not a deliverable
  'shorthand', // scientist-intent YAML, rendered read-only
  'termManifest', // term-classification rows for the term panel
  'notes', // diagnostic lines for the model
  'resolvedLabwares', // placement OFFERS (draft support, not a deliverable)
  'alsoPlace', // explicit placement of created records
  'refusal', // server-built write-wall refusal envelope (a wall, not a channel)
  'ontologyBindings', // draft-only bindings materialized on Accept
  'clarificationNeeded', // prose body of a doc-discussion answer (proseDeliverable marks the deliverable)
  'error', // failure text, not a deliverable
];
const AI_AGENT_RESULT_NON_CHANNEL_FIELDS = [
  'success', 'notes', 'unresolvedRefs', 'clarificationNeeded', 'error',
  'alsoPlace', 'resolvedLabwares', 'executionScalePlan', 'ontologyBindings',
  'assurance', 'usage', 'shorthand',
];
/**
 * Server deliverable fields of a done draft result (documented — the fields
 * AgentOrchestrator stamps on the done payload). A constant because the
 * server result type (server/src/ai/types.ts AgentResult) also carries
 * transport-only fields that would blur the channel question.
 */
const SERVER_DELIVERABLE_FIELDS = Object.freeze({
  events: 'events',
  clarificationRequests: 'clarification',
  labwareAdditions: 'labwareAdditions',
  labwareRequirements: 'labwareRequirements',
  recordCreations: 'recordCreations',
  deckLayout: 'deckLayout',
  sequenceProposal: 'sequenceProposal',
  protocolEdit: 'protocolEdit',
  instrumentApplianceJobs: 'instrumentJob',
} satisfies Record<string, string>);

/**
 * Top-level field names of a TS interface, straight from source —
 * line-based, comment-aware (block comments may span lines; // and block
 * comments are stripped before scanning) and string-aware (quoted text
 * blanked so a `:` in a literal never parses as a member). A field is
 * recorded at brace depth 1, so nested object types are never captured.
 * Equivalent to the original char-loop parser (verified byte-identical
 * field lists on AssistDraftResult and AiAgentResult).
 */
function interfaceFieldNames(source: string, iface: string): string[] {
  const start = source.indexOf(`export interface ${iface}`);
  expect(start, `interface ${iface} not found`).toBeGreaterThanOrEqual(0);
  const fields: string[] = [];
  let depth = 0;
  let inBlock = false;
  let opened = false;
  for (const raw of source.slice(start).split('\n')) {
    let line = raw;
    let i = 0;
    // strip comments (a block comment may continue onto the next line):
    while (i < line.length) {
      if (inBlock) {
        const j = line.indexOf('*/', i);
        if (j < 0) i = line.length;
        else { inBlock = false; i = j + 2; }
      } else {
        const code = line.slice(i);
        const sc = code.indexOf('//');
        const bc = code.indexOf('/*');
        if (sc >= 0 && (bc < 0 || sc < bc)) { line = code.slice(0, sc); i = line.length; }
        else if (bc >= 0) {
          const j = code.indexOf('*/', bc + 2);
          if (j < 0) { inBlock = true; line = code.slice(0, bc); i = line.length; }
          else i = bc + j + 3;
        } else break;
      }
    }
    const code = line.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, ' ');
    if (depth === 1) {
      const m = code.trim().match(/^([A-Za-z_$][\w$]*)(\?)?:/);
      if (m && !fields.includes(m[1])) fields.push(m[1]);
    }
    for (const ch of code) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    if (depth > 0) opened = true;
    if (opened && depth === 0) break;
  }
  expect(opened, `interface ${iface} body never closed`).toBe(true);
  return fields;
}

/** The channel-shaped fields each client type carries (stale-entry guard). */
const ASSIST_DRAFT_RESULT_MAPPED_FIELDS = [
  'events', 'labwareAdditions', 'labwareRequirements', 'equipmentRequirements',
  'recordCreations', 'deckLayout', 'sequenceProposal', 'protocolEdit',
  'proseDeliverable', 'clarification', 'clarificationRequests',
];
const AI_AGENT_RESULT_MAPPED_FIELDS = [
  'sequenceProposal', 'events', 'clarification', 'clarificationRequests',
  'labwareAdditions', 'labwareRequirements', 'equipmentRequirements',
  'recordCreations', 'instrumentApplianceJobs',
];

function assertFieldsCovered(
  fields: string[],
  mappedFields: string[],
  nonChannel: string[],
  sourceLabel: string,
): void {
  const declared = new Set(channels.map((c) => c.id));
  for (const field of fields) {
    if (nonChannel.includes(field)) continue;
    const channelId = FIELD_TO_CHANNEL[field];
    expect(
      channelId,
      `${sourceLabel} field "${field}" is channel-shaped but maps to no declared channel — declare it in the registry or add it to the documented allow-list`,
    ).toBeTruthy();
    expect(
      declared.has(channelId!),
      `${sourceLabel} field "${field}" maps to undeclared channel "${channelId}"`,
    ).toBe(true);
  }
  // Stale-entry guard (both directions): every named field must still be a
  // real field of the source type — a removed field is a defect.
  for (const field of [...mappedFields, ...nonChannel]) {
    expect(fields.includes(field), `stale entry "${field}" — ${sourceLabel} no longer carries it`).toBe(true);
  }
}

describe('TEST B — reverse coverage: every channel-shaped field is declared', () => {
  it('every AssistDraftResult field maps to a declared channel or the allow-list', () => {
    const fields = interfaceFieldNames(assistStreamSrc, 'AssistDraftResult');
    expect(fields).toContain('events');
    expect(fields).toContain('clarificationRequests');
    assertFieldsCovered(fields, ASSIST_DRAFT_RESULT_MAPPED_FIELDS, ASSIST_DRAFT_RESULT_NON_CHANNEL_FIELDS, 'AssistDraftResult');
  });

  it('every AiAgentResult field (the live hook done-payload type) maps to a declared channel or the allow-list', () => {
    const fields = interfaceFieldNames(aiAgentResultSrc, 'AiAgentResult');
    expect(fields).toContain('instrumentApplianceJobs');
    assertFieldsCovered(fields, AI_AGENT_RESULT_MAPPED_FIELDS, AI_AGENT_RESULT_NON_CHANNEL_FIELDS, 'AiAgentResult');
  });

  it('every server deliverable field maps to a declared channel', () => {
    const declared = new Set(channels.map((c) => c.id));
    for (const [field, channelId] of Object.entries(SERVER_DELIVERABLE_FIELDS)) {
      expect(declared.has(channelId), `server deliverable field "${field}" maps to undeclared channel "${channelId}"`).toBe(true);
    }
  });

  it('the instrumentApplianceJobs -> instrumentJob mapping is declared, not invented', () => {
    const { channels: loaded } = loadDefaultAiDeliverableChannels(SCHEMA_DIR);
    expect(loaded.some((c) => c.id === 'instrumentJob')).toBe(true);
    expect(FIELD_TO_CHANNEL.instrumentApplianceJobs).toBe('instrumentJob');
    expect(SERVER_DELIVERABLE_FIELDS.instrumentApplianceJobs).toBe('instrumentJob');
  });
});

/**
 * TEST C — EMPTINESS DERIVATION. Decision rule 4: the emptiness rule derives
 * from the declaration. The server module loads the declaration at boot and
 * derives its checked set (derivedServerGuardChannels); the partition
 * (counted ∪ not-counted-by-ruling, read from the module's SOURCE) must
 * EXACTLY cover the loaded declaration — the declaration is the one list.
 * Every counted channel flips the helper. The app's RULING-3 drift pin
 * (draftEmptiness.drift.test.ts) holds the reverse direction.
 */
const GUARD_COUNTED_SRC_RE = /const GUARD_COUNTED: readonly string\[\] = Object\.freeze\(\[([\s\S]*?)\]\)/;
const GUARD_NOT_COUNTED_SRC_RE = /const GUARD_NOT_COUNTED_BY_RULING: ReadonlySet<string> = new Set\(\[([\s\S]*?)\]\)/;

function partitionFromSource(): { counted: Set<string>; notCounted: Set<string> } {
  const ids = (block: string): Set<string> =>
    new Set([...block.matchAll(/'([A-Za-z_$][\w$]*)'/g)].map((m) => m[1]));
  const countedMatch = draftDiagnosticsSrc.match(GUARD_COUNTED_SRC_RE);
  const notCountedMatch = draftDiagnosticsSrc.match(GUARD_NOT_COUNTED_SRC_RE);
  expect(countedMatch, 'GUARD_COUNTED partition not found in draftArgDiagnostics.ts').toBeTruthy();
  expect(notCountedMatch, 'GUARD_NOT_COUNTED_BY_RULING partition not found in draftArgDiagnostics.ts').toBeTruthy();
  // normalize the source partition's field names to declared channel ids
  // (one channel, two field names for clarification — same table as TEST B):
  const toId = (field: string): string => FIELD_TO_CHANNEL[field] ?? field;
  return {
    counted: new Set([...ids(countedMatch![1])].map(toId)),
    notCounted: new Set([...ids(notCountedMatch![1])].map(toId)),
  };
}
/** Channel id -> done-payload field name (inverse of FIELD_TO_CHANNEL). */
const CHANNEL_TO_FIELD: Record<string, string> = { clarification: 'clarificationRequests' };

describe('TEST C — emptiness derivation: the helper agrees with the declaration', () => {
  it('the derived checked set equals the module partition, which exactly covers the declaration (one list)', () => {
    const declared = new Set(channels.map((c) => c.id));
    const derived = new Set(derivedServerGuardChannels());
    const { counted, notCounted } = partitionFromSource();
    // the module's derived set IS its counted partition (derived at boot):
    expect(derived).toEqual(counted);
    // counted + not-counted-by-ruling EXACTLY covers the loaded declaration:
    expect(new Set([...counted, ...notCounted].sort())).toEqual(new Set([...declared].sort()));
    for (const id of counted) {
      expect(notCounted.has(id), `channel "${id}" is counted twice (partition overlap)`).toBe(false);
    }
  });

  it('a result carrying ONLY one non-empty counted channel produced something (iterating the DERIVED set)', () => {
    for (const id of derivedServerGuardChannels()) {
      const field = CHANNEL_TO_FIELD[id] ?? id;
      const result = { success: true, [field]: [{ id: 'x' }] } as never;
      expect(draftProducedNothingOnServer(result), `channel "${id}" must flip the helper to produced-something`).toBe(false);
    }
    // deckLayout is object-typed, not an array channel:
    expect(draftProducedNothingOnServer({ success: true, deckLayout: { platformId: 'p', variantId: 'v' } })).toBe(false);
  });

  it('the client predicate counts every server-counted channel (CLIENT ⊇ SERVER)', () => {
    for (const id of derivedServerGuardChannels()) {
      const field = CHANNEL_TO_FIELD[id] ?? id;
      const Q = String.fromCharCode(92);
      const term = new RegExp(`result${Q}.${field}${Q}?${Q}.length|!result${Q}.${field}${Q}b`);
      expect(draftEmptinessSrc, `client draftEmptiness does not count "${id}" (CLIENT ⊉ SERVER)`).toMatch(term);
      expect(draftDiagnosticsSrc, `server guard lost its term for "${id}"`).toMatch(term);
    }
    // the sanctioned client-superset members are counted by the client only:
    expect(draftEmptinessSrc).toContain('equipmentRequirements');
    expect(draftEmptinessSrc).toContain('proseDeliverable');
  });

  it('a result with every declared channel absent produced nothing', () => {
    expect(draftProducedNothingOnServer({ success: true, events: [] })).toBe(true);
    expect(draftProducedNothingOnServer({})).toBe(true);
    // the client-superset members are deliberately NOT in the server guard:
    expect(draftProducedNothingOnServer({ success: true, events: [], equipmentRequirements: [{ classCurie: 'equipment:water_bath' }] } as never)).toBe(true);
    expect(draftProducedNothingOnServer({ success: true, events: [], proseDeliverable: true } as never)).toBe(true);
  });
});

/**
 * TEST D — WIRING: the named-failure primitive is on the live consumer path.
 * A module the server ALWAYS loads (draftArgDiagnostics, imported by
 * AgentOrchestrator at :48) runs the boot-time channel gate: it loads the
 * declaration and calls assertChannelTreated for EVERY declared channel — a
 * declared channel with no treatment makes the process fail loudly at boot,
 * never silently (decision rule 3; the emptiness rule derives from the same
 * loaded declaration — decision rule 4).
 */
describe('TEST D — wiring: assertChannelTreated is on the live consumer path', () => {
  it('assertChannelTreated is the named-failure primitive (throws naming the id)', () => {
    expect(assertChannelTreated(channels, 'events').treatment).toBe('answer');
    expect(() => assertChannelTreated(channels, 'noSuchChannel')).toThrow(
      'channel "noSuchChannel" has no declared treatment',
    );
  });

  it('the always-loaded server module calls assertChannelTreated over the whole declaration (boot gate)', () => {
    // The call must iterate the LOADED channels (no second literal id list):
    expect(draftDiagnosticsSrc).toMatch(/\bfor\s*\(const\s+\w+\s+of\s+channels\)\s*\{\s*\n\s*assertChannelTreated\s*\(\s*channels\s*,/);
    expect(draftDiagnosticsSrc).toMatch(/\bassertChannelTreated\s*\(\s*channels/);
  });

  it('the emptiness helper is derived from the loaded declaration, not a second literal list (drift pin updated)', () => {
    expect(draftDiagnosticsSrc).toContain('ai-deliverable-channels declaration');
    expect(draftDiagnosticsSrc).toContain('declaration is the one list');
    // the derived gate runs at module load:
    expect(draftDiagnosticsSrc).toMatch(/\bassertServerChannelsTreated\s*\(/);
  });
});
