/**
 * StorageDevicesSection — renders configured devices and lets the user add /
 * edit / remove / save an arbitrary number of storage devices.
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { StorageDevicesSection } from './StorageDevicesSection'
import type { StorageDeviceConfig } from '../../types/config'

type SaveFn = (patch: Record<string, unknown>) => Promise<{ restartRequired?: boolean }>

const DEVICES: StorageDeviceConfig[] = [
  { id: 'usb0', label: 'USB main', kind: 'local-mount', default: true, mountPath: '/mnt/usb0' },
]

describe('StorageDevicesSection', () => {
  let onSave: SaveFn
  let savedPatches: Record<string, unknown>[]

  beforeEach(() => {
    savedPatches = []
    onSave = async (patch) => {
      savedPatches.push(patch)
      return { restartRequired: false }
    }
  })

  /** Stateful host so Edit actually toggles edit mode (the SettingsPage owns this). */
  function Host({ devices }: { devices: StorageDeviceConfig[] }) {
    const [editing, setEditing] = useState<string | null>(null)
    return (
      <StorageDevicesSection
        devices={devices}
        editingSection={editing}
        onEditChange={setEditing}
        onSave={onSave}
        saving={false}
      />
    )
  }

  function renderSection(devices: StorageDeviceConfig[] = DEVICES) {
    return render(<Host devices={devices} />)
  }

  it('renders configured devices in read mode', () => {
    renderSection()
    const section = screen.getByTestId('storage-devices-section')
    expect(section).toHaveTextContent('USB main')
    expect(section).toHaveTextContent('local-mount')
    expect(section).toHaveTextContent('/mnt/usb0')
  })

  it('shows "None configured" when there are no devices', () => {
    renderSection([])
    expect(screen.getByTestId('storage-devices-section')).toHaveTextContent('None configured')
  })

  it('shows the s3 fields when a new device kind is switched to s3', () => {
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: '+ Add device' }))
    const editor = within(screen.getByTestId('storage-device-editor-dev-2'))
    fireEvent.change(editor.getByRole('combobox'), { target: { value: 's3' } })
    expect(editor.getByPlaceholderText('https://minio.lab:9000')).toBeDefined()
    expect(editor.getByPlaceholderText('LAB_S3_ACCESS_KEY')).toBeDefined()
  })

  it('keeps the original device and saves a newly added second device', () => {
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: '+ Add device' }))
    const editor = within(screen.getByTestId('storage-device-editor-dev-2'))
    fireEvent.change(editor.getByPlaceholderText('/mnt/usb0'), { target: { value: '/mnt/nas' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(savedPatches.length).toBe(1)
    const saved = savedPatches[0].storageDevices as Array<{
      id: string
      kind: string
      mountPath?: string
    }> | undefined
    expect(saved?.length).toBe(2)
    expect(saved?.[0]).toMatchObject({ id: 'usb0', kind: 'local-mount', mountPath: '/mnt/usb0' })
    expect(saved?.[1]).toMatchObject({ id: 'dev-2', kind: 'local-mount', mountPath: '/mnt/nas' })
  })
})