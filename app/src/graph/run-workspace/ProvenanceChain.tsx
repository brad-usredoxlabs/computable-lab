import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { RecordEnvelope } from '../../types/kernel'
import type { RunWorkspaceResponse } from '../../shared/api/client'

interface ProvenanceChainProps {
  workspace: RunWorkspaceResponse | null
}

interface ProvenanceNode {
  type: 'measurement' | 'evidence' | 'assertion' | 'claim'
  recordId: string
  label: string
  children: ProvenanceNode[]
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function buildProvenanceTree(workspace: RunWorkspaceResponse): ProvenanceNode[] {
  // Build lookup maps
  const evidenceBySupportsId = new Map<string, RecordEnvelope[]>()
  for (const evidence of workspace.evidence) {
    const payload = asObject(evidence.payload)
    const supports = Array.isArray(payload.supports) ? payload.supports : []
    for (const support of supports) {
      const refId = typeof support === 'object' && support !== null ? (support as Record<string, unknown>).id : null
      if (typeof refId === 'string') {
        const list = evidenceBySupportsId.get(refId) ?? []
        list.push(evidence)
        evidenceBySupportsId.set(refId, list)
      }
    }
  }

  const assertionByClaimId = new Map<string, RecordEnvelope[]>()
  for (const assertion of workspace.assertions) {
    const payload = asObject(assertion.payload)
    const claimRef = asObject(payload.claim_ref)
    const claimId = typeof claimRef.id === 'string' ? claimRef.id : null
    if (claimId) {
      const list = assertionByClaimId.get(claimId) ?? []
      list.push(assertion)
      assertionByClaimId.set(claimId, list)
    }
  }

  // Build tree from claims down
  const claimNodes: ProvenanceNode[] = workspace.claims.map((claim) => {
    const claimPayload = asObject(claim.payload)
    const assertions = assertionByClaimId.get(claim.recordId) ?? []

    const assertionNodes: ProvenanceNode[] = assertions.map((assertion) => {
      const aPayload = asObject(assertion.payload)
      const evidenceRecords = evidenceBySupportsId.get(assertion.recordId) ?? []

      const evidenceNodes: ProvenanceNode[] = evidenceRecords.map((evidence) => {
        const ePayload = asObject(evidence.payload)
        // Find linked measurements
        const measurementNodes: ProvenanceNode[] = []
        const sourceRefs = Array.isArray(ePayload.source_refs) ? ePayload.source_refs : []
        for (const ref of sourceRefs) {
          const refObj = asObject(ref)
          if (typeof refObj.id === 'string') {
            const measurement = workspace.measurements.find((m) => m.recordId === refObj.id)
            if (measurement) {
              const mPayload = asObject(measurement.payload)
              measurementNodes.push({
                type: 'measurement',
                recordId: measurement.recordId,
                label: typeof mPayload.title === 'string' ? mPayload.title : measurement.recordId,
                children: [],
              })
            }
          }
        }

        return {
          type: 'evidence' as const,
          recordId: evidence.recordId,
          label: typeof ePayload.title === 'string' ? ePayload.title : evidence.recordId,
          children: measurementNodes,
        }
      })

      return {
        type: 'assertion' as const,
        recordId: assertion.recordId,
        label: typeof aPayload.statement === 'string' ? aPayload.statement : assertion.recordId,
        children: evidenceNodes,
      }
    })

    return {
      type: 'claim' as const,
      recordId: claim.recordId,
      label: typeof claimPayload.statement === 'string' ? claimPayload.statement : claim.recordId,
      children: assertionNodes,
    }
  })

  return claimNodes
}

function ProvenanceNodeView({ node, depth = 0 }: { node: ProvenanceNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = node.children.length > 0

  const typeColors: Record<string, { bg: string; border: string; text: string }> = {
    claim: { bg: '#f0fdf4', border: '#86efac', text: '#15803d' },
    assertion: { bg: '#faf5ff', border: '#e9d5ff', text: '#6b21a8' },
    evidence: { bg: '#fefce8', border: '#fde68a', text: '#92400e' },
    measurement: { bg: '#f0f9ff', border: '#bae6fd', text: '#0369a1' },
  }

  const colors = typeColors[node.type] ?? typeColors.measurement

  return (
    <div className="provenance-node" style={{ marginLeft: depth > 0 ? '1.25rem' : 0 }}>
      <div
        className="provenance-node__header"
        style={{ background: colors.bg, borderColor: colors.border }}
      >
        {hasChildren && (
          <button
            type="button"
            className="provenance-node__toggle"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? '\u25BC' : '\u25B6'}
          </button>
        )}
        <span className="provenance-node__type" style={{ color: colors.text }}>
          {node.type.toUpperCase()}
        </span>
        <span className="provenance-node__label" title={node.label}>
          {node.label.length > 80 ? `${node.label.slice(0, 80)}...` : node.label}
        </span>
        <Link
          to={`/records/${encodeURIComponent(node.recordId)}`}
          className="provenance-node__link"
        >
          View
        </Link>
      </div>
      {expanded && hasChildren && (
        <div className="provenance-node__children">
          {node.children.map((child) => (
            <ProvenanceNodeView key={child.recordId} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export function ProvenanceChain({ workspace }: ProvenanceChainProps) {
  const tree = useMemo(() => (workspace ? buildProvenanceTree(workspace) : []), [workspace])

  if (tree.length === 0) {
    return null
  }

  return (
    <div className="provenance-chain">
      <div className="provenance-chain__header">
        <h3>Provenance Chain</h3>
        <span className="provenance-chain__legend">
          Measurement &rarr; Evidence &rarr; Assertion &rarr; Claim
        </span>
      </div>
      <div className="provenance-chain__tree">
        {tree.map((node) => (
          <ProvenanceNodeView key={node.recordId} node={node} />
        ))}
      </div>

      <style>{`
        .provenance-chain {
          margin-top: 1rem;
          padding: 1rem;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
        }
        .provenance-chain__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 0.75rem;
          flex-wrap: wrap;
        }
        .provenance-chain__header h3 { margin: 0; }
        .provenance-chain__legend {
          font-size: 0.8rem;
          color: #64748b;
        }
        .provenance-chain__tree {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .provenance-node__header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.4rem 0.7rem;
          border: 1px solid;
          border-radius: 8px;
          font-size: 0.85rem;
        }
        .provenance-node__toggle {
          border: none;
          background: none;
          cursor: pointer;
          font-size: 0.7rem;
          padding: 0;
          line-height: 1;
          color: #64748b;
        }
        .provenance-node__type {
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          flex-shrink: 0;
        }
        .provenance-node__label {
          flex: 1;
          color: #1e293b;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .provenance-node__link {
          font-size: 0.75rem;
          color: #0969da;
          text-decoration: none;
          flex-shrink: 0;
        }
        .provenance-node__children {
          margin-top: 0.35rem;
          border-left: 2px solid #e2e8f0;
          padding-left: 0.25rem;
        }
      `}</style>
    </div>
  )
}
