/**
 * L2-CLARIFY-CARD-1 D2 — the mint-blob-label defect: when the model emits a
 * serialized structured token {mint:{label:clofibrate,domain:chemical}} as the
 * fact's label, the clarification prompt/query/mint label must carry the INNER
 * human label "clofibrate", never the serialized blob.
 *
 * The model's tool/args shape declares the mint inner key as `label` — see
 * server/src/resolve/types.ts:74 `mint?: { label: string; domain?: string }`.
 *
 * The raw `unresolvedFact.label` must keep the verbatim model output (provenance).
 */
import { describe, expect, it } from 'vitest';
import { clarificationsFromUnresolvedFacts } from './shorthandChat.js';
import type { ScientistIntentUnresolvedFact } from '../compiler/scientistIntent/types.js';

const BLOB_LABEL = '{mint:{label:clofibrate,domain:chemical}}';

function blobFact(label: string, reason = 'unknown-noun'): ScientistIntentUnresolvedFact {
  return {
    label,
    reason,
    actionLocation: { actionIndex: 0, action: 'add_material', argument: 'material' },
  };
}

describe('CARD-1 D2: mint blob label — display must extract inner label', () => {
  it('the blob label is NOT rendered verbatim — inner label extracted for prompt and query', () => {
    const requests = clarificationsFromUnresolvedFacts([blobFact(BLOB_LABEL)]);
    expect(requests).toHaveLength(1);
    const [request] = requests;

    // The prompt must name the inner label, not the blob serialization
    expect(request.prompt).not.toContain(BLOB_LABEL);
    expect(request.prompt).toContain('clofibrate');

    // The query must be the inner label (the mint preview seeds from this)
    expect(request.query).toBe('clofibrate');

    // The raw unresolvedFact keeps the verbatim model output (provenance contract)
    expect(request.unresolvedFact!.label).toBe(BLOB_LABEL);

    // The inner label "clofibrate" is mintable — allowCreateLocal must be true
    expect(request.allowCreateLocal).toBe(true);
  });

  it('a plain string label is byte-identical — no regression', () => {
    const plainLabel = 'Enigma Broth';
    const requests = clarificationsFromUnresolvedFacts([blobFact(plainLabel)]);
    expect(requests).toHaveLength(1);
    const [request] = requests;

    // Plain labels pass through the extraction unchanged, then ride the
    // identity form (canonicalLabelKey lowercases for display).
    // The raw label on unresolvedFact is byte-identical to input.
    expect(request.query).toBe('enigma broth');
    expect(request.unresolvedFact!.label).toBe(plainLabel);
    expect(request.prompt).toContain('enigma broth');
    expect(request.allowCreateLocal).toBe(true);
  });

  it('a blob with no usable inner label falls back gracefully', () => {
    const malformedBlob = '{mint:{domain:chemical}}';
    const requests = clarificationsFromUnresolvedFacts([blobFact(malformedBlob)]);
    expect(requests).toHaveLength(1);
    const [request] = requests;

    // No inner label → query should not render the blob serialization
    expect(request.query).not.toBe(malformedBlob);
    expect(request.prompt).not.toContain(malformedBlob);
  });
});
