/**
 * Shared compiler policy types.
 *
 * Profiles are resolved from broadest scope to narrowest scope:
 * organization -> lab -> project -> run.
 * Later profiles override earlier settings deterministically.
 */

export const POLICY_SCOPE_ORDER = ['organization', 'lab', 'project', 'run'] as const;

export type PolicyScope = typeof POLICY_SCOPE_ORDER[number];

export type PolicyDisposition = 'allow' | 'confirm' | 'deny';

export type ApprovalAuthority =
  | 'none'
  | 'run-operator'
  | 'supervisor'
  | 'project-owner'
  | 'lab-manager'
  | 'qa-reviewer'
  | 'organization-admin';

export interface CompilerPolicySettings {
  allowAutoCreate: PolicyDisposition;
  allowSubstitutions: PolicyDisposition;
  allowPlaceholders: PolicyDisposition;
  allowRemediation: PolicyDisposition;
  allowSupervisedUse: PolicyDisposition;
  allowExpiredTraining: PolicyDisposition;
  allowExpiredAuthorization: PolicyDisposition;
  allowOutOfCalibrationEquipment: PolicyDisposition;
  allowUnqualifiedEquipment: PolicyDisposition;
  approvalAuthority: ApprovalAuthority;
}

export type CompilerPolicySettingKey = keyof CompilerPolicySettings;
export type CompilerPolicyActionSettingKey =
  | 'allowAutoCreate'
  | 'allowSubstitutions'
  | 'allowPlaceholders'
  | 'allowRemediation';

export interface PolicyProfile {
  id: string;
  scope: PolicyScope;
  scopeId: string;
  priority?: number;
  description?: string;
  settings: Partial<CompilerPolicySettings>;
}

export interface ActivePolicyScope {
  organizationId: string;
  labId?: string;
  projectId?: string;
  runId?: string;
}

export interface PolicySettingOrigin {
  profileId: string;
  scope: PolicyScope;
  scopeId: string;
  priority: number;
}

export interface PolicyResolutionTraceEntry {
  profileId: string;
  scope: PolicyScope;
  scopeId: string;
  priority: number;
  overrides: CompilerPolicySettingKey[];
}

export interface ResolvedPolicyProfile {
  scope: ActivePolicyScope;
  profiles: PolicyProfile[];
  settings: CompilerPolicySettings;
  origins: Record<CompilerPolicySettingKey, PolicySettingOrigin>;
  trace: PolicyResolutionTraceEntry[];
}

export type PolicyAction =
  | 'auto-create'
  | 'substitute'
  | 'use-placeholder'
  | 'apply-remediation';

export interface PolicyActionRequest {
  action: PolicyAction;
  target: string;
  detail?: string;
}

export type PolicyDecisionDisposition = 'allowed' | 'needs-confirmation' | 'blocked';

export interface PolicyActionDecision {
  action: PolicyAction;
  target: string;
  detail?: string;
  disposition: PolicyDecisionDisposition;
  authority: ApprovalAuthority;
  settingKey: CompilerPolicyActionSettingKey;
  origin: PolicySettingOrigin;
  rationale: string;
}

export interface PolicyEvaluation {
  activeProfile: ResolvedPolicyProfile;
  decisions: PolicyActionDecision[];
}

export const DEFAULT_COMPILER_POLICY_SETTINGS: CompilerPolicySettings = {
  allowAutoCreate: 'deny',
  allowSubstitutions: 'confirm',
  allowPlaceholders: 'confirm',
  allowRemediation: 'confirm',
  allowSupervisedUse: 'confirm',
  allowExpiredTraining: 'deny',
  allowExpiredAuthorization: 'deny',
  allowOutOfCalibrationEquipment: 'deny',
  allowUnqualifiedEquipment: 'deny',
  approvalAuthority: 'project-owner',
};
