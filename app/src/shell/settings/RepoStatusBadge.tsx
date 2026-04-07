/**
 * RepoStatusBadge - Shows connected repository status in header.
 * 
 * Visual states:
 * - connected (green): clean, synced
 * - dirty (yellow): has uncommitted changes or behind remote
 * - syncing (blue): sync in progress
 * - error (red): connection error
 * - disconnected (gray): no repo configured
 */

import { Link } from 'react-router-dom'
import type { RepoStatusInfo, RepoStatus } from '../../types/server'

interface RepoStatusBadgeProps {
  status: RepoStatusInfo
  loading?: boolean
  error?: string | null
  compact?: boolean
}

/**
 * Status indicator dot colors
 */
const STATUS_COLORS: Record<RepoStatus, string> = {
  clean: '#40c057',      // green
  dirty: '#fab005',      // yellow
  syncing: '#339af0',    // blue
  error: '#fa5252',      // red
  unknown: '#868e96',    // gray
  disconnected: '#868e96', // gray
}

/**
 * Status icon SVG
 */
function StatusDot({ status }: { status: RepoStatus }) {
  const color = STATUS_COLORS[status]
  const isAnimated = status === 'syncing'
  
  return (
    <span 
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: color,
        animation: isAnimated ? 'pulse 1.5s infinite' : undefined,
      }}
    />
  )
}

/**
 * Git branch icon
 */
function BranchIcon() {
  return (
    <svg 
      width={12} 
      height={12} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ opacity: 0.7 }}
    >
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  )
}

/**
 * RepoStatusBadge component
 */
export function RepoStatusBadge({ 
  status, 
  loading = false, 
  error,
  compact = false 
}: RepoStatusBadgeProps) {
  const effectiveStatus = error ? 'error' : status.status
  const hasUpdates = status.behind > 0 || status.ahead > 0
  
  // Tooltip content
  const tooltip = [
    status.repoName,
    status.branch ? `Branch: ${status.branch}` : null,
    status.ahead > 0 ? `${status.ahead} commit(s) ahead` : null,
    status.behind > 0 ? `${status.behind} commit(s) behind` : null,
    error ? `Error: ${error}` : null,
    'Click for settings',
  ].filter(Boolean).join('\n')

  if (compact) {
    return (
      <Link to="/settings" className="repo-status-badge repo-status-badge--compact" title={tooltip}>
        <StatusDot status={effectiveStatus} />
      </Link>
    )
  }

  return (
    <Link 
      to="/settings" 
      className="repo-status-badge"
      title={tooltip}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.25rem 0.75rem',
        borderRadius: '9999px',
        backgroundColor: 'rgba(0,0,0,0.05)',
        textDecoration: 'none',
        color: 'inherit',
        fontSize: '0.8rem',
        transition: 'background-color 0.15s',
      }}
    >
      <StatusDot status={effectiveStatus} />
      
      <span style={{ 
        maxWidth: 150, 
        overflow: 'hidden', 
        textOverflow: 'ellipsis', 
        whiteSpace: 'nowrap',
        opacity: loading ? 0.5 : 1,
      }}>
        {status.repoName}
      </span>
      
      {status.branch && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', opacity: 0.7 }}>
          <BranchIcon />
          {status.branch}
        </span>
      )}
      
      {hasUpdates && (
        <span style={{ 
          fontSize: '0.7rem', 
          padding: '0 0.25rem',
          backgroundColor: STATUS_COLORS.dirty,
          color: 'white',
          borderRadius: 4,
        }}>
          {status.behind > 0 && `↓${status.behind}`}
          {status.ahead > 0 && status.behind > 0 && ' '}
          {status.ahead > 0 && `↑${status.ahead}`}
        </span>
      )}

      <style>{`
        .repo-status-badge:hover {
          background-color: rgba(0,0,0,0.1) !important;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </Link>
  )
}

export default RepoStatusBadge
