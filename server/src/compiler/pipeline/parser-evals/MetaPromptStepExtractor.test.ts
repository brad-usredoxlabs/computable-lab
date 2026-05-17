import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractNumberedProtocolPrompt,
  extractNumberedProtocolSteps,
} from './MetaPromptStepExtractor.js';

const REPO_ROOT = resolve(__dirname, '../../../../..');

describe('MetaPromptStepExtractor', () => {
  it('extracts only numbered protocol paragraphs from the PCR stamp meta-prompt', () => {
    const markdown = readFileSync(
      resolve(REPO_ROOT, 'specifications/pcr-stamp-prompt.md'),
      'utf8',
    );

    const steps = extractNumberedProtocolSteps(markdown);

    expect(steps).toEqual([
      {
        index: 1,
        sourceLine: 10,
        text: '[The biologist uploads a .csv file of sample ids.] Place a 96-well PCR plate loaded eith samples on deck position D2.',
      },
      {
        index: 2,
        sourceLine: 14,
        text: 'Put a 12-well reservoir with a master mix including primers and probes loaded into slot 1 on deck position B2.',
      },
      {
        index: 3,
        sourceLine: 19,
        text: 'Place three 384 well PCR plates on deck slots C1-C3',
      },
      {
        index: 4,
        sourceLine: 21,
        text: 'We are going to stamp out the samples in triplicate into each of the three PCR plates using the 8-channel, 1000uL pipette (5uL minimum volume). If we are talking about A1 in the 96-well sample plate, this maps to wells A1, A2 and B1 in the target 384-well plate. We will start with the Master Mix, this can be broadcast across all 108 wells serviced by each pipette tip in a multi-dispense.',
      },
      {
        index: 5,
        sourceLine: 23,
        text: 'Now stamp out the samples, using a 5uL multi-dispense corresponding to each of the 3 wells in each 384 well plates that map to the 96 well plate, 9 wells total per pipette tip.',
      },
    ]);

    const prompt = extractNumberedProtocolPrompt(markdown);
    expect(prompt).not.toContain('SHould we prompt them');
    expect(prompt).not.toContain('10% overrun');
    expect(prompt).not.toContain('Overview');
    expect(prompt).toContain('Place a 96-well PCR plate');
  });

  it('keeps wrapped lines inside a numbered step until the first blank line', () => {
    const markdown = [
      '# Meta',
      '',
      '1. Add a source plate',
      '   with samples on deck slot D2.',
      '',
      'This is commentary.',
      '',
      '2. Transfer 5uL to the target plate.',
      '',
    ].join('\n');

    expect(extractNumberedProtocolSteps(markdown)).toEqual([
      {
        index: 1,
        sourceLine: 3,
        text: 'Add a source plate with samples on deck slot D2.',
      },
      {
        index: 2,
        sourceLine: 8,
        text: 'Transfer 5uL to the target plate.',
      },
    ]);
  });
});
