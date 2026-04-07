/**
 * BrowserContext — State management for the file browser.
 * 
 * Provides:
 * - Study tree data and loading state
 * - Selected node tracking
 * - Inbox records
 * - Run context for linking new records
 */

import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react'
import type {
  StudyTreeNode,
  IndexEntry,
  SelectedNode,
  RunContext,
} from '../../types/tree'
import {
  getStudyTree,
  getInbox,
  getRecordsForRun,
  fileRecord,
  rebuildIndex,
} from '../api/treeClient'

/**
 * Context state interface.
 */
export interface BrowserState {
  /** Study hierarchy tree */
  studies: StudyTreeNode[]
  /** Currently selected node */
  selectedNode: SelectedNode
  /** Currently selected record ID for preview */
  selectedRecordId: string | null
  /** Inbox records (unfiled) */
  inboxRecords: IndexEntry[]
  /** Records for the selected run */
  runRecords: IndexEntry[]
  /** Current run context for linking new records */
  runContext: RunContext | null
  /** Loading state */
  isLoading: boolean
  /** Error message */
  error: string | null
  /** Expanded node IDs (for tree state) */
  expandedNodes: Set<string>
}

/**
 * Context actions interface.
 */
export interface BrowserActions {
  /** Select a node in the tree */
  selectNode: (node: SelectedNode) => void
  /** Select a record for preview */
  setSelectedRecordId: (recordId: string | null) => void
  /** Refresh the tree data */
  refresh: () => Promise<void>
  /** File a record from inbox into a run */
  fileToRun: (recordId: string, runId: string) => Promise<boolean>
  /** Toggle expansion of a tree node */
  toggleExpanded: (nodeId: string) => void
  /** Expand all nodes */
  expandAll: () => void
  /** Collapse all nodes */
  collapseAll: () => void
  /** Rebuild the server index */
  rebuildServerIndex: () => Promise<void>
}

type BrowserContextValue = BrowserState & BrowserActions

const BrowserContext = createContext<BrowserContextValue | null>(null)

/**
 * Hook to access browser context.
 */
export function useBrowser(): BrowserContextValue {
  const context = useContext(BrowserContext)
  if (!context) {
    throw new Error('useBrowser must be used within a BrowserProvider')
  }
  return context
}

/**
 * Browser context provider.
 */
export function BrowserProvider({ children }: { children: ReactNode }) {
  // State
  const [studies, setStudies] = useState<StudyTreeNode[]>([])
  const [selectedNode, setSelectedNode] = useState<SelectedNode>(null)
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null)
  const [inboxRecords, setInboxRecords] = useState<IndexEntry[]>([])
  const [runRecords, setRunRecords] = useState<IndexEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

  // Compute run context from selected node
  const runContext = useMemo((): RunContext | null => {
    if (!selectedNode || selectedNode.type !== 'run') {
      return null
    }

    // Find the run in the tree
    for (const study of studies) {
      for (const experiment of study.experiments) {
        const run = experiment.runs.find(r => r.recordId === selectedNode.recordId)
        if (run) {
          return {
            runId: run.recordId,
            studyId: study.recordId,
            experimentId: experiment.recordId,
            runTitle: run.title,
          }
        }
      }
    }
    return null
  }, [selectedNode, studies])

  // Load tree data
  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const [treeResponse, inboxResponse] = await Promise.all([
        getStudyTree(),
        getInbox(),
      ])

      setStudies(treeResponse.studies)
      setInboxRecords(inboxResponse.records)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load browser data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Load records when run is selected
  useEffect(() => {
    if (selectedNode?.type === 'run') {
      getRecordsForRun(selectedNode.recordId)
        .then(response => setRunRecords(response.records))
        .catch(err => console.error('Failed to load run records:', err))
    } else {
      setRunRecords([])
    }
  }, [selectedNode])

  // Initial load
  useEffect(() => {
    refresh()
  }, [refresh])

  // Select node
  const selectNode = useCallback((node: SelectedNode) => {
    setSelectedNode(node)
  }, [])

  // File record to run
  const fileToRun = useCallback(async (recordId: string, runId: string): Promise<boolean> => {
    try {
      const response = await fileRecord(recordId, runId)
      if (response.success) {
        // Refresh to update inbox and tree
        await refresh()
        return true
      }
      setError(response.error || 'Failed to file record')
      return false
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to file record')
      return false
    }
  }, [refresh])

  // Toggle node expansion
  const toggleExpanded = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }, [])

  // Expand all nodes
  const expandAll = useCallback(() => {
    const allIds = new Set<string>()
    for (const study of studies) {
      allIds.add(study.recordId)
      for (const experiment of study.experiments) {
        allIds.add(experiment.recordId)
        for (const run of experiment.runs) {
          allIds.add(run.recordId)
        }
      }
    }
    setExpandedNodes(allIds)
  }, [studies])

  // Collapse all nodes
  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set())
  }, [])

  // Rebuild server index
  const rebuildServerIndex = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      await rebuildIndex()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rebuild index')
    } finally {
      setIsLoading(false)
    }
  }, [refresh])

  const value: BrowserContextValue = {
    studies,
    selectedNode,
    selectedRecordId,
    inboxRecords,
    runRecords,
    runContext,
    isLoading,
    error,
    expandedNodes,
    selectNode,
    setSelectedRecordId,
    refresh,
    fileToRun,
    toggleExpanded,
    expandAll,
    collapseAll,
    rebuildServerIndex,
  }

  return (
    <BrowserContext.Provider value={value}>
      {children}
    </BrowserContext.Provider>
  )
}
