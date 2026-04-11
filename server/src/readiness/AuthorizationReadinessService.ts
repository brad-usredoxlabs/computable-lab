export interface AuthorizationScope {
  equipmentIds?: string[]
  equipmentClassIds?: string[]
  verbIds?: string[]
  methodIds?: string[]
}

export interface TrainingGap {
  requirementId: string
  trainingMaterialId: string
  trainingMaterialLabel?: string
  reason: 'missing' | 'expired' | 'failed'
}

export interface AuthorizationReadiness {
  personId: string
  status: 'authorized' | 'expired' | 'suspended' | 'no_authorization' | 'training_gap'
  matchingAuthorizations: Array<{
    id: string
    status: string
    effectiveAt: string
    expiresAt?: string
    supervisedOnly: boolean
  }>
  trainingGaps: TrainingGap[]
}

export async function checkAuthorization(
  personId: string,
  scope: AuthorizationScope,
  store: { list: (opts: { kind: string }) => Promise<any[]> }
): Promise<AuthorizationReadiness> {
  const now = Date.now()
  const allAuths = await store.list({ kind: 'competency-authorization' })
  const personAuths = allAuths.filter((a) => a.payload?.personRef?.id === personId)

  const matchingAuths = personAuths.filter((auth) => {
    const authScope = auth.payload?.scope || {}
    const scopeEmpty = !scope.equipmentIds && !scope.equipmentClassIds && !scope.verbIds && !scope.methodIds
    if (scopeEmpty) return true
    const authEquipRefs = authScope.equipmentRefs || []
    const authClassRefs = authScope.equipmentClassRefs || []
    const authVerbRefs = authScope.verbRefs || []
    const authMethodRefs = authScope.methodRefs || []
    if (scope.equipmentIds?.some((id) => authEquipRefs.some((r: any) => r.id === id))) return true
    if (scope.equipmentClassIds?.some((id) => authClassRefs.some((r: any) => r.id === id))) return true
    if (scope.verbIds?.some((id) => authVerbRefs.some((r: any) => r.id === id))) return true
    if (scope.methodIds?.some((id) => authMethodRefs.some((r: any) => r.id === id))) return true
    return false
  })

  const matchingAuthorizations = matchingAuths.map((a) => ({
    id: a.id, status: a.payload?.status || 'unknown', effectiveAt: a.payload?.effectiveAt,
    expiresAt: a.payload?.expiresAt, supervisedOnly: a.payload?.supervisedOnly || false
  }))

  const hasSuspended = matchingAuths.some((a) => a.payload?.status !== 'active')
  const allExpired = matchingAuths.every((a) => {
    const exp = a.payload?.expiresAt
    return exp && new Date(exp).getTime() < now
  })

  if (matchingAuths.length === 0) return { personId, status: 'no_authorization', matchingAuthorizations, trainingGaps: [] }
  if (hasSuspended) return { personId, status: 'suspended', matchingAuthorizations, trainingGaps: [] }
  if (allExpired) return { personId, status: 'expired', matchingAuthorizations, trainingGaps: [] }

  const trainingGaps: TrainingGap[] = []
  const allRequirements = await store.list({ kind: 'equipment-training-requirement' })
  const allTrainingRecords = await store.list({ kind: 'training-record' })
  const personTraining = allTrainingRecords.filter((t) => t.payload?.personRef?.id === personId)

  const relevantRequirements = allRequirements.filter((req) => {
    const reqScope = req.payload?.scope || {}
    if (scope.equipmentIds?.includes(reqScope.equipmentRef?.id)) return true
    if (scope.equipmentClassIds?.includes(reqScope.equipmentClassRef?.id)) return true
    return false
  })

  for (const req of relevantRequirements) {
    const requiredMaterials = req.payload?.requiredTrainingMaterialRefs || []
    for (const matRef of requiredMaterials) {
      const materialId = matRef.id
      const trainingMaterialLabel = matRef.label
      const trainingRecord = personTraining.find((t) => t.payload?.trainingMaterialRef?.id === materialId)
      if (!trainingRecord) {
        trainingGaps.push({ requirementId: req.id, trainingMaterialId: materialId, trainingMaterialLabel, reason: 'missing' })
      } else {
        const status = trainingRecord.payload?.status
        const expiresAt = trainingRecord.payload?.expiresAt
        if (status === 'failed') {
          trainingGaps.push({ requirementId: req.id, trainingMaterialId: materialId, trainingMaterialLabel, reason: 'failed' })
        } else if (expiresAt && new Date(expiresAt).getTime() < now) {
          trainingGaps.push({ requirementId: req.id, trainingMaterialId: materialId, trainingMaterialLabel, reason: 'expired' })
        }
      }
    }
  }

  const status: AuthorizationReadiness['status'] = trainingGaps.length > 0 ? 'training_gap' : 'authorized'
  return { personId, status, matchingAuthorizations, trainingGaps }
}
