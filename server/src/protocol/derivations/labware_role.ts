import type { Derivation } from './types.js';

const labwareRole: Derivation = (input) => {
  if (typeof input === 'string' && input.length > 0) {
    return { ok: true, value: input };
  }
  if (typeof input === 'object' && input !== null) {
    const obj = input as Record<string, unknown>;
    for (const key of ['role', 'roleId', 'labwareRole']) {
      const v = obj[key];
      if (typeof v === 'string' && v.length > 0) {
        return { ok: true, value: v };
      }
    }
  }
  return { ok: false, reason: 'no labware role found on input' };
};

export default labwareRole;
