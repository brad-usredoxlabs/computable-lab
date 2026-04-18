import { describe, expect, it } from 'vitest';
import { checkStructuralCorrespondence } from './StructuralCorrespondencePass.js';

describe('StructuralCorrespondencePass', () => {
  describe('equal sequences', () => {
    it('returns ok: true for two equal sequences of length >= 2', () => {
      const upper = ['mix', 'transfer', 'incubate'];
      const lower = ['mix', 'transfer', 'incubate'];

      const result = checkStructuralCorrespondence(upper, lower);

      expect(result.ok).toBe(true);
      expect(result.mismatches).toEqual([]);
    });

    it('returns ok: true for two empty sequences', () => {
      const upper: string[] = [];
      const lower: string[] = [];

      const result = checkStructuralCorrespondence(upper, lower);

      expect(result.ok).toBe(true);
      expect(result.mismatches).toEqual([]);
    });

    it('returns ok: true for two equal sequences of length 1', () => {
      const upper = ['mix'];
      const lower = ['mix'];

      const result = checkStructuralCorrespondence(upper, lower);

      expect(result.ok).toBe(true);
      expect(result.mismatches).toEqual([]);
    });
  });

  describe('length mismatch', () => {
    it('returns ok: false when upper is longer than lower', () => {
      const upper = ['mix', 'transfer', 'incubate'];
      const lower = ['mix', 'transfer'];

      const result = checkStructuralCorrespondence(upper, lower);

      expect(result.ok).toBe(false);
      expect(result.mismatches).toHaveLength(1);
      expect(result.mismatches[0]?.position).toBe(2);
      expect(result.mismatches[0]?.upperVerb).toBe('incubate');
      expect(result.mismatches[0]?.lowerVerb).toBeUndefined();
      expect(result.mismatches[0]?.reason).toContain('Length mismatch');
    });

    it('returns ok: false when lower is longer than upper', () => {
      const upper = ['mix'];
      const lower = ['mix', 'transfer', 'incubate'];

      const result = checkStructuralCorrespondence(upper, lower);

      expect(result.ok).toBe(false);
      expect(result.mismatches).toHaveLength(1);
      expect(result.mismatches[0]?.position).toBe(1);
      expect(result.mismatches[0]?.upperVerb).toBeUndefined();
      expect(result.mismatches[0]?.lowerVerb).toBe('transfer');
      expect(result.mismatches[0]?.reason).toContain('Length mismatch');
    });

    it('reports only the first extra/missing entry for length mismatch', () => {
      const upper = ['a', 'b', 'c', 'd', 'e'];
      const lower = ['a', 'b'];

      const result = checkStructuralCorrespondence(upper, lower);

      expect(result.ok).toBe(false);
      expect(result.mismatches).toHaveLength(1);
      expect(result.mismatches[0]?.position).toBe(2);
    });
  });

  describe('verb mismatch', () => {
    it('returns ok: false with mismatch at the correct position for single verb mismatch', () => {
      const upper = ['mix', 'transfer', 'incubate'];
      const lower = ['mix', 'read', 'incubate'];

      const result = checkStructuralCorrespondence(upper, lower);

      expect(result.ok).toBe(false);
      expect(result.mismatches).toHaveLength(1);
      expect(result.mismatches[0]?.position).toBe(1);
      expect(result.mismatches[0]?.upperVerb).toBe('transfer');
      expect(result.mismatches[0]?.lowerVerb).toBe('read');
      expect(result.mismatches[0]?.reason).toContain('verb');
    });

    it('reports all verb mismatches when sequences are equal length', () => {
      const upper = ['mix', 'transfer', 'incubate', 'read'];
      const lower = ['mix', 'aliquot', 'incubate', 'read'];

      const result = checkStructuralCorrespondence(upper, lower);

      expect(result.ok).toBe(false);
      expect(result.mismatches).toHaveLength(1);
      expect(result.mismatches[0]?.position).toBe(1);
      expect(result.mismatches[0]?.upperVerb).toBe('transfer');
      expect(result.mismatches[0]?.lowerVerb).toBe('aliquot');
    });

    it('reports multiple verb mismatches across the sequence', () => {
      const upper = ['mix', 'transfer', 'incubate'];
      const lower = ['read', 'transfer', 'centrifuge'];

      const result = checkStructuralCorrespondence(upper, lower);

      expect(result.ok).toBe(false);
      expect(result.mismatches).toHaveLength(2);
      expect(result.mismatches[0]?.position).toBe(0);
      expect(result.mismatches[0]?.upperVerb).toBe('mix');
      expect(result.mismatches[0]?.lowerVerb).toBe('read');
      expect(result.mismatches[1]?.position).toBe(2);
      expect(result.mismatches[1]?.upperVerb).toBe('incubate');
      expect(result.mismatches[1]?.lowerVerb).toBe('centrifuge');
    });
  });

  describe('edge cases', () => {
    it('handles sequences with undefined-like empty strings', () => {
      const upper = ['mix', '', 'incubate'];
      const lower = ['mix', 'transfer', 'incubate'];

      const result = checkStructuralCorrespondence(upper, lower);

      expect(result.ok).toBe(false);
      expect(result.mismatches).toHaveLength(1);
      expect(result.mismatches[0]?.position).toBe(1);
      expect(result.mismatches[0]?.upperVerb).toBe('');
      expect(result.mismatches[0]?.lowerVerb).toBe('transfer');
    });

    it('is pure: same inputs always produce same outputs', () => {
      const upper = ['mix', 'transfer'];
      const lower = ['mix', 'read'];

      const result1 = checkStructuralCorrespondence(upper, lower);
      const result2 = checkStructuralCorrespondence(upper, lower);

      expect(result1).toEqual(result2);
    });
  });
});
