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
  onActionStart,
}: {
  entryId: string
  /** Called with the minted ACQP recordId after a successful register (the
   *  section refetches the entry to show the new ref in the table). */
  onAttached: (packageRecordId: string) => void
  /** Called when a register action STARTS (GC-12 fix-cycle-3 DIRFIX-3 minor
   *  5: one owner for the chrome note line — a new action clears the stale
   *  note from a prior failure, so the register's own named token renders
   *  next to nothing, never next to a different failure's note). */
  onActionStart?: () => void
}) {
  const [devices, setDevices] = useState<StorageDevice[]>([])
  const [deviceId, setDeviceId] = useState('')
  const [directoryKey, setDirectoryKey] = useState('')
  const [busy, setBusy] = useState(false)
  // GC-12 dirfix MINOR-FIX (defect 2): the register's OWN busy note. A click
  // during an in-flight register used to be a SILENT `if (busy) return`
  // (the only feedback: the label flipping to "Registering…"). Now the
  // ignored click renders a NAMED note — consistent with the sibling
  // addSample/analyze busy notes. Kept separate from the `error` surface so
  // a busy click never fakes an ACQP failure token.
  const [busyNote, setBusyNote] = useState<string | null>(null)
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
    // GC-12 dirfix MINOR-FIX (defect 2): the guard is VISIBLE — the ignored
    // click renders a NAMED note (consistent with the sibling addSample/
    // analyze/handleGcCreate busy notes), never a silent swallow, and no
    // second action starts.
    if (busy) {
      setBusyNote('A register is already in progress — try again when it completes.')
      return
    }
    if (!deviceId || !directoryKey.trim()) {
      setError({
        token: 'MISSING_INPUT',
        message: 'Choose a storage device and the .D directory to register.',
      })
      return
    }
    // GC-12 fix-cycle-3 (DIRFIX-3 minor 5): the register action STARTS —
    // the chrome note line (the ONE owner) clears any stale note from a
    // prior failure, so this register's own named token renders next to
    // nothing, never next to a different failure's note (the regate2
    // defect 5 shape: the add's validation note rendered beside the
    // PACKAGE_DEVICE_MISSING token).
    onActionStart?.()
    setError(null)
    // A new register start clears any stale busy note (the note line has one
    // state at a time — the busy note belongs to THIS action's in-flight
    // window, not a prior ignored click).
    setBusyNote(null)
    setBusy(true)
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
      // GC-12 DIRFIX-M3-1 (adv cycle-2 defect 1, probe BUSY_NOTE_AFTER_SETTLE):
      // the busy note only describes the IN-FLIGHT window — it clears the
      // moment the register SETTLES (success or failure), so a FAILED
      // register renders the failure token ALONE, never beside a stale
      // "register is already in progress" claim (a fabricated state: no
      // register exists anymore). The note line keeps one state at a time:
      // cleared here on settle, and on a new register start above.
      setBusyNote(null)
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
      {/* GC-12 dirfix MINOR-FIX (defect 2): the register's OWN busy note — a
          click during an in-flight register is VISIBLE here (a named note),
          never a silent swallow. Kept distinct from the `error` surface so a
          busy click never fakes an ACQP failure token. */}
      {busyNote && (
        <span className="gc-attach__hint" data-testid={`gc-attach-busy-${entryId}`}>
          {busyNote}
        </span>
      )}
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
