import { PolicyProfileService } from '../policy/PolicyProfileService.js';
import type { PolicyActionRequest, PolicyEvaluation } from '../policy/types.js';
import type {
  CandidateBinding,
  CompilationResult,
  CompilerDiagnostic,
  CompilerDiagnosticOutcome,
  CompilerKernelRequest,
  CompilerProvenanceEnvelope,
  CompilerProvenanceSource,
} from './types.js';

function readFactValue(source: Record<string, unknown>, factKey: string): unknown {
  const segments = factKey.split('.').filter((segment) => segment.length > 0);
  let current: unknown = source;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function hasFact(source: Record<string, unknown>, factKey: string): boolean {
  const value = readFactValue(source, factKey);
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function dedupeActions(actions: PolicyActionRequest[]): PolicyActionRequest[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.action}:${action.target}:${action.detail ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function inferredActions<TCandidate>(bindings: CandidateBinding<TCandidate>[]): PolicyActionRequest[] {
  const actions: PolicyActionRequest[] = [];
  for (const binding of bindings) {
    switch (binding.resolution) {
      case 'exact':
        break;
      case 'substitution':
        actions.push({ action: 'substitute', target: binding.slot, detail: binding.candidateId });
        break;
      case 'placeholder':
        actions.push({ action: 'use-placeholder', target: binding.slot, detail: binding.candidateId });
        break;
      case 'new-record':
        actions.push({ action: 'auto-create', target: binding.slot, detail: binding.candidateId });
        break;
    }
  }
  return actions;
}

function policyDecisionDiagnostics(policy: PolicyEvaluation): CompilerDiagnostic[] {
  return policy.decisions.map((decision): CompilerDiagnostic => {
    switch (decision.disposition) {
      case 'allowed':
        return {
          code: 'POLICY_AUTO_RESOLVED',
          stage: 'policy',
          severity: 'info',
          outcome: 'auto-resolved',
          message: decision.rationale,
          remediation: [
            {
              kind: 'adjust-policy',
              message: `Applied active policy profile ${decision.origin.profileId}.`,
            },
          ],
          provenance: [
            {
              kind: 'policy-profile',
              id: decision.origin.profileId,
              detail: `${decision.origin.scope}:${decision.origin.scopeId}`,
            },
          ],
        };
      case 'needs-confirmation':
        return {
          code: 'POLICY_CONFIRMATION_REQUIRED',
          stage: 'policy',
          severity: 'warning',
          outcome: 'needs-confirmation',
          message: decision.rationale,
          remediation: [
            {
              kind: 'confirm-choice',
              message: `Confirmation required from ${decision.authority}.`,
            },
          ],
          provenance: [
            {
              kind: 'policy-profile',
              id: decision.origin.profileId,
              detail: `${decision.origin.scope}:${decision.origin.scopeId}`,
            },
          ],
        };
      case 'blocked':
        return {
          code: 'POLICY_BLOCKED',
          stage: 'policy',
          severity: 'error',
          outcome: 'policy-blocked',
          message: decision.rationale,
          remediation: [
            {
              kind: 'request-approval',
              message: `Action is blocked under the active profile. Escalate to ${decision.authority}.`,
            },
          ],
          provenance: [
            {
              kind: 'policy-profile',
              id: decision.origin.profileId,
              detail: `${decision.origin.scope}:${decision.origin.scopeId}`,
            },
          ],
        };
    }
  });
}

function missingFactDiagnostics(requiredFacts: string[], knownFacts: Record<string, unknown>): CompilerDiagnostic[] {
  return requiredFacts
    .filter((factKey) => !hasFact(knownFacts, factKey))
    .map((factKey) => ({
      code: 'MISSING_REQUIRED_FACT',
      stage: 'normalize' as const,
      severity: 'warning' as const,
      outcome: 'needs-missing-fact' as const,
      factKey,
      message: `Missing required fact: ${factKey}.`,
      remediation: [
        {
          kind: 'provide-missing-fact' as const,
          message: `Provide ${factKey} before compilation can proceed deterministically.`,
        },
      ],
    }));
}

function executionBlockerDiagnostics(messages: string[]): CompilerDiagnostic[] {
  return messages.map((message) => ({
    code: 'EXECUTION_BLOCKED',
    stage: 'plan' as const,
    severity: 'error' as const,
    outcome: 'execution-blocked' as const,
    message,
    remediation: [
      {
        kind: 'supply-execution-capability' as const,
        message: 'Add the missing execution capability or choose a compatible platform.',
      },
    ],
  }));
}

function summarizeOutcome(diagnostics: CompilerDiagnostic[]): CompilerDiagnosticOutcome | 'ready' {
  const ranking: CompilerDiagnosticOutcome[] = [
    'policy-blocked',
    'execution-blocked',
    'needs-missing-fact',
    'needs-confirmation',
    'auto-resolved',
  ];

  for (const outcome of ranking) {
    if (diagnostics.some((diagnostic) => diagnostic.outcome === outcome)) {
      return outcome;
    }
  }
  return 'ready';
}

function collectBindingSources<TCandidate>(bindings: CandidateBinding<TCandidate>[]): CompilerProvenanceSource[] {
  const sources = new Map<string, CompilerProvenanceSource>();
  for (const binding of bindings) {
    for (const source of binding.provenance) {
      sources.set(`${source.kind}:${source.id}`, source);
    }
  }
  return [...sources.values()];
}

export class CompilerKernel {
  private readonly policyProfiles = new PolicyProfileService();

  evaluateRequest<TIntent = unknown, TCandidate = unknown, TStep = unknown>(
    input: CompilerKernelRequest<TIntent, TCandidate, TStep>,
  ): CompilationResult<TIntent, TCandidate, TStep> {
    const policy = this.policyProfiles.evaluateActions({
      profiles: input.policyProfiles,
      scope: input.activeScope,
      actions: dedupeActions([...(input.requestedActions ?? []), ...inferredActions(input.candidateBindings)]),
    });

    const diagnostics = [
      ...(input.diagnostics ?? []),
      ...missingFactDiagnostics(input.normalizedIntent.requiredFacts, input.knownFacts ?? {}),
      ...policyDecisionDiagnostics(policy),
      ...executionBlockerDiagnostics(input.plan.executionBlockers ?? []),
    ];

    const policySources: CompilerProvenanceSource[] = policy.activeProfile.trace.map((entry) => ({
      kind: 'policy-profile',
      id: entry.profileId,
      label: entry.scope,
      detail: `${entry.scope}:${entry.scopeId}`,
    }));

    const provenance: CompilerProvenanceEnvelope = {
      generatedAt: new Date().toISOString(),
      ...(input.provenance?.actor ? { actor: input.provenance.actor } : {}),
      sources: [
        ...collectBindingSources(input.candidateBindings),
        ...policySources,
        ...(input.provenance?.sources ?? []),
      ],
      notes: [
        {
          stage: 'policy',
          message: `Resolved ${policy.activeProfile.trace.length} policy profile(s).`,
          sourceIds: policy.activeProfile.trace.map((entry) => entry.profileId),
        },
        ...(input.provenance?.notes ?? []),
      ],
    };

    return {
      normalizedIntent: input.normalizedIntent,
      candidateBindings: input.candidateBindings,
      policy,
      diagnostics,
      plan: input.plan,
      provenance,
      outcome: summarizeOutcome(diagnostics),
    };
  }
}
