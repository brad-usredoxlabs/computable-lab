import { describe, it, expect } from 'vitest';
import { getPatternExpander, clearPatternExpanders } from '../../patterns/PatternExpanders.js';

describe('Pattern expanders registration', () => {
  it('should have triplicate_stamp expander', () => {
    const expander = getPatternExpander('triplicate_stamp');
    expect(expander).toBeDefined();
  });

  it('should have column_stamp_differentiated expander', () => {
    const expander = getPatternExpander('column_stamp_differentiated');
    expect(expander).toBeDefined();
  });

  it('should have quadrant_stamp expander', () => {
    const expander = getPatternExpander('quadrant_stamp');
    expect(expander).toBeDefined();
  });
});
