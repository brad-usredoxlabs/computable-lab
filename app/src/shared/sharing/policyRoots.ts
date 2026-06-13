/**
 * Record kinds that own an access policy (others inherit from their parent).
 * Mirrors POLICY_ROOT_KINDS in server/src/security/AuthorizationService.ts.
 */
export const POLICY_ROOT_KINDS = new Set(['study', 'experiment', 'run', 'planned-run'])

export function isPolicyRootKind(kind: string | undefined | null): boolean {
  return Boolean(kind && POLICY_ROOT_KINDS.has(kind))
}
