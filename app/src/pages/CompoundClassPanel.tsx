/**
 * L2-GC-PEAK-NAMING-1 (u4surface) — the /registry "Compounds" tab's list
 * (GC-BUNDLE r2 gate defect T2-3: the compound-class registry resolved only
 * through GET /ontology-terms/lookup and NO surface rendered it).
 *
 * One row per candidate: the registry's declared name, the controlled
 * compoundId, and the resolved ontology label. The label comes ONLY from
 * getOntologyTerm (the same lookup the GC peak-naming path uses) — an id that
 * fails lookup renders the literal marker `unresolved`: never a crash, never
 * a free-text invention. Reuses the page's existing row/badge classes
 * (RecordRegistryPage.css) — no new stylesheet.
 */
import { useEffect, useState } from 'react'
import { apiClient } from '../shared/api/client'

export interface CompoundClass {
  id: string
  name: string
  description?: string
  candidates: Array<{ compoundId: string; name: string; notes?: string }>
}

const UNRESOLVED = 'unresolved'

/** Resolve one controlled id through the ontology lookup; 404 or any failure
 *  -> null (the row shows the literal `unresolved` marker, never a crash). */
async function resolveLabel(compoundId: string): Promise<string | null> {
  try {
    const { term } = await apiClient.getOntologyTerm(compoundId)
    return term && typeof term.label === 'string' && term.label.length > 0 ? term.label : null
  } catch {
    return null
  }
}

/** One candidate row: declared name + compound id + resolved label. */
function CandidateRow({ candidate }: { candidate: CompoundClass['candidates'][number] }) {
  const [label, setLabel] = useState<string | null>(null)
  const [pending, setPending] = useState(true)

  useEffect(() => {
    let cancelled = false
    setPending(true)
    setLabel(null)
    void resolveLabel(candidate.compoundId).then((resolved) => {
      if (cancelled) return
      setLabel(resolved)
      setPending(false)
    })
    return () => { cancelled = true }
  }, [candidate.compoundId])

  return (
    <div className="registry-row" data-testid={`compound-candidate-${candidate.compoundId}`}>
      <div className="registry-row__title">{candidate.name}</div>
      <div className="registry-row__meta">
        <span className="registry-kind-badge">{candidate.compoundId}</span>
        <span data-testid="candidate-label" className="registry-kind-badge">
          {pending ? 'resolving' : (label ?? UNRESOLVED)}
        </span>
      </div>
    </div>
  )
}

/** The Compounds tab list: every compound class, each candidate resolved. */
export function CompoundClassPanel({ classes, loading }: { classes: CompoundClass[] | null; loading: boolean }) {
  if (loading) {
    return <div className="registry-list__empty" data-testid="compound-panel">Loading compound classes…</div>
  }
  if (!classes || classes.length === 0) {
    return <div className="registry-list__empty" data-testid="compound-panel">No compound classes registered</div>
  }
  return (
    <div className="registry-list__rows" data-testid="compound-panel">
      {classes.map((cls) => (
        <div key={cls.id} data-testid={`compound-class-${cls.id}`}>
          <div className="registry-row__title" data-testid="compound-class-name">{cls.name}</div>
          {cls.description ? (
            <div className="registry-list__empty" data-testid="compound-class-description">{cls.description}</div>
          ) : null}
          {cls.candidates.map((candidate) => (
            <CandidateRow key={candidate.compoundId} candidate={candidate} />
          ))}
        </div>
      ))}
    </div>
  )
}
