import { describe, it, expect } from 'vitest';
import labwareRole from './labware_role.js';

describe('labware_role', () => {
  it('returns the string for a plain labware role', () => {
    const result = labwareRole('reagents-reservoir');
    expect(result).toEqual({ ok: true, value: 'reagents-reservoir' });
  });

  it('passes auto-generated labware role through unchanged', () => {
    const result = labwareRole('auto:reagents-reservoir:staging');
    expect(result).toEqual({ ok: true, value: 'auto:reagents-reservoir:staging' });
  });

  it('returns role from { role: string }', () => {
    const result = labwareRole({ role: 'plate' });
    expect(result).toEqual({ ok: true, value: 'plate' });
  });

  it('returns roleId from { roleId: string }', () => {
    const result = labwareRole({ roleId: 'plate' });
    expect(result).toEqual({ ok: true, value: 'plate' });
  });

  it('returns labwareRole from { labwareRole: string }', () => {
    const result = labwareRole({ labwareRole: 'plate' });
    expect(result).toEqual({ ok: true, value: 'plate' });
  });

  it('returns ok: false for null', () => {
    const result = labwareRole(null);
    expect(result).toEqual({ ok: false, reason: 'no labware role found on input' });
  });

  it('returns ok: false for undefined', () => {
    const result = labwareRole(undefined);
    expect(result).toEqual({ ok: false, reason: 'no labware role found on input' });
  });

  it('returns ok: false for empty string', () => {
    const result = labwareRole('');
    expect(result).toEqual({ ok: false, reason: 'no labware role found on input' });
  });

  it('returns ok: false for {}', () => {
    const result = labwareRole({});
    expect(result).toEqual({ ok: false, reason: 'no labware role found on input' });
  });
});
