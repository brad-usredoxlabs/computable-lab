/**
 * GroupMembershipSection — Settings panel to view/manage collaboration groups.
 *
 * Groups are records (GRP-*) used by access policies. This section lists all
 * groups (flagging the ones you belong to), creates new groups, and adds/
 * removes members. Mutations go through the /api/groups convenience endpoints
 * and refetch on success (groups are records, not config — no single "Save").
 */

import { useCallback, useEffect, useState } from 'react'
import { apiClient, type GroupSummary, type UserSummary } from '../../shared/api/client'
import { useCurrentUser } from '../../shared/identity/CurrentUserProvider'

export function GroupMembershipSection() {
  const { groups: myGroups } = useCurrentUser()
  const [groups, setGroups] = useState<GroupSummary[]>([])
  const [users, setUsers] = useState<UserSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [g, u] = await Promise.all([apiClient.listGroups(), apiClient.listUsers()])
      setGroups(g)
      setUsers(u)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const myGroupIds = new Set(myGroups.map((g) => g.recordId))

  const userLabel = useCallback(
    (id: string) => {
      const u = users.find((x) => x.recordId === id)
      return u?.displayName ?? u?.username ?? id
    },
    [users],
  )

  const createGroup = async () => {
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    setError(null)
    try {
      await apiClient.createGroup({ name, displayName: name })
      setNewName('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const addMember = async (groupId: string, principalType: 'user' | 'group', principalId: string) => {
    setBusy(true)
    setError(null)
    try {
      await apiClient.addGroupMember(groupId, { principalType, principalId })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const removeMember = async (groupId: string, principalId: string) => {
    setBusy(true)
    setError(null)
    try {
      await apiClient.removeGroupMember(groupId, principalId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-section">
      <div className="settings-section__header">
        <h2>Groups</h2>
      </div>
      <div className="settings-section__content">
        {error ? <p className="groups__error">{error}</p> : null}
        {loading ? (
          <p className="groups__muted">Loading…</p>
        ) : (
          <>
            <div className="groups__create">
              <input
                type="text"
                value={newName}
                placeholder="New group name…"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void createGroup()
                }}
              />
              <button type="button" onClick={() => void createGroup()} disabled={busy || !newName.trim()}>
                Create group
              </button>
            </div>

            {groups.length === 0 ? (
              <p className="groups__muted">No groups yet.</p>
            ) : (
              <ul className="groups__list">
                {groups.map((g) => (
                  <GroupCard
                    key={g.recordId}
                    group={g}
                    users={users}
                    allGroups={groups}
                    mine={myGroupIds.has(g.recordId)}
                    busy={busy}
                    userLabel={userLabel}
                    onAddMember={addMember}
                    onRemoveMember={removeMember}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <style>{groupStyles}</style>
    </div>
  )
}

function GroupCard({
  group,
  users,
  allGroups,
  mine,
  busy,
  userLabel,
  onAddMember,
  onRemoveMember,
}: {
  group: GroupSummary
  users: UserSummary[]
  allGroups: GroupSummary[]
  mine: boolean
  busy: boolean
  userLabel: (id: string) => string
  onAddMember: (groupId: string, principalType: 'user' | 'group', principalId: string) => void
  onRemoveMember: (groupId: string, principalId: string) => void
}) {
  const [addType, setAddType] = useState<'user' | 'group'>('user')
  const [addId, setAddId] = useState('')

  const options =
    addType === 'user'
      ? users.map((u) => ({ id: u.recordId, label: u.displayName ?? u.username ?? u.recordId }))
      : allGroups
          .filter((g) => g.recordId !== group.recordId)
          .map((g) => ({ id: g.recordId, label: g.displayName ?? g.name ?? g.recordId }))

  return (
    <li className="groups__card">
      <div className="groups__card-head">
        <span className="groups__name">{group.displayName ?? group.name ?? group.recordId}</span>
        {mine ? <span className="groups__mine">member</span> : null}
        <span className="groups__rid">{group.recordId}</span>
      </div>

      {group.memberUserIds.length === 0 && group.memberGroupIds.length === 0 ? (
        <p className="groups__muted">No members.</p>
      ) : (
        <ul className="groups__members">
          {group.memberUserIds.map((id) => (
            <li key={id}>
              <span aria-hidden>👤</span> {userLabel(id)}
              <button type="button" disabled={busy} onClick={() => onRemoveMember(group.recordId, id)} aria-label="Remove">✕</button>
            </li>
          ))}
          {group.memberGroupIds.map((id) => (
            <li key={id}>
              <span aria-hidden>👥</span> {id}
              <button type="button" disabled={busy} onClick={() => onRemoveMember(group.recordId, id)} aria-label="Remove">✕</button>
            </li>
          ))}
        </ul>
      )}

      <div className="groups__add">
        <select value={addType} onChange={(e) => { setAddType(e.target.value as 'user' | 'group'); setAddId('') }}>
          <option value="user">User</option>
          <option value="group">Group</option>
        </select>
        <select value={addId} onChange={(e) => setAddId(e.target.value)}>
          <option value="">Add {addType}…</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <button
          type="button"
          disabled={busy || !addId}
          onClick={() => {
            if (!addId) return
            onAddMember(group.recordId, addType, addId)
            setAddId('')
          }}
        >
          Add
        </button>
      </div>
    </li>
  )
}

const groupStyles = `
.groups__error { color: var(--cl-danger); font-size: 0.85rem; margin: 0 0 8px; }
.groups__muted { color: var(--cl-text-faint); font-size: 0.85rem; margin: 4px 0; }
.groups__create { display: flex; gap: 6px; margin-bottom: 12px; }
.groups__create input { flex: 1; font: inherit; background: var(--cl-bg-elev-2); color: var(--cl-text); border: 1px solid var(--cl-border); border-radius: 4px; padding: 5px 8px; }
.groups__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.groups__card { border: 1px solid var(--cl-border); border-radius: 6px; padding: 10px 12px; }
.groups__card-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
.groups__name { font-weight: 600; }
.groups__mine { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--cl-accent); border: 1px solid var(--cl-accent); border-radius: 999px; padding: 0 6px; }
.groups__rid { margin-left: auto; font-size: 0.72rem; color: var(--cl-text-faint); font-family: var(--cl-font-mono, monospace); }
.groups__members { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.groups__members li { display: flex; align-items: center; gap: 6px; font-size: 0.85rem; }
.groups__members li button { margin-left: auto; background: transparent; border: none; color: var(--cl-text-faint); cursor: pointer; }
.groups__add { display: flex; gap: 6px; align-items: center; }
.groups__add select { font: inherit; background: var(--cl-bg-elev-2); color: var(--cl-text); border: 1px solid var(--cl-border); border-radius: 4px; padding: 4px 6px; }
.groups__create button, .groups__add button { font: inherit; background: var(--cl-bg-elev-2); color: var(--cl-text); border: 1px solid var(--cl-border); border-radius: 4px; padding: 5px 10px; cursor: pointer; }
.groups__create button:disabled, .groups__add button:disabled { opacity: 0.5; cursor: default; }
`
