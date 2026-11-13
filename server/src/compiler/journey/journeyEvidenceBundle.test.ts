// @vitest-environment node
/**
 * L2-JOURNEY-EVIDENCE-1 (unit evbundle), RED-first: the bundle is ONE closed
 * manifest — (a) complete input builds AND validates against the schema in
 * the same run; (a2) the closed schema refuses a 4th determinism mode and an
 * unknown top-level member (via the module's single loader); (b) a required
 * approval with no retained receipt is refused, naming the task; (c) an
 * effect whose receipt is not retained is refused, naming the receipt id;
 * (e0) an empty request anchor is refused first; (e) no determinism mode is
 * refused; fixed order pins approval before determinism; (d) a retained
 * document that no longer hashes to its declared sha256 verifies as a
 * mismatch naming the ref; AC3: verify is byte-stable across two runs.
 * Fixtures use neutral ids; the module carries no journey/step/surface
 * literals.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { CompiledJourneyManifest } from './journeyCompiler.js';
import type { CompiledJourneyEnvelope } from './journeyEnvelope.js';
import {
  buildJourneyEvidenceBundle,
  verifyJourneyEvidenceBundle,
  validateJourneyEvidenceBundle,
  RULE_BUNDLE_APPROVAL_MISSING,
  RULE_BUNDLE_DETERMINISM_MISSING,
  RULE_BUNDLE_EFFECT_RECEIPT_UNKNOWN,
  RULE_BUNDLE_REQUEST_MISSING,
} from './journeyEvidenceBundle.js';
import type { JourneyEvidenceBundle, JourneyEvidenceBundleInput } from './journeyEvidenceBundle.js';

const sha256Hex = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const doc = (refId: string, text: string): { ref_id: string; sha256: string; document: string } =>
  ({ ref_id: refId, sha256: sha256Hex(text), document: text });

const REQUEST = { message_id: 'msg-0001', verbatim_text: 'Run the full assay on the new extract' };
const MANIFEST: CompiledJourneyManifest = {
  journey_id: 'JX-2026-113', revision: 1,
  steps: [{ id: 'step-extract', capability_ref: 'cap-extract', capability_version: '1.2.0', interaction_mode: 'automatic', status: 'READY', reasons: [], blocked_by: [] }],
  not_ready: [],
};
const ENVELOPE: CompiledJourneyEnvelope = {
  journey_id: 'JX-2026-113', revision: 1, step_id: 'step-extract',
  capability_ref: 'cap-extract', capability_version: '1.2.0',
  bindings: [{ port_index: 0, declared_version: 'v3', resolved_version: 'v3' }],
  authorization: {
    action: 'auto-create', target: 'cap-extract', disposition: 'allowed',
    authority: 'project-owner', setting_key: 'allowAutoCreate', origin_profile_id: 'profile-lab-1',
    rationale: 'declared policy permits auto-create for this step',
  },
};
/** The complete input every arm starts from; arms override, never rebuild. */
const completeInput = (overrides: Partial<JourneyEvidenceBundleInput> = {}): JourneyEvidenceBundleInput => ({
  journey_id: 'JX-2026-113',
  revision: 1,
  request: { ...REQUEST },
  intent_revisions: [doc('doc-intent-r1', 'intent revision 1: the AI added the extraction step with a versioned port')],
  compiler_versions: [{ name: 'journey-compiler', version: '1.0.0' }],
  retained_versions: [{ ref: 'record-extract-9', version: 'v3' }],
  compiled_manifests: [MANIFEST],
  observations: [doc('obs-1', 'observation: absorbance plateau reached at four minutes')],
  required_approvals: ['step-signoff'],
  human_approvals: [doc('step-signoff', 'receipt: signoff task closed on record rec-77')],
  execution_envelopes: [ENVELOPE],
  effects: [{ step_id: 'step-extract', receipt_id: 'eff-1' }],
  effect_receipts: [doc('eff-1', 'effect: two millilitre transfer completed on pipette-4')],
  checkpoint_events: [doc('cp-1', 'checkpoint: stage-1 manifest compiled clean')],
  determinism: { mode: 'replay_from_evidence' },
  ...overrides,
});
/** The retained texts keyed by ref_id — what an auditor extracts from the bundle itself. */
const retainedDocuments = (bundle: JourneyEvidenceBundle): Record<string, string> => {
  const docs: Record<string, string> = {};
  for (const list of [bundle.intent_revisions, bundle.observations, bundle.human_approvals, bundle.effect_receipts, bundle.checkpoint_events]) {
    for (const entry of list) docs[entry.ref_id] = entry.document;
  }
  return docs;
};

describe('buildJourneyEvidenceBundle', () => {
  it('(a) a complete input builds, and the bundle validates against the schema in the same run', () => {
    const out = buildJourneyEvidenceBundle(completeInput());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.bundle.request).toEqual(REQUEST);
    expect(out.bundle.determinism).toEqual({ mode: 'replay_from_evidence' });
    expect(out.bundle.journey_id).toBe('JX-2026-113');
    expect(out.bundle.revision).toBe(1);
    const verdict = validateJourneyEvidenceBundle(out.bundle);
    expect(verdict).toEqual({ ok: true });
  });
  it('(a2) the closed schema refuses a fourth determinism mode and an unknown top-level member', () => {
    const out = buildJourneyEvidenceBundle(completeInput());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // through the module's own loader — one Ajv authority, no second one:
    const live = { ...out.bundle, determinism: { mode: 'live' } };
    expect(validateJourneyEvidenceBundle(live).ok).toBe(false);
    const extra = { ...out.bundle, plate_positions: [{ well: 'A1' }] };
    expect(validateJourneyEvidenceBundle(extra).ok).toBe(false);
  });
  it('(b) a required approval with no retained receipt is refused, naming the task', () => {
    const out = buildJourneyEvidenceBundle(completeInput({ human_approvals: [] }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnostics).toHaveLength(1);
    expect(out.diagnostics[0].rule).toBe(RULE_BUNDLE_APPROVAL_MISSING);
    expect(out.diagnostics[0].message).toContain('step-signoff');
  });
  it('(c) an effect whose receipt is not retained is refused, naming the receipt id', () => {
    const out = buildJourneyEvidenceBundle(completeInput({
      effects: [{ step_id: 'step-extract', receipt_id: 'eff-missing' }],
    }));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnostics).toHaveLength(1);
    expect(out.diagnostics[0].rule).toBe(RULE_BUNDLE_EFFECT_RECEIPT_UNKNOWN);
    expect(out.diagnostics[0].message).toContain('eff-missing');
  });
  it('(e0) an empty request anchor is refused first, before every other rule', () => {
    const input = completeInput({ human_approvals: [] });
    delete input.request;
    const out = buildJourneyEvidenceBundle(input);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnostics).toHaveLength(1);
    expect(out.diagnostics[0].rule).toBe(RULE_BUNDLE_REQUEST_MISSING);
  });
  it('(e) a bundle declaring no determinism mode is refused', () => {
    const input = completeInput();
    delete input.determinism;
    const out = buildJourneyEvidenceBundle(input);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnostics).toHaveLength(1);
    expect(out.diagnostics[0].rule).toBe(RULE_BUNDLE_DETERMINISM_MISSING);
  });
  it('the fixed order: a missing approval refuses before a missing determinism mode', () => {
    const input = completeInput({ human_approvals: [] });
    delete input.determinism;
    const out = buildJourneyEvidenceBundle(input);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnostics).toHaveLength(1);
    expect(out.diagnostics[0].rule).toBe(RULE_BUNDLE_APPROVAL_MISSING);
  });
});

describe('verifyJourneyEvidenceBundle', () => {
  it('(d) a retained document that no longer matches its declared digest verifies as a mismatch naming the ref', () => {
    const input = completeInput();
    const original = input.observations[0]!.document;
    input.observations[0]!.document = original + ' (amended)'; // declared digest stays over the original text
    const built = buildJourneyEvidenceBundle(input);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const bundle = built.bundle;
    expect(verifyJourneyEvidenceBundle(bundle, retainedDocuments(bundle))).not.toEqual([]);
    const mismatches = verifyJourneyEvidenceBundle(bundle, retainedDocuments(bundle));
    expect(mismatches).toEqual([{
      ref_id: 'obs-1',
      expected: sha256Hex(original),
      actual: sha256Hex(original + ' (amended)'),
    }]);
  });
  it('verify is byte-stable: two runs over the same documents return identical results', () => {
    const built = buildJourneyEvidenceBundle(completeInput());
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const bundle = built.bundle;
    const docs = retainedDocuments(bundle);
    expect(verifyJourneyEvidenceBundle(bundle, docs)).toEqual([]);
    const first = verifyJourneyEvidenceBundle(bundle, docs);
    const second = verifyJourneyEvidenceBundle(bundle, docs);
    expect(second).toEqual(first);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
