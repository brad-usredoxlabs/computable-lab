/**
 * BrowserSidebar — Main sidebar containing search, tree and inbox.
 */

import { useState } from 'react'
import { useBrowser } from '../../shared/context/BrowserContext'
import { SearchBar } from './SearchBar'
import { StudyTree } from './StudyTree'
import { InboxPanel } from './InboxPanel'
import { CreateNodeModal } from './CreateNodeModal'

// Simple cn utility inline
const cn = (...classes: (string | boolean | undefined | null)[]): string =>
  classes.filter(Boolean).join(' ')

interface BrowserSidebarProps {
  className?: string
}

// Refresh icon
const RefreshIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
)

// Expand icon
const ExpandIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
  </svg>
)

// Collapse icon
const CollapseIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
  </svg>
)

// Plus icon
const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
)

/**
 * Main browser sidebar with tree and inbox.
 */
export function BrowserSidebar({ className }: BrowserSidebarProps) {
  const { 
    isLoading, 
    runContext, 
    refresh, 
    expandAll, 
    collapseAll,
    rebuildServerIndex 
  } = useBrowser()
  
  const [showCreateStudy, setShowCreateStudy] = useState(false)

  return (
    <div className={cn('flex flex-col h-full bg-white border-r border-gray-200', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
        <h2 className="font-semibold text-sm">Browser</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowCreateStudy(true)}
            className="p-1 hover:bg-blue-100 rounded text-gray-600 hover:text-blue-600"
            title="New Study"
          >
            <PlusIcon />
          </button>
          <button
            type="button"
            onClick={expandAll}
            className="p-1 hover:bg-gray-100 rounded"
            title="Expand all"
          >
            <ExpandIcon />
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="p-1 hover:bg-gray-100 rounded"
            title="Collapse all"
          >
            <CollapseIcon />
          </button>
          <button
            type="button"
            onClick={refresh}
            disabled={isLoading}
            className={cn(
              'p-1 hover:bg-gray-100 rounded',
              isLoading && 'opacity-50 cursor-not-allowed animate-spin'
            )}
            title="Refresh"
          >
            <RefreshIcon />
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="px-3 py-2 border-b border-gray-200">
        <SearchBar />
      </div>

      {/* Run context indicator */}
      {runContext && (
        <div className="px-3 py-1.5 bg-blue-50 border-b border-blue-100 text-xs">
          <span className="text-gray-500">Filing to: </span>
          <span className="font-medium text-blue-700">{runContext.runTitle}</span>
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto p-2">
        <StudyTree />
      </div>

      {/* Inbox */}
      <InboxPanel />

      {/* Footer with admin actions */}
      <div className="border-t border-gray-200 px-3 py-2">
        <button
          type="button"
          onClick={rebuildServerIndex}
          disabled={isLoading}
          className={cn(
            'text-xs text-gray-400 hover:text-gray-600',
            isLoading && 'opacity-50 cursor-not-allowed'
          )}
        >
          Rebuild Index
        </button>
      </div>

      {/* Create Study Modal */}
      <CreateNodeModal
        isOpen={showCreateStudy}
        onClose={() => setShowCreateStudy(false)}
        nodeType="study"
      />
    </div>
  )
}
