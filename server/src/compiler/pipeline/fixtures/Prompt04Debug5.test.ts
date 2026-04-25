import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFixture } from './FixtureTypes.js';
import { runFixture } from './FixtureRunner.js';
import { getPatternExpander } from '../../patterns/PatternExpanders.js';

describe('Prompt 04 - debug 5', () => {
  it('check pattern expanders before and after', async () => {
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
    
    expect(true).toBe(true);
  });
});
