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
      field?: string
      than?: string
      disposition?: 'allowed' | 'needs-confirmation' | 'blocked'
      authority?: string
    }>
    description?: string
  }>
}

export interface LifecycleContext {
  recordId: string
  currentActorId: string
  roleAssignments: Record<string, string>  // role name → person ID
  fields: Record<string, unknown>          // record payload for field checks
}

export type LifecycleEvent = {
  type: string  // transition event name, e.g., "SUBMIT_FOR_REVIEW"
}
