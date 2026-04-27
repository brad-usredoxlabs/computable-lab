import { describe, it, expect } from 'vitest';
import passthrough from './passthrough.js';
import modality from './modality.js';
import substanceId from './substance_id.js';
import programId from './program_id.js';
import { derivations } from './index.js';

describe('passthrough', () => {
  it('returns ok with a non-empty string', () => {
    const result = passthrough('absorbance');
    expect(result).toEqual({ ok: true, value: 'absorbance' });
  });

  it('returns ok:false for an empty string', () => {
    const result = passthrough('');
    expect(result).toEqual({ ok: false, reason: 'expected non-empty string' });
  });
});

describe('modality', () => {
  it('returns ok with a non-empty string', () => {
    const result = modality('absorbance');
    expect(result).toEqual({ ok: true, value: 'absorbance' });
  });

  it('returns ok:false for null', () => {
    const result = modality(null);
    expect(result).toEqual({ ok: false, reason: 'expected non-empty string for modality' });
  });
});

describe('substance_id', () => {
  it('returns ok with a non-empty string', () => {
    const result = substanceId('CHEM-001');
    expect(result).toEqual({ ok: true, value: 'CHEM-001' });
  });

  it('returns ok with an object that has an id field', () => {
    const result = substanceId({ id: 'CHEM-002' });
    expect(result).toEqual({ ok: true, value: 'CHEM-002' });
  });

  it('returns ok:false for an object missing the id field', () => {
    const result = substanceId({ name: 'water' });
    expect(result).toEqual({ ok: false, reason: 'expected substance id string or { id: string }' });
  });
});

describe('program_id', () => {
  it('returns ok with a non-empty string', () => {
    const result = programId('PROG-001');
    expect(result).toEqual({ ok: true, value: 'PROG-001' });
  });

  it('returns ok with an object that has an id field', () => {
    const result = programId({ id: 'PROG-002' });
    expect(result).toEqual({ ok: true, value: 'PROG-002' });
  });

  it('returns ok:false for an object missing the id field', () => {
    const result = programId({ name: 'run1' });
    expect(result).toEqual({ ok: false, reason: 'expected program id string or { id: string }' });
  });
});

describe('derivations registry', () => {
  it('exports exactly the seven expected keys', () => {
    const keys = Object.keys(derivations);
    expect(keys).toEqual(['passthrough', 'modality', 'substance_id', 'program_id', 'labware_role', 'solvent', 'active_ingredients']);
  });
});
