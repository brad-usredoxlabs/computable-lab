/**
 * AI-deliverable-channels registry — coverage tripwire (u1declare).
 * Guards the declaration: the REAL file loads with exactly the 11 declared
 * channels (each an enum treatment), the schema rejects a missing treatment
 * and treatment "ignore", assertChannelTreated names an undeclared id, and
 * the treatment map is consistent (≥1 wall, nothing outside the enum).
 */
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { assertChannelTreated, loadAiDeliverableChannels, loadDefaultAiDeliverableChannels } from './channels.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = resolve(__dirname, '../../../schema');
const REAL_SCHEMA = resolve(SCHEMA_DIR, 'registry/ai-deliverable-channels/ai-deliverable-channels.schema.yaml');

const EXPECTED_IDS = [
  'events', 'clarification', 'recordCreations', 'labwareAdditions', 'equipmentRequirements',
  'labwareRequirements', 'deckLayout', 'sequenceProposal', 'protocolEdit', 'proseDeliverable', 'instrumentJob',
];
const TREATMENTS = new Set(['card', 'mount', 'navigate', 'wall', 'answer']);

let tmpRoot = '';

beforeAll(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'ai-channels-'));
});

afterAll(async () => {
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
});

/** Write a temp schemaDir holding `yaml` + a copy of the REAL sibling schema. */
async function writeTempRegistry(yaml: string): Promise<string> {
  const dir = await mkdtemp(join(tmpRoot, 'reg-'));
  const regDir = join(dir, 'registry', 'ai-deliverable-channels');
  await mkdir(regDir, { recursive: true });
  await writeFile(join(regDir, 'ai-deliverable-channels.yaml'), yaml, 'utf8');
  await writeFile(join(regDir, 'ai-deliverable-channels.schema.yaml'), await readFile(REAL_SCHEMA, 'utf8'), 'utf8');
  return dir;
}

describe('real registry', () => {
  it('loads exactly the 11 declared channel ids, no duplicates', () => {
    const { channels } = loadAiDeliverableChannels(SCHEMA_DIR);
    expect(channels).toHaveLength(11);
    expect(channels.map((c) => c.id).sort()).toEqual([...EXPECTED_IDS].sort());
    expect(new Set(channels.map((c) => c.id)).size).toBe(11);
  });

  it('every channel carries an enum treatment and a meaning ≥10 chars', () => {
    const { channels } = loadAiDeliverableChannels(SCHEMA_DIR);
    for (const c of channels) {
      expect(TREATMENTS.has(c.treatment)).toBe(true);
      expect(c.meaning.trim().length).toBeGreaterThanOrEqual(10);
    }
  });

  it('loadDefaultAiDeliverableChannels resolves the default registry path', () => {
    const { channels } = loadDefaultAiDeliverableChannels(SCHEMA_DIR);
    expect(channels).toHaveLength(11);
    expect(channels.some((c) => c.id === 'events')).toBe(true);
  });
});

describe('schema rejects malformed declarations', () => {
  it('a channel missing its treatment fails with an Ajv error', async () => {
    const dir = await writeTempRegistry(
      ['version: 1', 'channels:',
        '  - id: events',
        '    meaning: "Discrete experiment events the draft proposes to add to the event graph."',
        '  - id: proseDeliverable',
        '    meaning: "Prose the draft delivers as the message text of the turn itself."'].join('\n') + '\n',
    );
    expect(() => loadAiDeliverableChannels(dir)).toThrow(/ai-deliverable-channels registry invalid/);
    expect(() => loadAiDeliverableChannels(dir)).toThrow(/must have required property 'treatment'/);
  });

  it('treatment "ignore" is impossible — the enum rejects it', async () => {
    const dir = await writeTempRegistry(
      ['version: 1', 'channels:',
        '  - id: events',
        '    meaning: "Discrete experiment events the draft proposes to add to the event graph."',
        '    treatment: ignore'].join('\n') + '\n',
    );
    expect(() => loadAiDeliverableChannels(dir)).toThrow(/ai-deliverable-channels registry invalid/);
    expect(() => loadAiDeliverableChannels(dir)).toThrow(/must be equal to one of the allowed values/);
  });
});

describe('assertChannelTreated — the named-failure primitive', () => {
  it('returns the declared channel for a declared id', () => {
    const { channels } = loadAiDeliverableChannels(SCHEMA_DIR);
    expect(assertChannelTreated(channels, 'events').treatment).toBe('answer');
    expect(assertChannelTreated(channels, 'clarification').treatment).toBe('card');
  });

  it('throws naming an undeclared id', () => {
    const { channels } = loadAiDeliverableChannels(SCHEMA_DIR);
    expect(() => assertChannelTreated(channels, 'mysteryChannel')).toThrow(
      'channel "mysteryChannel" has no declared treatment',
    );
  });
});

describe('treatment map guard', () => {
  it('declares at least one wall channel and nothing outside the enum', () => {
    const { channels } = loadAiDeliverableChannels(SCHEMA_DIR);
    expect(channels.filter((c) => c.treatment === 'wall').length).toBeGreaterThanOrEqual(1);
    expect(channels.filter((c) => !TREATMENTS.has(c.treatment))).toHaveLength(0);
  });
});
