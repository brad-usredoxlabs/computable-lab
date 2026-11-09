/**
 * refSelectionValue — the ref SELECTION → canonical ref OBJECT boundary.
 *
 * W2 part 2 (typed sub-fields through the existing widget switch): a
 * `widget: ref` sub-field that renders the EXISTING RefCombobox picker must
 * commit the SAME canonical ref OBJECT the top-level FieldRow ref arm
 * commits for an ontology-ref field (datatypes/ref.schema.yaml ontology
 * shape: {kind: ontology, id: <CURIE>, namespace, label, uri?}) — never a
 * free-text string. The object construction (CURIE derivation from the
 * resolved term + the ref shape) lives HERE, as the single shared site, so
 * the FieldRow top-level arm and the ObjectWidget sub-field arm cannot drift
 * into two rival dialects of one entity.
 *
 * Pure module (no React, no apiClient) — testable in isolation.
 */

/**
 * Derive the CURIE + namespace from a resolved ontology term — the SAME
 * resolution the top-level ref arm applies (oboId/CURIE first, IRI tail
 * second, ontology-namespace + label-derived id as the last resort).
 * Returns null when no CURIE can be derived honestly (the caller then keeps
 * the raw value — a guessed CURIE is never invented here).
 */
export function curieFromOntologyTerm(term: {
  label: string;
  iri?: string;
  definition?: string;
  synonyms?: string[];
  ontology?: string;
  oboId?: string;
}): { curie: string; namespace: string } | null {
  if (term.oboId && /^[A-Za-z][A-Za-z0-9_]*:[A-Za-z0-9_]+$/.test(term.oboId)) {
    const namespace = term.oboId.split(':')[0]!.toUpperCase();
    return { curie: `${namespace}:${term.oboId.split(':').slice(1).join(':')}`, namespace };
  }
  const iriTail = term.iri?.split(/[/#]/).filter(Boolean).pop();
  if (iriTail && /^[A-Za-z][A-Za-z0-9]+_[A-Za-z0-9_]+$/.test(iriTail)) {
    const [prefix, ...rest] = iriTail.split('_');
    return { curie: `${prefix!.toUpperCase()}:${rest.join('_')}`, namespace: prefix!.toUpperCase() };
  }
  const namespace = term.ontology?.trim().toUpperCase();
  if (!namespace) return null;
  const id = term.label.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return { curie: `${namespace}:${id}`, namespace };
}

/**
 * Build the canonical ref OBJECT for a ref-picker selection.
 *
 * Mirrors the FieldRow ontology-ref arm byte-for-byte (the {kind:'ontology',
 * id, namespace, label, uri?} shape — `uri` present ONLY when the term
 * carries an IRI). Returns the raw committed value when the selection is NOT
 * an ontology term or no CURIE can be derived (absent-derivation = keep what
 * the picker committed; a guessed CURIE is never minted here).
 */
export function commitRefSelection(
  v: string,
  source: 'local' | 'ontology',
  t?: {
    label: string;
    iri?: string;
    definition?: string;
    synonyms?: string[];
    ontology?: string;
    oboId?: string;
  },
): unknown {
  if (source === 'ontology' && t) {
    const curie = curieFromOntologyTerm(t);
    return curie
      ? {
          kind: 'ontology',
          id: curie.curie,
          namespace: curie.namespace,
          label: t.label,
          ...(t.iri ? { uri: t.iri } : {}),
        }
      : v;
  }
  return v;
}
