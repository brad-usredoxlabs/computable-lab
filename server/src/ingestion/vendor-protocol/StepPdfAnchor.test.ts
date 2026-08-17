/**
 * StepPdfAnchor — unit tests (Plan 1, F1): step → PDF text anchor.
 */

import { describe, it, expect } from 'vitest';
import { anchorForStep, spanForExtracted } from './StepPdfAnchor.js';

const PAGES = [
  { page: 1, text: 'ZymoBIOMICS 96 Kit\nStep 1. Add sample and DNA/RNA Shield.' },
  { page: 2, text: 'Step 2. Add 200 uL MagBinding Buffer to each well.' },
  { page: 3, text: 'Step 4. Wash the plate with MagWash 1.' },
];

describe('anchorForStep', () => {
  it('locates a step text on the page that contains it', () => {
    const anchor = anchorForStep(PAGES, 'Add sample and DNA/RNA Shield.', 1);
    expect(anchor.page).toBe(1);
    expect(anchor.startText).toHaveLength > 0;
  });

  it('finds a step that appears on the declared page later in the doc', () => {
    const anchor = anchorForStep(PAGES, 'Add 200 uL MagBinding Buffer to each well.', 2);
    expect(anchor.page).toBe(2);
  });

  it('falls back to pageStart with a neutral anchor when not found (never throws)', () => {
    const anchor = anchorForStep(PAGES, 'A completely missing step line.', 3);
    expect(anchor.page).toBe(3);
  });
});

describe('spanForExtracted', () => {
  it('returns a highlight span with start+end tokens for the extracted panel', () => {
    const span = spanForExtracted(PAGES, 'Add 200 uL MagBinding Buffer to each well.', 2);
    expect(span.page).toBe(2);
    expect(span.startText).toContain('Add 200');
    expect(span.endText).toBeDefined();
  });
});