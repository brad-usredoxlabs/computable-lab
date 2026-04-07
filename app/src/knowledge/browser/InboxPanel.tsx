/**
 * InboxPanel — List of unfiled records with drag support.
 */

import { useBrowser } from '../../shared/context/BrowserContext'
import type { IndexEntry } from '../../types/tree'

// Simple cn utility inline to avoid import issues
const cn = (...classes: (string | boolean | undefined | null)[]): string =>
  classes.filter(Boolean).join(' ')

interface InboxPanelProps {
  className?: string
}

// Icon for inbox
const InboxIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
  </svg>
)

// Icon for file/document
const FileIcon = ({ kind }: { kind?: string }) => {
  // Different colors for different kinds
  const colorClass = kind === 'event-graph' 
    ? 'text-purple-500' 
    : kind === 'plate' 
    ? 'text-pink-500'
    : 'text-gray-500'
  
  return (
    <svg className={`w-4 h-4 flex-shrink-0 ${colorClass}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

/**
 * Panel showing unfiled inbox records.
 */
export function InboxPanel({ className }: InboxPanelProps) {
  const { inboxRecords, selectedNode, selectNode, isLoading } = useBrowser()
  const isSelected = selectedNode?.type === 'inbox'

  return (
    <div className={cn('border-t border-gray-200', className)}>
      {/* Header */}
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50',
          isSelected && 'bg-blue-50'
        )}
        onClick={() => selectNode({ type: 'inbox' })}
      >
        <InboxIcon />
        <span className="font-medium text-sm">Inbox</span>
        {inboxRecords.length > 0 && (
          <span className="ml-auto bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full">
            {inboxRecords.length}
          </span>
        )}
      </div>

      {/* Inbox items (show when inbox is selected) */}
      {isSelected && (
        <div className="max-h-48 overflow-y-auto">
          {isLoading && inboxRecords.length === 0 ? (
            <div className="px-4 py-2 text-xs text-gray-400">Loading...</div>
          ) : inboxRecords.length === 0 ? (
            <div className="px-4 py-2 text-xs text-gray-400">No unfiled records</div>
          ) : (
            inboxRecords.map(record => (
              <InboxItem key={record.recordId} record={record} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Individual inbox item.
 */
function InboxItem({ record }: { record: IndexEntry }) {
  const { runContext, fileToRun } = useBrowser()

  const handleFile = async () => {
    if (!runContext) {
      alert('Select a run first to file this record')
      return
    }
    await fileToRun(record.recordId, runContext.runId)
  }

  return (
    <div
      className="flex items-center gap-2 px-4 py-1.5 text-sm hover:bg-gray-50 cursor-pointer group"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', record.recordId)
        e.dataTransfer.effectAllowed = 'move'
      }}
    >
      <FileIcon kind={record.kind} />
      <span className="truncate flex-1">
        {record.title || record.recordId}
      </span>
      {record.kind && (
        <span className="text-xs text-gray-400 hidden group-hover:inline">
          {record.kind}
        </span>
      )}
      {runContext && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            handleFile()
          }}
          className="hidden group-hover:block text-xs text-blue-500 hover:text-blue-700"
          title={`File to ${runContext.runTitle}`}
        >
          File →
        </button>
      )}
    </div>
  )
}
