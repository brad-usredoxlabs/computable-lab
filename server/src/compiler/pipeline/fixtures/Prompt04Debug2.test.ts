import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFixture } from './FixtureTypes.js';
import { runFixture } from './FixtureRunner.js';

const FIXTURE_PATH = resolve(__dirname, 'prompt-04-fire-assay.yaml');

describe('Prompt 04 - debug 2', () => {
  it('debug output 2', async () => {
    const p4 = parseFixture(readFileSync(FIXTURE_PATH, 'utf8'));
    console.log('mocked patternEvents:', JSON.stringify(p4.mocked_ai_precompile_output.patternEvents, null, 2));
    const r4 = await runFixture(p4);

    console.log('outcome:', r4.outcome);
    console.log('directives:', r4.terminalArtifacts.directives.length);
    console.log('downstreamQueue:', r4.terminalArtifacts.downstreamQueue?.length);
    console.log('gaps:', r4.terminalArtifacts.gaps.map(g => g.message));
    console.log('total events:', r4.terminalArtifacts.events.length);
    console.log('all event types:', [...new Set(r4.terminalArtifacts.events.map(e => e.event_type))]);
    console.log('all event IDs:', r4.terminalArtifacts.events.map(e => e.eventId));
    
    expect(true).toBe(true);
  });
});
