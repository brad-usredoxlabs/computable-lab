import type { Derivation } from './types.js';

const substanceId: Derivation = (input) => {
  if (typeof input === 'string' && input.length > 0) {
    return { ok: true, value: input };
  }
  if (
    typeof input === 'object' &&
    input !== null &&
    'id' in input &&
    typeof (input as { id: unknown }).id === 'string' &&
    (input as { id: string }).id.length > 0
  ) {
    return { ok: true, value: (input as { id: string }).id };
  }
  return { ok: false, reason: 'expected substance id string or { id: string }' };
};

export default substanceId;
