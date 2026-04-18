import { describe, it, expect } from 'vitest';
import { flagRetractionReferences, RecordLike, RetractionFlag } from './RetractionCrossReferenceFlagger.js';

describe('RetractionCrossReferenceFlagger', () => {
  describe('flagRetractionReferences', () => {
    it('Direct reference flagged: top-level claim_ref to retracted claim', () => {
      const records: RecordLike[] = [
        {
          kind: 'claim',
          id: 'CLM-1',
          status: 'retracted',
          text: 'This claim is retracted',
        },
        {
          kind: 'evidence',
          id: 'EVD-1',
          claim_ref: {
            kind: 'record',
            id: 'CLM-1',
            type: 'claim',
          },
        },
      ];

      const result = flagRetractionReferences(records);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        referencing_record_id: 'EVD-1',
        referencing_record_kind: 'evidence',
        retracted_target_id: 'CLM-1',
        retracted_target_kind: 'claim',
        field_path: 'claim_ref',
      });
    });

    it('Array reference flagged: evidence_refs[0] to retracted assertion', () => {
      const records: RecordLike[] = [
        {
          kind: 'assertion',
          id: 'ASN-RETRACTED',
          status: 'retracted',
          text: 'This assertion is retracted',
        },
        {
          kind: 'observation',
          id: 'OBS-1',
          evidence_refs: [
            {
              kind: 'record',
              id: 'ASN-RETRACTED',
              type: 'assertion',
            },
          ],
        },
      ];

      const result = flagRetractionReferences(records);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        referencing_record_id: 'OBS-1',
        referencing_record_kind: 'observation',
        retracted_target_id: 'ASN-RETRACTED',
        retracted_target_kind: 'assertion',
        field_path: 'evidence_refs[0]',
      });
    });

    it('Nested reference flagged: outcome.target to retracted assertion', () => {
      const records: RecordLike[] = [
        {
          kind: 'assertion',
          id: 'ASN-R',
          status: 'retracted',
          text: 'Retracted assertion',
        },
        {
          kind: 'analysis',
          id: 'ANA-1',
          outcome: {
            target: {
              kind: 'record',
              id: 'ASN-R',
              type: 'assertion',
            },
            result: 'confirmed',
          },
        },
      ];

      const result = flagRetractionReferences(records);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        referencing_record_id: 'ANA-1',
        referencing_record_kind: 'analysis',
        retracted_target_id: 'ASN-R',
        retracted_target_kind: 'assertion',
        field_path: 'outcome.target',
      });
    });

    it('Retracted-to-retracted suppressed: no flags when retracted record references another retracted record', () => {
      const records: RecordLike[] = [
        {
          kind: 'claim',
          id: 'CLM-1',
          status: 'retracted',
          text: 'First retracted claim',
        },
        {
          kind: 'claim',
          id: 'CLM-2',
          status: 'retracted',
          text: 'Second retracted claim that references the first',
          related_claim: {
            kind: 'record',
            id: 'CLM-1',
            type: 'claim',
          },
        },
      ];

      const result = flagRetractionReferences(records);
      expect(result).toHaveLength(0);
    });

    it('Non-retracted target ignored: ref to active claim produces no flags', () => {
      const records: RecordLike[] = [
        {
          kind: 'claim',
          id: 'CLM-ACTIVE',
          status: 'active',
          text: 'This claim is active',
        },
        {
          kind: 'evidence',
          id: 'EVD-1',
          claim_ref: {
            kind: 'record',
            id: 'CLM-ACTIVE',
            type: 'claim',
          },
        },
      ];

      const result = flagRetractionReferences(records);
      expect(result).toHaveLength(0);
    });

    it('Type/kind mismatch ignored: ref type claim but target is retracted assertion', () => {
      const records: RecordLike[] = [
        {
          kind: 'assertion',
          id: 'ASN-MISMATCH',
          status: 'retracted',
          text: 'This is a retracted assertion',
        },
        {
          kind: 'evidence',
          id: 'EVD-1',
          claim_ref: {
            kind: 'record',
            id: 'ASN-MISMATCH',
            type: 'claim', // Wrong type - points to an assertion but says claim
          },
        },
      ];

      const result = flagRetractionReferences(records);
      expect(result).toHaveLength(0);
    });

    it('Deeply nested reference flagged: multiple levels of nesting', () => {
      const records: RecordLike[] = [
        {
          kind: 'claim',
          id: 'CLM-DEEP',
          status: 'retracted',
        },
        {
          kind: 'protocol',
          id: 'PROT-1',
          steps: [
            {
              action: 'verify',
              reference: {
                nested: {
                  target: {
                    kind: 'record',
                    id: 'CLM-DEEP',
                    type: 'claim',
                  },
                },
              },
            },
          ],
        },
      ];

      const result = flagRetractionReferences(records);
      expect(result).toHaveLength(1);
      expect(result[0].field_path).toBe('steps[0].reference.nested.target');
      expect(result[0].retracted_target_id).toBe('CLM-DEEP');
    });

    it('Multiple references to same retracted target produce separate flags', () => {
      const records: RecordLike[] = [
        {
          kind: 'assertion',
          id: 'ASN-MULTI',
          status: 'retracted',
        },
        {
          kind: 'analysis',
          id: 'ANA-1',
          primary_ref: {
            kind: 'record',
            id: 'ASN-MULTI',
            type: 'assertion',
          },
          secondary_ref: {
            kind: 'record',
            id: 'ASN-MULTI',
            type: 'assertion',
          },
        },
      ];

      const result = flagRetractionReferences(records);
      expect(result).toHaveLength(2);
      const paths = result.map((f) => f.field_path).sort();
      expect(paths).toEqual(['primary_ref', 'secondary_ref']);
    });

    it('Record without id uses recordId fallback', () => {
      const records: RecordLike[] = [
        {
          kind: 'claim',
          id: 'CLM-NO-ID',
          status: 'retracted',
        },
        {
          kind: 'evidence',
          recordId: 'EVD-NO-ID',
          claim_ref: {
            kind: 'record',
            id: 'CLM-NO-ID',
            type: 'claim',
          },
        },
      ];

      const result = flagRetractionReferences(records);
      expect(result).toHaveLength(1);
      expect(result[0].referencing_record_id).toBe('EVD-NO-ID');
    });

    it('Unknown record id handled gracefully with fallback', () => {
      const records: RecordLike[] = [
        {
          kind: 'claim',
          id: 'CLM-UNKNOWN-TARGET',
          status: 'retracted',
        },
        {
          kind: 'evidence',
          // No id or recordId
          claim_ref: {
            kind: 'record',
            id: 'CLM-UNKNOWN-TARGET',
            type: 'claim',
          },
        },
      ];

      const result = flagRetractionReferences(records);
      expect(result).toHaveLength(1);
      expect(result[0].referencing_record_id).toBe('<unknown>');
    });

    it('Cyclic reference does not cause infinite loop', () => {
      const retractedClaim: RecordLike = {
        kind: 'claim',
        id: 'CLM-CYCLE',
        status: 'retracted',
      };

      const cyclicRecord: RecordLike = {
        kind: 'analysis',
        id: 'ANA-CYCLE',
      };

      // Create a cyclic structure
      (cyclicRecord as unknown as Record<string, unknown>).self = cyclicRecord;
      (cyclicRecord as unknown as Record<string, unknown>).ref = {
        kind: 'record',
        id: 'CLM-CYCLE',
        type: 'claim',
      };

      const records: RecordLike[] = [retractedClaim, cyclicRecord];

      // Should not throw or hang
      const result = flagRetractionReferences(records);
      
      // Should find the ref despite the cycle
      expect(result).toHaveLength(1);
      expect(result[0].retracted_target_id).toBe('CLM-CYCLE');
    });

    it('Empty records array returns empty result', () => {
      const result = flagRetractionReferences([]);
      expect(result).toHaveLength(0);
    });

    it('Only retracted records returns empty result', () => {
      const records: RecordLike[] = [
        {
          kind: 'claim',
          id: 'CLM-1',
          status: 'retracted',
        },
        {
          kind: 'assertion',
          id: 'ASN-1',
          status: 'retracted',
        },
      ];

      const result = flagRetractionReferences(records);
      expect(result).toHaveLength(0);
    });

    it('Mixed valid and invalid ref types handled correctly', () => {
      const records: RecordLike[] = [
        {
          kind: 'claim',
          id: 'CLM-VALID',
          status: 'retracted',
        },
        {
          kind: 'assertion',
          id: 'ASN-VALID',
          status: 'retracted',
        },
        {
          kind: 'analysis',
          id: 'ANA-1',
          valid_claim_ref: {
            kind: 'record',
            id: 'CLM-VALID',
            type: 'claim',
          },
          valid_assertion_ref: {
            kind: 'record',
            id: 'ASN-VALID',
            type: 'assertion',
          },
          invalid_ref: {
            kind: 'record',
            id: 'SOME-ID',
            type: 'unknown-type', // Invalid type
          },
        },
      ];

      const result = flagRetractionReferences(records);
      expect(result).toHaveLength(2);
      const paths = result.map((f) => f.field_path).sort();
      expect(paths).toEqual(['valid_assertion_ref', 'valid_claim_ref']);
    });
  });
});
