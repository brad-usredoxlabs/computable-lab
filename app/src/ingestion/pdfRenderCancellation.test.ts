/**
 * A superseded paint is not a failure.
 *
 * pdf.js raises RenderingCancelledException when a render task is cancelled,
 * which happens by design here: a zoom, a pane measure, or a payload arriving
 * starts a newer paint of the same page, and the older one is stopped so the
 * page is never painted twice onto one canvas (twice = upside-down, because the
 * viewport transform is a y-flip).
 */

import { describe, expect, it } from 'vitest';
import { isCancelledRender } from './pdfRenderCancellation.js';

describe('isCancelledRender', () => {
  it('recognises the cancellation pdf.js raises', () => {
    const error = new Error('Rendering cancelled');
    error.name = 'RenderingCancelledException';
    expect(isCancelledRender(error)).toBe(true);
  });

  it('does not swallow a real rendering failure', () => {
    expect(isCancelledRender(new Error('Failed to fetch page'))).toBe(false);
    expect(isCancelledRender({ name: 'InvalidPDFException' })).toBe(false);
  });

  it('survives a thrown non-object', () => {
    expect(isCancelledRender(undefined)).toBe(false);
    expect(isCancelledRender(null)).toBe(false);
    expect(isCancelledRender('Rendering cancelled')).toBe(false);
  });
});
