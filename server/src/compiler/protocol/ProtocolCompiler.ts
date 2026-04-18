import { OperationalAdmissibilityService } from '../../authorization/OperationalAdmissibilityService.js';
import { EquipmentCapabilityService } from '../../capabilities/EquipmentCapabilityService.js';
import { PolicyProfileService } from '../../policy/PolicyProfileService.js';
import { buildLocalProtocol } from './LocalProtocolBuilder.js';
import type { LocalProtocolPayload } from './LocalProtocolBuilder.js';
import type {
  ActivePolicyScope,
  ApprovalAuthority,
  PolicyDecisionDisposition,
  PolicyProfile,
  ResolvedPolicyProfile,
} from '../../policy/types.js';
import type { RecordStore } from '../../store/types.js';
import type { RecordEnvelope } from '../../types/RecordEnvelope.js';
import type { VerbDefinitionPayload } from '../../types/capabilityAuthorization.js';
import { resolveProtocolStepSemanticVerb } from '../../workflow/verbs/protocolVerbRegistry.js';

type RecordRef = {
  kind: 'record';
  id: string;
  type?: string;
};

type ProtocolExecutionPreference = {
  manualAllowed?: unknown;
  preferredBackendIds?: unknown;
};

type ProtocolMethodRequirement = {
  methodId?: unknown;
  instrumentRole?: unknown;
};

type ProtocolStepPayload = {
  stepId?: unknown;
  kind?: unknown;
  notes?: unknown;
  instrumentRole?: unknown;
  semanticVerb?: {
    ref?: { id?: unknown } | null;
    canonical?: unknown;
    backendHints?: unknown;
  } | null;
  verbRef?: { id?: unknown } | null;
  methodRequirement?: ProtocolMethodRequirement | null;
  executionPreference?: ProtocolExecutionPreference | null;
  labwareRef?: { id?: unknown } | null;
};

type ProtocolPayload = {
  recordId?: unknown;
  title?: unknown;
  steps?: unknown;
};

type PlannedRunBindings = {
  instruments?: unknown[];
};

type InstrumentBinding = {
  roleId: string;
  instrumentRef?: unknown;
};

type CandidatePlan = {
  backendId: string;
  executionMode: 'manual' | 'instrument';
  disposition: PolicyDecisionDisposition;
  requiresConfirmation: boolean;
  authority?: ApprovalAuthority;
  equipmentId?: string;
  recordIds: string[];
  notes?: string;
};

export interface ProtocolCompilerDiagnostic {
  code: string;
  stepId: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  subject: 'step' | 'verb' | 'equipment' | 'person' | 'policy' | 'backend';
  disposition?: PolicyDecisionDisposition;
  backendId?: string;
  recordIds?: string[];
}

export interface ProtocolCompilerRemediation {
  code: string;
  stepId: string;
  action: string;
  disposition: PolicyDecisionDisposition;
  message: string;
  authority?: ApprovalAuthority;
  backendId?: string;
  equipmentRef?: RecordRef;
}

export interface CompiledProtocolStep {
  stepId: string;
  kind: string;
  canonicalVerb: string;
  verbRef?: RecordRef;
  methodId?: string;
  selectedBackendId?: string;
  executionMode: 'manual' | 'instrument';
  equipmentRef?: RecordRef;
  disposition: PolicyDecisionDisposition;
  requiresConfirmation: boolean;
  notes?: string;
}

export interface ProtocolCompilerResult {
  status: 'ready' | 'blocked';
  sourceLayer: 'universal';
  targetLayer: 'lab';
  diagnostics: ProtocolCompilerDiagnostic[];
  remediationOptions: ProtocolCompilerRemediation[];
  steps: CompiledProtocolStep[];
  activePolicy: ResolvedPolicyProfile;
  localProtocol: LocalProtocolPayload;
}

export interface ProtocolCompilerContext {
  policyProfiles?: PolicyProfile[];
  scope?: ActivePolicyScope;
  operatorPersonId?: string;
  supervisorPersonId?: string;
}

function asProtocolPayload(envelope: RecordEnvelope): ProtocolPayload {
  return envelope.payload as ProtocolPayload;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim());
}

function uniq(values: string[]): string[] {
  return [...new Set(values)];
}

function compareDisposition(left: PolicyDecisionDisposition, right: PolicyDecisionDisposition): number {
  const rank: Record<PolicyDecisionDisposition, number> = {
    blocked: 3,
    'needs-confirmation': 2,
    allowed: 1,
  };
  return rank[left] - rank[right];
}

function maxDisposition(...values: PolicyDecisionDisposition[]): PolicyDecisionDisposition {
  return values.reduce((current, value) => (compareDisposition(value, current) > 0 ? value : current), 'allowed');
}

function diagnosticSeverity(disposition: PolicyDecisionDisposition | undefined): ProtocolCompilerDiagnostic['severity'] {
  if (disposition === 'blocked') return 'error';
  if (disposition === 'needs-confirmation') return 'warning';
  return 'info';
}

function mapFindingSubject(subject: 'person' | 'equipment' | 'training' | 'authorization' | 'capability' | 'policy'): ProtocolCompilerDiagnostic['subject'] {
  switch (subject) {
    case 'person':
      return 'person';
    case 'equipment':
    case 'capability':
      return 'equipment';
    case 'training':
    case 'authorization':
    case 'policy':
      return 'policy';
  }
}

function defaultScope(scope?: ActivePolicyScope): ActivePolicyScope {
  return scope ?? { organizationId: 'default-org' };
}

function normalizeRecordId(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (value && typeof value === 'object') {
    const candidate = (value as { id?: unknown }).id;
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate.trim();
  }
  return undefined;
}

function equipmentRef(id: string): RecordRef {
  return { kind: 'record', id, type: 'equipment' };
}

function verbRef(id: string): RecordRef {
  return { kind: 'record', id, type: 'verb-definition' };
}

function instrumentBindings(bindings: PlannedRunBindings | undefined): InstrumentBinding[] {
  if (!Array.isArray(bindings?.instruments)) return [];
  return bindings.instruments
    .filter((value): value is InstrumentBinding => value !== null && typeof value === 'object' && typeof (value as { roleId?: unknown }).roleId === 'string');
}

function stepMethodId(step: ProtocolStepPayload): string | undefined {
  return asString(step.methodRequirement?.methodId);
}

function stepInstrumentRole(step: ProtocolStepPayload): string | undefined {
  return asString(step.methodRequirement?.instrumentRole) ?? asString(step.instrumentRole);
}

function stepPreferredBackends(step: ProtocolStepPayload): string[] {
  return asStringArray(step.executionPreference?.preferredBackendIds);
}

function stepManualAllowed(step: ProtocolStepPayload): boolean {
  return asBoolean(step.executionPreference?.manualAllowed) ?? true;
}

function stepIdFor(step: ProtocolStepPayload, index: number): string {
  return asString(step.stepId) ?? `step_${String(index + 1).padStart(3, '0')}`;
}

function stepKindFor(step: ProtocolStepPayload): string {
  return asString(step.kind) ?? 'other';
}

function candidateSortValue(
  candidate: CandidatePlan,
  preferredBackendIds: string[],
  backendHints: string[],
): [number, number, number, string, string] {
  const dispositionRank = candidate.disposition === 'allowed' ? 0 : candidate.disposition === 'needs-confirmation' ? 1 : 2;
  const preferredIndex = preferredBackendIds.indexOf(candidate.backendId);
  const hintIndex = backendHints.indexOf(candidate.backendId);
  const backendPreferenceRank = preferredIndex >= 0 ? preferredIndex : preferredBackendIds.length + (hintIndex >= 0 ? hintIndex : backendHints.length + 1);
  const modeRank = candidate.executionMode === 'instrument' ? 0 : 1;
  return [dispositionRank, backendPreferenceRank, modeRank, candidate.backendId, candidate.equipmentId ?? ''];
}

function chooseCandidate(
  candidates: CandidatePlan[],
  preferredBackendIds: string[],
  backendHints: string[],
): CandidatePlan | undefined {
  return [...candidates]
    .sort((left, right) => {
      const leftValue = candidateSortValue(left, preferredBackendIds, backendHints);
      const rightValue = candidateSortValue(right, preferredBackendIds, backendHints);
      for (let i = 0; i < leftValue.length; i += 1) {
        const leftPart = leftValue[i] ?? '';
        const rightPart = rightValue[i] ?? '';
        if (leftPart < rightPart) return -1;
        if (leftPart > rightPart) return 1;
      }
      return 0;
    })
    .find((candidate) => candidate.disposition !== 'blocked');
}

function admissibilityInput(input: {
  policyProfiles: PolicyProfile[];
  scope: ActivePolicyScope;
  verbId: string;
  methodId?: string;
  personId?: string;
  supervisorPersonId?: string;
  equipmentId?: string;
}) {
  return {
    policyProfiles: input.policyProfiles,
    scope: input.scope,
    verbId: input.verbId,
    ...(input.methodId ? { methodId: input.methodId } : {}),
    ...(input.personId ? { personId: input.personId } : {}),
    ...(input.supervisorPersonId ? { supervisorPersonId: input.supervisorPersonId } : {}),
    ...(input.equipmentId ? { equipmentId: input.equipmentId } : {}),
  };
}

export class ProtocolCompiler {
  private readonly capabilityService: EquipmentCapabilityService;
  private readonly admissibilityService: OperationalAdmissibilityService;
  private readonly policyService = new PolicyProfileService();

  constructor(private readonly store: Pick<RecordStore, 'list'>) {
    this.capabilityService = new EquipmentCapabilityService(store);
    this.admissibilityService = new OperationalAdmissibilityService(store);
  }

  private async resolveVerbDefinitions(): Promise<{
    byId: Map<string, VerbDefinitionPayload>;
    byCanonical: Map<string, VerbDefinitionPayload>;
  }> {
    const records = await this.store.list({ kind: 'verb-definition' });
    const byId = new Map<string, VerbDefinitionPayload>();
    const byCanonical = new Map<string, VerbDefinitionPayload>();

    for (const record of records) {
      const payload = record.payload as VerbDefinitionPayload;
      if (payload.kind !== 'verb-definition') continue;
      byId.set(payload.id, payload);
      const canonical = payload.canonical.trim().toLowerCase();
      if (!byCanonical.has(canonical)) byCanonical.set(canonical, payload);
    }

    return { byId, byCanonical };
  }

  async lowerToLabProtocol(input: {
    protocolEnvelope: RecordEnvelope;
    bindings?: PlannedRunBindings;
    context?: ProtocolCompilerContext;
  }): Promise<ProtocolCompilerResult> {
    const scope = defaultScope(input.context?.scope);
    const policyProfiles = input.context?.policyProfiles ?? [];
    const activePolicy = this.policyService.resolveActiveProfile(policyProfiles, scope);
    const diagnostics: ProtocolCompilerDiagnostic[] = [];
    const remediationOptions: ProtocolCompilerRemediation[] = [];
    const steps: CompiledProtocolStep[] = [];
    const instruments = instrumentBindings(input.bindings);
    const instrumentRoleMap = new Map<string, string>();
    for (const binding of instruments) {
      const instrumentId = normalizeRecordId(binding.instrumentRef);
      if (instrumentId) instrumentRoleMap.set(binding.roleId, instrumentId);
    }

    const { byId: verbsById, byCanonical: verbsByCanonical } = await this.resolveVerbDefinitions();
    const protocol = asProtocolPayload(input.protocolEnvelope);
    const protocolSteps = Array.isArray(protocol.steps) ? protocol.steps as ProtocolStepPayload[] : [];

    // Build localProtocol from the compiled steps (will be populated after the loop)
    let localProtocol: LocalProtocolPayload | undefined;

    for (const [index, step] of protocolSteps.entries()) {
      const stepId = stepIdFor(step, index);
      const kind = stepKindFor(step);
      const semanticVerb = resolveProtocolStepSemanticVerb(step);
      const preferredBackendIds = stepPreferredBackends(step);
      const methodId = stepMethodId(step);
      const requiredInstrumentRole = stepInstrumentRole(step);
      const candidates: CandidatePlan[] = [];

      if (!semanticVerb) {
        diagnostics.push({
          code: 'MISSING_VERB',
          stepId,
          severity: 'error',
          message: `Step ${stepId} does not define a semantic verb.`,
          subject: 'verb',
        });
        steps.push({
          stepId,
          kind,
          canonicalVerb: 'unknown',
          executionMode: 'manual',
          disposition: 'blocked',
          requiresConfirmation: false,
          notes: 'Blocked because no semantic verb could be resolved.',
        });
        continue;
      }

      const resolvedVerb = semanticVerb.refId
        ? verbsById.get(semanticVerb.refId)
        : verbsByCanonical.get(semanticVerb.canonical);
      const effectiveVerbId = resolvedVerb?.id ?? semanticVerb.refId;
      const canonicalVerb = resolvedVerb?.canonical ?? semanticVerb.canonical;
      const backendHints = uniq([...semanticVerb.backendHints, ...(resolvedVerb?.backendHints ?? [])]);

      if (!effectiveVerbId) {
        diagnostics.push({
          code: 'VERB_UNREGISTERED',
          stepId,
          severity: 'warning',
          message: `No registered verb-definition matches canonical verb "${canonicalVerb}". Instrument-backed compilation will be skipped.`,
          subject: 'verb',
        });
      }

      const candidateEquipmentIds = uniq(
        requiredInstrumentRole
          ? [instrumentRoleMap.get(requiredInstrumentRole)].filter((value): value is string => typeof value === 'string')
          : [...instrumentRoleMap.values()],
      );

      if (requiredInstrumentRole && candidateEquipmentIds.length === 0) {
        diagnostics.push({
          code: 'INSTRUMENT_BINDING_MISSING',
          stepId,
          severity: 'warning',
          message: `Step ${stepId} requires instrument role "${requiredInstrumentRole}" but no binding was supplied.`,
          subject: 'equipment',
        });
      }

      if (effectiveVerbId) {
        for (const equipmentId of candidateEquipmentIds) {
          const capability = await this.capabilityService.resolveEquipmentSupport({
            equipmentId,
            verbId: effectiveVerbId,
            ...(methodId ? { methodId } : {}),
          });

          if (!capability.supported) {
            diagnostics.push({
              code: 'CAPABILITY_UNSUPPORTED',
              stepId,
              severity: 'warning',
              message: `Equipment ${equipmentId} does not support ${canonicalVerb}${methodId ? ` (${methodId})` : ''}.`,
              subject: 'equipment',
              disposition: 'blocked',
              recordIds: [equipmentId],
            });
            continue;
          }

          // Check labware compatibility if the capability has acceptedLabware constraints
          const matchedCapability = capability.matches[0];
          const acceptedLabware = matchedCapability?.constraints?.acceptedLabware as Array<{ labwareRef: { id: string } }> | undefined;
          const stepLabwareRef = step.labwareRef as { id?: string } | undefined;

          if (acceptedLabware && acceptedLabware.length > 0 && stepLabwareRef?.id) {
            const labwareAccepted = acceptedLabware.some(
              (al) => al.labwareRef?.id === stepLabwareRef.id
            );
            if (!labwareAccepted) {
              diagnostics.push({
                code: 'labware-incompatible',
                stepId,
                severity: 'warning',
                message: `Labware ${stepLabwareRef.id} is not in the accepted labware list for ${equipmentId} performing ${canonicalVerb}`,
                subject: 'equipment',
              });
            }
          }

          const admissibility = await this.admissibilityService.evaluate(admissibilityInput({
            policyProfiles,
            scope,
            equipmentId,
            verbId: effectiveVerbId,
            ...(methodId ? { methodId } : {}),
            ...(input.context?.operatorPersonId ? { personId: input.context.operatorPersonId } : {}),
            ...(input.context?.supervisorPersonId ? { supervisorPersonId: input.context.supervisorPersonId } : {}),
          }));

          for (const finding of admissibility.findings) {
            diagnostics.push({
              code: finding.code,
              stepId,
              severity: diagnosticSeverity(finding.disposition),
              message: finding.message,
              subject: mapFindingSubject(finding.subject),
              disposition: finding.disposition,
              ...(finding.recordIds ? { recordIds: finding.recordIds } : {}),
            });
          }

          const backendIds = uniq(
            capability.matches.flatMap((match) => match.backendImplementations).filter((value) => value.length > 0),
          );
          const resolvedBackendIds = backendIds.length > 0
            ? backendIds
            : uniq([
                ...(capability.equipment?.executionBackends ?? []),
                ...(capability.equipmentClass?.executionBackends ?? []),
              ]);

          for (const backendId of resolvedBackendIds.length > 0 ? resolvedBackendIds : ['instrument']) {
            candidates.push({
              backendId,
              executionMode: 'instrument',
              disposition: admissibility.disposition,
              requiresConfirmation: admissibility.disposition === 'needs-confirmation',
              equipmentId,
              recordIds: uniq([equipmentId, ...admissibility.findings.flatMap((finding) => finding.recordIds ?? [])]),
              notes: `Resolved against equipment ${equipmentId}.`,
            });
          }
        }
      }

      const manualPolicyDecision = this.policyService.evaluateActions({
        profiles: policyProfiles,
        scope,
        actions: [
          {
            action: 'apply-remediation',
            target: 'manual-backend',
            detail: `Use a manual backend for step ${stepId}.`,
          },
        ],
      }).decisions[0]!;

      if (stepManualAllowed(step)) {
        let manualDisposition = manualPolicyDecision.disposition;
        const manualRecordIds: string[] = [];

        if (effectiveVerbId) {
          const manualAdmissibility = await this.admissibilityService.evaluate(admissibilityInput({
            policyProfiles,
            scope,
            verbId: effectiveVerbId,
            ...(methodId ? { methodId } : {}),
            ...(input.context?.operatorPersonId ? { personId: input.context.operatorPersonId } : {}),
            ...(input.context?.supervisorPersonId ? { supervisorPersonId: input.context.supervisorPersonId } : {}),
          }));
          manualDisposition = maxDisposition(manualDisposition, manualAdmissibility.disposition);
          manualRecordIds.push(...manualAdmissibility.findings.flatMap((finding) => finding.recordIds ?? []));
          for (const finding of manualAdmissibility.findings) {
            diagnostics.push({
              code: `${finding.code}_MANUAL`,
              stepId,
              severity: diagnosticSeverity(maxDisposition(finding.disposition, manualPolicyDecision.disposition)),
              message: `${finding.message} Manual fallback context.`,
              subject: mapFindingSubject(finding.subject),
              disposition: maxDisposition(finding.disposition, manualPolicyDecision.disposition),
              backendId: 'manual',
              ...(finding.recordIds ? { recordIds: finding.recordIds } : {}),
            });
          }
        } else if (input.context?.operatorPersonId) {
          diagnostics.push({
            code: 'MANUAL_AUTHORIZATION_UNVERIFIED',
            stepId,
            severity: 'warning',
            message: `Manual fallback for ${stepId} cannot evaluate operator authorization until the semantic verb is registered.`,
            subject: 'policy',
            disposition: 'needs-confirmation',
            backendId: 'manual',
          });
          manualDisposition = maxDisposition(manualDisposition, 'needs-confirmation');
        }

        candidates.push({
          backendId: 'manual',
          executionMode: 'manual',
          disposition: manualDisposition,
          requiresConfirmation: manualDisposition === 'needs-confirmation',
          authority: manualPolicyDecision.authority,
          recordIds: uniq(manualRecordIds),
          notes: `Manual fallback for ${stepId}.`,
        });
      } else {
        diagnostics.push({
          code: 'MANUAL_FALLBACK_DISABLED',
          stepId,
          severity: 'warning',
          message: `Step ${stepId} explicitly disallows manual fallback.`,
          subject: 'backend',
        });
      }

      const selected = chooseCandidate(candidates, preferredBackendIds, backendHints);
      const selectedDisposition = selected?.disposition ?? 'blocked';
      const selectedExecutionMode = selected?.executionMode ?? 'manual';

      if (!selected) {
        diagnostics.push({
          code: 'NO_ADMISSIBLE_BACKEND',
          stepId,
          severity: 'error',
          message: `No admissible backend is available for step ${stepId}.`,
          subject: 'backend',
          disposition: 'blocked',
        });
      }

      for (const candidate of candidates) {
        if (selected && candidate.backendId === selected.backendId && candidate.equipmentId === selected.equipmentId) continue;
        if (candidate.disposition === 'blocked') continue;
        remediationOptions.push({
          code: candidate.executionMode === 'manual' ? 'MANUAL_ALTERNATIVE' : 'INSTRUMENT_ALTERNATIVE',
          stepId,
          action: candidate.executionMode === 'manual' ? 'use-manual-backend' : 'bind-instrument-backend',
          disposition: candidate.disposition,
          message: candidate.executionMode === 'manual'
            ? `Manual execution is admissible for step ${stepId}.`
            : `Instrument backend ${candidate.backendId} on ${candidate.equipmentId} is admissible for step ${stepId}.`,
          ...(candidate.authority ? { authority: candidate.authority } : {}),
          backendId: candidate.backendId,
          ...(candidate.equipmentId ? { equipmentRef: equipmentRef(candidate.equipmentId) } : {}),
        });
      }

      const stepNotes = selected?.notes ?? asString(step.notes);
      steps.push({
        stepId,
        kind,
        canonicalVerb,
        ...(effectiveVerbId ? { verbRef: verbRef(effectiveVerbId) } : {}),
        ...(methodId ? { methodId } : {}),
        ...(selected?.backendId ? { selectedBackendId: selected.backendId } : {}),
        executionMode: selectedExecutionMode,
        ...(selected?.equipmentId ? { equipmentRef: equipmentRef(selected.equipmentId) } : {}),
        disposition: selectedDisposition,
        requiresConfirmation: selected?.requiresConfirmation ?? false,
        ...(stepNotes !== undefined ? { notes: stepNotes } : {}),
      });
    }

    // Build localProtocol before returning
    // Map CompiledProtocolStep to the format expected by buildLocalProtocol
    const mappedSteps = steps.map((step) => {
      const mapped: { stepId: string; equipmentRef?: { kind: 'record'; id: string; type: string } } = {
        stepId: step.stepId,
      };
      if (step.equipmentRef) {
        mapped.equipmentRef = {
          kind: 'record',
          id: step.equipmentRef.id,
          type: step.equipmentRef.type ?? 'equipment',
        };
      }
      return mapped;
    });
    localProtocol = buildLocalProtocol({
      globalProtocolRecordId: protocol.recordId as string,
      globalProtocolTitle: protocol.title as string,
      compiledSteps: mappedSteps,
      status: 'draft',
    });

    return {
      status: steps.some((step) => step.disposition === 'blocked') ? 'blocked' : 'ready',
      sourceLayer: 'universal',
      targetLayer: 'lab',
      diagnostics,
      remediationOptions,
      steps,
      activePolicy,
      localProtocol,
    };
  }
}
