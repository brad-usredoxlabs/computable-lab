import { describe, expect, it } from 'vitest';
import { PolicyProfileService } from './PolicyProfileService.js';
import type { PolicyProfile } from './types.js';

describe('PolicyProfileService', () => {
  it('resolves organization -> lab -> project -> run inheritance in deterministic order', () => {
    const service = new PolicyProfileService();
    const profiles: PolicyProfile[] = [
      {
        id: 'org-default',
        scope: 'organization',
        scopeId: 'org-1',
        settings: {
          allowAutoCreate: 'deny',
          allowSubstitutions: 'confirm',
          approvalAuthority: 'organization-admin',
        },
      },
      {
        id: 'lab-default',
        scope: 'lab',
        scopeId: 'lab-1',
        settings: {
          allowAutoCreate: 'confirm',
          allowPlaceholders: 'deny',
        },
      },
      {
        id: 'project-default',
        scope: 'project',
        scopeId: 'project-1',
        settings: {
          allowSubstitutions: 'allow',
          allowRemediation: 'allow',
          approvalAuthority: 'project-owner',
        },
      },
      {
        id: 'run-override',
        scope: 'run',
        scopeId: 'run-1',
        settings: {
          allowAutoCreate: 'allow',
        },
      },
    ];

    const resolved = service.resolveActiveProfile(profiles, {
      organizationId: 'org-1',
      labId: 'lab-1',
      projectId: 'project-1',
      runId: 'run-1',
    });

    expect(resolved.trace.map((entry) => entry.profileId)).toEqual([
      'org-default',
      'lab-default',
      'project-default',
      'run-override',
    ]);
    expect(resolved.settings).toEqual({
      allowAutoCreate: 'allow',
      allowSubstitutions: 'allow',
      allowPlaceholders: 'deny',
      allowRemediation: 'allow',
      allowSupervisedUse: 'confirm',
      allowExpiredTraining: 'deny',
      allowExpiredAuthorization: 'deny',
      allowOutOfCalibrationEquipment: 'deny',
      allowUnqualifiedEquipment: 'deny',
      approvalAuthority: 'project-owner',
    });
    expect(resolved.origins.allowAutoCreate.profileId).toBe('run-override');
    expect(resolved.origins.allowSubstitutions.profileId).toBe('project-default');
    expect(resolved.origins.allowPlaceholders.profileId).toBe('lab-default');
  });

  it('breaks same-scope conflicts by priority then profile id', () => {
    const service = new PolicyProfileService();
    const profiles: PolicyProfile[] = [
      {
        id: 'lab-alpha',
        scope: 'lab',
        scopeId: 'lab-1',
        priority: 5,
        settings: {
          allowAutoCreate: 'deny',
        },
      },
      {
        id: 'lab-beta',
        scope: 'lab',
        scopeId: 'lab-1',
        priority: 5,
        settings: {
          allowAutoCreate: 'confirm',
        },
      },
      {
        id: 'lab-late',
        scope: 'lab',
        scopeId: 'lab-1',
        priority: 10,
        settings: {
          allowAutoCreate: 'allow',
        },
      },
    ];

    const resolved = service.resolveActiveProfile(profiles, {
      organizationId: 'org-1',
      labId: 'lab-1',
    });

    expect(resolved.trace.map((entry) => entry.profileId)).toEqual([
      'lab-alpha',
      'lab-beta',
      'lab-late',
    ]);
    expect(resolved.settings.allowAutoCreate).toBe('allow');
    expect(resolved.origins.allowAutoCreate.profileId).toBe('lab-late');
  });

  it('evaluates compiler actions against the active profile', () => {
    const service = new PolicyProfileService();
    const evaluation = service.evaluateActions({
      profiles: [
        {
          id: 'org-default',
          scope: 'organization',
          scopeId: 'org-1',
          settings: {
            allowAutoCreate: 'deny',
            allowSubstitutions: 'confirm',
            allowPlaceholders: 'allow',
            allowRemediation: 'allow',
            approvalAuthority: 'lab-manager',
          },
        },
      ],
      scope: {
        organizationId: 'org-1',
      },
      actions: [
        { action: 'auto-create', target: 'material-slot' },
        { action: 'substitute', target: 'buffer-slot' },
        { action: 'use-placeholder', target: 'instrument-slot' },
      ],
    });

    expect(evaluation.decisions.map((decision) => decision.disposition)).toEqual([
      'blocked',
      'needs-confirmation',
      'allowed',
    ]);
    expect(evaluation.decisions.every((decision) => decision.authority === 'lab-manager')).toBe(true);
  });
});
