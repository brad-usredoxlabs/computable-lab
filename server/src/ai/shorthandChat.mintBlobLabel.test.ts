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
import {
  clarificationsFromUnresolvedFacts,
  factRequestId,
  shorthandResultFromCompile,
} from './shorthandChat.js';
import type { ScientistIntentUnresolvedFact } from '../compiler/scientistIntent/types.js';
import type { ScientistIntentCompileResult } from '../compiler/scientistIntent/compileScientistIntent.js';
import { canonicalLabelKey } from '../materials/termId.js';

const BLOB_LABEL = '{mint:{label:clofibrate,domain:chemical}}';

function blobFact(label: string, reason = 'unknown-noun'): ScientistIntentUnresolvedFact {
  return {
    label,
    reason,
    actionLocation: { actionIndex: 0, action: 'add_material', argument: 'material' },
  };
}

function makeCompileResult(clarifications: ScientistIntentUnresolvedFact[]): ScientistIntentCompileResult {
  return {
    terminalArtifacts: { events: [], directives: [], gaps: [] },
    normalized: { candidateEvents: [], unresolvedRefs: [] },
    outcome: 'needs-clarification',
    diagnostics: [],
    clarifications,
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

// ====================================================================
// M1 — Regex fallback must capture multi-word labels
// ====================================================================
describe('M1: multi-word labels survive regex fallback extraction', () => {
  it('extractHumanLabel captures "Nile Red" from unquoted blob', () => {
    const multiWordBlob = '{mint:{label:Nile Red,domain:chemical}}';
    const requests = clarificationsFromUnresolvedFacts([blobFact(multiWordBlob)]);
    expect(requests).toHaveLength(1);
    const [request] = requests;

    // The query must be "Nile Red", not truncated to "Nile"
    expect(request.query).toBe('nile red');
    expect(request.prompt).toContain('nile red');
    expect(request.prompt).not.toContain(multiWordBlob);
  });
});

// ====================================================================
// M2 — identityKey must derive from label, never from reason
// ====================================================================
describe('M2: identity key derives from label, never from reason', () => {
  it('same label blob + different reasons -> identity key based on label, not reason', () => {
    // Use a malformed blob (no inner label) so humanLabel is undefined.
    // Without the fix, identityKey = canonicalLabelKey(reason) — different for each.
    // With the fix, identityKey = canonicalLabelKey(fact.label) — same for both.
    const malformedBlob = '{mint:{domain:chemical}}';
    const canonicalBlobKey = canonicalLabelKey(malformedBlob);

    // Pass a canonicalLabels map keyed by the blob label's canonical key
    const canonicalLabels = new Map([
      [canonicalBlobKey, 'GroundedTitle'],
    ]);

    const factA = blobFact(malformedBlob, 'reason-alpha');
    const factB = blobFact(malformedBlob, 'reason-beta');
    const requests = clarificationsFromUnresolvedFacts([factA, factB], canonicalLabels);

    // Both facts have the same blob label -> same identity key -> both hit the
    // grounded title lookup. Without the fix, factA's key would be based on
    // "reason-alpha" and factB's on "reason-beta" — neither would match the map.
    expect(requests[0].query).toBe('GroundedTitle');
    expect(requests[1].query).toBe('GroundedTitle');
  });
});

// ====================================================================
// M3 — mintRefused in looped escalation must use extracted label
// ====================================================================
describe('M3: looped escalation mintRefused uses extracted label', () => {
  it('mintable blob label reports mintRefused:false in looped escalation', () => {
    const blob = '{mint:{label:clofibrate,domain:chemical}}';
    const fact = blobFact(blob, 'unknown-noun');

    const compiled = makeCompileResult([fact]);
    const requestId = factRequestId(fact);

    const result = shorthandResultFromCompile(compiled, 'shorthand: test', '', undefined, {
      priorLoopAskCounts: { [requestId]: 2 },
    });

    // With priorLoopAskCounts of 2, this enters looped escalation
    expect(result.success).toBe(true);
    expect(result.error).toBeDefined();
    // The error should NOT include the mintRefused clause because "clofibrate" is mintable
    expect(result.error).not.toContain('mint affordance is closed');
    // The label in the error should be the extracted label "clofibrate"
    expect(result.error).toContain('clofibrate');
  });

  it('non-mintable blob label reports mintRefused:true — refusal clause present', () => {
    // "FBS with HepG2" is non-mintable per config/drafting/shorthand-drafting.yaml:52
    // pattern 2: \\b[\\p{L}]{2,}\\s+(?:with|containing|including)\\s+[\\p{L}]{2,}
    // (connective "with" flanked by multi-letter words)
    const blob = '{mint:{label:FBS with HepG2,domain:chemical}}';
    const fact = blobFact(blob, 'unknown-noun');

    const compiled = makeCompileResult([fact]);
    const requestId = factRequestId(fact);

    const result = shorthandResultFromCompile(compiled, 'shorthand: test', '', undefined, {
      priorLoopAskCounts: { [requestId]: 2 },
    });

    // With priorLoopAskCounts of 2, this enters looped escalation
    expect(result.success).toBe(true);
    expect(result.error).toBeDefined();
    // The extracted label "FBS with HepG2" is non-mintable — the error MUST contain
    // the refusal clause (this is the positive pin for M3)
    expect(result.error).toContain('mint affordance is closed');
    // The label in the error should be the extracted label "FBS with HepG2"
    expect(result.error).toContain('FBS with HepG2');
  });
});
