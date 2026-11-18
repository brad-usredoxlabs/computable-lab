/**
 * Material Selection Policy loader — normalizes policy records and indexes them
 * by material concept ref. Rejects duplicate `only` claims for the same concept,
 * naming both record IDs in the error.
 *
 * The cross-record `only` uniqueness check lives HERE, not in the lint engine,
 * because LintEngine.ts:143 silently skips any scope != 'record' (documented gap).
 */

/** A parsed material selection policy record (matches the schema). */
export interface MaterialSelectionPolicyRecord {
  kind: 'material-selection-policy';
  recordId: string;
  title: string;
  material_ref: { kind: 'ontology' | 'record'; id: string };
  vendor_product_ref: { kind: 'ontology' | 'record'; id: string };
  selection: 'only' | 'default' | 'alternative';
  since: string;
  reason?: string;
}

/**
 * Map of material concept ref -> policy record(s), keyed by the concept's
 * kind:id (e.g. "ontology:CHEBI:12345" or "record:MAT-HEPG2").
 */
export type MaterialPolicyIndex = Map<string, MaterialSelectionPolicyRecord[]>;

/**
 * Normalize an array of parsed policy records into an index keyed by material
 * concept ref. Throws a single Error naming BOTH recordIds when two records
 * claim `selection: only` for the same concept.
 *
 * Does NOT branch on schema name, vendor name, or catalogue-number string.
 */
export function normalizeMaterialSelectionPolicies(
  records: MaterialSelectionPolicyRecord[],
): MaterialPolicyIndex {
  const index = new Map<string, MaterialSelectionPolicyRecord[]>();

  for (const record of records) {
    const conceptKey = `${record.material_ref.kind}:${record.material_ref.id}`;
    const existing = index.get(conceptKey);
    if (existing === undefined) {
      index.set(conceptKey, [record]);
    } else {
      existing.push(record);
    }
  }

  // Check for duplicate 'only' claims on the same concept
  for (const [conceptKey, policies] of index) {
    const onlyPolicies = policies.filter((p) => p.selection === 'only');
    if (onlyPolicies.length > 1) {
      const ids = onlyPolicies.map((p) => p.recordId);
      throw new Error(
        `Duplicate 'only' selection for material concept ${conceptKey}: ` +
          `${ids[0]} and ${ids[1]}`,
      );
    }
  }

  return index;
}
