/**
 * LabProfile — client-side mirror of the declarative lab identity served by
 * GET /api/lab-profile. Mirrors server/src/labProfile/labProfile.ts.
 */

export interface LabRef {
  kind: 'record'
  id: string
  type: string
}

export interface LabRefEntry {
  label: string
  ref: LabRef
}

export interface LabNamespace {
  baseUri: string
  prefix: string
}

export interface LabProfileBody {
  label: string
  namespace: LabNamespace
  ontologyNamespace: string
  instruments: LabRefEntry[]
  protocols: LabRefEntry[]
  reagents: LabRefEntry[]
}

export interface LabProfile {
  version: number
  title?: string
  description?: string
  profile: LabProfileBody
}