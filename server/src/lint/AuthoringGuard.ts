/**
 * AuthoringGuard — generic interpreter for the actor-side `authoring:`
 * policy declared in *.lint.yaml files.
 *
 * Mirrors how lifecycle guards are declared (values in YAML) and
 * interpreted (code): this file contains ZERO domain literals — no role
 * names, no record kinds, no user ids. It answers one question: does the
 * resolved actor context satisfy the declared policy?
 */

import type { AuthoringPolicy, AuthoringRequirement } from './types.js';

/** The actor-side evaluation context, supplied by the call site. */
export interface ActorContext {
  userId: string | null;
  isSystem: boolean;
  /**
   * Actor is the platform local-admin bootstrap user. A platform primitive
   * (like isSystem), not a domain role — supplied by the call site.
   */
  isLocalAdmin: boolean;
  /** Roles resolved for the actor (empty when no resolver is wired). */
  roles: string[];
}

/**
 * A single requirement passes only via the semantics it declares.
 * Unknown requirement shapes fail closed.
 */
export function actorSatisfiesRequirement(
  requirement: AuthoringRequirement,
  actor: ActorContext,
): boolean {
  if (requirement.systemActor === true) return actor.isSystem;
  if (requirement.localAdmin === true) return actor.isLocalAdmin;
  if (requirement.role !== undefined) return actor.roles.includes(requirement.role);
  if (requirement.userId !== undefined) return actor.userId === requirement.userId;
  return false;
}

/** The policy passes when the actor satisfies ANY declared requirement. */
export function authoringPolicyPasses(policy: AuthoringPolicy, actor: ActorContext): boolean {
  const anyOf = Array.isArray(policy.require?.anyOf) ? policy.require.anyOf : [];
  if (anyOf.length === 0) return false; // fail closed on empty policy
  return anyOf.some((r) => actorSatisfiesRequirement(r, actor));
}

/**
 * Whether a declared authoring policy is ACTIVE under the resolved compiler
 * policy settings. The policy names the setting it consults
 * (`gateOnPolicySetting` — a key of CompilerPolicySettings, supplied by YAML);
 * the gate fires only when that setting resolves to 'deny'. A policy that
 * declares no `gateOnPolicySetting` is bundle-blind and always active —
 * privilege-escalation guards (role-grant) must never sleep.
 *
 * Generic: this file names no setting key, role, kind, or bundle itself.
 */
export function authoringGateActive(
  policy: AuthoringPolicy,
  settings: Record<string, unknown> | undefined,
): boolean {
  const settingKey = policy.gateOnPolicySetting;
  if (settingKey === undefined) return true;
  return settings?.[settingKey] === 'deny';
}

/**
 * Whether an UPDATE must consult the authoring policy: fires on any change
 * when `guardWhenChanged` is undeclared, else only when one of the named
 * payload paths actually changes value.
 */
export function authoringGuardFiresOnUpdate(
  policy: AuthoringPolicy,
  previousPayload: Record<string, unknown> | undefined,
  nextPayload: Record<string, unknown> | undefined,
): boolean {
  const paths = policy.guardWhenChanged;
  if (!Array.isArray(paths) || paths.length === 0) return true;
  return paths.some((p) => {
    const prev = previousPayload?.[p];
    const next = nextPayload?.[p];
    if (prev === next) return false;
    return JSON.stringify(prev ?? null) !== JSON.stringify(next ?? null);
  });
}
