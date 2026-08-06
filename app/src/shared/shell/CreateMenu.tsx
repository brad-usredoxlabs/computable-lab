/**
 * CreateMenu — "+ Create" dropdown in the navbar.
 *
 * Offers New Run (visually dominant), New Project, New Claim, and
 * relevant lab entity types.
 *
 * New Run creates a run immediately (quickCreateRun), opens it as a
 * top-level run tab, and lands straight in the event editor.
 *
 * Spec reference: specs/computable-lab-ui-specification.md §4.1
 * New Run SHOULD be the visually dominant creation action.
 */

import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOptionalOpenTabs } from './OpenTabsContext'
import { runTabId } from '../../event-editor/workspace/types'
import { openContent } from '../lib/openContent'
import { quickCreateRun } from '../../event-editor/create/quickCreateRun'
import { SCRATCH_STUDY_ID } from '../../event-editor/legacyRouteResolution'
import './CreateMenu.css'

interface CreateMenuItem {
  label: string
  path?: string
  dominant?: boolean
  /** When true, this item creates a run immediately instead of navigating. */
  onCreateRun?: boolean
}

const ITEMS: CreateMenuItem[] = [
  { label: 'New Run', onCreateRun: true, dominant: true },
  { label: 'New Project', path: '/create/study' },
  { label: 'New Claim', path: '/claims' },
]

export function CreateMenu() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const openTabs = useOptionalOpenTabs()
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

  async function handleSelect(item: CreateMenuItem) {
    setOpen(false)
    if (item.onCreateRun) {
      try {
        const { recordId, title } = await quickCreateRun({ studyId: SCRATCH_STUDY_ID })
        openContent(openTabs, navigate, { id: runTabId(recordId), kind: 'run', runId: recordId, title }, `/runs/${recordId}`)
      } catch (err) {
        console.error('Failed to create run:', err)
      }
      return
    }
    if (item.path) navigate(item.path)
  }

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
              key={item.label}
              type="button"
              role="menuitem"
              className={
                item.dominant
                  ? 'create-menu__item create-menu__item--dominant'
                  : 'create-menu__item'
              }
              data-testid={`create-menu-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={() => void handleSelect(item)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
