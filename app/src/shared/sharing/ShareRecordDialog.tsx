/**
 * ShareRecordDialog — view/edit a record's access policy.
 *
 * Editable when the record is a policy-root kind (study/experiment/run/
 * planned-run) AND the current user can admin it. Otherwise read-only:
 * children show the inherited policy; non-admins see it without controls.
 * Reads/writes via the /api/records/:id/access-policy convenience endpoints.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  apiClient,
  type AccessGrant,
  type AccessPolicyResponse,
  type AccessRole,
  type GroupSummary,
  type UserSummary,
  type Visibility,
} from '../api/client'

const ROLES: AccessRole[] = ['owner', 'admin', 'editor', 'operator', 'qa', 'viewer']
const VISIBILITIES: Visibility[] = ['private', 'shared', 'public']
const VISIBILITY_HELP: Record<Visibility, string> = {
  private: 'Only the owner and explicitly-granted users/groups can access.',
  shared: 'Owner + everyone listed in the grants below.',
  public: 'Anyone can read; writes still require a grant.',
}

interface Props {
  recordId: string
  onClose: () => void
}

export function ShareRecordDialog({ recordId, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [policy, setPolicy] = useState<AccessPolicyResponse | null>(null)
  const [users, setUsers] = useState<UserSummary[]>([])
  const [groups, setGroups] = useState<GroupSummary[]>([])

  // Editable working copy (only used when editable).
  const [visibility, setVisibility] = useState<Visibility>('private')
  const [grants, setGrants] = useState<AccessGrant[]>([])
  const [newType, setNewType] = useState<'user' | 'group'>('user')
  const [newPrincipal, setNewPrincipal] = useState<string>('')
  const [newRole, setNewRole] = useState<AccessRole>('viewer')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [p, u, g] = await Promise.all([
        apiClient.getAccessPolicy(recordId),
        apiClient.listUsers(),
        apiClient.listGroups(),
      ])
      setPolicy(p)
      setUsers(u)
      setGroups(g)
      const seed = p.direct ?? p.effective
      setVisibility(seed?.visibility ?? 'private')
      setGrants(seed?.grants ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [recordId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const editable = Boolean(policy?.isPolicyRoot && policy?.canAdmin)

  const principalLabel = useCallback(
    (g: AccessGrant): string => {
      if (g.principalType === 'user') {
        const u = users.find((x) => x.recordId === g.principalId)
        return u?.displayName ?? u?.username ?? g.principalId
      }
      const grp = groups.find((x) => x.recordId === g.principalId)
      return grp?.displayName ?? grp?.name ?? g.principalId
    },
    [users, groups],
  )

  const addGrant = () => {
    if (!newPrincipal) return
    if (grants.some((x) => x.principalType === newType && x.principalId === newPrincipal && x.role === newRole)) return
    setGrants((prev) => [...prev, { principalType: newType, principalId: newPrincipal, role: newRole }])
    setNewPrincipal('')
  }

  const removeGrant = (idx: number) => setGrants((prev) => prev.filter((_, i) => i !== idx))

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await apiClient.putAccessPolicy(recordId, { visibility, grants })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const principalOptions = newType === 'user' ? users : groups

  return (
    <div
      className="share-dialog__backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="share-dialog" role="dialog" aria-modal="true" aria-label={`Sharing for ${recordId}`}>
        <header className="share-dialog__header">
          <h2>Sharing</h2>
          <span className="share-dialog__rid">{recordId}</span>
          <button type="button" className="share-dialog__close" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="share-dialog__body">
          {loading ? (
            <p className="share-dialog__muted">Loading…</p>
          ) : error ? (
            <p className="share-dialog__error">{error}</p>
          ) : !policy ? (
            <p className="share-dialog__muted">No policy information.</p>
          ) : (
            <>
              {!policy.isPolicyRoot ? (
                <p className="share-dialog__note">
                  Sharing is managed on the parent study/experiment/run. This record{' '}
                  {policy.effective ? 'inherits the policy shown below (read-only).' : 'has no policy (open to everyone with access).'}
                </p>
              ) : !policy.canAdmin ? (
                <p className="share-dialog__note">You don’t have permission to change sharing for this record.</p>
              ) : policy.effective == null && policy.direct == null ? (
                <p className="share-dialog__note">Not shared yet — open to everyone with access. Choose a visibility to create a policy.</p>
              ) : null}

              <div className="share-dialog__row">
                <span className="share-dialog__label">Owner</span>
                <span>{(policy.direct ?? policy.effective)?.ownerUserId ?? '—'}</span>
              </div>

              <div className="share-dialog__row">
                <span className="share-dialog__label">Visibility</span>
                {editable ? (
                  <select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
                    {VISIBILITIES.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                ) : (
                  <span>{(policy.direct ?? policy.effective)?.visibility ?? 'open'}{policy.inherited ? ' (inherited)' : ''}</span>
                )}
              </div>
              {editable ? <p className="share-dialog__help">{VISIBILITY_HELP[visibility]}</p> : null}

              <div className="share-dialog__grants">
                <span className="share-dialog__label">Access grants</span>
                {(editable ? grants : (policy.direct ?? policy.effective)?.grants ?? []).length === 0 ? (
                  <p className="share-dialog__muted">No additional grants.</p>
                ) : (
                  <ul className="share-dialog__grant-list">
                    {(editable ? grants : (policy.direct ?? policy.effective)?.grants ?? []).map((g, idx) => (
                      <li key={`${g.principalType}:${g.principalId}:${g.role}`}>
                        <span className="share-dialog__grant-icon" aria-hidden>{g.principalType === 'group' ? '👥' : '👤'}</span>
                        <span className="share-dialog__grant-name">{principalLabel(g)}</span>
                        <span className="share-dialog__grant-role">{g.role}</span>
                        {editable ? (
                          <button type="button" className="share-dialog__grant-remove" onClick={() => removeGrant(idx)} aria-label="Remove">✕</button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}

                {editable ? (
                  <div className="share-dialog__add">
                    <select value={newType} onChange={(e) => { setNewType(e.target.value as 'user' | 'group'); setNewPrincipal('') }}>
                      <option value="user">User</option>
                      <option value="group">Group</option>
                    </select>
                    <select value={newPrincipal} onChange={(e) => setNewPrincipal(e.target.value)}>
                      <option value="">Select {newType}…</option>
                      {principalOptions.map((p) => (
                        <option key={p.recordId} value={p.recordId}>
                          {('displayName' in p && p.displayName) || ('username' in p && (p as UserSummary).username) || ('name' in p && (p as GroupSummary).name) || p.recordId}
                        </option>
                      ))}
                    </select>
                    <select value={newRole} onChange={(e) => setNewRole(e.target.value as AccessRole)}>
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button type="button" onClick={addGrant} disabled={!newPrincipal}>Add</button>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>

        <footer className="share-dialog__footer">
          {editable ? (
            <button type="button" className="share-dialog__save" onClick={() => void save()} disabled={saving || loading}>
              {saving ? 'Saving…' : 'Save sharing'}
            </button>
          ) : null}
          <button type="button" className="share-dialog__cancel" onClick={onClose}>Close</button>
        </footer>
        <style>{shareDialogStyles}</style>
      </div>
    </div>
  )
}

const shareDialogStyles = `
.share-dialog__backdrop {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.share-dialog {
  background: var(--cl-bg-elev); color: var(--cl-text);
  border: 1px solid var(--cl-border); border-radius: 8px;
  width: min(560px, 96vw); max-height: 88vh; display: flex; flex-direction: column;
  box-shadow: 0 16px 48px rgba(0,0,0,0.4);
}
.share-dialog__header {
  display: flex; align-items: baseline; gap: 10px;
  padding: 12px 16px; border-bottom: 1px solid var(--cl-border);
}
.share-dialog__header h2 { margin: 0; font-size: 1rem; }
.share-dialog__rid { font-size: 0.75rem; color: var(--cl-text-faint); font-family: var(--cl-font-mono, monospace); }
.share-dialog__close { margin-left: auto; background: transparent; border: 1px solid var(--cl-border); color: var(--cl-text-dim); border-radius: 4px; width: 26px; height: 26px; cursor: pointer; }
.share-dialog__body { padding: 14px 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.share-dialog__row { display: flex; align-items: center; gap: 10px; }
.share-dialog__label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--cl-text-faint); min-width: 84px; }
.share-dialog__help { margin: -6px 0 0 94px; font-size: 0.75rem; color: var(--cl-text-faint); }
.share-dialog__note { margin: 0; font-size: 0.82rem; color: var(--cl-text-dim); background: var(--cl-bg-elev-2); border: 1px solid var(--cl-border); border-radius: 6px; padding: 8px 10px; }
.share-dialog__muted { margin: 0; color: var(--cl-text-faint); font-size: 0.85rem; }
.share-dialog__error { margin: 0; color: var(--cl-danger); font-size: 0.85rem; }
.share-dialog__grants { display: flex; flex-direction: column; gap: 8px; }
.share-dialog__grant-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.share-dialog__grant-list li { display: flex; align-items: center; gap: 8px; border: 1px solid var(--cl-border); border-radius: 6px; padding: 5px 8px; }
.share-dialog__grant-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.share-dialog__grant-role { font-size: 0.72rem; color: var(--cl-accent); }
.share-dialog__grant-remove { background: transparent; border: none; color: var(--cl-text-faint); cursor: pointer; }
.share-dialog__add { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.share-dialog__add select, .share-dialog__row select { font: inherit; background: var(--cl-bg-elev-2); color: var(--cl-text); border: 1px solid var(--cl-border); border-radius: 4px; padding: 4px 6px; }
.share-dialog__footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--cl-border); }
.share-dialog__save { background: var(--cl-accent); color: var(--cl-on-accent); border: none; border-radius: 6px; padding: 6px 14px; cursor: pointer; font: inherit; }
.share-dialog__save:disabled { opacity: 0.6; cursor: default; }
.share-dialog__cancel { background: transparent; color: var(--cl-text); border: 1px solid var(--cl-border); border-radius: 6px; padding: 6px 14px; cursor: pointer; font: inherit; }
`
