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
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../shared/shell'
import { WorkspaceTabStrip } from '../shared/shell/WorkspaceTabStrip'
import { VendorPdfWorkflowTab } from './VendorPdfWorkflowTab'
import './IngestionPage.css'

const LiteratureExplorer = lazy(() =>
  import('../knowledge/LiteratureExplorer').then((m) => ({ default: m.LiteratureExplorer })),
)

type IngestionTab = 'vendor-pdf' | 'literature'

const TABS: { id: IngestionTab; label: string }[] = [
  { id: 'vendor-pdf', label: 'Vendor PDFs' },
  { id: 'literature', label: 'Literature' },
]

export function IngestionPage() {
  const { tab: tabParam } = useParams<{ tab?: string }>()
  const navigate = useNavigate()
  const active = (TABS.find((t) => t.id === tabParam) ?? TABS[0]).id

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
            {active === 'vendor-pdf' ? (
              <VendorPdfWorkflowTab />
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
