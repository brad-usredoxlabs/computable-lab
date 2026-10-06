import './ChangesPanel.css'
import type { AiProtocolEditProposal } from './assistStream'
import type {
  EventGraphChange,
  ProtocolEditDiff,
  ProtocolEditOp,
  ProtocolEditSetting,
  ProtocolStepKind,
  RoleBeforeAfter,
  StepFieldBeforeAfter,
  ValidationGap,
} from './sidebarState'

export interface ChangesPanelProps {
  changes: EventGraphChange[]
  warnings: ValidationGap[]
  onApply: () => void
  onDiscard: () => void
  /**
   * PROTO-AI-9 (D1: NO new rail): a `protocol_edit` proposal rendered inside
   * THIS review surface. Optional — without it the event-graph panel is
   * byte-unchanged, prefixes and all.
   */
  protocolDiff?: ProtocolEditDiff
  /** Accept is in flight (or already landed): the button disables so a
   *  duplicate click cannot replay the proposal (AI-8 idempotence is the
   *  backstop, the disabled gate is the front door). */
  applying?: boolean
  /** A failed/conflicted apply, shown verbatim (the D4 stale-sha message). */
  applyError?: string
}

/** The + / - / ~ prefix convention, shared by both diff kinds. */
function opPrefix(op: 'add' | 'modify' | 'remove'): string {
  return op === 'add' ? '+' : op === 'remove' ? '-' : '~'
}

export function ChangesPanel({
  changes,
  warnings,
  onApply,
  onDiscard,
  protocolDiff,
  applying,
  applyError,
}: ChangesPanelProps) {
  const protocolMode = protocolDiff !== undefined
  return (
    <div className="changes-panel" data-testid="changes-panel">
      {warnings.length > 0 ? (
        <div className="changes-panel__warnings">
          {warnings.map((w, i) => (
            <div
              key={i}
              className={`changes-panel__warning changes-panel__warning--${w.severity}`}
            >
              {w.message}
            </div>
          ))}
        </div>
      ) : null}

      {protocolDiff ? <ProtocolDiffView diff={protocolDiff} /> : null}

      <div className="changes-panel__diff">
        {changes.map((change, i) => (
          <div
            key={i}
            className={`changes-panel__change changes-panel__change--${change.op}`}
          >
            <span className="changes-panel__change-prefix">
              {change.op === 'add' ? '+' : change.op === 'remove' ? '-' : '~'}
            </span>
            <span className="changes-panel__change-desc">{change.description}</span>
          </div>
        ))}
      </div>

      {protocolMode && applying ? (
        <div className="changes-panel__applying" role="status">
          Applying to protocol…
        </div>
      ) : null}
      {protocolMode && applyError ? (
        <div className="changes-panel__apply-error" role="alert">
          {applyError}
        </div>
      ) : null}

      <div className="changes-panel__actions">
        <button
          type="button"
          className="changes-panel__btn changes-panel__btn--discard"
          onClick={onDiscard}
        >
          {protocolMode ? 'Reject' : 'Discard'}
        </button>
        <button
          type="button"
          className="changes-panel__btn changes-panel__btn--apply"
          onClick={onApply}
          data-testid="changes-apply"
          {...(protocolMode && applying ? { disabled: true } : {})}
        >
          {protocolMode ? 'Accept' : 'Apply to run'}
        </button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------- protocol diff view

/** The section label a role target belongs to (the role sections a biologist
 *  reads in the rail). */
function roleSectionName(kind: 'labwareRoles' | 'instrumentRoles' | 'materialRoles'): string {
  return kind === 'labwareRoles' ? 'labware' : kind === 'instrumentRoles' ? 'equipment' : 'material'
}

function stepFields(side: StepFieldBeforeAfter): string {
  const parts: string[] = []
  if (side.label) parts.push(side.label)
  if (side.kind) parts.push(`kind ${side.kind}`)
  if (side.description) parts.push(side.description)
  if (side.settings?.length) parts.push(side.settings.map(settingText).join('; '))
  if (side.ordinal !== undefined) parts.push(`position ${side.ordinal}`)
  return parts.join(' — ')
}

function roleFields(side: RoleBeforeAfter): string {
  const parts: string[] = []
  if (side.description) parts.push(side.description)
  if (side.expectedLabwareKinds?.length) parts.push(`expectedLabwareKinds: ${side.expectedLabwareKinds.join(', ')}`)
  if (side.allowedInstrumentIds?.length) parts.push(`allowedInstrumentIds: ${side.allowedInstrumentIds.join(', ')}`)
  return parts.join(' — ')
}

/** A setting renders by its identity + human label + value when present. */
function settingText(s: ProtocolEditSetting): string {
  const value = s['defaultValue'] ?? s['value']
  const name = s.label ?? s.settingId
  return value !== undefined ? `${name}=${String(value)}` : name
}

function opLabel(target: ProtocolEditOp['target']): string {
  return target.type === 'step' ? `step ${target.stepId || '(new step)'}` : `${roleSectionName(target.roleKind)} role ${target.roleId}`
}

function sideFields(side: StepFieldBeforeAfter | RoleBeforeAfter): string {
  return 'roleId' in side && typeof side.roleId === 'string' ? roleFields(side as RoleBeforeAfter) : stepFields(side as StepFieldBeforeAfter)
}

function ProtocolDiffView({ diff }: { diff: ProtocolEditDiff }) {
  return (
    <div className="changes-panel__protocol" data-testid="protocol-diff">
      <div className="changes-panel__protocol-target" data-testid="protocol-diff-target">
        Protocol: {diff.protocol.title ?? diff.protocol.recordId} ({diff.protocol.recordId})
      </div>
      <div className="changes-panel__diff">
        {diff.ops.map((op, i) => {
          const sides: string[] = []
          if (op.before) sides.push(`was: ${sideFields(op.before)}`)
          if (op.after) sides.push(`now: ${sideFields(op.after)}`)
          if (op.position) sides.push(`${op.position.relative} ${op.position.anchorStepId}`)
          return (
            <div
              key={i}
              className={`changes-panel__change changes-panel__change--${op.op}`}
              data-testid="protocol-edit-row"
            >
              <span className="changes-panel__change-prefix">{opPrefix(op.op)}</span>
              <span className="changes-panel__change-desc">
                {opLabel(op.target)}
                {sides.length > 0 ? ` — ${sides.join(' | ')}` : ''}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ------------------------------------------------ envelope → display mapping

type Dict = Record<string, unknown>

function asDict(value: unknown): Dict | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Dict) : null
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const list = value.filter((v): v is string => typeof v === 'string' && v.length > 0)
  return list.length > 0 ? list : undefined
}

/** The snapshot of the ATTACHED protocol the mapper hydrates `before` from —
 *  the same shape AiTabPanel's `attachedProtocol` context already builds
 *  (PROTO-AI-6). Structural, never re-fetched. */
export interface AttachedProtocolSnapshot {
  steps: Array<{ stepId: string; label: string; description?: string; kind?: string }>
  labwareRoles?: Array<{ roleId: string; description?: string; expectedLabwareKinds?: string[] }>
  instrumentRoles?: Array<{ roleId: string; description?: string; allowedInstrumentIds?: string[] }>
}

const STEP_KINDS: readonly ProtocolStepKind[] = [
  'add_material', 'transfer', 'mix', 'wash', 'incubate', 'read', 'harvest', 'other',
]

function asStepKind(value: unknown): ProtocolStepKind | undefined {
  return STEP_KINDS.includes(value as ProtocolStepKind) ? (value as ProtocolStepKind) : undefined
}

function asSettings(value: unknown): ProtocolEditSetting[] | undefined {
  if (!Array.isArray(value)) return undefined
  const list = value
    .map(asDict)
    .filter((s): s is Dict => s !== null && typeof s.settingId === 'string')
    .map(s => s as unknown as ProtocolEditSetting)
  return list.length > 0 ? list : undefined
}

function stepSide(
  step: { label: string; description?: string; kind?: string },
  overrides: Partial<Record<'label' | 'description' | 'kind' | 'settings', unknown>> = {},
  opts: { inheritKind?: boolean } = {},
): StepFieldBeforeAfter {
  const side: StepFieldBeforeAfter = {}
  const label = asString(overrides.label) ?? step.label
  if (label) side.label = label
  // `kind` shows on the after side ONLY when the op proposes a new kind —
  // an unchanged kind is not a change to review.
  const kind = asStepKind('kind' in overrides ? overrides.kind : (opts.inheritKind ? step.kind : undefined))
  if (kind) side.kind = kind
  const description = 'description' in overrides ? asString(overrides.description) : step.description
  if (description) side.description = description
  const settings = asSettings(overrides.settings)
  if (settings) side.settings = settings
  return side
}

function roleSide(
  role: { roleId: string; description?: string; expectedLabwareKinds?: string[]; allowedInstrumentIds?: string[] } | undefined,
  roleId: string,
  overrides: Dict,
): RoleBeforeAfter {
  const side: RoleBeforeAfter = { roleId }
  const description = asString(overrides.description) ?? role?.description
  if (description) side.description = description
  const labwareKinds = asStringArray(overrides.expectedLabwareKinds) ?? role?.expectedLabwareKinds
  if (labwareKinds?.length) side.expectedLabwareKinds = labwareKinds
  const instruments = asStringArray(overrides.allowedInstrumentIds) ?? role?.allowedInstrumentIds
  if (instruments?.length) side.allowedInstrumentIds = instruments
  return side
}

/**
 * Map the validated `protocol_edit` envelope (PROTO-AI-7 — `ops` is schema
 * data, opaque here on purpose) onto the ChangesPanel display diff, hydrating
 * each op's BEFORE side from the attached-protocol snapshot so the biologist
 * reviews a real before/after, not a one-sided claim. Returns null when the
 * envelope carries nothing mappable (the caller then keeps the event-graph
 * path untouched). The op fields themselves are read structurally — the
 * schema, not TypeScript, is the vocabulary authority.
 */
export function protocolEditDiffFrom(
  proposal: AiProtocolEditProposal,
  protocol: { recordId: string; title?: string },
  attached?: AttachedProtocolSnapshot,
): ProtocolEditDiff | null {
  const ops: ProtocolEditOp[] = []
  for (const raw of proposal.ops) {
    const op = asDict(raw)
    const name = asString(op?.op)
    if (!op || !name) continue
    const stepById = (stepId: string) => attached?.steps.find(s => s.stepId === stepId)

    switch (name) {
      case 'step_update': {
        const stepId = asString(op.stepId)
        if (!stepId) break
        const step = stepById(stepId)
        const after = stepSide(step ?? { label: '' }, {
          ...('label' in op ? { label: op.label } : {}),
          ...('description' in op ? { description: op.description } : {}),
          ...('kind' in op ? { kind: op.kind } : {}),
          ...('settings' in op ? { settings: op.settings } : {}),
        })
        ops.push({
          op: 'modify',
          target: { type: 'step', stepId },
          ...(step ? { before: stepSide(step, {}, { inheritKind: true }) } : {}),
          after,
        })
        break
      }
      case 'step_insert': {
        const afterSide: StepFieldBeforeAfter = {}
        const label = asString(op.label)
        if (label) afterSide.label = label
        const kind = asStepKind(op.kind)
        if (kind) afterSide.kind = kind
        const description = asString(op.description)
        if (description) afterSide.description = description
        const anchorAfter = asString(op.afterStepId)
        const anchorBefore = asString(op.beforeStepId)
        ops.push({
          op: 'add',
          target: { type: 'step', stepId: '' },
          after: afterSide,
          ...(anchorAfter ? { position: { anchorStepId: anchorAfter, relative: 'after' as const } } : {}),
          ...(anchorBefore ? { position: { anchorStepId: anchorBefore, relative: 'before' as const } } : {}),
        })
        break
      }
      case 'step_delete': {
        const stepId = asString(op.stepId)
        if (!stepId) break
        const step = stepById(stepId)
        ops.push({
          op: 'remove',
          target: { type: 'step', stepId },
          ...(step ? { before: stepSide(step, {}, { inheritKind: true }) } : {}),
        })
        break
      }
      case 'labware_add':
      case 'labware_update':
      case 'labware_delete':
      case 'equipment_add':
      case 'equipment_update':
      case 'equipment_delete': {
        const roleId = asString(op.roleId)
        if (!roleId) break
        const isLabware = name.startsWith('labware')
        const roleList = isLabware ? attached?.labwareRoles : attached?.instrumentRoles
        const role = roleList?.find(r => r.roleId === roleId)
        const target: ProtocolEditOp['target'] = {
          type: 'role',
          roleKind: isLabware ? 'labwareRoles' : 'instrumentRoles',
          roleId,
        }
        if (name.endsWith('_add')) {
          ops.push({ op: 'add', target, after: roleSide(undefined, roleId, op) })
        } else if (name.endsWith('_delete')) {
          ops.push({
            op: 'remove',
            target,
            ...(role ? { before: roleSide(role, roleId, {}) } : { before: { roleId } }),
          })
        } else {
          ops.push({
            op: 'modify',
            target,
            ...(role ? { before: roleSide(role, roleId, {}) } : { before: { roleId } }),
            after: roleSide(role, roleId, op),
          })
        }
        break
      }
      default:
        // Unknown op name: schema validation is the server's (PROTO-AI-7);
        // an unmappable op is skipped rather than guessed at here.
        break
    }
  }
  if (ops.length === 0) return null
  return { protocol, ops }
}
