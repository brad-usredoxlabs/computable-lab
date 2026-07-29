/**
 * Integration tests for Protocol Execution Redesign
 * 
 * Tests the complete workflow:
 * 1. AI agent receives execution context and drafts events with insert_at
 * 2. LabwareEditorContext handles INSERT_EVENT_AT correctly
 * 3. Deviation reporting updates existing events inline
 * 4. Execution state is properly tracked and displayed
 */

import { describe, it, expect } from 'vitest'
import { editorReducer, type LabwareEditorState } from '../context/LabwareEditorContext'
import type { PlateEvent, DeviationData } from '../../types/events'

describe('Protocol Execution Redesign - Integration Tests', () => {
  
  // Helper to create initial state
  const createInitialState = (): LabwareEditorState => ({
    labwares: new Map(),
    activeLabwareId: null,
    selections: new Map(),
    labwarePoses: new Map(),
    events: [],
    selectedEventId: null,
    editingEventId: null,
    isDirty: false,
    sourceLabwareId: null,
    targetLabwareId: null,
  })

  describe('INSERT_EVENT_AT action', () => {
    it('should insert an event at the specified index', () => {
      const state = createInitialState()
      
      // Add initial events
      const event1: PlateEvent = {
        eventId: 'EVT-001',
        event_type: 'add_material',
        details: { labwareId: 'plate-1', wells: ['A1'] },
      }
      const event2: PlateEvent = {
        eventId: 'EVT-002',
        event_type: 'transfer',
        details: { labwareId: 'plate-1', wells: ['A2'] },
      }
      
      const stateWithEvents = editorReducer(state, {
        type: 'ADD_EVENT',
        event: event1,
      })
      
      const stateWithTwoEvents = editorReducer(stateWithEvents, {
        type: 'ADD_EVENT',
        event: event2,
      })
      
      // Insert a new event at index 1
      const insertEvent: PlateEvent = {
        eventId: 'EVT-001-5',
        event_type: 'mix',
        details: { labwareId: 'plate-1', wells: ['A1'] },
      }
      
      const newState = editorReducer(stateWithTwoEvents, {
        type: 'INSERT_EVENT_AT',
        event: insertEvent,
        index: 1,
      })
      
      expect(newState.events).toHaveLength(3)
      expect(newState.events[0].eventId).toBe('EVT-001')
      expect(newState.events[1].eventId).toBe('EVT-001-5')
      expect(newState.events[2].eventId).toBe('EVT-002')
      expect(newState.isDirty).toBe(true)
    })

    it('should insert at the beginning (index 0)', () => {
      const state = createInitialState()
      const event1: PlateEvent = {
        eventId: 'EVT-001',
        event_type: 'add_material',
        details: { labwareId: 'plate-1', wells: ['A1'] },
      }
      
      const stateWithEvent = editorReducer(state, {
        type: 'ADD_EVENT',
        event: event1,
      })
      
      const insertEvent: PlateEvent = {
        eventId: 'EVT-000',
        event_type: 'incubate',
        details: { labwareId: 'plate-1', wells: ['A1'] },
      }
      
      const newState = editorReducer(stateWithEvent, {
        type: 'INSERT_EVENT_AT',
        event: insertEvent,
        index: 0,
      })
      
      expect(newState.events[0].eventId).toBe('EVT-000')
      expect(newState.events[1].eventId).toBe('EVT-001')
    })

    it('should insert at the end when index equals length', () => {
      const state = createInitialState()
      const event1: PlateEvent = {
        eventId: 'EVT-001',
        event_type: 'add_material',
        details: { labwareId: 'plate-1', wells: ['A1'] },
      }
      
      const stateWithEvent = editorReducer(state, {
        type: 'ADD_EVENT',
        event: event1,
      })
      
      const insertEvent: PlateEvent = {
        eventId: 'EVT-002',
        event_type: 'transfer',
        details: { labwareId: 'plate-1', wells: ['A2'] },
      }
      
      const newState = editorReducer(stateWithEvent, {
        type: 'INSERT_EVENT_AT',
        event: insertEvent,
        index: 1,
      })
      
      expect(newState.events[0].eventId).toBe('EVT-001')
      expect(newState.events[1].eventId).toBe('EVT-002')
    })
  })

  describe('UPDATE_EVENT_DEVIATION action', () => {
    it('should add a deviation to an existing event', () => {
      const state = createInitialState()
      
      const eventWithExecutionState: PlateEvent = {
        eventId: 'EVT-001',
        event_type: 'incubate',
        details: { labwareId: 'plate-1', wells: ['A1'], duration: 'PT30M' },
        executionState: {
          state: 'completed',
          startedAt: '2026-07-29T10:00:00Z',
          completedAt: '2026-07-29T10:35:00Z',
        },
      }
      
      const stateWithEvent = editorReducer(state, {
        type: 'ADD_EVENT',
        event: eventWithExecutionState,
      })
      
      const deviation: DeviationData = {
        eventId: 'EVT-001',
        code: 'timing_deviation',
        message: 'Incubation took 35 min instead of 30 min',
        severity: 'warning',
        reportedBy: 'operator-jane',
        reportedAt: '2026-07-29T10:35:00Z',
        expectedValue: 'PT30M',
        actualValue: 'PT35M',
        deviationType: 'operator',
        field: 'duration',
        originalValue: 'PT30M',
        newValue: 'PT35M',
        reason: 'Incubation took 35 min instead of 30 min',
        recordedBy: 'operator-jane',
        recordedAt: '2026-07-29T10:35:00Z',
      }
      
      const newState = editorReducer(stateWithEvent, {
        type: 'UPDATE_EVENT_DEVIATION',
        eventId: 'EVT-001',
        deviation,
      })
      
      const updatedEvent = newState.events.find((e: PlateEvent) => e.eventId === 'EVT-001')
      expect(updatedEvent).toBeDefined()
      expect(updatedEvent?.deviations).toHaveLength(1)
      expect(updatedEvent?.deviations?.[0].code).toBe('timing_deviation')
      expect(updatedEvent?.deviations?.[0].message).toBe('Incubation took 35 min instead of 30 min')
      expect(updatedEvent?.executionState?.state).toBe('deviated')
      expect(updatedEvent?.executionState?.deviationNote).toBe('Incubation took 35 min instead of 30 min')
      expect(newState.isDirty).toBe(true)
    })

    it('should add multiple deviations to the same event', () => {
      const state = createInitialState()
      
      const event: PlateEvent = {
        eventId: 'EVT-001',
        event_type: 'transfer',
        details: { labwareId: 'plate-1', wells: ['A1'] },
        executionState: {
          state: 'completed',
        },
      }
      
      const stateWithEvent = editorReducer(state, {
        type: 'ADD_EVENT',
        event: event,
      })
      
      const deviation1: DeviationData = {
        eventId: 'EVT-001',
        code: 'timing_deviation',
        message: 'Took longer than expected',
        severity: 'warning',
        reportedBy: 'operator-jane',
        reportedAt: '2026-07-29T10:05:00Z',
        expectedValue: 'PT5M',
        actualValue: 'PT8M',
        deviationType: 'timing',
        field: 'duration',
        originalValue: 'PT5M',
        newValue: 'PT8M',
        reason: 'Took longer than expected',
        recordedBy: 'operator-jane',
        recordedAt: '2026-07-29T10:05:00Z',
      }
      
      const deviation2: DeviationData = {
        eventId: 'EVT-001',
        code: 'volume_deviation',
        message: 'Used slightly less volume',
        severity: 'info',
        reportedBy: 'operator-jane',
        reportedAt: '2026-07-29T10:05:30Z',
        expectedValue: '100uL',
        actualValue: '95uL',
        deviationType: 'volume',
        field: 'volume',
        originalValue: '100uL',
        newValue: '95uL',
        reason: 'Used slightly less volume',
        recordedBy: 'operator-jane',
        recordedAt: '2026-07-29T10:05:30Z',
      }
      
      let newState = editorReducer(stateWithEvent, {
        type: 'UPDATE_EVENT_DEVIATION',
        eventId: 'EVT-001',
        deviation: deviation1,
      })
      
      newState = editorReducer(newState, {
        type: 'UPDATE_EVENT_DEVIATION',
        eventId: 'EVT-001',
        deviation: deviation2,
      })
      
      const updatedEvent = newState.events.find((e: PlateEvent) => e.eventId === 'EVT-001')
      expect(updatedEvent?.deviations).toHaveLength(2)
      expect(updatedEvent?.deviations?.[0].code).toBe('timing_deviation')
      expect(updatedEvent?.deviations?.[1].code).toBe('volume_deviation')
    })

    it('should not modify events that do not exist', () => {
      const state = createInitialState()
      
      const deviation: DeviationData = {
        eventId: 'EVT-NONEXISTENT',
        code: 'other',
        message: 'Some deviation',
        severity: 'info',
        reportedBy: 'system',
        reportedAt: '2026-07-29T10:00:00Z',
        deviationType: 'operator',
        field: 'other',
        originalValue: null,
        newValue: null,
        reason: 'Some deviation',
        recordedBy: 'system',
        recordedAt: '2026-07-29T10:00:00Z',
      }
      
      const newState = editorReducer(state, {
        type: 'UPDATE_EVENT_DEVIATION',
        eventId: 'EVT-NONEXISTENT',
        deviation,
      })
      
      expect(newState.events).toHaveLength(0)
      expect(newState.isDirty).toBe(false)
    })
  })

  describe('Complete workflow: Insert event and report deviation', () => {
    it('should handle a realistic execution scenario', () => {
      let state = createInitialState()
      
      // Step 1: Add initial events
      const events: PlateEvent[] = [
        {
          eventId: 'EVT-001',
          event_type: 'add_material',
          details: { labwareId: 'plate-1', wells: ['A1', 'A2'] },
        },
        {
          eventId: 'EVT-002',
          event_type: 'incubate',
          details: { labwareId: 'plate-1', wells: ['A1', 'A2'], duration: 'PT30M' },
          executionState: { state: 'pending' },
        },
        {
          eventId: 'EVT-003',
          event_type: 'transfer',
          details: { labwareId: 'plate-1', source_wells: ['A1'], dest_wells: ['B1'] },
        },
      ]
      
      for (const event of events) {
        state = editorReducer(state, { type: 'ADD_EVENT', event })
      }
      
      // Step 2: User reports that incubation took longer than expected
      const deviation: DeviationData = {
        eventId: 'EVT-002',
        code: 'timing_deviation',
        message: 'Incubation took 35 min instead of 30 min due to door opening',
        severity: 'warning',
        reportedBy: 'operator-jane',
        reportedAt: '2026-07-29T10:35:00Z',
        expectedValue: 'PT30M',
        actualValue: 'PT35M',
        deviationType: 'operator',
        field: 'duration',
        originalValue: 'PT30M',
        newValue: 'PT35M',
        reason: 'Incubation took 35 min instead of 30 min due to door opening',
        recordedBy: 'operator-jane',
        recordedAt: '2026-07-29T10:35:00Z',
      }
      
      state = editorReducer(state, {
        type: 'UPDATE_EVENT_DEVIATION',
        eventId: 'EVT-002',
        deviation,
      })
      
      // Step 3: User wants to insert a mix step before the transfer
      const mixEvent: PlateEvent = {
        eventId: 'EVT-002-5',
        event_type: 'mix',
        details: { labwareId: 'plate-1', wells: ['A1', 'A2'], mix_count: 3 },
      }
      
      state = editorReducer(state, {
        type: 'INSERT_EVENT_AT',
        event: mixEvent,
        index: 2, // Insert before EVT-003
      })
      
      // Verify the final state
      expect(state.events).toHaveLength(4)
      expect(state.events[0].eventId).toBe('EVT-001')
      expect(state.events[1].eventId).toBe('EVT-002')
      expect(state.events[2].eventId).toBe('EVT-002-5') // Inserted mix
      expect(state.events[3].eventId).toBe('EVT-003')
      
      // Verify deviation was recorded
      const incubateEvent = state.events.find((e: PlateEvent) => e.eventId === 'EVT-002')
      expect(incubateEvent?.deviations).toHaveLength(1)
      expect(incubateEvent?.deviations?.[0].code).toBe('timing_deviation')
      expect(incubateEvent?.executionState?.state).toBe('deviated')
      
      // Verify isDirty is true
      expect(state.isDirty).toBe(true)
    })
  })
})
