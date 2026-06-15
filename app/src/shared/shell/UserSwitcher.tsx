/**
 * UserSwitcher — top-bar dropdown to view/select the current local user.
 *
 * Local-first, NOT authentication: picking a user just sets the `x-user-id`
 * header the client sends and reloads. Mirrors the BrandMenu dropdown styling.
 */

import { useEffect, useRef, useState } from 'react'
import { useOptionalCurrentUser } from '../identity/CurrentUserProvider'
import { apiClient } from '../api/client'

export function UserSwitcher() {
  const currentUserCtx = useOptionalCurrentUser()
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editFields, setEditFields] = useState({ displayName: '', username: '', email: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(event: MouseEvent) {
      const target = event.target as Node | null
      if (target && containerRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Render nothing outside a CurrentUserProvider (e.g. isolated unit tests).
  if (!currentUserCtx) return null
  const { users, currentUserId, currentUser, isSystem, setCurrentUser, reload } = currentUserCtx

  const label = currentUser?.displayName ?? currentUser?.username ?? (currentUserId ?? 'Unknown user')

  async function handleCreate() {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    setCreateError(null)
    try {
      const created = await apiClient.createUser({ displayName: name })
      // setCurrentUser persists the selection and reloads as the new user.
      setCurrentUser(created.recordId)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err))
      setCreating(false)
    }
  }

  function startEdit() {
    setEditFields({
      displayName: currentUser?.displayName ?? '',
      username: currentUser?.username ?? '',
      email: currentUser?.email ?? '',
      notes: currentUser?.notes ?? '',
    })
    setEditError(null)
    setEditing(true)
  }

  async function handleSaveProfile() {
    setSaving(true)
    setEditError(null)
    try {
      await apiClient.updateMe({
        displayName: editFields.displayName.trim(),
        username: editFields.username.trim(),
        email: editFields.email.trim(),
        notes: editFields.notes,
      })
      // Reload so the switcher label and any derived Created By names refresh.
      reload()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <div ref={containerRef} className="user-switcher" style={{ position: 'relative' }}>
      <button
        type="button"
        className="user-switcher__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title="Switch user (local, not authentication)"
      >
        <span className="user-switcher__avatar" aria-hidden>
          {(label[0] ?? '?').toUpperCase()}
        </span>
        <span className="user-switcher__name">{label}</span>
        {isSystem ? <span className="user-switcher__sys" aria-hidden>·default</span> : null}
        <span className="user-switcher__caret" aria-hidden>▾</span>
      </button>
      {open ? (
        <ul className="user-switcher__dropdown" role="menu">
          {users.length === 0 ? (
            <li className="user-switcher__empty">No users found</li>
          ) : (
            users.map((u) => {
              const active = u.recordId === currentUserId
              return (
                <li key={u.recordId}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => {
                      setOpen(false)
                      if (!active) setCurrentUser(u.recordId)
                    }}
                  >
                    <span className="user-switcher__check" aria-hidden>{active ? '✓' : ''}</span>
                    <span>
                      {u.displayName ?? u.username ?? u.recordId}
                      {u.username && u.displayName ? (
                        <span className="user-switcher__sub"> @{u.username}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              )
            })
          )}
          <li className="user-switcher__divider" role="separator" />
          {!isSystem && currentUser ? (
            editing ? (
              <li className="user-switcher__edit-form">
                <label>
                  <span>Display name</span>
                  <input
                    type="text"
                    autoFocus
                    value={editFields.displayName}
                    onChange={(e) => setEditFields((f) => ({ ...f, displayName: e.target.value }))}
                    disabled={saving}
                  />
                </label>
                <label>
                  <span>Username</span>
                  <input
                    type="text"
                    value={editFields.username}
                    onChange={(e) => setEditFields((f) => ({ ...f, username: e.target.value }))}
                    disabled={saving}
                  />
                </label>
                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={editFields.email}
                    onChange={(e) => setEditFields((f) => ({ ...f, email: e.target.value }))}
                    disabled={saving}
                  />
                </label>
                <label>
                  <span>Notes</span>
                  <textarea
                    rows={2}
                    value={editFields.notes}
                    onChange={(e) => setEditFields((f) => ({ ...f, notes: e.target.value }))}
                    disabled={saving}
                  />
                </label>
                <div className="user-switcher__edit-actions">
                  <button type="button" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
                  <button
                    type="button"
                    className="user-switcher__edit-save"
                    onClick={() => void handleSaveProfile()}
                    disabled={saving || !editFields.displayName.trim()}
                  >{saving ? '…' : 'Save'}</button>
                </div>
                {editError ? <div className="user-switcher__add-error">{editError}</div> : null}
              </li>
            ) : (
              <li>
                <button type="button" onClick={startEdit}>
                  <span className="user-switcher__check" aria-hidden>✎</span>
                  <span>Edit profile…</span>
                </button>
              </li>
            )
          ) : null}
          {adding ? (
            <li className="user-switcher__add-form">
              <input
                type="text"
                autoFocus
                value={newName}
                placeholder="New user name…"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); void handleCreate() }
                  else if (e.key === 'Escape') { setAdding(false); setNewName('') }
                }}
                disabled={creating}
              />
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={creating || !newName.trim()}
              >{creating ? '…' : 'Add'}</button>
            </li>
          ) : (
            <li>
              <button type="button" onClick={() => setAdding(true)}>
                <span className="user-switcher__check" aria-hidden>＋</span>
                <span>New user…</span>
              </button>
            </li>
          )}
          {createError ? <li className="user-switcher__add-error">{createError}</li> : null}
        </ul>
      ) : null}
      <style>{userSwitcherStyles}</style>
    </div>
  )
}

const userSwitcherStyles = `
.user-switcher__trigger {
  font: inherit;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid var(--cl-border);
  color: inherit;
  cursor: pointer;
  padding: 3px 8px;
  border-radius: 999px;
  max-width: 200px;
}
.user-switcher__trigger:hover { background: var(--cl-bg-elev-2); }
.user-switcher__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--cl-accent);
  color: var(--cl-on-accent);
  font-size: 0.7rem;
  font-weight: 700;
  flex: 0 0 auto;
}
.user-switcher__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.85rem;
}
.user-switcher__sys { color: var(--cl-text-faint); font-size: 0.7rem; }
.user-switcher__caret { font-size: 0.7em; color: var(--cl-text-dim); }
.user-switcher__dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 30;
  margin: 4px 0 0 0;
  padding: 4px 0;
  list-style: none;
  background: var(--cl-bg-elev);
  border: 1px solid var(--cl-border);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  min-width: 200px;
  max-height: 320px;
  overflow-y: auto;
}
.user-switcher__dropdown li button {
  font: inherit;
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  width: 100%;
  background: transparent;
  border: none;
  color: var(--cl-text);
  padding: 8px 12px;
  cursor: pointer;
}
.user-switcher__dropdown li button:hover { background: var(--cl-bg-elev-2); }
.user-switcher__check { width: 12px; color: var(--cl-accent); }
.user-switcher__sub { color: var(--cl-text-faint); font-size: 0.8em; }
.user-switcher__empty { padding: 8px 12px; color: var(--cl-text-faint); font-size: 0.85rem; }
.user-switcher__divider { height: 1px; margin: 4px 0; background: var(--cl-border); }
.user-switcher__add-form { display: flex; gap: 6px; padding: 6px 12px; }
.user-switcher__add-form input {
  flex: 1 1 auto;
  min-width: 0;
  font: inherit;
  font-size: 0.85rem;
  background: var(--cl-bg-elev-2);
  color: var(--cl-text);
  border: 1px solid var(--cl-border);
  border-radius: 4px;
  padding: 4px 6px;
}
.user-switcher__add-form button {
  flex: 0 0 auto;
  width: auto !important;
  padding: 4px 10px !important;
  border: 1px solid var(--cl-border) !important;
  border-radius: 4px;
  background: var(--cl-bg-elev-2) !important;
}
.user-switcher__add-form button:disabled { opacity: 0.5; cursor: default; }
.user-switcher__add-error { padding: 4px 12px 8px; color: var(--cl-danger); font-size: 0.78rem; }
.user-switcher__edit-form { display: flex; flex-direction: column; gap: 6px; padding: 8px 12px; }
.user-switcher__edit-form label { display: flex; flex-direction: column; gap: 2px; }
.user-switcher__edit-form label span { font-size: 0.7rem; color: var(--cl-text-faint); }
.user-switcher__edit-form input,
.user-switcher__edit-form textarea {
  font: inherit;
  font-size: 0.85rem;
  background: var(--cl-bg-elev-2);
  color: var(--cl-text);
  border: 1px solid var(--cl-border);
  border-radius: 4px;
  padding: 4px 6px;
  resize: vertical;
}
.user-switcher__edit-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 2px; }
.user-switcher__edit-actions button {
  font: inherit;
  width: auto !important;
  padding: 4px 10px !important;
  border: 1px solid var(--cl-border) !important;
  border-radius: 4px;
  background: var(--cl-bg-elev-2) !important;
  color: var(--cl-text);
  cursor: pointer;
}
.user-switcher__edit-actions button:disabled { opacity: 0.5; cursor: default; }
.user-switcher__edit-save { background: var(--cl-accent) !important; color: var(--cl-on-accent) !important; border-color: var(--cl-accent) !important; }
`
