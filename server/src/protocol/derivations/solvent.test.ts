import { describe, it, expect } from 'vitest';
import solvent from './solvent.js';

describe('solvent', () => {
  it('returns the string from { solvent: string }', () => {
    const result = solvent({ solvent: 'DMSO' });
    expect(result).toEqual({ ok: true, value: 'DMSO' });
  });

  it('returns id from { solvent: { id: string } }', () => {
    const result = solvent({ solvent: { id: 'DMSO', label: 'Dimethyl sulfoxide' } });
    expect(result).toEqual({ ok: true, value: 'DMSO' });
  });

  it('returns the string from { solventRef: string }', () => {
    const result = solvent({ solventRef: 'DMSO' });
    expect(result).toEqual({ ok: true, value: 'DMSO' });
  });

  it('returns id from { solventRef: { id: string } }', () => {
    const result = solvent({ solventRef: { id: 'DMSO' } });
    expect(result).toEqual({ ok: true, value: 'DMSO' });
  });

  it('returns ok: false for a formulation with no solvent at all', () => {
    const result = solvent({ solute: 'NaCl' });
    expect(result).toEqual({ ok: false, reason: 'no solvent found on formulation input' });
  });

  it('returns ok: false for null', () => {
    const result = solvent(null);
    expect(result).toEqual({ ok: false, reason: 'no solvent found on formulation input' });
  });

  it('returns ok: false for undefined', () => {
    const result = solvent(undefined);
    expect(result).toEqual({ ok: false, reason: 'no solvent found on formulation input' });
  });
});
