import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  apiClient,
  type MeasurementContextRecord,
  type WellGroupRecord,
  type WellRoleAssignmentRecord,
} from '../../shared/api/client'
import { parseBiologyNotes } from '../lib/biologyMetadata'
import { buildBiologyContextTags, isBiologyContext } from '../lib/readoutMetadata'

function toWellKey(subjectId: string): { labwareId: string; wellId: string } | null {
  const parts = subjectId.split('#')
  if (parts.length !== 2) return null
  const [labwareId, wellId] = parts
  if (!labwareId || !wellId) return null
  return { labwareId, wellId }
}

const ROLE_COLORS: Record<string, string> = {
  positive_control: '#d9480f',
  negative_control: '#1971c2',
  vehicle_control: '#e67700',
  blank: '#adb5bd',
  no_template_control: '#5f3dc4',
  housekeeping_control: '#2b8a3e',
  reference: '#7048e8',
  sample: '#2f9e44',
  unknown_sample: '#1c7ed6',
  standard: '#9c36b5',
  standard_curve: '#ae3ec9',
  internal_standard: '#0b7285',
  external_standard: '#099268',
  qc_sample: '#c2255c',
  calibrator: '#7c2d12',
}

export interface BiologyOverlayEntry {
  wellId: string
  color: string
  label: string
}

export interface BiologyAssignmentSummary {
  roleType: string
  label: string
  expectedBehavior?: string
  biologicalIntent?: string
}

export interface UseBiologyModeResult {
  activeContext: MeasurementContextRecord | null
  assignments: WellRoleAssignmentRecord[]
  allAssignments: WellRoleAssignmentRecord[]
  assignmentsByContext: Record<string, WellRoleAssignmentRecord[]>
  assignmentsByWell: Record<string, BiologyAssignmentSummary[]>
  assignmentCounts: Record<string, Record<string, number>>
  totalAssignmentCount: number
  wellGroups: WellGroupRecord[]
  loading: boolean
  creatingContext: boolean
  error: string | null
  refresh: () => Promise<void>
  leftOverlayEntries: BiologyOverlayEntry[]
  rightOverlayEntries: BiologyOverlayEntry[]
}

export function useBiologyMode(args: {
  sourceLabwareId?: string
  targetLabwareId?: string
}): UseBiologyModeResult {
  const { sourceLabwareId, targetLabwareId } = args
  const [contexts, setContexts] = useState<MeasurementContextRecord[]>([])
  const [wellGroups, setWellGroups] = useState<WellGroupRecord[]>([])
  const [assignmentsByContext, setAssignmentsByContext] = useState<Record<string, WellRoleAssignmentRecord[]>>({})
  const [loading, setLoading] = useState(false)
  const [creatingContext, setCreatingContext] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const creatingContextRef = useRef(false)

  const refresh = useCallback(async () => {
    if (!sourceLabwareId) {
      setContexts([])
      setWellGroups([])
      setAssignmentsByContext({})
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [contextResponse, wellGroupResponse] = await Promise.all([
        apiClient.listMeasurementContexts(sourceLabwareId),
        apiClient.listWellGroups(sourceLabwareId),
      ])
      let nextContexts = contextResponse.items
      let biologyContext = nextContexts.find((context) => isBiologyContext(context)) || null

      if (!biologyContext && !creatingContextRef.current) {
        creatingContextRef.current = true
        setCreatingContext(true)
        try {
          await apiClient.createMeasurementContext({
            name: `Biology Layer · ${sourceLabwareId}`,
            sourceRef: { kind: 'record', id: sourceLabwareId, type: 'labware', label: `Plate ${sourceLabwareId}` },
            instrumentRef: {
              kind: 'record',
              id: 'INSTDEF-GENERIC-PLATE_READER',
              type: 'instrument-definition',
              label: 'Generic Plate Reader',
            },
            readoutDefRefs: [{
              kind: 'record',
              id: 'RDEF-PLATE-FAR_RED-ROS',
              type: 'readout-definition',
              label: 'Far-Red Fluorescence',
            }],
            notes: 'Auto-managed biology layer for biological role assignment.',
            tags: buildBiologyContextTags(),
          })
          const refreshedContexts = await apiClient.listMeasurementContexts(sourceLabwareId)
          nextContexts = refreshedContexts.items
          biologyContext = nextContexts.find((context) => isBiologyContext(context)) || null
        } finally {
          creatingContextRef.current = false
          setCreatingContext(false)
        }
      }

      setContexts(nextContexts)
      setWellGroups(wellGroupResponse.items)

      const assignmentResponses = await Promise.all(
        nextContexts.map(async (context) => ({
          contextId: context.id,
          response: await apiClient.listWellRoleAssignments(context.id),
        })),
      )
      setAssignmentsByContext(
        assignmentResponses.reduce<Record<string, WellRoleAssignmentRecord[]>>((acc, item) => {
          acc[item.contextId] = item.response.items
          return acc
        }, {}),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load biology state')
    } finally {
      setLoading(false)
    }
  }, [sourceLabwareId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const activeContext = useMemo(
    () => contexts.find((context) => isBiologyContext(context)) || contexts[0] || null,
    [contexts],
  )

  const allAssignments = useMemo(
    () => Object.values(assignmentsByContext).flat(),
    [assignmentsByContext],
  )

  const assignments = useMemo(
    () => (activeContext ? (assignmentsByContext[activeContext.id] || []) : []),
    [activeContext, assignmentsByContext],
  )

  const assignmentCounts = useMemo(
    () => Object.fromEntries(
      Object.entries(assignmentsByContext).map(([contextId, contextAssignments]) => [
        contextId,
        contextAssignments.reduce<Record<string, number>>((acc, assignment) => {
          acc[assignment.role_type] = (acc[assignment.role_type] || 0) + assignment.subject_refs.length
          return acc
        }, {}),
      ]),
    ),
    [assignmentsByContext],
  )

  const assignmentsByWell = useMemo(() => {
    const entries: Record<string, BiologyAssignmentSummary[]> = {}
    for (const assignment of allAssignments) {
      const parsedNotes = parseBiologyNotes(assignment.notes)
      for (const subject of assignment.subject_refs || []) {
        const key = subject.id
        entries[key] = entries[key] || []
        const summary: BiologyAssignmentSummary = {
          roleType: assignment.role_type,
          label: assignment.role_type.replace(/_/g, ' '),
          ...(assignment.expected_behavior ? { expectedBehavior: assignment.expected_behavior } : {}),
          ...(parsedNotes.biologicalIntent ? { biologicalIntent: parsedNotes.biologicalIntent } : {}),
        }
        if (!entries[key].some((item) =>
          item.roleType === summary.roleType
          && item.expectedBehavior === summary.expectedBehavior
          && item.biologicalIntent === summary.biologicalIntent,
        )) {
          entries[key].push(summary)
        }
      }
    }
    return entries
  }, [allAssignments])

  const buildOverlayEntries = (labwareId: string | undefined): BiologyOverlayEntry[] => {
    if (!labwareId) return []
    const deduped = new Map<string, BiologyOverlayEntry>()
    for (const assignment of allAssignments) {
      for (const subject of assignment.subject_refs || []) {
        const parsed = toWellKey(subject.id)
        if (!parsed || parsed.labwareId !== labwareId) continue
        const key = `${parsed.wellId}:${assignment.role_type}`
        if (deduped.has(key)) continue
        deduped.set(key, {
          wellId: parsed.wellId,
          color: ROLE_COLORS[assignment.role_type] || '#fab005',
          label: assignment.role_type.replace(/_/g, ' '),
        })
      }
    }
    return Array.from(deduped.values())
  }

  return {
    activeContext,
    assignments,
    allAssignments,
    assignmentsByContext,
    assignmentsByWell,
    assignmentCounts,
    totalAssignmentCount: allAssignments.reduce((sum, assignment) => sum + assignment.subject_refs.length, 0),
    wellGroups,
    loading,
    creatingContext,
    error,
    refresh,
    leftOverlayEntries: buildOverlayEntries(sourceLabwareId),
    rightOverlayEntries: buildOverlayEntries(targetLabwareId),
  }
}
