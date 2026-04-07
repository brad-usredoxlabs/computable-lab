import type { ActivePolicyScope, PolicyActionRequest, PolicyEvaluation, PolicyProfile } from '../policy/types.js';

/**
 * Domain-agnostic compiler intermediate representations.
 *
 * Domain compilers provide the payload/step types via generics while reusing the
 * shared diagnostic, provenance, and policy-evaluation envelope.
 */

export type CompilerStage = 'normalize' | 'bind' | 'policy' | 'plan' | 'execute';

export type CompilerDiagnosticOutcome =
  | 'auto-resolved'
  | 'needs-confirmation'
  | 'needs-missing-fact'
  | 'policy-blocked'
  | 'execution-blocked';

export type CompilerDiagnosticSeverity = 'info' | 'warning' | 'error';

export type BindingResolutionKind = 'exact' | 'substitution' | 'placeholder' | 'new-record';

export type ProvenanceSourceKind =
  | 'record'
  | 'ontology'
  | 'catalog'
  | 'policy-profile'
  | 'user-input'
  | 'system';

export interface CompilerProvenanceSource {
  kind: ProvenanceSourceKind;
  id: string;
  label?: string;
  detail?: string;
}

export interface CompilerProvenanceNote {
  stage: CompilerStage;
  message: string;
  sourceIds?: string[];
}

export interface CompilerProvenanceEnvelope {
  generatedAt: string;
  actor?: string;
  sources: CompilerProvenanceSource[];
  notes: CompilerProvenanceNote[];
}

export interface NormalizedIntent<TPayload = unknown> {
  domain: string;
  intentId: string;
  version: string;
  summary: string;
  payload: TPayload;
  requiredFacts: string[];
  optionalFacts?: string[];
  assumptions?: string[];
}

export interface CandidateBinding<TPayload = unknown> {
  bindingId: string;
  slot: string;
  candidateType: string;
  candidateId: string;
  resolution: BindingResolutionKind;
  payload: TPayload;
  confidence?: number;
  provenance: CompilerProvenanceSource[];
}

export interface RemediationSuggestion {
  kind:
    | 'provide-missing-fact'
    | 'confirm-choice'
    | 'request-approval'
    | 'supply-execution-capability'
    | 'adjust-policy';
  message: string;
  actionLabel?: string;
}

export interface CompilerDiagnostic {
  code: string;
  stage: CompilerStage;
  severity: CompilerDiagnosticSeverity;
  outcome: CompilerDiagnosticOutcome;
  message: string;
  bindingId?: string;
  factKey?: string;
  remediation?: RemediationSuggestion[];
  provenance?: CompilerProvenanceSource[];
}

export interface CompilationPlan<TStep = unknown> {
  planId: string;
  steps: TStep[];
  requiresOperator?: boolean;
  executionBlockers?: string[];
}

export interface CompilerKernelRequest<TIntent = unknown, TCandidate = unknown, TStep = unknown> {
  normalizedIntent: NormalizedIntent<TIntent>;
  candidateBindings: CandidateBinding<TCandidate>[];
  plan: CompilationPlan<TStep>;
  policyProfiles: PolicyProfile[];
  activeScope: ActivePolicyScope;
  knownFacts?: Record<string, unknown>;
  requestedActions?: PolicyActionRequest[];
  diagnostics?: CompilerDiagnostic[];
  provenance?: {
    actor?: string;
    sources?: CompilerProvenanceSource[];
    notes?: CompilerProvenanceNote[];
  };
}

export interface CompilationResult<TIntent = unknown, TCandidate = unknown, TStep = unknown> {
  normalizedIntent: NormalizedIntent<TIntent>;
  candidateBindings: CandidateBinding<TCandidate>[];
  policy: PolicyEvaluation;
  diagnostics: CompilerDiagnostic[];
  plan: CompilationPlan<TStep>;
  provenance: CompilerProvenanceEnvelope;
  outcome: CompilerDiagnosticOutcome | 'ready';
}
