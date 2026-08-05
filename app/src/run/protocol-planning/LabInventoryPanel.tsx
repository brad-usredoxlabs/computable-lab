/**
 * LabInventoryPanel — compact inventory/instrument readout for the
 * Protocol Planning (localization) mode. Shows the lab's available equipment
 * (instruments) and material stocks so the user can see "which instrument do we
 * have" (e.g. QuantStudio 5 vs Bio-rad) before binding protocol roles.
 *
 * Lives inside the right pane tabs per project convention (two-pane, no third
 * pane, no pre-built widget libraries).
 */

import { useEffect, useState, type JSX } from 'react'
import { apiClient } from '../../shared/api/client'
import type { RecordEnvelope } from '../../types/kernel'

interface LabInventoryPanelProps {
  studyId?: string
}

interface EquipmentItem {
  id: string
  name: string
  model?: string
  manufacturer?: string
}

interface MaterialItem {
  recordId: string
  label: string
  name?: string
}

export function LabInventoryPanel({ studyId }: LabInventoryPanelProps): JSX.Element {
  const [equipment, setEquipment] = useState<EquipmentItem[]>([])
  const [materials, setMaterials] = useState<MaterialItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [eqRes, matRes] = await Promise.all([
          apiClient.listRecordsByKind('equipment', 100).catch(() => null),
          apiClient.listRecordsByKind('material-spec', 50).catch(() => null),
        ])
        if (cancelled) return
        setEquipment(
          (eqRes?.records ?? []).map(toEquipment).filter((e): e is EquipmentItem => e !== null),
        )
        setMaterials(
          (matRes?.records ?? []).map(toMaterial).filter((m): m is MaterialItem => m !== null),
        )
      } catch {
        // Degrade gracefully — empty inventory.
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // studyId is a scoping hint; the inventory is lab-global so we load all.
  }, [studyId])

  return (
    <div className="lab-inventory-panel" data-testid="lab-inventory-panel">
      {loading ? (
        <p className="lab-inventory-panel__hint">Loading inventory…</p>
      ) : (
        <>
          <section className="lab-inventory-panel__section">
            <h4 className="lab-inventory-panel__title">Instruments</h4>
            {equipment.length === 0 ? (
              <p className="lab-inventory-panel__hint">No equipment records.</p>
            ) : (
              <ul className="lab-inventory-panel__list">
                {equipment.map((e) => (
                  <li key={e.id} className="lab-inventory-panel__item">
                    <span className="lab-inventory-panel__item-name">{e.name}</span>
                    {e.model ? <span className="lab-inventory-panel__item-model">{e.model}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="lab-inventory-panel__section">
            <h4 className="lab-inventory-panel__title">Materials / Stocks</h4>
            {materials.length === 0 ? (
              <p className="lab-inventory-panel__hint">No material records.</p>
            ) : (
              <ul className="lab-inventory-panel__list">
                {materials.map((m) => (
                  <li key={m.recordId} className="lab-inventory-panel__item">
                    <span className="lab-inventory-panel__item-name">{m.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function toEquipment(env: RecordEnvelope): EquipmentItem | null {
  const p = (env.payload ?? env) as Record<string, unknown>
  const id = typeof p.id === 'string' ? p.id : env.recordId
  const name = typeof p.name === 'string' ? p.name : (typeof p.title === 'string' ? p.title : '')
  if (!id || !name) return null
  return {
    id,
    name,
    ...(typeof p.model === 'string' ? { model: p.model } : {}),
    ...(typeof p.manufacturer === 'string' ? { manufacturer: p.manufacturer } : {}),
  }
}

function toMaterial(env: RecordEnvelope): MaterialItem | null {
  const p = (env.payload ?? env) as Record<string, unknown>
  const label = typeof p.title === 'string' && p.title.length > 0 ? p.title : (typeof p.name === 'string' ? p.name : undefined)
  if (!label) return null
  return {
    recordId: env.recordId,
    label,
    ...(typeof p.name === 'string' ? { name: p.name } : {}),
  }
}
