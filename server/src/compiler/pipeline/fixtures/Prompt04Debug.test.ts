import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFixture } from './FixtureTypes.js';
import { runFixture } from './FixtureRunner.js';

const FIXTURE_PATH = resolve(__dirname, 'prompt-04-fire-assay.yaml');

describe('Prompt 04 - debug', () => {
  it('debug output', async () => {
    const p4 = parseFixture(readFileSync(FIXTURE_PATH, 'utf8'));
    const r4 = await runFixture(p4);

    console.log('outcome:', r4.outcome);
    console.log('directives:', r4.terminalArtifacts.directives.length);
    console.log('downstreamQueue:', r4.terminalArtifacts.downstreamQueue?.length);
    console.log('gaps:', r4.terminalArtifacts.gaps.map(g => g.message));
    console.log('total events:', r4.terminalArtifacts.events.length);
    console.log('first 10 events:', r4.terminalArtifacts.events.slice(0, 10).map(e => ({ id: e.eventId, type: e.event_type })));
    console.log('event IDs starting with pe_triplicate:', r4.terminalArtifacts.events.filter(e => e.eventId?.startsWith('pe_triplicate')).length);
    console.log('event IDs starting with pe_coldiff:', r4.terminalArtifacts.events.filter(e => e.eventId?.startsWith('pe_coldiff')).length);
    console.log('event IDs starting with pe_quad:', r4.terminalArtifacts.events.filter(e => e.eventId?.startsWith('pe_quad')).length);
    console.log('all event types:', [...new Set(r4.terminalArtifacts.events.map(e => e.event_type))]);
    console.log('all event IDs:', r4.terminalArtifacts.events.map(e => e.eventId));
    
    expect(true).toBe(true);
  });
});
