import type { RecordEnvelope, RecordStore } from '../../store/types.js';
import { CompilerKernel } from '../CompilerKernel.js';
import type { CandidateBinding, CompilerDiagnostic, CompilerProvenanceSource, NormalizedIntent, RemediationSuggestion } from '../types.js';
import { parseConcentration, toStoredConcentration, normalizeConcentrationUnit, type Concentration } from '../../materials/concentration.js';
import { parseStoredCompositionEntries, type ParsedCompositionEntry } from '../../materials/composition.js';
import { PolicyProfileService, compareProfiles, scopeIdentifier } from '../../policy/PolicyProfileService.js';
import type {
  MaterialCompilerBindingPayload,
  MaterialCompilerEventDraft,
  MaterialCompilerPlanStep,
  MaterialCompilerPolicyProfile,
  MaterialCompilerPolicySettings,
  MaterialCompilerRecordRef,
  MaterialCompilerRequest,
  MaterialCompilerResult,
  MaterialPolicySettingOrigin,
  MaterialResolvedPolicy,
  NormalizedMaterialIntentPayload,
} from './types.js';

const SCHEMA_IDS = {
  material: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
  materialSpec: 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml',
  materialInstance: 'https://computable-lab.com/schema/computable-lab/material-instance.schema.yaml',
  aliquot: 'https://computable-lab.com/schema/computable-lab/aliquot.schema.yaml',
} as const;

const DEFAULT_MATERIAL_POLICY_SETTINGS: MaterialCompilerPolicySettings = {
  mode: 'execution-planning',
  concentrationSemantics: 'formulation',
  clarificationBehavior: 'confirm-near-match',
  remediationBehavior: 'suggest',
};

type RefShape = {
  kind: 'record' | 'ontology';
  id: string;
  type?: string;
  label?: string;
  namespace?: string;
  uri?: string;
};

type SemanticMatch = {
  envelope: RecordEnvelope;
  payload: Record<string, unknown>;
  name: string;
};

type FormulationMatch = {
  envelope: RecordEnvelope;
  payload: Record<string, unknown>;
  name: string;
  analyteId?: string | undefined;
  solventId?: string | undefined;
  concentration?: Concentration | undefined;
};

type MaterialSourceMatch = {
  envelope: RecordEnvelope;
  payload: Record<string, unknown>;
  name: string;
  schemaId: string;
  kind: 'material-instance' | 'aliquot';
};

type RequestedAction = {
  action: 'auto-create' | 'substitute' | 'use-placeholder' | 'apply-remediation';
  target: string;
  detail?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asPayload(value: unknown): Record<string, unknown> | null {
  return isObject(value) ? value : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function refValue(value: unknown): RefShape | undefined {
  if (!isObject(value)) return undefined;
  const id = stringValue(value.id);
  if (!id) return undefined;
  const kind = value.kind === 'ontology' ? 'ontology' : 'record';
  return {
    kind,
    id,
    ...(stringValue(value.type) ? { type: stringValue(value.type)! } : {}),
    ...(stringValue(value.label) ? { label: stringValue(value.label)! } : {}),
    ...(stringValue(value.namespace) ? { namespace: stringValue(value.namespace)! } : {}),
    ...(stringValue(value.uri) ? { uri: stringValue(value.uri)! } : {}),
  };
}

function toRecordRef(id: string, type: string, label?: string): MaterialCompilerRecordRef {
  return { kind: 'record', id, type, ...(label ? { label } : {}) };
}

function canonicalName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function slugify(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 48) || 'UNKNOWN';
}

function resolveMaterialPolicy(
  profiles: MaterialCompilerPolicyProfile[],
  scope: MaterialCompilerRequest['activeScope'],
): MaterialResolvedPolicy {
  const matchedProfiles = profiles
    .filter((profile) => scopeIdentifier(scope, profile.scope) === profile.scopeId)
    .sort(compareProfiles);

  const defaultOrigin: MaterialPolicySettingOrigin = {
    profileId: 'default',
    scope: 'organization',
    scopeId: scope.organizationId,
    priority: Number.MIN_SAFE_INTEGER,
  };
  const settings: MaterialCompilerPolicySettings = { ...DEFAULT_MATERIAL_POLICY_SETTINGS };
  const origins: MaterialResolvedPolicy['origins'] = {
    mode: defaultOrigin,
    concentrationSemantics: defaultOrigin,
    clarificationBehavior: defaultOrigin,
    remediationBehavior: defaultOrigin,
  };
  const trace: MaterialResolvedPolicy['trace'] = [];

  for (const profile of matchedProfiles) {
    const profileSettings = profile.materialSettings ?? {};
    const overrides: Array<keyof MaterialCompilerPolicySettings> = [];
    if (profileSettings.mode !== undefined) overrides.push('mode');
    if (profileSettings.concentrationSemantics !== undefined) overrides.push('concentrationSemantics');
    if (profileSettings.clarificationBehavior !== undefined) overrides.push('clarificationBehavior');
    if (profileSettings.remediationBehavior !== undefined) overrides.push('remediationBehavior');
    if (overrides.length === 0) continue;
    const origin = {
      profileId: profile.id,
      scope: profile.scope,
      scopeId: profile.scopeId,
      priority: profile.priority ?? 0,
    };
    if (profileSettings.mode !== undefined) {
      settings.mode = profileSettings.mode;
      origins.mode = origin;
    }
    if (profileSettings.concentrationSemantics !== undefined) {
      settings.concentrationSemantics = profileSettings.concentrationSemantics;
      origins.concentrationSemantics = origin;
    }
    if (profileSettings.clarificationBehavior !== undefined) {
      settings.clarificationBehavior = profileSettings.clarificationBehavior;
      origins.clarificationBehavior = origin;
    }
    if (profileSettings.remediationBehavior !== undefined) {
      settings.remediationBehavior = profileSettings.remediationBehavior;
      origins.remediationBehavior = origin;
    }
    trace.push({
      profileId: profile.id,
      scope: profile.scope,
      scopeId: profile.scopeId,
      priority: profile.priority ?? 0,
      overrides,
    });
  }

  return { scope, settings, origins, trace };
}

function formatConcentration(concentration?: Concentration): string | undefined {
  if (!concentration) return undefined;
  return `${concentration.value} ${normalizeConcentrationUnit(concentration.unit)}`;
}

function sameConcentration(left?: Concentration, right?: Concentration): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return left.value === right.value && normalizeConcentrationUnit(left.unit) === normalizeConcentrationUnit(right.unit);
}

function extractMaterialDomain(intent: NormalizedMaterialIntentPayload, role: 'analyte' | 'solvent'): string {
  if (role === 'solvent') return 'chemical';
  return intent.concentration || intent.solventName ? 'chemical' : 'other';
}

function storedRef(id: string, type: string, label?: string): Record<string, unknown> {
  return { kind: 'record', id, type, ...(label ? { label } : {}) };
}

function deriveFormulationComposition(
  analyteRef: MaterialCompilerRecordRef,
  solventRef?: MaterialCompilerRecordRef,
  concentration?: Concentration,
): Array<Record<string, unknown>> {
  const composition: Array<Record<string, unknown>> = [
    {
      component_ref: storedRef(analyteRef.id, analyteRef.type, analyteRef.label),
      role: 'solute',
      ...(concentration ? { concentration: toStoredConcentration(concentration) } : {}),
    },
  ];
  if (solventRef) {
    composition.push({
      component_ref: storedRef(solventRef.id, solventRef.type, solventRef.label),
      role: 'solvent',
    });
  }
  return composition;
}

function firstSolvent(entries: ParsedCompositionEntry[]): RefShape | undefined {
  return entries.find((entry) => entry.role === 'solvent')?.componentRef;
}

function soluteConcentration(entries: ParsedCompositionEntry[], analyteId?: string): Concentration | undefined {
  const preferred = analyteId
    ? entries.find((entry) => entry.role === 'solute' && entry.componentRef.id === analyteId && entry.concentration)
    : undefined;
  return preferred?.concentration ?? entries.find((entry) => entry.role === 'solute' && entry.concentration)?.concentration;
}

function parseFormulationSignature(payload: Record<string, unknown>): FormulationMatch {
  const formulation = asPayload(payload.formulation);
  const composition = parseStoredCompositionEntries(formulation?.composition);
  const materialRef = refValue(payload.material_ref);
  const concentration =
    parseConcentration(formulation?.concentration)
    ?? soluteConcentration(composition, materialRef?.id);
  const solventRef = refValue(formulation?.solvent_ref) ?? firstSolvent(composition);
  return {
    envelope: { recordId: stringValue(payload.id) ?? 'UNKNOWN', schemaId: SCHEMA_IDS.materialSpec, payload },
    payload,
    name: stringValue(payload.name) ?? stringValue(payload.id) ?? 'Unnamed formulation',
    ...(materialRef?.id ? { analyteId: materialRef.id } : {}),
    ...(solventRef?.id ? { solventId: solventRef.id } : {}),
    ...(concentration ? { concentration } : {}),
  };
}

function bindingFromMatch(
  slot: CandidateBinding<MaterialCompilerBindingPayload>['slot'],
  match: {
    recordId: string;
    recordType: MaterialCompilerBindingPayload['recordType'];
    label: string;
    resolution: CandidateBinding<MaterialCompilerBindingPayload>['resolution'];
  },
): CandidateBinding<MaterialCompilerBindingPayload> {
  return {
    bindingId: `${slot}:${match.recordId}`,
    slot,
    candidateType: match.recordType,
    candidateId: match.recordId,
    resolution: match.resolution,
    payload: {
      recordId: match.recordId,
      recordType: match.recordType,
      label: match.label,
      ...(match.resolution === 'new-record' ? { created: true } : {}),
    },
    provenance: [
      {
        kind: 'record',
        id: match.recordId,
        label: match.label,
      },
    ],
  };
}

function buildNearMatchRemediation(
  ids: string[],
  options: {
    allowPlanningSwitch: boolean;
    allowRemediation: boolean;
  },
): RemediationSuggestion[] | undefined {
  const remediation: RemediationSuggestion[] = [];
  if (options.allowRemediation && ids.length > 0) {
    remediation.push({
      kind: 'confirm-choice',
      message: `Review near matches: ${ids.slice(0, 3).join(', ')}.`,
      actionLabel: 'Review near matches',
    });
  }
  if (options.allowRemediation && options.allowPlanningSwitch) {
    remediation.push({
      kind: 'adjust-policy',
      message: 'Switch to semantic planning mode to allow a placeholder material source.',
      actionLabel: 'Switch to planning mode',
    });
  }
  return remediation.length > 0 ? remediation : undefined;
}

function buildStrictInventoryRemediation(
  formulationId: string,
  canSuggestPlanningMode: boolean,
): RemediationSuggestion[] {
  const remediation: RemediationSuggestion[] = [
    {
      kind: 'provide-missing-fact',
      message: `Provide an existing source instance for ${formulationId}.`,
      actionLabel: 'Select source instance',
    },
  ];
  if (canSuggestPlanningMode) {
    remediation.push({
      kind: 'adjust-policy',
      message: 'Switch to semantic planning mode if a placeholder source is acceptable.',
      actionLabel: 'Use planning mode',
    });
  }
  return remediation;
}

async function listBySchema(store: RecordStore, schemaId: string): Promise<RecordEnvelope[]> {
  return store.list({ schemaId, limit: 10000 });
}

function materialMatchesName(payload: Record<string, unknown>, targetName: string): boolean {
  const candidateNames = [
    stringValue(payload.name),
    ...(Array.isArray(payload.synonyms) ? payload.synonyms.map((entry) => stringValue(entry)) : []),
  ].filter((entry): entry is string => Boolean(entry));
  const target = canonicalName(targetName);
  return candidateNames.some((entry) => canonicalName(entry) === target);
}

function isUsableSource(payload: Record<string, unknown>): boolean {
  const status = stringValue(payload.status);
  return status === undefined || status === 'available';
}

async function ensureUniqueId(
  store: RecordStore,
  preferred: string,
): Promise<string> {
  let index = 0;
  let next = preferred;
  while (await store.exists(next)) {
    index += 1;
    next = `${preferred}-${index}`;
  }
  return next;
}

export class MaterialCompilerService {
  private readonly kernel = new CompilerKernel();

  private readonly policyProfileService = new PolicyProfileService();

  constructor(private readonly store: RecordStore) {}

  async compile(request: MaterialCompilerRequest): Promise<MaterialCompilerResult> {
    const persist = request.persist ?? true;
    const materialPolicy = resolveMaterialPolicy(request.policyProfiles, request.activeScope);
    const activePolicy = this.policyProfileService.resolveActiveProfile(request.policyProfiles, request.activeScope);
    const intent = request.normalizedIntent;
    const payload = intent.payload;
    const candidateBindings: Array<CandidateBinding<MaterialCompilerBindingPayload>> = [];
    const diagnostics: CompilerDiagnostic[] = [];
    const requestedActions: RequestedAction[] = [];
    const plan: MaterialCompilerPlanStep[] = [];
    const notes: Array<{ stage: 'normalize' | 'bind' | 'policy' | 'plan' | 'execute'; message: string; sourceIds?: string[] }> = [
      {
        stage: 'normalize',
        message: `Compiling material intent for ${payload.analyteName}.`,
      },
    ];
    const createdRecordIds: string[] = [];
    const extraSources: CompilerProvenanceSource[] = [];
    const resolved: MaterialCompilerResult['resolved'] = {
      analyte: { slot: 'analyte', resolution: 'missing' },
    };

    const canAutoCreate = activePolicy.settings.allowAutoCreate === 'allow';
    const canSuggestRemediation =
      activePolicy.settings.allowRemediation !== 'deny'
      && materialPolicy.settings.remediationBehavior === 'suggest';
    const canPlaceholder = activePolicy.settings.allowPlaceholders === 'allow';

    const semanticRecords = await listBySchema(this.store, SCHEMA_IDS.material);
    const analyteMatch = this.findSemanticMatch(semanticRecords, payload.analyteName);
    const analyteRef = await this.resolveSemanticMaterial({
      slot: 'analyte',
      name: payload.analyteName,
      ...(analyteMatch ? { match: analyteMatch } : {}),
      domain: extractMaterialDomain(payload, 'analyte'),
      persist,
      canAutoCreate,
      requestedActions,
      diagnostics,
      plan,
      notes,
      candidateBindings,
      createdRecordIds,
      resolved,
    });

    let solventRef: MaterialCompilerRecordRef | undefined;
    if (payload.solventName) {
      const solventMatch = this.findSemanticMatch(semanticRecords, payload.solventName);
      solventRef = await this.resolveSemanticMaterial({
        slot: 'solvent',
        name: payload.solventName,
        ...(solventMatch ? { match: solventMatch } : {}),
        domain: extractMaterialDomain(payload, 'solvent'),
        persist,
        canAutoCreate,
        requestedActions,
        diagnostics,
        plan,
        notes,
        candidateBindings,
        createdRecordIds,
        resolved,
      });
    }

    let formulationRef: MaterialCompilerRecordRef | undefined;
    const requiresFormulation = Boolean(
      analyteRef
      && payload.concentration
      && payload.solventName
      && materialPolicy.settings.concentrationSemantics !== 'event',
    );

    if (requiresFormulation && analyteRef && solventRef) {
      const formulationMatches = await listBySchema(this.store, SCHEMA_IDS.materialSpec);
      const formulationResolution = await this.resolveFormulation({
        matches: formulationMatches.map((envelope) => {
          const payloadObj = asPayload(envelope.payload) ?? {};
          const signature = parseFormulationSignature(payloadObj);
          return {
            ...signature,
            envelope,
          };
        }),
        analyteRef,
        solventRef,
        ...(payload.concentration ? { concentration: payload.concentration } : {}),
        persist,
        canAutoCreate,
        canSuggestRemediation,
        clarificationBehavior: materialPolicy.settings.clarificationBehavior,
        requestedActions,
        diagnostics,
        plan,
        notes,
        candidateBindings,
        createdRecordIds,
        resolved,
      });
      formulationRef = formulationResolution;
    }

    let materialSourceRef:
      | { id: string; type: 'material-instance' | 'aliquot'; label: string }
      | { id: string; type: 'placeholder'; label: string }
      | undefined;
    if (analyteRef) {
      materialSourceRef = await this.resolveMaterialSource({
        analyteRef,
        ...(formulationRef ? { formulationRef } : {}),
        ...(solventRef ? { solventRef } : {}),
        persist,
        canPlaceholder,
        canSuggestRemediation,
        mode: materialPolicy.settings.mode,
        requestedActions,
        diagnostics,
        plan,
        notes,
        candidateBindings,
        resolved,
      });
    }

    const eventDraft = this.buildEventDraft({
      intent,
      ...(analyteRef ? { analyteRef } : {}),
      ...(formulationRef ? { formulationRef } : {}),
      ...(materialSourceRef ? { materialSourceRef } : {}),
      concentrationSemantics: materialPolicy.settings.concentrationSemantics,
    });

    if (eventDraft) {
      notes.push({
        stage: 'plan',
        message: 'Generated event-ready add_material output.',
      });
      plan.push({
        kind: 'event',
        detail: 'Emit add_material event draft',
        status: 'resolved',
      });
    }

    const result = this.kernel.evaluateRequest({
      normalizedIntent: request.normalizedIntent,
      candidateBindings,
      requestedActions,
      diagnostics,
      policyProfiles: request.policyProfiles,
      activeScope: request.activeScope,
      knownFacts: {
        targetRole: payload.targetRole,
        targetWell: payload.targetWell,
      },
      plan: {
        planId: `${intent.intentId}:material-compile`,
        steps: plan,
      },
      provenance: {
        actor: request.actor ?? 'material-compiler',
        sources: extraSources,
        notes,
      },
    });

    return {
      ...result,
      materialPolicy,
      resolved,
      ...(eventDraft ? { eventDraft } : {}),
      createdRecordIds,
    };
  }

  private findSemanticMatch(records: RecordEnvelope[], name: string): SemanticMatch | undefined {
    const exact = records
      .map((envelope) => ({ envelope, payload: asPayload(envelope.payload) ?? {} }))
      .find(({ payload }) => materialMatchesName(payload, name));
    if (!exact) return undefined;
    return {
      envelope: exact.envelope,
      payload: exact.payload,
      name: stringValue(exact.payload.name) ?? exact.envelope.recordId,
    };
  }

  private async resolveSemanticMaterial(args: {
    slot: 'analyte' | 'solvent';
    name: string;
    match?: SemanticMatch;
    domain: string;
    persist: boolean;
    canAutoCreate: boolean;
    requestedActions: RequestedAction[];
    diagnostics: CompilerDiagnostic[];
    plan: MaterialCompilerPlanStep[];
    notes: Array<{ stage: 'normalize' | 'bind' | 'policy' | 'plan' | 'execute'; message: string; sourceIds?: string[] }>;
    candidateBindings: Array<CandidateBinding<MaterialCompilerBindingPayload>>;
    createdRecordIds: string[];
    resolved: MaterialCompilerResult['resolved'];
  }): Promise<MaterialCompilerRecordRef | undefined> {
    if (args.match) {
      args.candidateBindings.push(bindingFromMatch(args.slot, {
        recordId: args.match.envelope.recordId,
        recordType: 'material',
        label: args.match.name,
        resolution: 'exact',
      }));
      args.plan.push({
        kind: 'semantic',
        detail: `Reuse ${args.slot} material ${args.match.envelope.recordId}`,
        status: 'resolved',
      });
      args.notes.push({
        stage: 'bind',
        message: `Reused ${args.slot} material ${args.match.envelope.recordId}.`,
        sourceIds: [args.match.envelope.recordId],
      });
      args.resolved[args.slot] = {
        slot: args.slot,
        resolution: 'exact',
        recordId: args.match.envelope.recordId,
        recordType: 'material',
        label: args.match.name,
      };
      return toRecordRef(args.match.envelope.recordId, 'material', args.match.name);
    }

    args.requestedActions.push({
      action: 'auto-create',
      target: args.slot,
      detail: args.name,
    });

    if (!args.persist || !args.canAutoCreate) {
      args.diagnostics.push({
        code: 'MATERIAL_SEMANTIC_MISSING',
        stage: 'bind',
        severity: 'warning',
        outcome: args.canAutoCreate ? 'needs-confirmation' : 'policy-blocked',
        message: `No semantic material matched "${args.name}".`,
      });
      args.plan.push({
        kind: 'semantic',
        detail: `Create ${args.slot} material ${args.name}`,
        status: 'blocked',
      });
      return undefined;
    }

    const baseId = `MAT-${slugify(args.name)}`;
    const recordId = await ensureUniqueId(this.store, baseId);
    const payload = {
      kind: 'material',
      id: recordId,
      name: args.name,
      domain: args.domain,
      tags: ['compiler-created', args.slot],
    };
    await this.store.create({
      envelope: {
        recordId,
        schemaId: SCHEMA_IDS.material,
        payload,
      },
      message: `Create ${args.slot} material ${recordId}`,
    });
    args.createdRecordIds.push(recordId);
    args.candidateBindings.push(bindingFromMatch(args.slot, {
      recordId,
      recordType: 'material',
      label: args.name,
      resolution: 'new-record',
    }));
    args.plan.push({
      kind: 'semantic',
      detail: `Create ${args.slot} material ${recordId}`,
      status: 'created',
    });
    args.notes.push({
      stage: 'bind',
      message: `Created ${args.slot} material ${recordId}.`,
      sourceIds: [recordId],
    });
    args.resolved[args.slot] = {
      slot: args.slot,
      resolution: 'new-record',
      recordId,
      recordType: 'material',
      label: args.name,
    };
    return toRecordRef(recordId, 'material', args.name);
  }

  private async resolveFormulation(args: {
    matches: FormulationMatch[];
    analyteRef: MaterialCompilerRecordRef;
    solventRef: MaterialCompilerRecordRef;
    concentration?: Concentration;
    persist: boolean;
    canAutoCreate: boolean;
    canSuggestRemediation: boolean;
    clarificationBehavior: 'confirm-near-match' | 'diagnostic-only';
    requestedActions: RequestedAction[];
    diagnostics: CompilerDiagnostic[];
    plan: MaterialCompilerPlanStep[];
    notes: Array<{ stage: 'normalize' | 'bind' | 'policy' | 'plan' | 'execute'; message: string; sourceIds?: string[] }>;
    candidateBindings: Array<CandidateBinding<MaterialCompilerBindingPayload>>;
    createdRecordIds: string[];
    resolved: MaterialCompilerResult['resolved'];
  }): Promise<MaterialCompilerRecordRef | undefined> {
    const exact = args.matches.find((match) =>
      match.analyteId === args.analyteRef.id
      && match.solventId === args.solventRef.id
      && sameConcentration(match.concentration, args.concentration));

    if (exact) {
      args.candidateBindings.push(bindingFromMatch('formulation', {
        recordId: exact.envelope.recordId,
        recordType: 'material-spec',
        label: exact.name,
        resolution: 'exact',
      }));
      args.plan.push({
        kind: 'formulation',
        detail: `Reuse formulation ${exact.envelope.recordId}`,
        status: 'resolved',
      });
      args.notes.push({
        stage: 'bind',
        message: `Reused formulation ${exact.envelope.recordId}.`,
        sourceIds: [exact.envelope.recordId],
      });
      args.resolved.formulation = {
        slot: 'formulation',
        resolution: 'exact',
        recordId: exact.envelope.recordId,
        recordType: 'material-spec',
        label: exact.name,
      };
      return toRecordRef(exact.envelope.recordId, 'material-spec', exact.name);
    }

    const nearMatches = args.matches.filter((match) =>
      match.analyteId === args.analyteRef.id
      && match.solventId === args.solventRef.id
      && !sameConcentration(match.concentration, args.concentration));

    if (nearMatches.length > 0) {
      if (args.clarificationBehavior === 'confirm-near-match') {
        args.requestedActions.push({
          action: 'substitute',
          target: 'formulation',
          detail: nearMatches[0]!.envelope.recordId,
        });
      }
      const remediation = buildNearMatchRemediation(
        nearMatches.map((match) => match.envelope.recordId),
        {
          allowPlanningSwitch: true,
          allowRemediation: args.canSuggestRemediation,
        },
      );
      args.diagnostics.push({
        code: 'FORMULATION_EXACT_MATCH_REQUIRED',
        stage: 'bind',
        severity: 'warning',
        outcome: args.clarificationBehavior === 'confirm-near-match' ? 'needs-confirmation' : 'policy-blocked',
        message: `Explicit concentration ${formatConcentration(args.concentration)} has no exact formulation match; near matches exist.`,
        ...(remediation ? { remediation } : {}),
        provenance: nearMatches.slice(0, 3).map((match) => ({
          kind: 'record',
          id: match.envelope.recordId,
          label: match.name,
        })),
      });
    }

    args.requestedActions.push({
      action: 'auto-create',
      target: 'formulation',
      detail: `${formatConcentration(args.concentration)} ${args.analyteRef.label ?? args.analyteRef.id} in ${args.solventRef.label ?? args.solventRef.id}`,
    });

    if (!args.persist || !args.canAutoCreate) {
      args.diagnostics.push({
        code: 'FORMULATION_MISSING',
        stage: 'bind',
        severity: 'warning',
        outcome: args.canAutoCreate ? 'needs-confirmation' : 'policy-blocked',
        message: 'No exact formulation matched the requested material intent.',
      });
      args.plan.push({
        kind: 'formulation',
        detail: 'Create exact formulation',
        status: 'blocked',
      });
      return undefined;
    }

    const recordId = await ensureUniqueId(
      this.store,
      `MSP-${slugify(`${formatConcentration(args.concentration) ?? 'FORMULATION'}-${args.analyteRef.label ?? args.analyteRef.id}-IN-${args.solventRef.label ?? args.solventRef.id}`)}`,
    );
    const name = `${formatConcentration(args.concentration) ?? 'Formulation'} ${args.analyteRef.label ?? args.analyteRef.id} in ${args.solventRef.label ?? args.solventRef.id}`;
    await this.store.create({
      envelope: {
        recordId,
        schemaId: SCHEMA_IDS.materialSpec,
        payload: {
          kind: 'material-spec',
          id: recordId,
          name,
          material_ref: storedRef(args.analyteRef.id, 'material', args.analyteRef.label),
          formulation: {
            ...(args.concentration ? { concentration: toStoredConcentration(args.concentration) } : {}),
            solvent_ref: storedRef(args.solventRef.id, 'material', args.solventRef.label),
            composition: deriveFormulationComposition(args.analyteRef, args.solventRef, args.concentration),
          },
          tags: ['compiler-created'],
        },
      },
      message: `Create material spec ${recordId}`,
    });
    args.createdRecordIds.push(recordId);
    args.candidateBindings.push(bindingFromMatch('formulation', {
      recordId,
      recordType: 'material-spec',
      label: name,
      resolution: 'new-record',
    }));
    args.plan.push({
      kind: 'formulation',
      detail: `Create formulation ${recordId}`,
      status: 'created',
    });
    args.notes.push({
      stage: 'bind',
      message: `Created formulation ${recordId}.`,
      sourceIds: [recordId],
    });
    args.resolved.formulation = {
      slot: 'formulation',
      resolution: 'new-record',
      recordId,
      recordType: 'material-spec',
      label: name,
    };
    return toRecordRef(recordId, 'material-spec', name);
  }

  private async resolveMaterialSource(args: {
    formulationRef?: MaterialCompilerRecordRef;
    analyteRef: MaterialCompilerRecordRef;
    solventRef?: MaterialCompilerRecordRef;
    persist: boolean;
    canPlaceholder: boolean;
    canSuggestRemediation: boolean;
    mode: 'semantic-planning' | 'execution-planning' | 'strict-inventory';
    requestedActions: RequestedAction[];
    diagnostics: CompilerDiagnostic[];
    plan: MaterialCompilerPlanStep[];
    notes: Array<{ stage: 'normalize' | 'bind' | 'policy' | 'plan' | 'execute'; message: string; sourceIds?: string[] }>;
    candidateBindings: Array<CandidateBinding<MaterialCompilerBindingPayload>>;
    resolved: MaterialCompilerResult['resolved'];
  }): Promise<
    | { id: string; type: 'material-instance' | 'aliquot'; label: string }
    | { id: string; type: 'placeholder'; label: string }
    | undefined
  > {
    if (args.formulationRef) {
      const source = await this.findExactMaterialSource(args.formulationRef.id);
      if (source) {
        args.candidateBindings.push(bindingFromMatch('material-source', {
          recordId: source.envelope.recordId,
          recordType: source.kind,
          label: source.name,
          resolution: 'exact',
        }));
        args.plan.push({
          kind: 'instance',
          detail: `Reuse ${source.kind} ${source.envelope.recordId}`,
          status: 'resolved',
        });
        args.notes.push({
          stage: 'bind',
          message: `Reused ${source.kind} ${source.envelope.recordId}.`,
          sourceIds: [source.envelope.recordId],
        });
        args.resolved.materialSource = {
          slot: 'material-source',
          resolution: 'exact',
          recordId: source.envelope.recordId,
          recordType: source.kind,
          label: source.name,
        };
        return { id: source.envelope.recordId, type: source.kind, label: source.name };
      }
    }

    if (args.mode === 'strict-inventory') {
      const formulationId = args.formulationRef?.id ?? args.analyteRef.id;
      args.diagnostics.push({
        code: 'STRICT_INVENTORY_MISSING_SOURCE',
        stage: 'plan',
        severity: 'error',
        outcome: 'execution-blocked',
        message: `No usable source instance exists for ${formulationId} in strict inventory mode.`,
        remediation: buildStrictInventoryRemediation(formulationId, args.canSuggestRemediation),
      });
      args.plan.push({
        kind: 'instance',
        detail: `Require existing source for ${formulationId}`,
        status: 'blocked',
      });
      return undefined;
    }

    const placeholderLabel = `Placeholder source for ${args.formulationRef?.label ?? args.analyteRef.label ?? args.analyteRef.id}`;
    args.requestedActions.push({
      action: 'use-placeholder',
      target: 'material-source',
      detail: args.formulationRef?.id ?? args.analyteRef.id,
    });

    if (!args.canPlaceholder) {
      const remediation = args.canSuggestRemediation ? [
        {
          kind: 'adjust-policy' as const,
          message: 'Switch to semantic planning mode or enable placeholder creation.',
          actionLabel: 'Allow placeholder source',
        },
      ] : undefined;
      args.diagnostics.push({
        code: 'MATERIAL_SOURCE_MISSING',
        stage: 'plan',
        severity: 'warning',
        outcome: 'policy-blocked',
        message: `No exact material source exists for ${args.formulationRef?.label ?? args.analyteRef.label ?? args.analyteRef.id}.`,
        ...(remediation ? { remediation } : {}),
      });
      args.plan.push({
        kind: 'instance',
        detail: 'Create placeholder material source',
        status: 'blocked',
      });
      return undefined;
    }

    const placeholderId = `PH-${slugify(args.formulationRef?.id ?? args.analyteRef.id)}`;
    args.candidateBindings.push(bindingFromMatch('material-source', {
      recordId: placeholderId,
      recordType: 'placeholder',
      label: placeholderLabel,
      resolution: 'placeholder',
    }));
    args.plan.push({
      kind: 'instance',
      detail: `Create placeholder source ${placeholderId}`,
      status: 'placeholder',
    });
    args.notes.push({
      stage: 'plan',
      message: `Issued placeholder material source ${placeholderId}.`,
      sourceIds: [placeholderId],
    });
    args.resolved.materialSource = {
      slot: 'material-source',
      resolution: 'placeholder',
      recordId: placeholderId,
      recordType: 'placeholder',
      label: placeholderLabel,
    };
    return { id: placeholderId, type: 'placeholder', label: placeholderLabel };
  }

  private async findExactMaterialSource(formulationId: string): Promise<MaterialSourceMatch | undefined> {
    const [instances, aliquots] = await Promise.all([
      listBySchema(this.store, SCHEMA_IDS.materialInstance),
      listBySchema(this.store, SCHEMA_IDS.aliquot),
    ]);
    const candidates: MaterialSourceMatch[] = [];

    for (const envelope of [...instances, ...aliquots]) {
      const payload = asPayload(envelope.payload);
      if (!payload || !isUsableSource(payload)) continue;
      const specRef = refValue(payload.material_spec_ref);
      if (specRef?.id !== formulationId) continue;
      candidates.push({
        envelope,
        payload,
        name: stringValue(payload.name) ?? envelope.recordId,
        schemaId: envelope.schemaId,
        kind: envelope.schemaId === SCHEMA_IDS.aliquot ? 'aliquot' : 'material-instance',
      });
    }

    candidates.sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'aliquot' ? -1 : 1;
      return left.envelope.recordId.localeCompare(right.envelope.recordId);
    });
    return candidates[0];
  }

  private buildEventDraft(args: {
    intent: NormalizedIntent<NormalizedMaterialIntentPayload>;
    analyteRef?: MaterialCompilerRecordRef;
    formulationRef?: MaterialCompilerRecordRef;
    materialSourceRef?:
      | { id: string; type: 'material-instance' | 'aliquot'; label: string }
      | { id: string; type: 'placeholder'; label: string };
    concentrationSemantics: 'formulation' | 'event';
  }): MaterialCompilerEventDraft | undefined {
    const { payload } = args.intent;
    if (!payload.targetRole || !payload.targetWell) return undefined;

    const details: Record<string, unknown> = {
      target_role: payload.targetRole,
      target_well: payload.targetWell,
      wells: [payload.targetWell],
      ...(payload.quantity ? { volume: payload.quantity } : {}),
    };

    if (args.materialSourceRef?.type === 'aliquot') {
      details.aliquot_ref = storedRef(args.materialSourceRef.id, 'aliquot', args.materialSourceRef.label);
    } else if (args.materialSourceRef?.type === 'material-instance') {
      details.material_instance_ref = storedRef(args.materialSourceRef.id, 'material-instance', args.materialSourceRef.label);
    } else if (args.formulationRef) {
      details.material_spec_ref = storedRef(args.formulationRef.id, 'material-spec', args.formulationRef.label);
    } else if (args.analyteRef) {
      details.material_ref = storedRef(args.analyteRef.id, 'material', args.analyteRef.label);
    }

    if (args.concentrationSemantics === 'event' && payload.concentration) {
      details.concentration = toStoredConcentration(payload.concentration);
      if (payload.solventName) details.solvent = payload.solventName;
    }

    return {
      event_type: 'add_material',
      details,
    };
  }
}
