import { useCallback, useState } from 'react'
import { EditableSection, type SectionId } from './EditableSection'
import { CheckboxRow, InfoRow, SelectRow } from './EditRow'
import type { LabConfig, MaterialTrackingMode } from '../../types/config'

const MODE_OPTIONS: Array<{ value: MaterialTrackingMode; label: string }> = [
  { value: 'relaxed', label: 'Relaxed' },
  { value: 'tracked', label: 'Tracked' },
]

interface Props {
  lab: LabConfig | null
  editingSection: SectionId | null
  onEditChange: (id: SectionId | null) => void
  onSave: (patch: Record<string, unknown>) => Promise<{ restartRequired?: boolean }>
  saving: boolean
}

export function LabMaterialTrackingSection({ lab, editingSection, onEditChange, onSave, saving }: Props) {
  const [mode, setMode] = useState<MaterialTrackingMode>(lab?.materialTracking.mode ?? 'relaxed')
  const [allowAdHocEventInstances, setAllowAdHocEventInstances] = useState(lab?.materialTracking.allowAdHocEventInstances ?? true)

  const resetForm = useCallback(() => {
    setMode(lab?.materialTracking.mode ?? 'relaxed')
    setAllowAdHocEventInstances(lab?.materialTracking.allowAdHocEventInstances ?? true)
  }, [lab])

  const handleSave = useCallback(async () => {
    return onSave({
      lab: {
        materialTracking: {
          mode,
          allowAdHocEventInstances,
        },
      },
    })
  }, [allowAdHocEventInstances, mode, onSave])

  const handleEdit = useCallback((id: SectionId | null) => {
    if (id === 'lab-material-tracking') resetForm()
    onEditChange(id)
  }, [onEditChange, resetForm])

  return (
    <EditableSection
      id="lab-material-tracking"
      title="Lab Material Tracking"
      editingSection={editingSection}
      onEditChange={handleEdit}
      saving={saving}
      onSave={handleSave}
      onCancel={resetForm}
      readContent={
        <>
          <InfoRow label="Mode" value={mode === 'relaxed' ? 'Relaxed' : 'Tracked'} />
          <InfoRow label="Allow ad hoc event instances" value={allowAdHocEventInstances ? 'Yes' : 'No'} />
        </>
      }
      editContent={
        <>
          <SelectRow
            label="Tracking mode"
            value={mode}
            onChange={(value) => setMode(value as MaterialTrackingMode)}
            options={MODE_OPTIONS}
          />
          <CheckboxRow
            label="Allow ad hoc event instances"
            checked={allowAdHocEventInstances}
            onChange={setAllowAdHocEventInstances}
          />
        </>
      }
    />
  )
}
