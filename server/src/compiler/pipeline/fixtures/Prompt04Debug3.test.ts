import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFixture } from './FixtureTypes.js';
import { runFixture } from './FixtureRunner.js';
import { getPatternExpander } from '../../patterns/PatternExpanders.js';

describe('Prompt 04 - debug 3', () => {
  it('check pattern expanders after runFixture', async () => {
    const p4 = parseFixture(readFileSync(resolve(__dirname, 'prompt-04-fire-assay.yaml'), 'utf8'));
    const r4 = await runFixture(p4);

    // Check if pattern expanders are registered after runFixture
    console.log('triplicate_stamp expander:', getPatternExpander('triplicate_stamp') !== undefined);
    console.log('column_stamp_differentiated expander:', getPatternExpander('column_stamp_differentiated') !== undefined);
    console.log('quadrant_stamp expander:', getPatternExpander('quadrant_stamp') !== undefined);
    
    console.log('total events:', r4.terminalArtifacts.events.length);
    
    expect(true).toBe(true);
  });
});
