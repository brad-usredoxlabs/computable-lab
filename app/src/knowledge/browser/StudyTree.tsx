/**
 * StudyTree — Collapsible tree view for study hierarchy.
 */

import { useState } from 'react'
import type { StudyTreeNode, ExperimentTreeNode, RunTreeNode } from '../../types/tree'
import { useBrowser } from '../../shared/context/BrowserContext'
import { cn } from '../../shared/lib/utils'
import { CreateNodeModal, type CreateNodeType } from './CreateNodeModal'

interface StudyTreeProps {
  className?: string
}

interface CreateModalState {
  isOpen: boolean
  nodeType: CreateNodeType
  studyId?: string
  experimentId?: string
}

// Simple SVG icons
const ChevronRight = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
)

const ChevronDown = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
)

const FolderIcon = ({ open = false }: { open?: boolean }) => (
  <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    {open ? (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
    ) : (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    )}
  </svg>
)

const FlaskIcon = () => (
  <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
  </svg>
)

const PlayIcon = () => (
  <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
)

const EyeIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
)

/**
 * Main tree component.
 */
export function StudyTree({ className }: StudyTreeProps) {
  const { studies, isLoading, error } = useBrowser()
  const [createModal, setCreateModal] = useState<CreateModalState>({
    isOpen: false,
    nodeType: 'study',
  })

  const openCreateModal = (nodeType: CreateNodeType, studyId?: string, experimentId?: string) => {
    setCreateModal({ isOpen: true, nodeType, studyId, experimentId })
  }

  const closeCreateModal = () => {
    setCreateModal(prev => ({ ...prev, isOpen: false }))
  }

  if (isLoading && studies.length === 0) {
    return (
      <div className={cn('p-4 text-sm text-gray-500', className)}>
        Loading studies...
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('p-4 text-sm text-red-500', className)}>
        {error}
      </div>
    )
  }

  if (studies.length === 0) {
    return (
      <div className={cn('p-2', className)}>
        <p className="text-xs text-gray-500 mb-2">
          No studies yet. Create your first one:
        </p>
        <button
          type="button"
          onClick={() => openCreateModal('study')}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Study
        </button>
        <CreateNodeModal
          isOpen={createModal.isOpen}
          onClose={closeCreateModal}
          nodeType={createModal.nodeType}
          studyId={createModal.studyId}
          experimentId={createModal.experimentId}
        />
      </div>
    )
  }

  return (
    <div className={cn('text-sm', className)}>
      {studies.map(study => (
        <StudyNode key={study.recordId} study={study} onCreateChild={openCreateModal} />
      ))}
      <CreateNodeModal
        isOpen={createModal.isOpen}
        onClose={closeCreateModal}
        nodeType={createModal.nodeType}
        studyId={createModal.studyId}
        experimentId={createModal.experimentId}
      />
    </div>
  )
}

type OnCreateChild = (nodeType: CreateNodeType, studyId?: string, experimentId?: string) => void

/**
 * Study tree node.
 */
function StudyNode({ study, onCreateChild }: { study: StudyTreeNode; onCreateChild: OnCreateChild }) {
  const { selectedNode, selectNode, expandedNodes, toggleExpanded, setSelectedRecordId } = useBrowser()
  const isExpanded = expandedNodes.has(study.recordId)
  const isSelected = selectedNode?.type === 'study' && selectedNode.recordId === study.recordId
  const hasChildren = study.experiments.length > 0

  return (
    <div className="tree-node tree-node-study">
      <div
        className={cn(
          'flex items-center gap-1 py-1 px-2 rounded hover:bg-gray-100',
          isSelected && 'bg-gray-100 font-medium'
        )}
        onClick={(e) => {
          e.stopPropagation()
          toggleExpanded(study.recordId)
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            toggleExpanded(study.recordId)
          }}
          className={cn('p-0.5 hover:bg-gray-200 rounded', !hasChildren && 'invisible')}
        >
          {isExpanded ? <ChevronDown /> : <ChevronRight />}
        </button>
        <FlaskIcon />
        <span className="truncate flex-1">{study.title}</span>
        {/* Preview button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            selectNode({ type: 'study', recordId: study.recordId })
            setSelectedRecordId(study.recordId)
          }}
          className="tree-action-btn p-0.5 hover:bg-gray-100 rounded opacity-0 transition-opacity text-gray-400 hover:text-gray-700"
          title="View details"
        >
          <EyeIcon />
        </button>
        {/* Add experiment button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onCreateChild('experiment', study.recordId)
          }}
          className="tree-action-btn p-0.5 hover:bg-blue-100 rounded opacity-0 transition-opacity text-gray-400 hover:text-blue-600"
          title="Add Experiment"
        >
          <PlusIcon />
        </button>
        {study.experiments.length > 0 && (
          <span className="text-xs text-gray-400">
            {study.experiments.length}
          </span>
        )}
      </div>

      {isExpanded && (
        <div className="ml-4">
          {study.experiments.map(experiment => (
            <ExperimentNode 
              key={experiment.recordId} 
              experiment={experiment} 
              studyId={study.recordId}
              onCreateChild={onCreateChild}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Experiment tree node.
 */
function ExperimentNode({ 
  experiment, 
  studyId, 
  onCreateChild 
}: { 
  experiment: ExperimentTreeNode
  studyId: string
  onCreateChild: OnCreateChild 
}) {
  const { selectedNode, selectNode, expandedNodes, toggleExpanded, setSelectedRecordId } = useBrowser()
  const isExpanded = expandedNodes.has(experiment.recordId)
  const isSelected = selectedNode?.type === 'experiment' && selectedNode.recordId === experiment.recordId
  const hasChildren = experiment.runs.length > 0

  return (
    <div className="tree-node tree-node-experiment">
      <div
        className={cn(
          'flex items-center gap-1 py-1 px-2 rounded hover:bg-gray-100',
          isSelected && 'bg-gray-100 font-medium'
        )}
        onClick={(e) => {
          e.stopPropagation()
          toggleExpanded(experiment.recordId)
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            toggleExpanded(experiment.recordId)
          }}
          className={cn('p-0.5 hover:bg-gray-200 rounded', !hasChildren && 'invisible')}
        >
          {isExpanded ? <ChevronDown /> : <ChevronRight />}
        </button>
        <FolderIcon open={isExpanded} />
        <span className="truncate flex-1">{experiment.title}</span>
        {/* Preview button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            selectNode({ type: 'experiment', recordId: experiment.recordId })
            setSelectedRecordId(experiment.recordId)
          }}
          className="tree-action-btn p-0.5 hover:bg-gray-100 rounded opacity-0 transition-opacity text-gray-400 hover:text-gray-700"
          title="View details"
        >
          <EyeIcon />
        </button>
        {/* Add run button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onCreateChild('run', studyId, experiment.recordId)
          }}
          className="tree-action-btn p-0.5 hover:bg-green-100 rounded opacity-0 transition-opacity text-gray-400 hover:text-green-600"
          title="Add Run"
        >
          <PlusIcon />
        </button>
        {experiment.runs.length > 0 && (
          <span className="text-xs text-gray-400">
            {experiment.runs.length}
          </span>
        )}
      </div>

      {isExpanded && (
        <div className="ml-4">
          {experiment.runs.map(run => (
            <RunNode key={run.recordId} run={run} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Run tree node.
 */
function RunNode({ run }: { run: RunTreeNode }) {
  const { selectedNode, selectNode, setSelectedRecordId } = useBrowser()
  const isSelected = selectedNode?.type === 'run' && selectedNode.recordId === run.recordId

  // Count total records
  const totalRecords = Object.values(run.recordCounts).reduce((a, b) => a + b, 0)

  return (
    <div className="tree-node tree-node-run">
      <div
        className={cn(
          'flex items-center gap-1 py-1 px-2 rounded hover:bg-gray-100',
          isSelected && 'bg-blue-50 font-medium border-l-2 border-blue-500'
        )}
      >
        <div className="w-5" /> {/* Spacer for alignment */}
        <PlayIcon />
        <span className="truncate flex-1">{run.title}</span>
        {/* Preview button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            selectNode({ type: 'run', recordId: run.recordId })
            setSelectedRecordId(run.recordId)
          }}
          className="tree-action-btn p-0.5 hover:bg-gray-100 rounded opacity-0 transition-opacity text-gray-400 hover:text-gray-700"
          title="View details"
        >
          <EyeIcon />
        </button>
        {totalRecords > 0 && (
          <span className="text-xs text-gray-400">
            {totalRecords}
          </span>
        )}
      </div>
    </div>
  )
}
