/**
 * CreateMenu — "+ Create" dropdown in the navbar.
 *
 * Offers New Run (visually dominant), New Project, New Claim, and
 * relevant lab entity types.
 *
 * Spec reference: specs/computable-lab-ui-specification.md §4.1
 * New Run SHOULD be the visually dominant creation action.
 */

import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './CreateMenu.css'

interface CreateMenuItem {
  label: string
  path: string
  dominant?: boolean
}

const ITEMS: CreateMenuItem[] = [
  { label: 'New Run', path: '/runs', dominant: true },
  { label: 'New Project', path: '/create/study' },
  { label: 'New Claim', path: '/claims' },
]

export function CreateMenu() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div className="create-menu" ref={ref}>
      <button
        type="button"
        className="create-menu__button"
        data-testid="create-menu"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        + Create
      </button>
      {open ? (
        <div className="create-menu__dropdown" role="menu">
          {ITEMS.map((item) => (
            <button
              key={item.path}
              type="button"
              role="menuitem"
              className={
                item.dominant
                  ? 'create-menu__item create-menu__item--dominant'
                  : 'create-menu__item'
              }
              data-testid={`create-menu-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={() => {
                setOpen(false)
                navigate(item.path)
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
