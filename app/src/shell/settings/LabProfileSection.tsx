/**
 * LabProfileSection — read-only display of the declarative lab identity
 * ("THIS lab"): label, namespace, ontology CURIE prefix, and chips for the
 * instruments / protocols / reagents this lab owns. Grounds the AI resident
 * context & corpus; the namespace is edited in the Namespace section.
 */
import { useEffect, useState } from 'react'
import { apiClient } from '../../shared/api/client'
import type { LabProfile, LabRefEntry } from '../../types/labProfile'

function Chip({ entry }: { entry: LabRefEntry }) {
  return (
    <span className="chip" title={`${entry.ref.type}:${entry.ref.id}`}>
      {entry.label}
    </span>
  )
}

export function LabProfileSection() {
  const [profile, setProfile] = useState<LabProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await apiClient.getLabProfile()
        if (!cancelled) setProfile(res.profile)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load lab profile')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="settings-section" data-testid="lab-profile-section">
      <div className="settings-section__header">
        <h2>Lab Profile</h2>
      </div>
      <div className="settings-section__content">
        {loading ? (
          <div className="info-row"><span className="info-row__value">Loading...</span></div>
        ) : error ? (
          <div className="info-row">
            <span className="info-row__value" style={{ color: '#c92a2a' }}>{error}</span>
          </div>
        ) : profile ? (
          <>
            <div className="info-row" data-testid="lab-profile-label">
              <span className="info-row__label">Label</span>
              <span className="info-row__value">{profile.profile.label}</span>
            </div>
            <div className="info-row">
              <span className="info-row__label">Base URI</span>
              <span className="info-row__value info-row__value--mono">{profile.profile.namespace.baseUri}</span>
            </div>
            <div className="info-row">
              <span className="info-row__label">Prefix</span>
              <span className="info-row__value info-row__value--mono">{profile.profile.namespace.prefix}</span>
            </div>
            <div className="info-row">
              <span className="info-row__label">Ontology prefix</span>
              <span className="info-row__value info-row__value--mono">{profile.profile.ontologyNamespace}</span>
            </div>
            <InfoChips label="Instruments" entries={profile.profile.instruments} />
            <InfoChips label="Protocols" entries={profile.profile.protocols} />
            <InfoChips label="Reagents" entries={profile.profile.reagents} />
          </>
        ) : (
          <div className="info-row"><span className="info-row__value">Not configured</span></div>
        )}
      </div>
      <style>{`
        .chip {
          display: inline-block;
          background: #e7f5ff;
          color: #1864ab;
          border: 1px solid #d0ebff;
          border-radius: 9999px;
          padding: 0.125rem 0.6rem;
          margin: 0.15rem 0.25rem 0.15rem 0;
          font-size: 0.75rem;
          max-width: 260px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
    </div>
  )
}

function InfoChips({ label, entries }: { label: string; entries: LabRefEntry[] }) {
  return (
    <div className="info-row">
      <span className="info-row__label">{label}</span>
      <span className="info-row__value" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {entries.length === 0 ? '—' : entries.map((e) => <Chip key={e.ref.id} entry={e} />)}
      </span>
    </div>
  )
}