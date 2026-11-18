/**
 * L2-JOURNEY-COMPILER-1 (unit s2envelope, stage 2): the ready execution
 * envelope. compileJourneyEnvelope binds one READY step from the stage-1
 * manifest to the exact version each of its input ports pins, reading the
 * pinned versions from the document's port objects and the current versions
 * from the caller-measured ResolvedInputVersion list — the compiler never
 * reads a record store and never re-validates (the lint already gated the
 * document at stage 1). checkEnvelopeFreshness re-runs the same comparison
 * against a re-measured current set so a revised source record is refused
 * with a named stale-input diagnostic instead of silently executing against
 * new data. Rule order is fixed and each refusal returns ONE diagnostic:
 * step unknown, then human step, then input unbound, then stale input.
 * s2polauth records the caller-supplied policy decision on the envelope and
 * re-compares its disposition when the decision is re-evaluated.
 */
import type { CompiledJourneyManifest } from './journeyCompiler.js';
import type { PolicyActionDecision, PolicyDecisionDisposition } from '../../policy/types.js';
export const RULE_ENVELOPE_STEP_UNKNOWN = 'journey_envelope_step_unknown';
export const RULE_ENVELOPE_HUMAN_STEP = 'journey_envelope_human_step';
export const RULE_ENVELOPE_INPUT_UNBOUND = 'journey_envelope_input_unbound';
export const RULE_ENVELOPE_STALE_INPUT = 'journey_envelope_stale_input';
export const RULE_ENVELOPE_AUTHORIZATION_FLIPPED = 'journey_envelope_authorization_flipped';
export const RULE_ENVELOPE_AUTHORIZATION_MISSING = 'journey_envelope_authorization_missing';
export interface ResolvedInputVersion { port_index: number; version: string }
export interface JourneyEnvelopeBinding { port_index: number; declared_version: string; resolved_version: string }
export interface JourneyEnvelopeAuthorization {
  action: string; target: string; disposition: PolicyDecisionDisposition;
  authority: string; setting_key: string; origin_profile_id: string; rationale: string;
}
export interface CompiledJourneyEnvelope {
  journey_id: string; revision: number; step_id: string;
  capability_ref: string; capability_version: string; bindings: JourneyEnvelopeBinding[];
  authorization?: JourneyEnvelopeAuthorization;
}
export interface JourneyEnvelopeDiagnostic { rule: string; message: string; step_id: string }
export type JourneyEnvelopeResult = { ok: true; envelope: CompiledJourneyEnvelope } | { ok: false; diagnostics: JourneyEnvelopeDiagnostic[] };
/** A locally shaped step: the document is unknown at the boundary and every
 * field is narrowed by typeof checks; port entries stay unknown until proven. */
interface EnvelopeStepShape { id: string; input_ports: unknown[] }
/** One pinned input: the port index and the version string the step pins. */
interface PinnedInput { port_index: number; version: string }
/** Find the named step in an unknown document without trusting its shape. */
function findDocumentStep(document: unknown, stepId: string): EnvelopeStepShape | undefined {
  if (document === null || typeof document !== 'object') return undefined;
  const maybe = (document as { steps?: unknown }).steps;
  if (!Array.isArray(maybe)) return undefined;
  const step = maybe.find((s) => s !== null && typeof s === 'object' && (s as { id?: unknown }).id === stepId);
  return step === undefined ? undefined : (step as EnvelopeStepShape);
}
/** The ONE version comparison shared by compile and freshness: every pinned
 * port index must appear exactly once in the current set (otherwise
 * INPUT_UNBOUND naming the first offending index), and every present version
 * must equal the pinned one (otherwise STALE_INPUT naming all offenders,
 * ascending index). One diagnostic total; the unbound rule wins when both hold. */
function comparePinnedVersions(stepId: string, pinned: PinnedInput[], current: ResolvedInputVersion[]): JourneyEnvelopeDiagnostic[] {
  const ordered = [...pinned].sort((a, b) => a.port_index - b.port_index);
  let firstUnbound = -1;
  const stale: { index: number; declared: string; resolved: string }[] = [];
  for (const port of ordered) {
    const entries = current.filter((c) => c.port_index === port.port_index);
    if (entries.length !== 1) { if (firstUnbound === -1) firstUnbound = port.port_index; continue; }
    const entry = entries[0]!;
    if (entry.version !== port.version) stale.push({ index: port.port_index, declared: port.version, resolved: entry.version });
  }
  if (firstUnbound !== -1) {
    return [{ rule: RULE_ENVELOPE_INPUT_UNBOUND, message: `step ${stepId}: input port index ${firstUnbound} has no exactly-once resolved version in the supplied current inputs`, step_id: stepId }];
  }
  if (stale.length > 0) {
    const detail = stale.map((s) => `port index ${s.index} declares ${s.declared} while the current record version is ${s.resolved}`).join('; ');
    return [{ rule: RULE_ENVELOPE_STALE_INPUT, message: `step ${stepId}: pinned input versions no longer match the current record versions: ${detail}`, step_id: stepId }];
  }
  return [];
}
export function compileJourneyEnvelope(manifest: CompiledJourneyManifest, document: unknown, stepId: string, current: ResolvedInputVersion[]): JourneyEnvelopeResult {
  const manifestStep = manifest.steps.find((s) => s.id === stepId);
  const documentStep = findDocumentStep(document, stepId);
  if (manifestStep === undefined || documentStep === undefined) {
    return { ok: false, diagnostics: [{ rule: RULE_ENVELOPE_STEP_UNKNOWN, message: `step ${stepId}: not found in the compiled manifest or the journey document`, step_id: stepId }] };
  }
  if (manifestStep.reasons.includes('awaiting_human_completion')) {
    return { ok: false, diagnostics: [{ rule: RULE_ENVELOPE_HUMAN_STEP, message: `step ${stepId}: a human-in-the-loop step is completed by a person and is never pre-compiled into an envelope`, step_id: stepId }] };
  }
  const rawPorts = Array.isArray(documentStep.input_ports) ? documentStep.input_ports : [];
  const pinned: PinnedInput[] = [];
  for (let i = 0; i < rawPorts.length; i++) {
    const rawPort = rawPorts[i];
    const declared = rawPort === null || typeof rawPort !== 'object' ? undefined : (rawPort as { version?: unknown }).version;
    if (typeof declared !== 'string' || declared.length === 0) {
      return { ok: false, diagnostics: [{ rule: RULE_ENVELOPE_INPUT_UNBOUND, message: `step ${stepId}: input port index ${i} declares no version string and no resolved version may be assumed`, step_id: stepId }] };
    }
    pinned.push({ port_index: i, version: declared });
  }
  const versionDiagnostics = comparePinnedVersions(stepId, pinned, current);
  if (versionDiagnostics.length > 0) return { ok: false, diagnostics: versionDiagnostics };
  const bindings: JourneyEnvelopeBinding[] = pinned.map((p) => {
    const entry = current.find((c) => c.port_index === p.port_index)!;
    return { port_index: p.port_index, declared_version: p.version, resolved_version: entry.version };
  });
  return {
    ok: true,
    envelope: {
      journey_id: manifest.journey_id, revision: manifest.revision, step_id: stepId,
      capability_ref: manifestStep.capability_ref, capability_version: manifestStep.capability_version,
      bindings,
    },
  };
}
/** Re-run the shared comparison over the envelope's bindings against a
 * re-measured current set: a moved record version is STALE_INPUT, a missing
 * resolved version for a bound port index is INPUT_UNBOUND. */
export function checkEnvelopeFreshness(envelope: CompiledJourneyEnvelope, current: ResolvedInputVersion[]): { valid: true } | { valid: false; diagnostics: JourneyEnvelopeDiagnostic[] } {
  const pinned: PinnedInput[] = envelope.bindings.map((b) => ({ port_index: b.port_index, version: b.resolved_version }));
  const diagnostics = comparePinnedVersions(envelope.step_id, pinned, current);
  if (diagnostics.length === 0) return { valid: true };
  return { valid: false, diagnostics };
}
/** Record the policy decision the caller already evaluated. The module never
 * evaluates policy itself: it copies the decision's fields into a new
 * envelope and leaves the argument untouched. */
export function recordEnvelopeAuthorization(envelope: CompiledJourneyEnvelope, decision: PolicyActionDecision): CompiledJourneyEnvelope {
  const recorded: JourneyEnvelopeAuthorization = {
    action: decision.action, target: decision.target, disposition: decision.disposition,
    authority: decision.authority, setting_key: decision.settingKey,
    origin_profile_id: decision.origin.profileId, rationale: decision.rationale,
  };
  return { ...envelope, ...(recorded !== undefined ? { authorization: recorded } : {}) };
}
/** Re-compare the recorded disposition with the caller's re-evaluated decision.
 * A missing record is refused first (it may not read as permission); a changed
 * disposition is AUTHORIZATION_FLIPPED naming both sides. One diagnostic. */
export function checkEnvelopeAuthorization(envelope: CompiledJourneyEnvelope, decision: PolicyActionDecision): { valid: true } | { valid: false; diagnostics: JourneyEnvelopeDiagnostic[] } {
  const recorded = envelope.authorization;
  if (recorded === undefined) {
    return { valid: false, diagnostics: [{ rule: RULE_ENVELOPE_AUTHORIZATION_MISSING, message: `step ${envelope.step_id}: the envelope records no policy authorization; a missing authorization may not be read as permission`, step_id: envelope.step_id }] };
  }
  if (recorded.disposition !== decision.disposition) {
    return { valid: false, diagnostics: [{ rule: RULE_ENVELOPE_AUTHORIZATION_FLIPPED, message: `step ${envelope.step_id}: recorded disposition ${recorded.disposition} (origin ${recorded.origin_profile_id}) no longer matches the re-evaluated disposition ${decision.disposition} (origin ${decision.origin.profileId})`, step_id: envelope.step_id }] };
  }
  return { valid: true };
}
