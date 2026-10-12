export interface LifecycleSpec {
  lifecycleVersion: number
  id: string
  description?: string
  roles?: Array<{ id: string; label?: string; description?: string }>
  states: Array<{
    id: string
    label?: string
    initial?: boolean
    terminal?: boolean
    description?: string
  }>
  transitions: Array<{
    from: string | string[]
    to: string
    role: string
    label?: string
    guards?: Array<{
      type:
        | 'requires_different_person'
        | 'requires_field_set'
        | 'requires_active_policy'
        | 'requires_policy_disposition'
        | 'requires_authority'
        | 'requires_role'
        | 'requires_signature'
      field?: string
      role?: string
      than?: string
      disposition?: 'allowed' | 'needs-confirmation' | 'blocked'
      authority?: string
      signatureAction?: string  // required signature action for requires_signature
      /** Optional YAML-declared denial reason surfaced when this guard fails. */
      denialMessage?: string
    }>
    description?: string
  }>
}

export interface LifecycleContext {
  recordId: string
  currentActorId: string
  roleAssignments: Record<string, string>  // role name → person ID
  actorRoles: string[]                     // QMS roles granted to the actor
  enforceTransitionRoles: boolean          // policy-bundle-driven
  fields: Record<string, unknown>          // record payload for field checks
  /**
   * Signatures presented with the transition request (validated by the
   * caller). Interpreted by the requires_signature guard. Callers that have
   * nothing to present set [].
   */
  presentedSignatures: Array<{
    id: string
    action: string
    subjectRecordId: string
    signedBy: string
  }>
}

export type LifecycleEvent = {
  type: string  // transition event name, e.g., "SUBMIT_FOR_REVIEW"
}
