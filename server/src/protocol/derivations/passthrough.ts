import type { Derivation } from './types.js';

const passthrough: Derivation = (input) => {
  if (typeof input === 'string' && input.length > 0) {
    return { ok: true, value: input };
  }
  return { ok: false, reason: 'expected non-empty string' };
};

export default passthrough;
