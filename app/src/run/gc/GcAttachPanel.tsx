/**
 * GC-12 (deliverable D4) — GcAttachPanel: the NAS attach affordance for one
 * instrument-sequence-entry (the GC-4 registration flow via the run-sheet
 * register route).
 *
 * The failure surfaces (bait #6): the device dropdown is built from
 * getConfig().storageDevices (the CONFIG device id — NEVER a mount path,
 * bait #7); the directoryKey is a plain text input; on register the panel
 * renders the NAMED token + per-token message from
 * AcquisitionPackageClientError (every token in
 * ACQUISITION_PACKAGE_ERROR_CODES has an explicit surface — no conflation,
 * no silent disable, no dead chrome). A `not-configured` state (no devices)
 * renders a stated reason — never a disabled Attach pretending (dead-chrome
 * clause). The panel is click-only: mounting it NEVER registers.
 *
 * Testids: gc-attach-<entryId> (panel), gc-attach-device-<entryId>
 * (select), gc-attach-key-<entryId> (input), gc-attach-register-<entryId>
 * (button), gc-attach-error-<entryId> (named failure), gc-attach-done-
 * <entryId> (the attached ACQP id).
 */
import { useEffect, useState } from 'react'
import {
  apiClient,
  AcquisitionPackageClientError,
  ACQUISITION_PACKAGE_CLIENT_ERROR_MESSAGES,
} from '../../shared/api/client'

interface StorageDevice {
  id: string
  label?: string
  kind?: string
  mountPath?: string
}

export function GcAttachPanel({
  entryId,
  onAttached,
}: {
  entryId: string
  /** Called with the minted ACQP recordId after a successful register (the
   *  section refetches the entry to show the new ref in the table). */
  onAttached: (packageRecordId: string) => void
}) {
  const [devices, setDevices] = useState<StorageDevice[]>([])
  const [deviceId, setDeviceId] = useState('')
  const [directoryKey, setDirectoryKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ token: string; message: string } | null>(null)
  // GC-12 fix-cycle-1 (O1): a getConfig FAILURE (transport/4xx/5xx) is not
  // the "no devices configured" state — falling through to the empty-state
  // reason told the scientist a config entry was missing when the real cause
  // was a failed config fetch. The error is tracked separately and rendered
  // as an error row (precedent: OwnershipPolicySection's loadError arm).
  const [configError, setConfigError] = useState<string | null>(null)

  // The device dropdown is CONFIG DATA (GET /config) — never a hardcoded
  // path (bait #7). The mount path is NEVER rendered as an input.
  useEffect(() => {
    let cancelled = false
    apiClient
      .getConfig()
      .then((cfg) => {
        if (cancelled) return
        const list = cfg.storageDevices ?? []
        setDevices(list)
        setConfigError(null)
        // Default to the default device (the config's `default: true`) — the
        // scientist still picks explicitly (the dropdown is live).
        const def = list.find((d) => (d as { default?: boolean }).default) ?? list[0]
        if (def) setDeviceId(def.id)
      })
      .catch((err) => {
        // GC-12 fix-cycle-1 (O1): a fetch failure is a NAMED error, not a
        // fabricated "no devices" — the error row renders the real cause and
        // never lies about the config's contents.
        if (!cancelled) setConfigError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const register = async () => {
    // Re-entry guard while a register is in flight (the button stays
    // clickable — a missing input is a NAMED reason below, never a dead
    // disabled button standing in for the missing capability,
    // dead-chrome clause, bait #6).
    if (busy) return
    if (!deviceId || !directoryKey.trim()) {
      setError({
        token: 'MISSING_INPUT',
        message: 'Choose a storage device and the .D directory to register.',
      })
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await apiClient.registerAcquisitionPackage({
        deviceId,
        directoryKey,
        entryRef: { kind: 'record', id: entryId, type: 'instrument-sequence-entry' },
      })
      onAttached(res.packageRecordId)
      setDirectoryKey('')
    } catch (err) {
      if (AcquisitionPackageClientError.isAcquisitionPackageError(err)) {
        // The NAMED token + its per-token message (bait #6). The token set is
        // the 8 real ACQUISITION_PACKAGE_ERROR_CODES tokens.
        setError({
          token: err.code,
          message:
            ACQUISITION_PACKAGE_CLIENT_ERROR_MESSAGES[err.code] ?? err.message,
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

  // GC-12 fix-cycle-1 (O1): a config FETCH failure renders a NAMED error row
  // (precedent: OwnershipPolicySection's loadError arm) — never the
  // "No storage devices are configured" empty-state lie, which a
  // transport/4xx/5xx failure used to fall through to.
  if (configError) {
    return (
      <div className="gc-attach" data-testid={`gc-attach-${entryId}`}>
        <span className="gc-attach__error gc-attach__error--config" role="alert" data-testid={`gc-attach-configerror-${entryId}`}>
          Could not load the storage device config: {configError}
        </span>
      </div>
    )
  }

  // The not-configured arm (dead-chrome clause): no devices = a stated
  // reason, never a disabled button pretending.
  if (devices.length === 0) {
    return (
      <div className="gc-attach" data-testid={`gc-attach-${entryId}`}>
        <span className="gc-attach__reason" data-testid={`gc-attach-notconfigured-${entryId}`}>
          No storage devices are configured — the GC FID NAS device must be added to the lab config before a .D directory can be registered.
        </span>
      </div>
    )
  }

  return (
    <div className="gc-attach" data-testid={`gc-attach-${entryId}`}>
      <label className="gc-attach__label" htmlFor={`gc-attach-device-${entryId}`}>
        Device
      </label>
      <select
        id={`gc-attach-device-${entryId}`}
        data-testid={`gc-attach-device-${entryId}`}
        value={deviceId}
        onChange={(e) => setDeviceId(e.target.value)}
      >
        {devices.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label ?? d.id}
          </option>
        ))}
      </select>
      <label className="gc-attach__label" htmlFor={`gc-attach-key-${entryId}`}>
        .D directory
      </label>
      <input
        id={`gc-attach-key-${entryId}`}
        data-testid={`gc-attach-key-${entryId}`}
        value={directoryKey}
        placeholder="path/relative/to/device/root.D"
        onChange={(e) => setDirectoryKey(e.target.value)}
      />
      <button
        type="button"
        data-testid={`gc-attach-register-${entryId}`}
        onClick={() => void register()}
      >
        {busy ? 'Registering…' : 'Register .D'}
      </button>
      {(!deviceId || !directoryKey.trim()) && !error && !busy && (
        <span className="gc-attach__hint" data-testid={`gc-attach-hint-${entryId}`}>
          Pick a device and the .D directory to register.
        </span>
      )}
      {error && (
        <div className="gc-attach__error" data-testid={`gc-attach-error-${entryId}`}>
          <span className="gc-attach__error-token" data-testid={`gc-attach-error-token-${entryId}`}>
            {error.token}
          </span>
          <span className="gc-attach__error-message">{error.message}</span>
        </div>
      )}
    </div>
  )
}
