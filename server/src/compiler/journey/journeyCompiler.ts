/**
 * L2-JOURNEY-COMPILER-1 (unit cmanifest, stage 1): the stage-1 compile gate.
 * lintJourneyDocument is the ONLY validator — schema, capability membership,
 * port chaining — called once; failures relay its diagnostics verbatim and
 * build no manifest. On a clean gate every step is explicitly READY (zero
 * input ports, automatic) or NOT_READY with a closed reason set:
 * awaiting_producer_output first when input-fed, blocked_by the producer ids
 * from the lint's consecutive index pairing, then awaiting_human_completion.
 * capability_version records the admitted descriptor's version per step; the
 * document carries no capability version of its own, so it is recorded, not
 * judged. No envelope, no route, no second validation authority.
 *
 * L2-JOURNEY-COMPILER-1 (unit s2inval, stage 2): a compiled manifest also
 * declares a stage-2 freshness refusal. recordEnvelopeInvalidation appends
 * one JourneyEnvelopeInvalidation entry, marks the named step NOT_READY with
 * the closed reason stale_input (exactly once), and recomputes not_ready
 * with the same status !== 'READY' filter, document order. It returns a new
 * manifest and never mutates its argument.
 */
import { lintJourneyDocument } from './journeyDocumentLint.js';
import type { JourneyDocumentLintDiagnostic } from './journeyDocumentLint.js';
import type { CapabilityDescriptor } from './capabilityCatalogue.js';
export type JourneyStepStatus = 'READY' | 'NOT_READY';
export type JourneyNotReadyReason = 'awaiting_producer_output' | 'awaiting_human_completion' | 'stale_input';
export interface CompiledJourneyStep {
  id: string;
  capability_ref: string;
  capability_version: string;
  interaction_mode: 'automatic' | 'human_in_the_loop';
  status: JourneyStepStatus;
  reasons: JourneyNotReadyReason[];
  blocked_by: string[];
}
export interface JourneyEnvelopeInvalidation {
  step_id: string;
  rule: string;
  message: string;
}
export interface CompiledJourneyManifest {
  journey_id: string;
  revision: number;
  steps: CompiledJourneyStep[];
  not_ready: string[];
  invalidations?: JourneyEnvelopeInvalidation[];
}
export type JourneyCompileResult =
  | { ok: true; manifest: CompiledJourneyManifest }
  | { ok: false; diagnostics: JourneyDocumentLintDiagnostic[] };
interface ShapedJourneyStep { id: string; capability_ref: string; input_ports: unknown[]; output_ports: unknown[]; interaction_mode: 'automatic' | 'human_in_the_loop' }
interface ShapedJourney { journey_id: string; revision: number; steps: ShapedJourneyStep[] }
const RULE_CAPABILITY_VERSION_MISSING = 'journey_capability_version_missing';
export function compileJourneyStructure(document: unknown, catalogue: CapabilityDescriptor[]): JourneyCompileResult {
  const lint = lintJourneyDocument(document, catalogue); if (!lint.ok) return { ok: false, diagnostics: lint.diagnostics };
  const plan = document as ShapedJourney; const steps = plan.steps;
  const compiled: CompiledJourneyStep[] = [];
  for (let m = 0; m < steps.length; m++) {
    const step = steps[m]!;
    const descriptor = catalogue.find((d) => d.capability_id === step.capability_ref);
    const rawVersion: unknown = descriptor === undefined ? undefined : descriptor.version;
    if (typeof rawVersion !== 'string' || rawVersion.length === 0) {
      const message = `step ${step.id}: the admitted capability descriptor declares no version string`;
      return { ok: false, diagnostics: [{ rule: RULE_CAPABILITY_VERSION_MISSING, message, step_id: step.id }] };
    }
    const reasons: JourneyNotReadyReason[] = [];
    const blockedBy: string[] = [];
    if (step.input_ports.length > 0) {
      reasons.push('awaiting_producer_output');
      const producer = steps[m - 1];
      for (let i = 0; producer !== undefined && i < step.input_ports.length; i++) {
        if (producer.output_ports[i] !== undefined && !blockedBy.includes(producer.id)) blockedBy.push(producer.id);
      }
    }
    if (step.interaction_mode === 'human_in_the_loop') reasons.push('awaiting_human_completion');
    let status: JourneyStepStatus = 'NOT_READY';
    if (reasons.length === 0) status = 'READY';
    compiled.push({
      id: step.id, capability_ref: step.capability_ref, capability_version: rawVersion,
      interaction_mode: step.interaction_mode, status, reasons, blocked_by: blockedBy,
    });
  }
  return {
    ok: true,
    manifest: {
      journey_id: plan.journey_id, revision: plan.revision, steps: compiled,
      not_ready: compiled.filter((s) => s.status !== 'READY').map((s) => s.id),
    },
  };
}
/** Unit s2inval: record a stage-2 envelope invalidation on the manifest
 * without mutating the argument. Appends the entry, marks the named step
 * NOT_READY with the closed reason stale_input (added only if absent, so a
 * second refusal never duplicates it), and recomputes not_ready with the
 * same status !== 'READY' filter the compiler already uses, document order. */
export function recordEnvelopeInvalidation(manifest: CompiledJourneyManifest, invalidation: JourneyEnvelopeInvalidation): CompiledJourneyManifest {
  const steps = manifest.steps.map((step): CompiledJourneyStep => {
    if (step.id !== invalidation.step_id) return step;
    const stale = step.reasons.includes('stale_input');
    const reasons: JourneyNotReadyReason[] = stale ? step.reasons : [...step.reasons, 'stale_input'];
    return { ...step, status: 'NOT_READY', reasons };
  });
  return {
    journey_id: manifest.journey_id, revision: manifest.revision, steps,
    not_ready: steps.filter((s) => s.status !== 'READY').map((s) => s.id),
    invalidations: [...(manifest.invalidations ?? []), invalidation],
  };
}
