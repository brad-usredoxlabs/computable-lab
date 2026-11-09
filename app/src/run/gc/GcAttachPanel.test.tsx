/**
 * GC-12 (deliverable D4) — GcAttachPanel: the NAS attach affordance + the
 * EXPLICIT failure surfaces.
 *
 * Pins: (a) the device dropdown is CONFIG DATA (GET /config storageDevices —
 * never a hardcoded path, bait #7; no path textbox); (b) a successful
 * register calls the route with the CONFIG device id + directoryKey + the
 * entry ref and reports the ACQP id; (c) EVERY AcquisitionPackageError token
 * renders its NAMED token + per-token message (bait #6: no conflation —
 * PACKAGE_DEVICE_MISSING and PACKAGE_FILE_MISSING are distinct); (d) the
 * not-configured state (no devices) renders a stated reason, never a
 * disabled button pretending; (e) mount is read-only (getConfig only —
 * registerAcquisitionPackage is click-only).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { apiClient, AcquisitionPackageClientError } from '../../shared/api/client'
import { GcAttachPanel } from './GcAttachPanel'

// The mock must export a REAL constructor under the module's original name
// (the test constructs instances to drive the failure arms); the component
// only calls the static isAcquisitionPackageError predicate. Both are
// satisfied by exporting the class under the real name + a predicate that
// recognizes instances of it.
vi.mock('../../shared/api/client', () => {
  class AcquisitionPackageClientError_ extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.name = 'AcquisitionPackageClientError'
      this.code = code
    }
    static isAcquisitionPackageError(e: unknown): boolean {
      return e instanceof AcquisitionPackageClientError_
    }
  }
  return {
    apiClient: {
      getConfig: vi.fn(),
      registerAcquisitionPackage: vi.fn(),
    },
    AcquisitionPackageClientError: AcquisitionPackageClientError_,
    ACQUISITION_PACKAGE_CLIENT_ERROR_MESSAGES: {
      PACKAGE_DEVICE_MISSING: 'The storage device is not configured (or not mounted) — the acquisition directory could not be read.',
      PACKAGE_FILE_MISSING: 'The acquisition directory has no .D file — nothing to register.',
      PACKAGE_NOT_A_FILE: 'The acquisition path is not a directory of .D data — check the directoryKey.',
      PACKAGE_PATH_ESCAPE: 'The acquisition directory escapes the storage device (a path traversal like ../ was refused).',
    },
  }
})

const ENTRY = 'ISEN-ATT-1'
// The config fixture: id + label are the ONLY fields the panel consumes
// (bait #7 — the mount path is config data the panel NEVER types/echoes).
// The mountPath values are SYNTHETIC (the fixture is not the lane's real
// config); the "no path rendered" assertion checks a path SHAPE, not a
// hardcoded NAS root (the diff must stay NAS-root-grep-0 — bait #7).
const DEVICES = [
  { id: 'gc-fid-nas', label: 'GC FID NAS (read-only)', kind: 'local-mount', mountPath: '/nas/gc-fid' },
  { id: 'vast', label: 'Lab NAS (vast)', kind: 'local-mount', default: true, mountPath: '/nas/lab-data' },
]

function mockDevices(list: unknown[]) {
  vi.mocked(apiClient.getConfig).mockResolvedValue({ storageDevices: list } as never)
}

async function typeKey(text: string) {
  fireEvent.change(screen.getByTestId(`gc-attach-key-${ENTRY}`), { target: { value: text } })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDevices(DEVICES)
  vi.mocked(apiClient.registerAcquisitionPackage).mockResolvedValue({
    packageRecordId: 'ACQP-000042',
    packagePayload: { id: 'ACQP-000042' },
    entryRecordId: ENTRY,
  } as never)
})

describe('GcAttachPanel — device dropdown is config data (bait #7)', () => {
  it('lists the config storageDevices (labels, NOT mount paths) and defaults to the default device', async () => {
    render(<GcAttachPanel entryId={ENTRY} onAttached={vi.fn()} />)
    const sel = (await screen.findByTestId(`gc-attach-device-${ENTRY}`)) as HTMLSelectElement
    // The device LABELS render — the mount paths NEVER appear as option text.
    expect(sel.options.length).toBe(2)
    const labels = Array.from(sel.options).map((o) => o.textContent)
    expect(labels).toEqual(['GC FID NAS (read-only)', 'Lab NAS (vast)'])
    // No mount path is rendered as option text (bait #7): the device id and
    // label are shown; a path (a leading '/' or the synthetic fixture roots)
    // never is.
    for (const label of labels) {
      expect(label).not.toMatch(/^\/|\/nas\//)
    }
    // Defaulted to the config's `default: true` device.
    expect(sel.value).toBe('vast')
  })
})

describe('GcAttachPanel — register (click-only; mount never registers)', () => {
  it('mount is read-only: getConfig fires, registerAcquisitionPackage does NOT', async () => {
    render(<GcAttachPanel entryId={ENTRY} onAttached={vi.fn()} />)
    await screen.findByTestId(`gc-attach-device-${ENTRY}`)
    expect(apiClient.registerAcquisitionPackage).not.toHaveBeenCalled()
    expect(apiClient.getConfig).toHaveBeenCalledTimes(1)
  })

  it('a successful register calls the route with the CONFIG id + key + entry ref and reports the ACQP id', async () => {
    const onAttached = vi.fn()
    render(<GcAttachPanel entryId={ENTRY} onAttached={onAttached} />)
    const sel = (await screen.findByTestId(`gc-attach-device-${ENTRY}`)) as HTMLSelectElement
    fireEvent.change(sel, { target: { value: 'gc-fid-nas' } })
    await typeKey('2026-10-28/RES35077-4.D')
    fireEvent.click(screen.getByTestId(`gc-attach-register-${ENTRY}`))
    await waitFor(() => expect(apiClient.registerAcquisitionPackage).toHaveBeenCalledTimes(1))
    expect(apiClient.registerAcquisitionPackage).toHaveBeenCalledWith({
      deviceId: 'gc-fid-nas',
      directoryKey: '2026-10-28/RES35077-4.D',
      entryRef: { kind: 'record', id: ENTRY, type: 'instrument-sequence-entry' },
    })
    await waitFor(() => expect(onAttached).toHaveBeenCalledWith('ACQP-000042'))
  })

  it('a missing key renders a NAMED reason (never a silent no-op, never a dead disabled button)', async () => {
    render(<GcAttachPanel entryId={ENTRY} onAttached={vi.fn()} />)
    await screen.findByTestId(`gc-attach-device-${ENTRY}`)
    fireEvent.click(screen.getByTestId(`gc-attach-register-${ENTRY}`))
    const err = await screen.findByTestId(`gc-attach-error-${ENTRY}`)
    expect(err.textContent).toContain('MISSING_INPUT')
    expect(apiClient.registerAcquisitionPackage).not.toHaveBeenCalled()
  })
})

describe('GcAttachPanel — the NAMED failure surfaces (bait #6: every token, no conflation)', () => {
  async function failWith(code: string) {
    vi.mocked(apiClient.registerAcquisitionPackage).mockRejectedValue(
      new AcquisitionPackageClientError(code, `${code}: server wording`) as never,
    )
    render(<GcAttachPanel entryId={ENTRY} onAttached={vi.fn()} />)
    const sel = (await screen.findByTestId(`gc-attach-device-${ENTRY}`)) as HTMLSelectElement
    fireEvent.change(sel, { target: { value: 'gc-fid-nas' } })
    await typeKey('X.D')
    fireEvent.click(screen.getByTestId(`gc-attach-register-${ENTRY}`))
    await screen.findByTestId(`gc-attach-error-${ENTRY}`)
  }

  it('PACKAGE_DEVICE_MISSING names the missing-device cause (distinct from a missing file)', async () => {
    await failWith('PACKAGE_DEVICE_MISSING')
    expect(screen.getByTestId(`gc-attach-error-token-${ENTRY}`)).toHaveTextContent('PACKAGE_DEVICE_MISSING')
    expect(screen.getByTestId(`gc-attach-error-${ENTRY}`).textContent).toContain('not configured (or not mounted)')
  })

  it('PACKAGE_FILE_MISSING names the empty-directory cause (NOT conflated with the device cause)', async () => {
    await failWith('PACKAGE_FILE_MISSING')
    expect(screen.getByTestId(`gc-attach-error-token-${ENTRY}`)).toHaveTextContent('PACKAGE_FILE_MISSING')
    expect(screen.getByTestId(`gc-attach-error-${ENTRY}`).textContent).toContain('no .D file')
  })

  it('PACKAGE_NOT_A_FILE names the not-a-directory cause', async () => {
    await failWith('PACKAGE_NOT_A_FILE')
    expect(screen.getByTestId(`gc-attach-error-token-${ENTRY}`)).toHaveTextContent('PACKAGE_NOT_A_FILE')
    expect(screen.getByTestId(`gc-attach-error-${ENTRY}`).textContent).toContain('not a directory of .D data')
  })

  it('PACKAGE_PATH_ESCAPE names the traversal refusal', async () => {
    await failWith('PACKAGE_PATH_ESCAPE')
    expect(screen.getByTestId(`gc-attach-error-token-${ENTRY}`)).toHaveTextContent('PACKAGE_PATH_ESCAPE')
    expect(screen.getByTestId(`gc-attach-error-${ENTRY}`).textContent).toContain('escapes the storage device')
  })

  it('the panel stays usable after a failure (the error is a surface, not a dead end)', async () => {
    await failWith('PACKAGE_DEVICE_MISSING')
    // The device select + key input + register button are still present and
    // interactable — the failure is a NAMED message, not a disabled panel.
    expect(screen.getByTestId(`gc-attach-device-${ENTRY}`)).toBeDefined()
    expect(screen.getByTestId(`gc-attach-key-${ENTRY}`)).toBeDefined()
    expect(screen.getByTestId(`gc-attach-register-${ENTRY}`)).toBeDefined()
  })
})

describe('GcAttachPanel — the not-configured arm (dead-chrome clause)', () => {
  it('no devices renders a stated reason (never a disabled Attach pretending)', async () => {
    mockDevices([])
    render(<GcAttachPanel entryId={ENTRY} onAttached={vi.fn()} />)
    expect(await screen.findByTestId(`gc-attach-notconfigured-${ENTRY}`)).toHaveTextContent(/No storage devices are configured/)
    // No device dropdown, no register button — the capability is honestly absent.
    expect(screen.queryByTestId(`gc-attach-device-${ENTRY}`)).toBeNull()
    expect(screen.queryByTestId(`gc-attach-register-${ENTRY}`)).toBeNull()
  })
})

/**
 * GC-12 fix-cycle-1 (O1) — the getConfig FAILURE arm. Any config fetch
 * failure (transport/4xx/5xx) used to fall through to the "No storage
 * devices are configured…" empty-state reason — a lie that reported a
 * transport failure as a missing config entry. Precedent
 * (OwnershipPolicySection's loadError arm): a fetch failure renders a NAMED
 * error row instead.
 */
describe('GcAttachPanel — the getConfig failure arm (fix-cycle-1 O1: error row, never the empty-state lie)', () => {
  it('a config fetch FAILURE renders a NAMED error row — never "No storage devices are configured"', async () => {
    vi.mocked(apiClient.getConfig).mockRejectedValue(new Error('500: internal server error'))
    render(<GcAttachPanel entryId={ENTRY} onAttached={vi.fn()} />)
    // The error row names the real cause (the config fetch failed)…
    const err = await screen.findByTestId(`gc-attach-configerror-${ENTRY}`)
    expect(err.textContent).toContain('500: internal server error')
    // …and the empty-state LIE does not render (the scientist is not told a
    // config entry is missing when the real cause was a failed fetch).
    expect(screen.queryByTestId(`gc-attach-notconfigured-${ENTRY}`)).toBeNull()
    expect(screen.queryByText(/No storage devices are configured/)).toBeNull()
    // No device dropdown / register button — the capability is honestly
    // absent until the config loads.
    expect(screen.queryByTestId(`gc-attach-device-${ENTRY}`)).toBeNull()
    expect(screen.queryByTestId(`gc-attach-register-${ENTRY}`)).toBeNull()
  })

  it('a resolved empty config still renders the not-configured reason (failure and empty remain distinct states)', async () => {
    // Guards the O1 fix from over-correcting: an EMPTY (but successful)
    // config is the genuine not-configured state — the error row must not
    // fire there.
    mockDevices([])
    render(<GcAttachPanel entryId={ENTRY} onAttached={vi.fn()} />)
    expect(await screen.findByTestId(`gc-attach-notconfigured-${ENTRY}`)).toBeDefined()
    expect(screen.queryByTestId(`gc-attach-configerror-${ENTRY}`)).toBeNull()
  })
})

/**
 * GC-12 dirfix MINOR-FIX (defect 2) — the THIRD chrome action's busy no-op.
 * The chrome addSample/analyze and the collection's handleGcCreate render a
 * NAMED note on an ignored busy click; the attach-panel register's
 * `if (busy) return` was still a SILENT swallow (the only feedback was the
 * button label flipping to "Registering…" — not disabled, no reason).
 */
describe('GcAttachPanel — GC-12 dirfix MINOR-FIX (defect 2): the register busy no-op is visible', () => {
  it('a Register click while a register is IN FLIGHT is VISIBLE (a named note) — never a silent no-op', async () => {
    // The first register never resolves (the browser-gate phase-3 shape:
    // the >12 s write with the ignored follow-up click).
    vi.mocked(apiClient.registerAcquisitionPackage).mockReturnValue(new Promise(() => {}) as never)
    render(<GcAttachPanel entryId={ENTRY} onAttached={vi.fn()} />)
    const sel = (await screen.findByTestId(`gc-attach-device-${ENTRY}`)) as HTMLSelectElement
    fireEvent.change(sel, { target: { value: 'gc-fid-nas' } })
    await typeKey('2026-10-28/RES35077-4.D')
    fireEvent.click(screen.getByTestId(`gc-attach-register-${ENTRY}`)) // first register starts (in flight)
    await waitFor(() => expect(apiClient.registerAcquisitionPackage).toHaveBeenCalledTimes(1))
    // The follow-up click: the old `if (busy) return` swallowed it silently.
    // Now it renders a NAMED note on the ignored click (consistent with the
    // sibling addSample/analyze busy notes).
    fireEvent.click(screen.getByTestId(`gc-attach-register-${ENTRY}`))
    expect(await screen.findByTestId(`gc-attach-busy-${ENTRY}`)).toHaveTextContent(/already in progress/i)
    // AND no second register was started.
    expect(apiClient.registerAcquisitionPackage).toHaveBeenCalledTimes(1)
  })

  it('the busy note CLEARS when the register SETTLES (failure): the failure token renders alone (adv cycle-2 defect 1, probe BUSY_NOTE_AFTER_SETTLE)', async () => {
    // The reviewer probe shape: a click DURING an in-flight register shows
    // the busy note; when THAT register then REJECTS, the note must clear
    // (it described a register that no longer exists) and the failure
    // token renders alone. Pre-fix the note was only cleared when a NEW
    // register started, so after a FAILED register the panel kept saying
    // "A register is already in progress" beside the failure token — a
    // fabricated state claim.
    let rejectRegister!: (e: unknown) => void
    vi.mocked(apiClient.registerAcquisitionPackage).mockReturnValue(
      new Promise((_, rej) => {
        rejectRegister = rej
      }) as never,
    )
    render(<GcAttachPanel entryId={ENTRY} onAttached={vi.fn()} />)
    const sel = (await screen.findByTestId(`gc-attach-device-${ENTRY}`)) as HTMLSelectElement
    fireEvent.change(sel, { target: { value: 'gc-fid-nas' } })
    await typeKey('2026-10-28/RES35077-4.D')
    fireEvent.click(screen.getByTestId(`gc-attach-register-${ENTRY}`)) // first register starts (in flight)
    await waitFor(() => expect(apiClient.registerAcquisitionPackage).toHaveBeenCalledTimes(1))
    // The in-flight window: the busy note is live…
    fireEvent.click(screen.getByTestId(`gc-attach-register-${ENTRY}`))
    expect(await screen.findByTestId(`gc-attach-busy-${ENTRY}`)).toHaveTextContent(/already in progress/i)
    // …and when the register SETTLES with a failure the note is GONE — the
    // failure token (a non-ACQP rejection → the UNKNOWN token) renders
    // alone, and the button label returns (busy === false).
    rejectRegister(new Error('boom'))
    const err = await screen.findByTestId(`gc-attach-error-${ENTRY}`)
    expect(screen.queryByTestId(`gc-attach-busy-${ENTRY}`)).toBeNull()
    expect(err.textContent).toContain('ACQUISITION_PACKAGE_UNKNOWN')
    expect(err.textContent).toContain('boom')
    expect(screen.getByTestId(`gc-attach-register-${ENTRY}`).textContent).toBe('Register .D')
  })
})
