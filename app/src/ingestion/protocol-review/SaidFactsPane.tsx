/**
 * SaidFactsPane — the SAID, read-only (spec §3 W3, acceptance A1).
 *
 * The vendor-protocol-candidate is document truth: what the vendor PDF states
 * (sections, steps, tables, materials, equipment, labware) with the page anchor
 * each fact was extracted from. This pane renders those facts and NOTHING that
 * mutates them: the only controls are page-anchor jumps (onGotoPage), and a
 * jump is not a mutation. The SAID's immutability is server-backed by W2-5's
 * append-only wall (vendor-protocol-candidate is in appendOnlyKinds by merged
 * default, M3); this pane adds the UI-side half: zero editable controls.
 *
 * It degrades honestly: when no candidate record resolves for this artifact
 * (§0.8 join), it says so instead of guessing from the PDF.
 */
import type { SemanticDraftEnvelope } from './semanticDraft'

interface Anchor {
  pageStart?: number
  pageEnd?: number
  sectionId?: string
}

interface FactItem {
  id?: string
  label?: string
  title?: string
  sourceText?: string
  provenance?: Anchor
}

export interface SaidFactsPaneProps {
  /** The resolved vendor-protocol-candidate envelope, or null (the honest gap). */
  candidate: SemanticDraftEnvelope | null
  candidateRecordId?: string
  /** Jump the PDF/text pane to a page. A navigation, never a mutation. */
  onGotoPage: (pageNumber: number) => void
}

function items(payload: Record<string, unknown>, key: string): FactItem[] {
  const value = payload[key]
  return Array.isArray(value) ? (value as FactItem[]) : []
}

function anchorTitle(item: FactItem): string | undefined {
  const start = item.provenance?.pageStart
  const end = item.provenance?.pageEnd
  if (typeof start !== 'number') return undefined
  return end && end !== start ? `pages ${start}-${end}` : `page ${start}`
}

function FactList({
  heading,
  testid,
  items,
  onGotoPage,
}: {
  heading: string
  testid: string
  items: FactItem[]
  onGotoPage: (pageNumber: number) => void
}) {
  if (items.length === 0) return null
  return (
    <section className="said-facts__group" data-testid={testid}>
      <h4 className="said-facts__heading">{heading}</h4>
      <ul className="said-facts__list">
        {items.map((item, i) => {
          const label = item.label ?? item.title ?? item.sourceText ?? item.id ?? `item ${i + 1}`
          const page = item.provenance?.pageStart
          return (
            <li key={item.id ?? `${testid}-${i}`} className="said-facts__item">
              <span className="said-facts__label">{label}</span>
              {typeof page === 'number' ? (
                <button
                  type="button"
                  className="said-facts__anchor"
                  data-testid={`said-anchor-${item.id ?? `${testid}-${i}`}`}
                  title={`Jump to page ${page}`}
                  onClick={() => onGotoPage(page)}
                >
                  {anchorTitle(item) ?? `page ${page}`}
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function SaidFactsPane({ candidate, candidateRecordId, onGotoPage }: SaidFactsPaneProps) {
  if (!candidate) {
    return (
      <p className="said-facts__gap" data-testid="said-facts-gap">
        No vendor-protocol-candidate record resolves for this document yet — the SAID
        facts appear once the extraction candidate is stored. The PDF and its extracted
        text remain the document truth on this pane.
      </p>
    )
  }

  const payload = candidate.payload
  const title = typeof payload.title === 'string' ? payload.title : candidate.recordId
  const source = (payload.source ?? {}) as { filename?: string; pageCount?: number }

  return (
    <section className="said-facts" data-testid="said-facts" aria-label="SAID — vendor document truth (read-only)">
      <header className="said-facts__header">
        <h3 className="said-facts__title">{title}</h3>
        <p className="said-facts__meta">
          {candidateRecordId ?? candidate.recordId} · SAID (read-only document truth)
          {typeof source.pageCount === 'number' ? ` · ${source.pageCount} page(s)` : ''}
          {source.filename ? ` · ${source.filename}` : ''}
        </p>
      </header>

      <FactList heading="Sections" testid="said-facts-sections" items={items(payload, 'sections')} onGotoPage={onGotoPage} />
      <FactList heading="Steps" testid="said-facts-steps" items={items(payload, 'steps')} onGotoPage={onGotoPage} />
      <FactList heading="Tables" testid="said-facts-tables" items={items(payload, 'tables')} onGotoPage={onGotoPage} />
      <FactList heading="Materials" testid="said-facts-materials" items={items(payload, 'materials')} onGotoPage={onGotoPage} />
      <FactList heading="Equipment" testid="said-facts-equipment" items={items(payload, 'equipment')} onGotoPage={onGotoPage} />
      <FactList heading="Labware" testid="said-facts-labware" items={items(payload, 'labware')} onGotoPage={onGotoPage} />
    </section>
  )
}
