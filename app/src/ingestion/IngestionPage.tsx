/**
 * IngestionPage — top-level destination for external-document acquisition
 * workflows. Hosts tabbed ingestion surfaces (Vendor PDFs, Literature) that
 * bring documents and their extracted content into the lab as first-class
 * objects, mirroring the /lab tabbed category structure.
 *
 * The Literature tab mounts the bio-source explorer (PubMed / Europe PMC /
 * UniProt / … search → "Extract Knowledge" → claim/assertion/evidence
 * preview), the same surface as /literature?view=explore. It replaces the
 * former dead "PubMed — coming soon" placeholder.
 */

import { lazy, Suspense } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AppShell } from '../shared/shell'
import { WorkspaceTabStrip } from '../shared/shell/WorkspaceTabStrip'
import { VendorPdfWorkflowTab } from './VendorPdfWorkflowTab'
import { SequenceImport } from '../sequences/SequenceImport'
import '../sequences/SequencesPage.css'
import './IngestionPage.css'

const LiteratureExplorer = lazy(() =>
  import('../knowledge/LiteratureExplorer').then((m) => ({ default: m.LiteratureExplorer })),
)

const SequenceSearch = lazy(() =>
  import('../sequences/SequenceSearch').then((m) => ({ default: m.SequenceSearch })),
)

type IngestionTab = 'vendor-pdf' | 'literature' | 'sequences' | 'oligo-orders'

const TABS: { id: IngestionTab; label: string }[] = [
  { id: 'vendor-pdf', label: 'Documents' },
  { id: 'literature', label: 'Literature' },
  { id: 'sequences', label: 'Sequences' },
  { id: 'oligo-orders', label: 'Primer / probe orders' },
]

export function IngestionPage() {
  const { tab: tabParam } = useParams<{ tab?: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const active = (TABS.find((t) => t.id === tabParam) ?? TABS[0]).id
  /**
   * A journey door lands here with `?prefillName=<the person's noun>`
   * (L2-NOUN-CREATION-JOURNEY-1, D1). The candidate is read from the URL, so a
   * RELOAD of the door URL still shows it — it is the person's own words, not
   * a created object, and nothing is ingested by showing it.
   */
  const candidate = (searchParams.get('prefillName') ?? '').trim()

  return (
    <AppShell
      brand="Ingestion"
      layout="workspace"
      topbarTabs={<WorkspaceTabStrip />}
      leftPane={
        <div className="ingestion-page" data-testid="ingestion-page">
          <header className="ingestion-page__header">
            <h1 className="ingestion-page__title">Ingestion</h1>
            <p className="ingestion-page__subtitle">
              Bring external documents in as first-class lab objects for extraction.
            </p>
          </header>

          {candidate.length > 0 ? (
            <p className="ingestion-page__candidate" data-testid="ingestion-candidate">
              Candidate for creation:{' '}
              <strong className="ingestion-page__candidate-name" data-testid="ingestion-candidate-name">
                {candidate}
              </strong>
            </p>
          ) : null}

          <nav className="ingestion-page__tabs" role="navigation">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={
                  t.id === active
                    ? 'ingestion-page__tab ingestion-page__tab--active'
                    : 'ingestion-page__tab'
                }
                data-testid={`ingestion-tab-${t.id}`}
                onClick={() => navigate(`/ingestion/${t.id}`)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="ingestion-page__body" data-testid={`ingestion-body-${active}`}>
            {active === 'oligo-orders' ? <SequenceImport orderOnly /> : active === 'vendor-pdf' ? (
              <VendorPdfWorkflowTab />
            ) : active === 'sequences' ? (
              <Suspense fallback={<p className="ingestion-page__loading">Loading sequences…</p>}>
                <SequenceSearch />
              </Suspense>
            ) : (
              <Suspense fallback={<p className="ingestion-page__loading">Loading literature…</p>}>
                <LiteratureExplorer />
              </Suspense>
            )}
          </div>
        </div>
      }
    />
  )
}
