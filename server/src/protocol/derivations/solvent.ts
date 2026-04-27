import type { Derivation } from './types.js';

const solvent: Derivation = (input) => {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, reason: 'no solvent found on formulation input' };
  }
  const obj = input as Record<string, unknown>;

  // Check `solvent` field
  const solventVal = obj.solvent;
  if (typeof solventVal === 'string' && solventVal.length > 0) {
    return { ok: true, value: solventVal };
  }
  if (typeof solventVal === 'object' && solventVal !== null) {
    const sv = solventVal as Record<string, unknown>;
    if (typeof sv.id === 'string' && sv.id.length > 0) {
      return { ok: true, value: sv.id };
    }
  }

  // Check `solventRef` field
  const solventRefVal = obj.solventRef;
  if (typeof solventRefVal === 'string' && solventRefVal.length > 0) {
    return { ok: true, value: solventRefVal };
  }
  if (typeof solventRefVal === 'object' && solventRefVal !== null) {
    const sr = solventRefVal as Record<string, unknown>;
    if (typeof sr.id === 'string' && sr.id.length > 0) {
      return { ok: true, value: sr.id };
    }
  }

  return { ok: false, reason: 'no solvent found on formulation input' };
};

export default solvent;
