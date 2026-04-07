import type {
  BindingResolutionKind,
  CompilationResult,
  CompilerDiagnostic,
  CompilerProvenanceSource,
  NormalizedIntent,
} from '../types.js';
import type { ActivePolicyScope, PolicyProfile, PolicyScope } from '../../policy/types.js';
import type { Concentration } from '../../materials/concentration.js';

export type MaterialCompilerMode = 'semantic-planning' | 'execution-planning' | 'strict-inventory';

export type MaterialClarificationBehavior = 'confirm-near-match' | 'diagnostic-only';

export type MaterialConcentrationSemantics = 'formulation' | 'event';

export type MaterialRemediationBehavior = 'suggest' | 'suppress';

export interface NormalizedMaterialIntentPayload {
  intentType: 'add_material_to_well';
  rawText?: string | undefined;
  analyteName: string;
  solventName?: string | undefined;
  concentration?: Concentration | undefined;
  targetRole?: string | undefined;
  targetWell?: string | undefined;
  quantity?: {
    value: number;
    unit: string;
  } | undefined;
}

export interface MaterialCompilerPolicySettings {
  mode: MaterialCompilerMode;
  concentrationSemantics: MaterialConcentrationSemantics;
  clarificationBehavior: MaterialClarificationBehavior;
  remediationBehavior: MaterialRemediationBehavior;
}

export interface MaterialCompilerPolicyProfile extends PolicyProfile {
  materialSettings?: Partial<MaterialCompilerPolicySettings> | undefined;
}

export interface MaterialPolicySettingOrigin {
  profileId: string;
  scope: PolicyScope;
  scopeId: string;
  priority: number;
}

export interface MaterialPolicyTraceEntry {
  profileId: string;
  scope: PolicyScope;
  scopeId: string;
  priority: number;
  overrides: Array<keyof MaterialCompilerPolicySettings>;
}

export interface MaterialResolvedPolicy {
  scope: ActivePolicyScope;
  settings: MaterialCompilerPolicySettings;
  origins: Record<keyof MaterialCompilerPolicySettings, MaterialPolicySettingOrigin>;
  trace: MaterialPolicyTraceEntry[];
}

export type MaterialCompilerPlanStep = {
  kind: 'semantic' | 'formulation' | 'instance' | 'event';
  detail: string;
  status: 'resolved' | 'created' | 'placeholder' | 'blocked';
};

export interface MaterialCompilerBindingPayload {
  recordId: string;
  recordType: 'material' | 'material-spec' | 'material-instance' | 'aliquot' | 'placeholder';
  label: string;
  created?: boolean | undefined;
}

export interface MaterialResolutionLayer {
  slot: 'analyte' | 'solvent' | 'formulation' | 'material-source';
  resolution: BindingResolutionKind | 'missing';
  recordId?: string | undefined;
  recordType?: MaterialCompilerBindingPayload['recordType'] | undefined;
  label?: string | undefined;
}

export interface MaterialCompilerEventDraft {
  event_type: 'add_material';
  details: Record<string, unknown>;
}

export interface MaterialCompilerResult extends CompilationResult<
  NormalizedMaterialIntentPayload,
  MaterialCompilerBindingPayload,
  MaterialCompilerPlanStep
> {
  materialPolicy: MaterialResolvedPolicy;
  resolved: {
    analyte: MaterialResolutionLayer;
    solvent?: MaterialResolutionLayer | undefined;
    formulation?: MaterialResolutionLayer | undefined;
    materialSource?: MaterialResolutionLayer | undefined;
  };
  eventDraft?: MaterialCompilerEventDraft | undefined;
  createdRecordIds: string[];
}

export interface MaterialCompilerRequest {
  normalizedIntent: NormalizedIntent<NormalizedMaterialIntentPayload>;
  policyProfiles: MaterialCompilerPolicyProfile[];
  activeScope: ActivePolicyScope;
  persist?: boolean | undefined;
  actor?: string | undefined;
  now?: string | undefined;
}

export type MaterialCompilerRecordRef = {
  kind: 'record';
  id: string;
  type: string;
  label?: string | undefined;
};

export type MaterialCompilerProvenanceContext = {
  diagnostics: CompilerDiagnostic[];
  requestedActions: Array<{ action: 'auto-create' | 'substitute' | 'use-placeholder' | 'apply-remediation'; target: string; detail?: string }>;
  plan: MaterialCompilerPlanStep[];
  notes: Array<{ stage: 'normalize' | 'bind' | 'policy' | 'plan' | 'execute'; message: string; sourceIds?: string[] }>;
  createdRecordIds: string[];
  layers: MaterialCompilerResult['resolved'];
  eventDraft?: MaterialCompilerEventDraft | undefined;
  extraSources: CompilerProvenanceSource[];
};
