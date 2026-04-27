import type { Derivation } from './types.js';

const modality: Derivation = (input) => {
  if (typeof input === 'string' && input.length > 0) {
    return { ok: true, value: input };
  }
  return { ok: false, reason: 'expected non-empty string for modality' };
};

export default modality;
