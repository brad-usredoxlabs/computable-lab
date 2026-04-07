import type { Ref } from '../../types/ref'
import type { WellId } from '../../types/plate'
import type { OperationTemplateRecord } from '../../types/operationTemplate'
import type { TransferVignetteMacroProgram } from '../../types/macroProgram'
import type { NormalizedTransferDetails, TransferDetails } from '../../types/events'

function toTemplateRef(template: OperationTemplateRecord): Ref {
  return {
    kind: 'record',
    id: template.id,
    type: 'operation-template',
    label: template.name,
  }
}

export function createTransferVignetteProgramFromTemplate(
  template: OperationTemplateRecord,
  options: {
    sourceLabwareId?: string
    targetLabwareId?: string
    sourceWells?: WellId[]
    targetWells?: WellId[]
  } = {},
): TransferVignetteMacroProgram {
  const transferMode = template.semantic_defaults?.transfer_mode
    || (template.base_event_type === 'multi_dispense' ? 'multi_dispense' : 'transfer')
  return {
    kind: 'transfer_vignette',
    template_ref: toTemplateRef(template),
    params: {
      sourceLabwareId: options.sourceLabwareId,
      targetLabwareId: options.targetLabwareId,
      sourceWells: options.sourceWells || [],
      targetWells: options.targetWells || [],
      ...(template.semantic_defaults?.volume ? { volume: template.semantic_defaults.volume } : {}),
      transferMode,
      ...(template.semantic_defaults?.dead_volume ? { deadVolume: template.semantic_defaults.dead_volume } : {}),
      ...(template.semantic_defaults?.discard_to_waste ? { discardToWaste: true } : {}),
    },
    ...(template.execution_defaults ? { execution_hints: template.execution_defaults } : {}),
  }
}

export function normalizeTransferVignetteProgram(program: TransferVignetteMacroProgram): NormalizedTransferDetails {
  return {
    sourceLabwareId: program.params.sourceLabwareId,
    destLabwareId: program.params.targetLabwareId,
    sourceWells: [...program.params.sourceWells],
    destWells: [...program.params.targetWells],
    ...(program.params.volume ? { volume: program.params.volume } : {}),
    ...(program.params.deadVolume ? { deadVolume: program.params.deadVolume } : {}),
    ...(program.params.discardToWaste ? { discardToWaste: true } : {}),
    ...(program.params.inputs?.length ? { inputs: program.params.inputs } : {}),
    ...(program.execution_hints ? { executionHints: program.execution_hints } : {}),
  }
}

export function applyNormalizedTransferToVignette(
  program: TransferVignetteMacroProgram,
  normalized: NormalizedTransferDetails,
  transferMode?: 'transfer' | 'multi_dispense',
): TransferVignetteMacroProgram {
  return {
    ...program,
    params: {
      ...program.params,
      sourceLabwareId: normalized.sourceLabwareId,
      targetLabwareId: normalized.destLabwareId,
      sourceWells: [...normalized.sourceWells],
      targetWells: [...normalized.destWells],
      ...(normalized.volume ? { volume: normalized.volume } : { volume: undefined }),
      transferMode: transferMode || program.params.transferMode || 'transfer',
      ...(normalized.deadVolume ? { deadVolume: normalized.deadVolume } : { deadVolume: undefined }),
      ...(normalized.discardToWaste ? { discardToWaste: true } : { discardToWaste: undefined }),
      ...(normalized.inputs ? { inputs: normalized.inputs as TransferDetails['inputs'] } : { inputs: undefined }),
    },
    ...(normalized.executionHints ? { execution_hints: normalized.executionHints } : { execution_hints: undefined }),
  }
}

export function buildOperationTemplatePayload(input: {
  id: string
  name: string
  description?: string
  visibility: 'personal' | 'team'
  version: number
  program: TransferVignetteMacroProgram
  status?: 'active' | 'deprecated'
  tags?: string[]
}): Record<string, unknown> {
  return {
    kind: 'operation-template',
    id: input.id,
    name: input.name,
    version: input.version,
    category: 'transfer',
    scope: 'program',
    ...(input.description ? { description: input.description } : {}),
    visibility: input.visibility,
    status: input.status || 'active',
    base_event_type: input.program.params.transferMode === 'multi_dispense' ? 'multi_dispense' : 'transfer',
    semantic_defaults: {
      transfer_mode: input.program.params.transferMode || 'transfer',
      ...(input.program.params.volume ? { volume: input.program.params.volume } : {}),
      ...(input.program.params.deadVolume ? { dead_volume: input.program.params.deadVolume } : {}),
      ...(input.program.params.discardToWaste ? { discard_to_waste: true } : {}),
    },
    ...(input.program.execution_hints ? { execution_defaults: input.program.execution_hints } : {}),
    ...(input.tags && input.tags.length > 0 ? { tags: input.tags } : {}),
  }
}
