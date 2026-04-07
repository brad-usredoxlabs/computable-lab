import { formatFileSize, isImageFile, getFileExtension } from '../../types/aiContext'

interface AttachmentChipProps {
  name: string
  size: number
  type: string
  previewUrl?: string
  onRemove?: () => void
  onClick?: () => void
}

function fileIcon(name: string): string {
  const ext = getFileExtension(name)
  if (['.csv', '.tsv', '.xlsx', '.xls'].includes(ext)) return '\u{1F4CA}'
  if (ext === '.pdf') return '\u{1F4C4}'
  if (['.json', '.yaml', '.yml'].includes(ext)) return '\u{1F4CB}'
  if (['.txt', '.md'].includes(ext)) return '\u{1F4DD}'
  return '\u{1F4CE}'
}

export function AttachmentChip({ name, size, previewUrl, onRemove, onClick }: AttachmentChipProps) {
  const isImage = isImageFile(name)
  const truncatedName = name.length > 24 ? name.slice(0, 20) + '\u2026' + name.slice(name.lastIndexOf('.')) : name

  return (
    <span
      className="attachment-chip"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {isImage && previewUrl ? (
        <img
          src={previewUrl}
          alt={name}
          style={{
            width: 32,
            height: 32,
            objectFit: 'cover',
            borderRadius: 4,
            flexShrink: 0,
          }}
        />
      ) : (
        <span style={{ fontSize: '1.1rem', lineHeight: 1, flexShrink: 0 }}>{fileIcon(name)}</span>
      )}
      <span style={{ minWidth: 0 }}>
        <span className="attachment-chip__name" title={name}>{truncatedName}</span>
        <span className="attachment-chip__size">{formatFileSize(size)}</span>
      </span>
      {onRemove && (
        <button
          type="button"
          className="attachment-chip__remove"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          title="Remove attachment"
        >
          &times;
        </button>
      )}

      <style>{`
        .attachment-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          color: #0f172a;
          background: #ffffff;
          border: 1px solid #dbe2ea;
          border-radius: 8px;
          padding: 4px 8px;
          box-shadow: 0 1px 2px rgba(15,23,42,0.06);
          max-width: 220px;
        }

        .attachment-chip__name {
          display: block;
          color: #334155;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .attachment-chip__size {
          display: block;
          color: #94a3b8;
          font-size: 0.68rem;
        }

        .attachment-chip__remove {
          border: none;
          background: transparent;
          color: #94a3b8;
          font-size: 1rem;
          line-height: 1;
          cursor: pointer;
          padding: 0;
          margin-left: 2px;
          flex-shrink: 0;
        }

        .attachment-chip__remove:hover {
          color: #ef4444;
        }
      `}</style>
    </span>
  )
}
