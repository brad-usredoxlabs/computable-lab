/**
 * Material save-payload policy — the single owner of how the inline builders
 * turn their form state into `createRecord` / `createFormulation` /
 * `createMaterialInstance` request bodies.
 *
 * Previously each `Build*Form` assembled these inline, which is how
 * `recipe.inputRoles: []` (a backend-rejected empty-roles formulation) slipped
 * in twice. Centralizing the policy here means the role/spec/instance shape is
 * defined once and unit-tested, and the builders only gather UI state.
 *
 * These are pure builders (no I/O): the forms still make the two API calls so
 * the orchestration stays visible, but the payload *shape* lives here.
 */

import type {
  CreateFormulationRequest,
  MaterialInstanceCreateRequest,
  MaterialRefInput,
  RecipeInputRole,
} from '../../../shared/api/client'
import type { CompositionEntryValue, ConcentrationValue } from '../../../types/material'
import type { OLSResultRef } from '../../../shared/api/olsClient'

/** Map the builders' ontology refs onto the formulation `material.classRefs` shape. */
function toClassRefs(classRefs: OLSResultRef[]): NonNullable<CreateFormulationRequest['material']>['classRefs'] {
  return classRefs.map((r) => ({
    kind: 'ontology' as const,
    id: r.id,
    namespace: r.namespace,
    label: r.label,
    uri: r.uri,
  }))
}

/** The local material *concept* record body (`createRecord(MATERIAL_SCHEMA_ID, …)`). */
export function materialConceptPayload(args: {
  materialId: string
  name: string
  domain: string
  classRefs?: OLSResultRef[]
  tags?: string[]
}): Record<string, unknown> {
  return {
    kind: 'material',
    id: args.materialId,
    name: args.name,
    domain: args.domain,
    ...(args.classRefs && args.classRefs.length > 0 ? { class: args.classRefs } : {}),
    ...(args.tags && args.tags.length > 0 ? { tags: args.tags } : {}),
  }
}

/** Single-active "compound in solvent" formulation (compound builder). */
export function singleActiveFormulationPayload(args: {
  materialId: string
  conceptName: string
  outputName: string
  classRefs: OLSResultRef[]
  concentration?: ConcentrationValue
  solventRef?: MaterialRefInput
}): CreateFormulationRequest {
  const { materialId, conceptName, outputName, classRefs, concentration, solventRef } = args
  const inputRoles: RecipeInputRole[] = [
    {
      roleId: 'active',
      roleType: 'solute',
      required: true,
      materialRefId: materialId,
      sourceState: 'solid',
      ...(concentration ? { targetContribution: concentration } : {}),
    },
    ...(solventRef
      ? [{
          roleId: 'solvent',
          roleType: 'solvent',
          required: true,
          sourceState: 'liquid' as const,
          ...(solventRef.kind === 'record' ? { materialRefId: solventRef.id } : {}),
        } satisfies RecipeInputRole]
      : []),
  ]
  const concText = concentration ? `${concentration.value} ${concentration.unit}` : 'the target concentration'
  return {
    material: {
      id: materialId,
      name: conceptName,
      domain: 'chemical',
      ...(classRefs.length > 0 ? { classRefs: toClassRefs(classRefs) } : {}),
    },
    outputSpec: {
      name: outputName,
      materialRefId: materialId,
      formulationKind: 'single_active',
      ...(concentration ? { concentration } : {}),
      ...(solventRef ? { solventRef } : {}),
    },
    recipe: {
      name: `${conceptName} stock`,
      inputRoles,
      steps: [
        { order: 1, instruction: `Dissolve ${conceptName} in ${solventRef?.label ?? 'solvent'} to ${concText}.` },
      ],
    },
  }
}

/** Multi-component mixture/media formulation (mixture builder). */
export function compositionFormulationPayload(args: {
  materialId: string
  conceptName: string
  outputName: string
  domain: string
  classRefs: OLSResultRef[]
  composition: CompositionEntryValue[]
}): CreateFormulationRequest {
  const { materialId, conceptName, outputName, domain, classRefs, composition } = args
  const inputRoles: RecipeInputRole[] = composition.map((entry, index) => ({
    roleId: `${entry.role}-${index + 1}`,
    roleType: entry.role,
    required: true,
    ...(entry.componentRef.kind === 'record' ? { materialRefId: entry.componentRef.id } : {}),
    ...(entry.concentration ? { targetContribution: entry.concentration } : {}),
    compositionSnapshot: [entry],
  }))
  return {
    material: {
      id: materialId,
      name: conceptName,
      domain,
      ...(classRefs.length > 0 ? { classRefs: toClassRefs(classRefs) } : {}),
    },
    outputSpec: {
      name: outputName,
      materialRefId: materialId,
      formulationKind: composition.length > 1 ? 'complex_composition' : 'defined_composition',
      composition,
    },
    recipe: {
      name: `${conceptName} mix`,
      inputRoles,
      steps: [
        {
          order: 1,
          instruction: `Combine the ${composition.length} component${composition.length === 1 ? '' : 's'} above to produce ${outputName}.`,
        },
      ],
    },
  }
}

/** Cells material *instance* (cells builder). */
export function cellsInstancePayload(args: {
  materialId: string
  name: string
  preparedOn: string
  biologicalState?: Record<string, unknown>
}): MaterialInstanceCreateRequest {
  const { materialId, name, preparedOn, biologicalState } = args
  return {
    name,
    materialRef: { kind: 'record', id: materialId, type: 'material', label: name },
    preparedOn,
    ...(biologicalState && Object.keys(biologicalState).length > 0 ? { biologicalState } : {}),
    status: 'available',
    tags: ['cells'],
  }
}

/** Sample material *instance* (sample builder). */
export function sampleInstancePayload(args: {
  materialId: string
  name: string
  derivationType: string
  derivedState: Record<string, unknown>
  collectionDate?: string
}): MaterialInstanceCreateRequest {
  const { materialId, name, derivationType, derivedState, collectionDate } = args
  return {
    name,
    materialRef: { kind: 'record', id: materialId, type: 'material', label: name },
    ...(collectionDate ? { preparedOn: collectionDate } : {}),
    derivedState,
    status: 'available',
    tags: ['sample', derivationType],
  }
}
