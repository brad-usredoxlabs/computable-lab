import {
  DEFAULT_COMPILER_POLICY_SETTINGS,
  POLICY_SCOPE_ORDER,
  type ActivePolicyScope,
  type CompilerPolicyActionSettingKey,
  type CompilerPolicySettingKey,
  type CompilerPolicySettings,
  type PolicyActionDecision,
  type PolicyActionRequest,
  type PolicyDecisionDisposition,
  type PolicyDisposition,
  type PolicyEvaluation,
  type PolicyProfile,
  type PolicyResolutionTraceEntry,
  type PolicyScope,
  type PolicySettingOrigin,
  type ResolvedPolicyProfile,
} from './types.js';

export function scopeIdentifier(scope: ActivePolicyScope, scopeType: PolicyScope): string | undefined {
  switch (scopeType) {
    case 'organization':
      return scope.organizationId;
    case 'lab':
      return scope.labId;
    case 'project':
      return scope.projectId;
    case 'run':
      return scope.runId;
  }
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

export function profileSortOrder(scopeType: PolicyScope): number {
  return POLICY_SCOPE_ORDER.indexOf(scopeType);
}

export function compareProfiles(left: PolicyProfile, right: PolicyProfile): number {
  const scopeDiff = profileSortOrder(left.scope) - profileSortOrder(right.scope);
  if (scopeDiff !== 0) return scopeDiff;
  const leftPriority = left.priority ?? 0;
  const rightPriority = right.priority ?? 0;
  if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  return left.id.localeCompare(right.id);
}

function settingOrigin(profile: PolicyProfile): PolicySettingOrigin {
  return {
    profileId: profile.id,
    scope: profile.scope,
    scopeId: profile.scopeId,
    priority: profile.priority ?? 0,
  };
}

function policyDispositionToDecision(disposition: PolicyDisposition): PolicyDecisionDisposition {
  switch (disposition) {
    case 'allow':
      return 'allowed';
    case 'confirm':
      return 'needs-confirmation';
    case 'deny':
      return 'blocked';
  }
}

function settingForAction(action: PolicyActionRequest['action']): CompilerPolicyActionSettingKey {
  switch (action) {
    case 'auto-create':
      return 'allowAutoCreate';
    case 'substitute':
      return 'allowSubstitutions';
    case 'use-placeholder':
      return 'allowPlaceholders';
    case 'apply-remediation':
      return 'allowRemediation';
  }
}

function applySetting(
  settings: CompilerPolicySettings,
  origins: Record<CompilerPolicySettingKey, PolicySettingOrigin>,
  profile: PolicyProfile,
  key: CompilerPolicySettingKey,
): void {
  switch (key) {
    case 'allowAutoCreate': {
      const value = profile.settings.allowAutoCreate;
      if (value === undefined) return;
      settings.allowAutoCreate = value;
      break;
    }
    case 'allowSubstitutions': {
      const value = profile.settings.allowSubstitutions;
      if (value === undefined) return;
      settings.allowSubstitutions = value;
      break;
    }
    case 'allowPlaceholders': {
      const value = profile.settings.allowPlaceholders;
      if (value === undefined) return;
      settings.allowPlaceholders = value;
      break;
    }
    case 'allowRemediation': {
      const value = profile.settings.allowRemediation;
      if (value === undefined) return;
      settings.allowRemediation = value;
      break;
    }
    case 'allowSupervisedUse': {
      const value = profile.settings.allowSupervisedUse;
      if (value === undefined) return;
      settings.allowSupervisedUse = value;
      break;
    }
    case 'allowExpiredTraining': {
      const value = profile.settings.allowExpiredTraining;
      if (value === undefined) return;
      settings.allowExpiredTraining = value;
      break;
    }
    case 'allowExpiredAuthorization': {
      const value = profile.settings.allowExpiredAuthorization;
      if (value === undefined) return;
      settings.allowExpiredAuthorization = value;
      break;
    }
    case 'allowOutOfCalibrationEquipment': {
      const value = profile.settings.allowOutOfCalibrationEquipment;
      if (value === undefined) return;
      settings.allowOutOfCalibrationEquipment = value;
      break;
    }
    case 'allowUnqualifiedEquipment': {
      const value = profile.settings.allowUnqualifiedEquipment;
      if (value === undefined) return;
      settings.allowUnqualifiedEquipment = value;
      break;
    }
    case 'approvalAuthority': {
      const value = profile.settings.approvalAuthority;
      if (value === undefined) return;
      settings.approvalAuthority = value;
      break;
    }
  }

  origins[key] = settingOrigin(profile);
}

function actionLabel(action: PolicyActionRequest['action']): string {
  switch (action) {
    case 'auto-create':
      return 'Auto-create';
    case 'substitute':
      return 'Substitute';
    case 'use-placeholder':
      return 'Use placeholder';
    case 'apply-remediation':
      return 'Apply remediation';
  }
}

export class PolicyProfileService {
  resolveActiveProfile(profiles: PolicyProfile[], scope: ActivePolicyScope): ResolvedPolicyProfile {
    const matchedProfiles = profiles
      .filter((profile) => {
        const expectedScopeId = scopeIdentifier(scope, profile.scope);
        return expectedScopeId !== undefined && expectedScopeId === profile.scopeId;
      })
      .sort(compareProfiles);

    const settings: CompilerPolicySettings = { ...DEFAULT_COMPILER_POLICY_SETTINGS };
    const defaultOrigin: PolicySettingOrigin = {
      profileId: 'default',
      scope: 'organization',
      scopeId: scope.organizationId,
      priority: Number.MIN_SAFE_INTEGER,
    };
    const origins: Record<CompilerPolicySettingKey, PolicySettingOrigin> = {
      allowAutoCreate: defaultOrigin,
      allowSubstitutions: defaultOrigin,
      allowPlaceholders: defaultOrigin,
      allowRemediation: defaultOrigin,
      allowSupervisedUse: defaultOrigin,
      allowExpiredTraining: defaultOrigin,
      allowExpiredAuthorization: defaultOrigin,
      allowOutOfCalibrationEquipment: defaultOrigin,
      allowUnqualifiedEquipment: defaultOrigin,
      approvalAuthority: defaultOrigin,
    };
    const trace: PolicyResolutionTraceEntry[] = [];

    for (const profile of matchedProfiles) {
      const overrides = (Object.keys(profile.settings) as CompilerPolicySettingKey[])
        .filter((key) => profile.settings[key] !== undefined);

      for (const key of overrides) {
        applySetting(settings, origins, profile, key);
      }

      trace.push({
        profileId: profile.id,
        scope: profile.scope,
        scopeId: profile.scopeId,
        priority: profile.priority ?? 0,
        overrides,
      });
    }

    return {
      scope,
      profiles: matchedProfiles,
      settings,
      origins,
      trace,
    };
  }

  evaluateActions(input: {
    profiles: PolicyProfile[];
    scope: ActivePolicyScope;
    actions: PolicyActionRequest[];
  }): PolicyEvaluation {
    const activeProfile = this.resolveActiveProfile(input.profiles, input.scope);
    const decisions = input.actions.map((request): PolicyActionDecision => {
      const settingKey = settingForAction(request.action);
      const disposition = activeProfile.settings[settingKey];
      const origin = activeProfile.origins[settingKey];

      return {
        action: request.action,
        target: request.target,
        ...(request.detail ? { detail: request.detail } : {}),
        disposition: policyDispositionToDecision(disposition),
        authority: activeProfile.settings.approvalAuthority,
        settingKey,
        origin,
        rationale: `${actionLabel(request.action)} for ${request.target} is ${disposition} by ${origin.profileId}.`,
      };
    });

    return {
      activeProfile,
      decisions,
    };
  }

  resolutionOrder(profiles: PolicyProfile[], scope: ActivePolicyScope): string[] {
    return this.resolveActiveProfile(profiles, scope).trace.map((entry) => entry.profileId);
  }

  getApplicableScopeIds(scope: ActivePolicyScope): string[] {
    return POLICY_SCOPE_ORDER.map((scopeType) => scopeIdentifier(scope, scopeType)).filter(isDefined);
  }
}
