import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/**
 * SelectionContext — cross-endpoint source / target selections.
 *
 * Each appliance endpoint can publish what its user currently has selected as
 * a "source" or "target", and consumers (notably the shared slash menu's
 * `/s` and `/t` lookups) can read it without knowing which endpoint produced
 * it. This is the registration API the appliance plan calls for: any endpoint
 * publishes; nothing else cares where the selection came from.
 *
 * Selection payloads are a discriminated union so each endpoint can publish
 * its native shape — wells on a labware in the event-editor today; record
 * refs from /browser and candidate refs from /protocols once those land.
 *
 * Distinct from `WellSelectionContext`, which is the per-plate widget's
 * internal click-and-drag state. That context is the input to the event-
 * editor's publisher into this one, not a replacement.
 */

/** A set of wells on a single labware, e.g. event-editor's source/target pane. */
export interface WellsSelection {
  kind: 'wells'
  labwareId: string
  wells: string[]
  label?: string
}

/** A set of records — e.g. /browser row selection, /protocols candidate picks. */
export interface RecordsSelection {
  kind: 'records'
  refs: Array<{ recordId: string; kind?: string; label?: string }>
  label?: string
}

export type SelectionPayload = WellsSelection | RecordsSelection

export interface SelectionContextValue {
  source: SelectionPayload | null
  target: SelectionPayload | null
  setSource: (payload: SelectionPayload | null) => void
  setTarget: (payload: SelectionPayload | null) => void
  clear: () => void
}

const SelectionContext = createContext<SelectionContextValue | null>(null)

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [source, setSource] = useState<SelectionPayload | null>(null)
  const [target, setTarget] = useState<SelectionPayload | null>(null)

  const clear = useCallback(() => {
    setSource(null)
    setTarget(null)
  }, [])

  const value = useMemo<SelectionContextValue>(
    () => ({ source, target, setSource, setTarget, clear }),
    [source, target, clear],
  )

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>
}

/**
 * Read the cross-endpoint selection. Returns `null` if no `SelectionProvider`
 * is mounted — callers in legacy surfaces that pre-date the AppShell can
 * treat that as "no selection" rather than crashing.
 */
export function useSelection(): SelectionContextValue | null {
  return useContext(SelectionContext)
}

/**
 * Same as `useSelection` but throws if no provider is mounted. Use this in
 * components that genuinely depend on the publisher being there (e.g. the
 * LabwareEditorContext publisher hook).
 */
export function useRequiredSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext)
  if (!ctx) {
    throw new Error('useRequiredSelection must be used inside <SelectionProvider>')
  }
  return ctx
}
