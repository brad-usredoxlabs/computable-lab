/**
 * TextTree — Modern file browser tree component.
 * 
 * Displays a modern file-browser style tree with appropriate icons and smooth interactions.
 * Sharp, professional design like VS Code or modern IDE file explorers.
 */

import { useState } from 'react'

// Simple cn utility
const cn = (...classes: (string | boolean | undefined | null)[]): string =>
  classes.filter(Boolean).join(' ')

/**
 * Get appropriate text indicator for node type and kind
 */
function getNodeIndicator(type: string, kind?: string): string {
  switch (type) {
    case 'study':
      return '📁'
    case 'experiment':
      return '🧪'
    case 'run':
      return '▶'
    case 'inbox':
      return '📥'
    case 'record':
      switch (kind) {
        case 'event-graph':
          return '📊'
        case 'plate':
          return '🧫'
        case 'collection':
          return '📦'
        case 'context':
          return '📍'
        case 'material':
          return '🧬'
        case 'attachment':
          return '📎'
        default:
          return '📄'
      }
    default:
      return '📄'
  }
}

/**
 * A node in the flattened tree.
 */
export interface TreeNode {
  id: string
  label: string
  depth: number
  type: 'study' | 'experiment' | 'run' | 'record' | 'inbox'
  hasChildren: boolean
  parentId?: string
  recordId?: string
  kind?: string
}

interface TreeRowProps {
  node: TreeNode
  isExpanded: boolean
  isSelected: boolean
  onToggle: () => void
  onSelect: () => void
  onDoubleClick?: () => void
}

/**
 * A single modern row in the tree with text indicators.
 */
function TreeRow({ 
  node, 
  isExpanded, 
  isSelected, 
  onToggle, 
  onSelect,
  onDoubleClick,
}: TreeRowProps) {
  const indicator = getNodeIndicator(node.type, node.kind)
  
  // Typography hierarchy based on node type
  const getTextClass = () => {
    switch (node.type) {
      case 'study':
        return 'font-semibold text-gray-900'
      case 'experiment':
        return 'font-medium text-gray-800'
      case 'run':
        return 'font-medium text-gray-700'
      case 'record':
        return 'font-normal text-gray-600'
      case 'inbox':
        return 'font-medium text-gray-900'
      default:
        return 'font-normal text-gray-600'
    }
  }

  return (
    <div 
      className={cn(
        "group flex items-center py-1 px-2 cursor-pointer text-sm",
        "hover:bg-gray-100",
        isSelected && "bg-blue-100"
      )}
      style={{ paddingLeft: `${node.depth * 16 + 8}px` }}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
    >
      {/* Expand/collapse chevron */}
      {node.hasChildren ? (
        <span
          className="mr-1 cursor-pointer select-none"
          onClick={(e) => { e.stopPropagation(); onToggle() }}
        >
          {isExpanded ? '▼' : '▶'}
        </span>
      ) : (
        <span className="mr-1 w-3 inline-block" />
      )}
      
      {/* Type indicator */}
      <span className="mr-2">{indicator}</span>
      
      {/* Record title */}
      <div className="flex-1 min-w-0">
        <span className={cn("truncate", getTextClass())}>
          {node.label}
        </span>
      </div>
      
      {/* Badges */}
      {node.type === 'record' && node.kind && (
        <span className="ml-2 text-xs text-gray-500">
          [{node.kind}]
        </span>
      )}
    </div>
  )
}

interface TextTreeProps {
  nodes: TreeNode[]
  expandedNodes: Set<string>
  selectedNodeId: string | null
  onToggle: (nodeId: string) => void
  onSelect: (nodeId: string) => void
  onDoubleClick?: (nodeId: string) => void
  className?: string
}

/**
 * Text-based tree component.
 * Renders a flat list of nodes with proper indentation.
 */
export function TextTree({
  nodes,
  expandedNodes,
  selectedNodeId,
  onToggle,
  onSelect,
  onDoubleClick,
  className,
}: TextTreeProps) {
  if (nodes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-2">No records found</h3>
          <p className="text-sm text-gray-500">Get started by creating your first study</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("flex-1 overflow-y-auto", className)}>
      <div className="py-2">
        {nodes.map(node => (
          <TreeRow
            key={node.id}
            node={node}
            isExpanded={expandedNodes.has(node.id)}
            isSelected={selectedNodeId === node.id}
            onToggle={() => onToggle(node.id)}
            onSelect={() => onSelect(node.id)}
            onDoubleClick={onDoubleClick ? () => onDoubleClick(node.id) : undefined}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Demo tree with sample data for testing.
 */
export function TextTreeDemo() {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['study-1', 'exp-1', 'run-1']))
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  // Sample hierarchical data
  const sampleData = {
    studies: [
      {
        id: 'study-1',
        title: 'Liver Toxicity Study',
        experiments: [
          {
            id: 'exp-1',
            title: 'Dose Response Experiment',
            runs: [
              {
                id: 'run-1',
                title: 'Run 2026-01-31',
                records: [
                  { id: 'evg-1', title: 'Serial Dilution', kind: 'event-graph' },
                  { id: 'evg-2', title: 'Cell Seeding', kind: 'event-graph' },
                  { id: 'plt-1', title: 'Readout Plate', kind: 'plate' },
                ],
              },
              {
                id: 'run-2',
                title: 'Run 2026-01-30',
                records: [],
              },
            ],
          },
          {
            id: 'exp-2',
            title: 'Control Experiment',
            runs: [],
          },
        ],
      },
      {
        id: 'study-2',
        title: 'Kidney Fibrosis Study',
        experiments: [],
      },
    ],
    inbox: [
      { id: 'inbox-1', title: 'Unfiled Event Graph', kind: 'event-graph' },
      { id: 'inbox-2', title: 'Unfiled Plate', kind: 'plate' },
    ],
  }

  // Flatten tree based on expansion state
  const flattenTree = (): TreeNode[] => {
    const nodes: TreeNode[] = []

    for (const study of sampleData.studies) {
      nodes.push({
        id: study.id,
        label: study.title,
        depth: 0,
        type: 'study',
        hasChildren: study.experiments.length > 0,
      })

      if (expandedNodes.has(study.id)) {
        for (const exp of study.experiments) {
          nodes.push({
            id: exp.id,
            label: exp.title,
            depth: 1,
            type: 'experiment',
            parentId: study.id,
            hasChildren: exp.runs.length > 0,
          })

          if (expandedNodes.has(exp.id)) {
            for (const run of exp.runs) {
              nodes.push({
                id: run.id,
                label: run.title,
                depth: 2,
                type: 'run',
                parentId: exp.id,
                hasChildren: run.records.length > 0,
              })

              if (expandedNodes.has(run.id)) {
                for (const record of run.records) {
                  nodes.push({
                    id: record.id,
                    label: record.title,
                    depth: 3,
                    type: 'record',
                    parentId: run.id,
                    hasChildren: false,
                    recordId: record.id,
                    kind: record.kind,
                  })
                }
              }
            }
          }
        }
      }
    }

    // Add inbox section
    nodes.push({
      id: '_inbox',
      label: `_inbox (${sampleData.inbox.length})`,
      depth: 0,
      type: 'inbox',
      hasChildren: sampleData.inbox.length > 0,
    })

    if (expandedNodes.has('_inbox')) {
      for (const record of sampleData.inbox) {
        nodes.push({
          id: record.id,
          label: record.title,
          depth: 1,
          type: 'record',
          parentId: '_inbox',
          hasChildren: false,
          recordId: record.id,
          kind: record.kind,
        })
      }
    }

    return nodes
  }

  const handleToggle = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }

  const handleSelect = (nodeId: string) => {
    setSelectedNodeId(nodeId)
  }

  const nodes = flattenTree()

  return (
    <div className="border rounded bg-white">
      <div className="p-2 border-b bg-gray-50 text-sm font-medium">
        Record Browser (Demo)
      </div>
      <TextTree
        nodes={nodes}
        expandedNodes={expandedNodes}
        selectedNodeId={selectedNodeId}
        onToggle={handleToggle}
        onSelect={handleSelect}
      />
      {selectedNodeId && (
        <div className="p-2 border-t bg-gray-50 text-xs text-gray-500">
          Selected: {selectedNodeId}
        </div>
      )}
    </div>
  )
}
