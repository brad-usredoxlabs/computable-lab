import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFixture } from './FixtureTypes.js';
import { runFixture } from './FixtureRunner.js';
import { getPatternExpander } from '../../patterns/PatternExpanders.js';

describe('Prompt 04 - debug 7', () => {
  it('check expanders in test', async () => {
    // Check before runFixture
    console.log('Before runFixture:');
    console.log('  triplicate_stamp:', getPatternExpander('triplicate_stamp') !== undefined);
    console.log('  column_stamp_differentiated:', getPatternExpander('column_stamp_differentiated') !== undefined);
    
    const p4 = parseFixture(readFileSync(resolve(__dirname, 'prompt-04-fire-assay.yaml'), 'utf8'));
    const r4 = await runFixture(p4);

    // Check after runFixture
    console.log('After runFixture:');
    console.log('  triplicate_stamp:', getPatternExpander('triplicate_stamp') !== undefined);
    console.log('  column_stamp_differentiated:', getPatternExpander('column_stamp_differentiated') !== undefined);
    
    console.log('total events:', r4.terminalArtifacts.events.length);
    console.log('outcome:', r4.outcome);
    console.log('directives:', r4.terminalArtifacts.directives.length);
    console.log('downstreamQueue:', r4.terminalArtifacts.downstreamQueue?.length);
    console.log('gaps:', r4.terminalArtifacts.gaps.map(g => g.message));
    
    expect(true).toBe(true);
  });
});
