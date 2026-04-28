import type { RecordEnvelope } from '../../types/kernel'
import type { Diagnostic } from './types'

interface RoleBindingRowProps {
  roleId: string
  roleType: string
  currentBinding: { instanceRef: string } | undefined
  instances: Array<{ recordId: string; title: string; kind: string }>
  onBindingChange: (roleId: string, instanceRef: string) => void
  diagnostics: Diagnostic[]
}

function DiagnosticBadge({ diagnostics }: { diagnostics: Diagnostic[] }) {
  if (diagnostics.length === 0) {
    return <span title="OK" className="diagnostic-badge diagnostic-badge--ok">✓</span>
  }
  const hasError = diagnostics.some((d) => d.code.startsWith('capability_'))
  const hasUnbound = diagnostics.some((d) => d.code.startsWith('unbound_'))
  if (hasError) {
    return (
      <span
        title={diagnostics.map((d) => d.message).join('\n')}
        className="diagnostic-badge diagnostic-badge--error"
      >
        ✗
      </span>
    )
  }
  if (hasUnbound) {
    return (
      <span
        title={diagnostics.map((d) => d.message).join('\n')}
        className="diagnostic-badge diagnostic-badge--warning"
      >
        ⚠
      </span>
    )
  }
  return <span title="OK" className="diagnostic-badge diagnostic-badge--ok">✓</span>
}

export function RoleBindingRow({
  roleId,
  roleType,
  currentBinding,
  instances,
  onBindingChange,
  diagnostics,
}: RoleBindingRowProps) {
  const isLabwareRole = roleType === 'labware' || roleType === 'labware-role'
  const label = isLabwareRole ? 'Labware' : 'Material'

  return (
    <div data-testid={`role-binding-${roleId}`} className="role-binding-row">
      <div className="role-binding-row__info">
        <span className="role-binding-row__label">{roleId}</span>
        <span className="role-binding-row__type">{label}</span>
        <DiagnosticBadge diagnostics={diagnostics} />
      </div>
      <select
        value={currentBinding?.instanceRef ?? ''}
        onChange={(e) => onBindingChange(roleId, e.target.value)}
        className="role-binding-row__select"
      >
        <option value="">— select —</option>
        {instances.map((inst) => (
          <option key={inst.recordId} value={inst.recordId}>
            {inst.title} ({inst.recordId})
          </option>
        ))}
      </select>
      {currentBinding && (
        <span className="role-binding-row__current">
          Bound: {currentBinding.instanceRef}
        </span>
      )}
    </div>
  )
}

interface RoleBindingPanelProps {
  labwareRoles: Array<{ roleId: string; roleType: string }>
  materialRoles: Array<{ roleId: string; roleType: string }>
  currentBindings: Record<string, { instanceRef: string }>
  labwareInstances: RecordEnvelope[]
  materialInstances: RecordEnvelope[]
  onBindingChange: (roleId: string, instanceRef: string) => void
  diagnostics: Diagnostic[]
}

export function RoleBindingPanel({
  labwareRoles,
  materialRoles,
  currentBindings,
  labwareInstances,
  materialInstances,
  onBindingChange,
  diagnostics,
}: RoleBindingPanelProps) {
  const labwareInstanceList = labwareInstances.map((r) => ({
    recordId: r.recordId,
    title: (r.payload as Record<string, unknown>)?.name as string || r.recordId,
    kind: 'labware-instance',
  }))

  const materialInstanceList = materialInstances.map((r) => ({
    recordId: r.recordId,
    title: (r.payload as Record<string, unknown>)?.name as string || r.recordId,
    kind: 'material-instance',
  }))

  // Filter diagnostics for labware roles
  const labwareRoleIds = new Set(labwareRoles.map((r) => r.roleId))
  const labwareDiagnostics = diagnostics.filter((d) => {
    const roleId = (d.details as Record<string, unknown>)?.roleId as string | undefined
    return roleId !== undefined && labwareRoleIds.has(roleId)
  })

  // Filter diagnostics for material roles
  const materialRoleIds = new Set(materialRoles.map((r) => r.roleId))
  const materialDiagnostics = diagnostics.filter((d) => {
    const roleId = (d.details as Record<string, unknown>)?.roleId as string | undefined
    return roleId !== undefined && materialRoleIds.has(roleId)
  })

  return (
    <div className="role-binding-panel">
      {labwareRoles.length > 0 && (
        <section className="role-binding-panel__group">
          <h3 className="role-binding-panel__group-title">Labware roles</h3>
          {labwareRoles.map((role) => (
            <RoleBindingRow
              key={role.roleId}
              roleId={role.roleId}
              roleType={role.roleType}
              currentBinding={currentBindings[role.roleId]}
              instances={labwareInstanceList}
              onBindingChange={onBindingChange}
              diagnostics={labwareDiagnostics.filter(
                (d) => (d.details as Record<string, unknown>)?.roleId === role.roleId,
              )}
            />
          ))}
        </section>
      )}

      {materialRoles.length > 0 && (
        <section className="role-binding-panel__group">
          <h3 className="role-binding-panel__group-title">Material roles</h3>
          {materialRoles.map((role) => (
            <RoleBindingRow
              key={role.roleId}
              roleId={role.roleId}
              roleType={role.roleType}
              currentBinding={currentBindings[role.roleId]}
              instances={materialInstanceList}
              onBindingChange={onBindingChange}
              diagnostics={materialDiagnostics.filter(
                (d) => (d.details as Record<string, unknown>)?.roleId === role.roleId,
              )}
            />
          ))}
        </section>
      )}

      {labwareRoles.length === 0 && materialRoles.length === 0 && (
        <p className="role-binding-panel__empty">No roles defined in the local protocol.</p>
      )}
    </div>
  )
}
