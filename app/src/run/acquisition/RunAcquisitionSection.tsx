/**
 * L2-RUN-ACQUISITION-SECTION-1 (unit u1acqdoor) — the RUN-OWNED acquisition
 * section. The run is the provenance record: an acquisition attaches to the
 * RUN, not to an instrument-sequence accident (RUN-IS-THE-PROVENANCE-RECORD,
 * 2026-11-14; restated by Brad 2026-11-16).
 *
 * Always-present data door (the defect this unit ends):
 *   - mounts on EVERY kind-'run' page, even when nothing links an
 *     instrument-sequence (GcRunSheetSection returns null in that case — the
 *     gating defect; THIS section does NOT share that gate). It is the ONE
 *     data surface the run owns, the precondition for retiring the legacy
 *     /runs/<id>/editor/results page and for L2-RUN-ACQUISITION-FILE-UPLOAD-1.
 *   - lists the acquisition-package records whose `sourceRunRef` names THIS
 *     run (the existing records API — no second store, no new read method: a
 *     package links to the run via sourceRunRef, the same ref the register
 *     door writes).
 *   - empty state names the absence ("No instrument data attached to this
 *     run yet") and offers the attach affordance.
 *
 * The attach affordance reuses the ONE acquisition write
 * (`apiClient.registerAcquisitionPackage` — the existing acquisition-package
 * register door, /acquisition-packages/register). It does NOT reimplement a
 * second store or a second attach path. For a run with NO instrument-sequence
 * the door's entry-scoped binding (an instrument-sequence-entry) is absent, so
 * the form uses the door's RUN-scoped binding (u1acqgraph): `sourceRunRef`
 * (the run) + `eventGraphRef` (the run's method graph) + `assayType`. A
 * `sourceRunRef`-only body does NOT pass the door's MATERIAL_OR_ENTRY_REQUIRED
 * guard — the run-scoped path names the run's method graph, which is exactly
 * why a run with no sequence can still attach (the acceptance run
 * RUN-2026-11-14-run-571a carries a methodEventGraphId).
 *
 * Presentation only: no server change, no new read method. The device dropdown
 * is CONFIG DATA (getConfig().storageDevices — the config device id, never a
 * mount path); the directoryKey is a plain text input; the assayType is the
 * measurement schema's enum (the door requires it for an event-graph-scoped
 * call). Failure surfaces render the NAMED token (never a silent disable).
 */
import { useCallback, useEffect, useState } from 'react'
import { apiClient, AcquisitionPackageClientError, ACQUISITION_PACKAGE_CLIENT_ERROR_MESSAGES } from '../../shared/api/client'
import type { RecordEnvelope } from '../../types/kernel'
import './RunAcquisitionSection.css'

// The measurement schema's assayType enum (the run-scoped register door
// requires it when eventGraphRef is present + entryRef absent — it is never
// defaulted by the handler; the caller declares the assay).
const ASSAY_TYPES = ['qpcr', 'plate_reader', 'microscopy', 'gc_fid', 'gc_ms', 'flow', 'other'] as const
type AssayType = (typeof ASSAY_TYPES)[number]

interface StorageDevice {
  id: string
  label?: string
  kind?: string
  mountPath?: string
}

/** One attached acquisition package (the ACQP record, run-scoped). */
interface AttachedPackage {
  recordId: string
  title?: string
  storageDeviceId?: string
  directoryKey?: string
  registeredAt?: string
}

export function RunAcquisitionSection({
  runId,
  eventGraphId,
}: {
  runId: string
  /** The run's method event-graph id (the door's run-scoped binding). Absent
   *  for a run with no method graph — the attach form then names that, it does
   *  not conjure a graph (a missing identity is never conjured). */
  eventGraphId?: string
}) {
  const [packages, setPackages] = useState<AttachedPackage[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [attachOpen, setAttachOpen] = useState(false)

  // The ONE acquisition read: the existing records API, filtered to the
  // packages whose sourceRunRef names THIS run. The section owns its own
  // single probe (it is NOT gated on a sequence probe).
  const load = useCallback(async () => {
    setListError(null)
    try {
      const { records } = await apiClient.listRecordsByKind('acquisition-package', 1000)
      const attached = records
        .filter((r) => (r.payload?.sourceRunRef as { id?: string } | undefined)?.id === runId)
        .map((r: RecordEnvelope) => {
          const p = r.payload as Record<string, unknown>
          return {
            recordId: r.recordId,
            ...(typeof p.title === 'string' ? { title: p.title } : {}),
            ...(typeof p.storageDeviceId === 'string' ? { storageDeviceId: p.storageDeviceId } : {}),
            ...(typeof p.directoryKey === 'string' ? { directoryKey: p.directoryKey } : {}),
            ...(typeof p.registeredAt === 'string' ? { registeredAt: p.registeredAt } : {}),
          }
        })
      setPackages(attached)
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err))
    }
  }, [runId])

  useEffect(() => {
    void load()
  }, [load])

  const empty = packages !== null && packages.length === 0

  return (
    <section
      id="run-acquisition"
      data-testid="run-acquisition-section"
      className="run-acquisition"
      tabIndex={-1}
    >
      <header className="run-acquisition__head">
        <h2 className="run-acquisition__title">Instrument data</h2>
        <span className="run-acquisition__subtitle">acquisition packages attached to this run</span>
      </header>

      {listError && (
        <p className="run-acquisition__list-error" role="alert">
          Could not load the attached packages: {listError}
        </p>
      )}

      {packages === null && !listError && <p className="run-acquisition__loading">Loading attached packages…</p>}

      {empty && (
        <div className="run-acquisition__empty" data-testid="run-acquisition-empty">
          <p className="run-acquisition__empty-text">No instrument data attached to this run yet</p>
          {!attachOpen ? (
            <button
              type="button"
              className="run-acquisition__attach-btn"
              data-testid="run-acquisition-attach"
              onClick={() => setAttachOpen(true)}
            >
              Attach instrument data
            </button>
          ) : (
            <RunScopedAttachForm
              runId={runId}
              eventGraphId={eventGraphId}
              onAttached={() => {
                setAttachOpen(false)
                void load()
              }}
              onCancel={() => setAttachOpen(false)}
            />
          )}
        </div>
      )}

      {packages !== null && !empty && (
        <ul className="run-acquisition__list" data-testid="run-acquisition-list">
          {packages.map((p) => (
            <li key={p.recordId} className="run-acquisition__item" data-testid="run-acquisition-item">
              <span className="run-acquisition__id">{p.recordId}</span>
              <span className="run-acquisition__loc">
                {p.storageDeviceId ?? '—'} · {p.directoryKey ?? '—'}
              </span>
              {p.registeredAt ? <time className="run-acquisition__created" dateTime={p.registeredAt}>{p.registeredAt}</time> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * The run-scoped attach form: the ONE register write, invoked with the door's
 * run-scoped binding (sourceRunRef + eventGraphRef + assayType) so a run with
 * NO instrument-sequence can still attach its .D directory to the run.
 *
 * Reuses the same failure-surface posture as GcAttachPanel (the GC attach
 * panel's register flow): the device dropdown is CONFIG data (the config
 * device id, never a mount path); the directoryKey is a plain input; a
 * `not-configured` state (no devices) renders a stated reason (never a
 * disabled Register pretending); a register failure renders the NAMED token
 * from AcquisitionPackageClientError (no conflation, no silent disable).
 * Mounting the form NEVER registers — the Register button is the only writer.
 */
function RunScopedAttachForm({
  runId,
  eventGraphId,
  onAttached,
  onCancel,
}: {
  runId: string
  eventGraphId?: string
  onAttached: () => void
  onCancel: () => void
}) {
  const [devices, setDevices] = useState<StorageDevice[]>([])
  const [deviceId, setDeviceId] = useState('')
  const [directoryKey, setDirectoryKey] = useState('')
  const [assayType, setAssayType] = useState<AssayType>('other')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ token: string; message: string } | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)

  // The device dropdown is CONFIG DATA (GET /config) — the config device id,
  // never a mount path. Default to the default device (config `default: true`).
  useEffect(() => {
    let cancelled = false
    apiClient
      .getConfig()
      .then((cfg) => {
        if (cancelled) return
        const list = (cfg.storageDevices ?? []) as StorageDevice[]
        setDevices(list)
        setConfigError(null)
        const def = list.find((d) => (d as { default?: boolean }).default) ?? list[0]
        if (def) setDeviceId(def.id)
      })
      .catch((err) => {
        if (!cancelled) setConfigError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const register = async () => {
    if (busy) return
    if (!deviceId || !directoryKey.trim()) {
      setError({ token: 'MISSING_INPUT', message: 'Choose a storage device and the .D directory to register.' })
      return
    }
    setError(null)
    setBusy(true)
    try {
      await apiClient.registerAcquisitionPackage({
        deviceId,
        directoryKey,
        sourceRunRef: { kind: 'record', id: runId, type: 'run' },
        ...(eventGraphId ? { eventGraphRef: { kind: 'record', id: eventGraphId, type: 'event-graph' } } : {}),
        assayType,
      })
      onAttached()
    } catch (err) {
      if (AcquisitionPackageClientError.isAcquisitionPackageError(err)) {
        setError({
          token: err.code,
          message: ACQUISITION_PACKAGE_CLIENT_ERROR_MESSAGES[err.code] ?? err.message,
        })
      } else {
        setError({
          token: 'ACQUISITION_PACKAGE_UNKNOWN',
          message: err instanceof Error ? err.message : String(err),
        })
      }
    } finally {
      setBusy(false)
    }
  }

  // A config FETCH failure is a NAMED error — never the "no devices" lie.
  if (configError) {
    return (
      <div className="run-acquisition__form" data-testid="run-acquisition-attach-form">
        <span className="run-acquisition__form-error" role="alert" data-testid="run-acquisition-configerror">
          Could not load the storage device config: {configError}
        </span>
      </div>
    )
  }

  // The not-configured arm (dead-chrome clause): no devices = a stated reason,
  // never a disabled Register pretending.
  if (devices.length === 0) {
    return (
      <div className="run-acquisition__form" data-testid="run-acquisition-attach-form">
        <span className="run-acquisition__form-reason" data-testid="run-acquisition-notconfigured">
          No storage devices are configured — a storage device must be added to the lab config before a .D directory can be attached.
        </span>
      </div>
    )
  }

  // No method graph on this run: the door's run-scoped binding names the run's
  // method graph (eventGraphRef), so without one the .D can't be attached to
  // the run's method. State it (never conjure a graph, never a silent disable).
  if (!eventGraphId) {
    return (
      <div className="run-acquisition__form" data-testid="run-acquisition-attach-form">
        <span className="run-acquisition__form-reason" data-testid="run-acquisition-nomethod">
          This run has no method graph yet — attach a method so a .D directory can be registered to the run.
        </span>
      </div>
    )
  }

  return (
    <div className="run-acquisition__form" data-testid="run-acquisition-attach-form">
      <label className="run-acquisition__label" htmlFor="run-acquisition-device">
        Device
      </label>
      <select
        id="run-acquisition-device"
        data-testid="run-acquisition-attach-device"
        value={deviceId}
        onChange={(e) => setDeviceId(e.target.value)}
      >
        {devices.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label ?? d.id}
          </option>
        ))}
      </select>
      <label className="run-acquisition__label" htmlFor="run-acquisition-directory">
        .D directory
      </label>
      <input
        id="run-acquisition-directory"
        data-testid="run-acquisition-attach-directory"
        value={directoryKey}
        placeholder="path/relative/to/device/root.D"
        onChange={(e) => setDirectoryKey(e.target.value)}
      />
      <label className="run-acquisition__label" htmlFor="run-acquisition-assay">
        Assay
      </label>
      <select
        id="run-acquisition-assay"
        data-testid="run-acquisition-attach-assay"
        value={assayType}
        onChange={(e) => setAssayType(e.target.value as AssayType)}
      >
        {ASSAY_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <div className="run-acquisition__form-actions">
        <button type="button" className="run-acquisition__register-btn" data-testid="run-acquisition-attach-register" onClick={() => void register()}>
          {busy ? 'Registering…' : 'Attach .D'}
        </button>
        <button type="button" className="run-acquisition__cancel-btn" data-testid="run-acquisition-attach-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {(!deviceId || !directoryKey.trim()) && !error && !busy && (
        <span className="run-acquisition__hint" data-testid="run-acquisition-attach-hint">
          Pick a device and the .D directory to attach.
        </span>
      )}
      {error && (
        <div className="run-acquisition__form-error" data-testid="run-acquisition-attach-error">
          <span className="run-acquisition__form-error-token" data-testid="run-acquisition-attach-error-token">
            {error.token}
          </span>
          <span>{error.message}</span>
        </div>
      )}
    </div>
  )
}
