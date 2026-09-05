/**
 * StorageDevicesSection — connect CL to an arbitrary number of external
 * storage devices (S3 bucket / NAS, or a local mount such as a USB stick).
 *
 * Each device is a pointer to where large raw instrument data lives; CL keeps
 * references + hashes in git, never the bytes. Supports s3 and local-mount
 * kinds. Secrets are referenced by ENV VAR NAME (accessKeyEnv / secretKeyEnv),
 * never literal values.
 */
import { useState, useCallback } from 'react'
import { EditableSection, type SectionId } from './EditableSection'
import { EditRow, SelectRow, CheckboxRow, InfoRow } from './EditRow'
import type { StorageDeviceConfig, StorageDeviceKind } from '../../types/config'

const KIND_OPTIONS = [
  { value: 'local-mount', label: 'Local mount (USB / NAS path)' },
  { value: 's3', label: 'S3-compatible bucket' },
]

interface DraftDevice {
  id: string
  label: string
  kind: StorageDeviceKind
  default: boolean
  mountPath: string
  bucket: string
  entrypoint: string
  region: string
  pathPrefix: string
  accessKeyEnv: string
  secretKeyEnv: string
}

function toDraft(d: StorageDeviceConfig): DraftDevice {
  return {
    id: d.id,
    label: d.label,
    kind: d.kind,
    default: d.default === true,
    mountPath: d.mountPath ?? '',
    bucket: d.bucket ?? '',
    entrypoint: d.entrypoint ?? '',
    region: d.region ?? '',
    pathPrefix: d.pathPrefix ?? '',
    accessKeyEnv: d.accessKeyEnv ?? '',
    secretKeyEnv: d.secretKeyEnv ?? '',
  }
}

function toConfig(d: DraftDevice): StorageDeviceConfig {
  const base: StorageDeviceConfig = {
    id: d.id,
    label: d.label,
    kind: d.kind,
    default: d.default,
  }
  if (d.kind === 'local-mount') {
    if (d.mountPath.trim()) base.mountPath = d.mountPath.trim()
  } else {
    if (d.bucket.trim()) base.bucket = d.bucket.trim()
    if (d.entrypoint.trim()) base.entrypoint = d.entrypoint.trim()
    if (d.region.trim()) base.region = d.region.trim()
    if (d.pathPrefix.trim()) base.pathPrefix = d.pathPrefix.trim()
    if (d.accessKeyEnv.trim()) base.accessKeyEnv = d.accessKeyEnv.trim()
    if (d.secretKeyEnv.trim()) base.secretKeyEnv = d.secretKeyEnv.trim()
  }
  return base
}

interface Props {
  devices: StorageDeviceConfig[]
  editingSection: SectionId | null
  onEditChange: (id: SectionId | null) => void
  onSave: (patch: Record<string, unknown>) => Promise<{ restartRequired?: boolean }>
  saving: boolean
}

const blank = (n: number): DraftDevice => ({
  id: `dev-${n}`,
  label: '',
  kind: 'local-mount',
  default: false,
  mountPath: '',
  bucket: '',
  entrypoint: '',
  region: '',
  pathPrefix: '',
  accessKeyEnv: '',
  secretKeyEnv: '',
})

export function StorageDevicesSection({
  devices,
  editingSection,
  onEditChange,
  onSave,
  saving,
}: Props) {
  const [draft, setDraft] = useState<DraftDevice[]>(() => devices.map(toDraft))

  const resetForm = useCallback(() => {
    setDraft(devices.map(toDraft))
  }, [devices])

  const handleEdit = useCallback(
    (id: SectionId | null) => {
      if (id === 'storage-devices') resetForm()
      onEditChange(id)
    },
    [resetForm, onEditChange],
  )

  const handleChange = useCallback((idx: number, patch: Partial<DraftDevice>) => {
    setDraft((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)))
  }, [])

  const addDevice = useCallback(() => {
    setDraft((prev) => [...prev, blank(prev.length + 1)])
  }, [])

  const removeDevice = useCallback((idx: number) => {
    setDraft((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const handleSave = useCallback(async () => {
    const payload = draft.map(toConfig)
    return onSave({ storageDevices: payload })
  }, [draft, onSave])

  return (
    <EditableSection
      id="storage-devices"
      title="Storage Devices"
      editingSection={editingSection}
      onEditChange={handleEdit}
      saving={saving}
      onSave={handleSave}
      onCancel={resetForm}
      readContent={
        <div data-testid="storage-devices-section">
          {devices.length === 0 ? (
            <InfoRow label="Devices" value="None configured" />
          ) : (
            devices.map((d) => (
              <InfoRow
                key={d.id}
                label={d.label}
                value={
                  <span>
                    <span className="storage-device-kind">{d.kind}</span>
                    {d.default && <span className="storage-device-default">default</span>}
                    {d.kind === 'local-mount' ? d.mountPath : d.bucket}
                  </span>
                }
                mono
              />
            ))
          )}
        </div>
      }
      editContent={
        <div data-testid="storage-devices-section">
          {draft.map((d, idx) => (
            <div key={d.id} className="storage-device-editor" data-testid={`storage-device-editor-${d.id}`}>
              <div className="storage-device-editor__head">
                <EditRow label="ID" value={d.id} onChange={(v) => handleChange(idx, { id: v })} mono />
                <button
                  type="button"
                  className="btn btn-edit"
                  onClick={() => removeDevice(idx)}
                  aria-label={`Remove ${d.label || d.id}`}
                >
                  Remove
                </button>
              </div>
              <EditRow label="Label" value={d.label} onChange={(v) => handleChange(idx, { label: v })} />
              <SelectRow
                label="Kind"
                value={d.kind}
                onChange={(v) => handleChange(idx, { kind: v as StorageDeviceKind })}
                options={KIND_OPTIONS}
              />
              <CheckboxRow
                label="Default device"
                checked={d.default}
                onChange={(v) => handleChange(idx, { default: v })}
              />
              {d.kind === 'local-mount' ? (
                <EditRow
                  label="Mount path"
                  value={d.mountPath}
                  onChange={(v) => handleChange(idx, { mountPath: v })}
                  mono
                  placeholder="/mnt/usb0"
                />
              ) : (
                <>
                  <EditRow label="Bucket" value={d.bucket} onChange={(v) => handleChange(idx, { bucket: v })} mono />
                  <EditRow
                    label="Endpoint (optional)"
                    value={d.entrypoint}
                    onChange={(v) => handleChange(idx, { entrypoint: v })}
                    mono
                    placeholder="https://minio.lab:9000"
                  />
                  <EditRow
                    label="Region (optional)"
                    value={d.region}
                    onChange={(v) => handleChange(idx, { region: v })}
                    mono
                  />
                  <EditRow
                    label="Path prefix (optional)"
                    value={d.pathPrefix}
                    onChange={(v) => handleChange(idx, { pathPrefix: v })}
                    mono
                  />
                  <EditRow
                    label="Access key env var"
                    value={d.accessKeyEnv}
                    onChange={(v) => handleChange(idx, { accessKeyEnv: v })}
                    mono
                    placeholder="LAB_S3_ACCESS_KEY"
                  />
                  <EditRow
                    label="Secret key env var"
                    value={d.secretKeyEnv}
                    onChange={(v) => handleChange(idx, { secretKeyEnv: v })}
                    mono
                    placeholder="LAB_S3_SECRET_KEY"
                  />
                </>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-secondary" onClick={addDevice} data-testid="storage-add-device">
            + Add device
          </button>
        </div>
      }
    />
  )
}