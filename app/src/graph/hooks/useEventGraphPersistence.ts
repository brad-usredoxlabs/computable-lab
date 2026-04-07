/**
 * useEventGraphPersistence - Persistence for event graphs.
 * 
 * Features:
 * - Save to kernel API
 * - Load from kernel API
 * - Auto-save to localStorage as draft
 * - Dirty state tracking
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import type { PlateEvent } from '../../types/events'
import type { Labware } from '../../types/labware'
import { apiClient } from '../../shared/api/client'
import { normalizeEventGraphEventsForSave } from '../../editor/lib/serialDilutionPlan'

const LOCAL_STORAGE_KEY = 'semantic-eln-event-graph-draft'
const AUTO_SAVE_DELAY_MS = 5000

export interface EventGraphData {
  id: string | null
  name: string
  events: PlateEvent[]
  labwares: Labware[]
  runId?: string
}

export interface PersistenceState {
  /** Whether the data has changed since last save */
  isDirty: boolean
  /** Whether a save operation is in progress */
  isSaving: boolean
  /** Whether a load operation is in progress */
  isLoading: boolean
  /** Last save timestamp */
  lastSaved: Date | null
  /** Error from last operation */
  error: string | null
  /** Current event graph ID (null if new/unsaved) */
  eventGraphId: string | null
  /** Event graph name */
  name: string
}

export interface PersistenceActions {
  /** Save the current state to the kernel */
  save: () => Promise<string | null>
  /** Load an event graph by ID */
  load: (eventGraphId: string) => Promise<boolean>
  /** Create a new empty event graph */
  createNew: () => void
  /** Mark state as dirty */
  markDirty: () => void
  /** Update the name */
  setName: (name: string) => void
  /** Save draft to localStorage */
  saveDraft: () => void
  /** Load draft from localStorage */
  loadDraft: () => EventGraphData | null
  /** Clear draft from localStorage */
  clearDraft: () => void
}

interface UseEventGraphPersistenceOptions {
  /** Current events */
  events: PlateEvent[]
  /** Current labwares */
  labwares: Map<string, Labware>
  /** Callback when state is loaded */
  onLoad?: (data: EventGraphData) => void
  /** Enable auto-save to localStorage */
  autoSaveDraft?: boolean
  /** Run ID to associate with the event graph */
  runId?: string
}

/**
 * Hook for event graph persistence.
 */
export function useEventGraphPersistence({
  events,
  labwares,
  onLoad,
  autoSaveDraft = true,
  runId,
}: UseEventGraphPersistenceOptions): [PersistenceState, PersistenceActions] {
  const [state, setState] = useState<PersistenceState>({
    isDirty: false,
    isSaving: false,
    isLoading: false,
    lastSaved: null,
    error: null,
    eventGraphId: null,
    name: 'Untitled Event Graph',
  })

  // Auto-save timer ref
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Convert labwares Map to array for serialization
  const labwaresArray = Array.from(labwares.values())

  // Save to kernel API
  const save = useCallback(async (): Promise<string | null> => {
    setState(s => ({ ...s, isSaving: true, error: null }))

    try {
      const response = await apiClient.saveEventGraph(state.eventGraphId, {
        events: normalizeEventGraphEventsForSave(events),
        labwares: labwaresArray,
        runId,
        name: state.name,
      })

      // Response contains record, validation, lint
      const newId = response.record?.recordId || state.eventGraphId
      
      // Check for validation errors
      if (response.validation && !response.validation.valid) {
        const errorMessages = response.validation.errors
          .map(e => e.message)
          .join('; ')
        setState(s => ({
          ...s,
          isSaving: false,
          error: `Validation errors: ${errorMessages}`,
        }))
        return null
      }

      setState(s => ({
        ...s,
        isSaving: false,
        isDirty: false,
        lastSaved: new Date(),
        eventGraphId: newId,
        error: null,
      }))
      // Clear draft after successful save
      clearDraft()
      return newId
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setState(s => ({
        ...s,
        isSaving: false,
        error: message,
      }))
      return null
    }
  }, [events, labwaresArray, runId, state.eventGraphId, state.name])

  // Load from kernel API
  const load = useCallback(async (eventGraphId: string): Promise<boolean> => {
    setState(s => ({ ...s, isLoading: true, error: null }))

    try {
      const data = await apiClient.loadEventGraph(eventGraphId)
      
      const loadedData: EventGraphData = {
        id: eventGraphId,
        name: data.name || 'Untitled Event Graph',
        events: normalizeEventGraphEventsForSave(data.events as PlateEvent[]),
        labwares: data.labwares as Labware[],
        runId: data.runId,
      }

      setState(s => ({
        ...s,
        isLoading: false,
        isDirty: false,
        eventGraphId,
        name: loadedData.name,
        error: null,
      }))

      onLoad?.(loadedData)
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setState(s => ({
        ...s,
        isLoading: false,
        error: message,
      }))
      return false
    }
  }, [onLoad])

  // Create new event graph
  const createNew = useCallback(() => {
    setState({
      isDirty: false,
      isSaving: false,
      isLoading: false,
      lastSaved: null,
      error: null,
      eventGraphId: null,
      name: 'Untitled Event Graph',
    })
    clearDraft()
  }, [])

  // Mark as dirty
  const markDirty = useCallback(() => {
    setState(s => ({ ...s, isDirty: true }))
  }, [])

  // Set name
  const setName = useCallback((name: string) => {
    setState(s => ({ ...s, name, isDirty: true }))
  }, [])

  // Save draft to localStorage
  const saveDraft = useCallback(() => {
    try {
      const draft: EventGraphData = {
        id: state.eventGraphId,
        name: state.name,
        events: normalizeEventGraphEventsForSave(events),
        labwares: labwaresArray,
        runId,
      }
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(draft))
    } catch {
      // Ignore localStorage errors (e.g., quota exceeded)
    }
  }, [events, labwaresArray, runId, state.eventGraphId, state.name])

  // Load draft from localStorage
  const loadDraft = useCallback((): EventGraphData | null => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as EventGraphData
        return {
          ...parsed,
          events: normalizeEventGraphEventsForSave(parsed.events || []),
        }
      }
    } catch {
      // Ignore parse errors
    }
    return null
  }, [])

  // Clear draft
  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY)
    } catch {
      // Ignore
    }
  }, [])

  // Auto-save to localStorage when dirty
  useEffect(() => {
    if (!autoSaveDraft || !state.isDirty) return

    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }

    // Set new timer
    autoSaveTimerRef.current = setTimeout(() => {
      saveDraft()
    }, AUTO_SAVE_DELAY_MS)

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [autoSaveDraft, state.isDirty, saveDraft])

  // Save draft immediately on unmount if dirty
  useEffect(() => {
    return () => {
      if (state.isDirty && autoSaveDraft) {
        saveDraft()
      }
    }
  }, [state.isDirty, autoSaveDraft, saveDraft])

  const actions: PersistenceActions = {
    save,
    load,
    createNew,
    markDirty,
    setName,
    saveDraft,
    loadDraft,
    clearDraft,
  }

  return [state, actions]
}

/**
 * Format last saved time for display.
 */
export function formatLastSaved(date: Date | null): string {
  if (!date) return 'Never saved'
  
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)

  if (diffSec < 10) return 'Just now'
  if (diffSec < 60) return `${diffSec}s ago`
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  return date.toLocaleDateString()
}
