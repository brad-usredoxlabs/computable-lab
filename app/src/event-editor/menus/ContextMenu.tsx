import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface ContextMenuItem {
  id: string
  label: string
  icon?: string
  detail?: string
  disabled?: boolean
  destructive?: boolean
  onSelect?: () => void
}

interface ContextMenuProps {
  open: boolean
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
  title?: string
}

export function ContextMenu({ open, x, y, items, onClose, title }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState({ x, y })

  useLayoutEffect(() => {
    if (!open) return
    const menu = menuRef.current
    if (!menu) return
    const rect = menu.getBoundingClientRect()
    const margin = 8
    const maxX = window.innerWidth - rect.width - margin
    const maxY = window.innerHeight - rect.height - margin
    setCoords({
      x: Math.max(margin, Math.min(x, maxX)),
      y: Math.max(margin, Math.min(y, maxY)),
    })
  }, [open, x, y, items.length])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    function onPointer(event: MouseEvent) {
      const menu = menuRef.current
      if (!menu) return
      if (event.target instanceof Node && menu.contains(event.target)) return
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('mousedown', onPointer, true)
    document.addEventListener('contextmenu', onPointer, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('mousedown', onPointer, true)
      document.removeEventListener('contextmenu', onPointer, true)
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="ctx-menu event-editor"
      style={{ left: coords.x, top: coords.y }}
      ref={menuRef}
      role="menu"
    >
      {title ? <div className="ctx-menu__title">{title}</div> : null}
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="ctx-menu__item"
          data-disabled={item.disabled ? 'true' : 'false'}
          data-destructive={item.destructive ? 'true' : 'false'}
          disabled={item.disabled}
          onClick={() => {
            if (item.disabled) return
            item.onSelect?.()
            onClose()
          }}
          role="menuitem"
        >
          {item.icon ? <span className="ctx-menu__icon">{item.icon}</span> : null}
          <span className="ctx-menu__label">{item.label}</span>
          {item.detail ? <span className="ctx-menu__detail">{item.detail}</span> : null}
        </button>
      ))}
    </div>,
    document.body,
  )
}
