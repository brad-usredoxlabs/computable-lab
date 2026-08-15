/**
 * IngestionPage — top-level destination for external-document acquisition
 * workflows. Hosts tabbed ingestion surfaces (Vendor PDFs, PubMed) that bring
 * documents into the lab as first-class objects, mirroring the /lab tabbed
 * category structure.
 *
 * Phase 3: navigation shell + tab routing. The Vendor PDFs and PubMed tabs
 * render placeholder bodies here; the actual workflow UI lands in later phases.
 */

import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../shared/shell'
import { WorkspaceTabStrip } from '../shared/shell/WorkspaceTabStrip'
import { VendorPdfWorkflowTab } from './VendorPdfWorkflowTab'
import './IngestionPage.css'

type IngestionTab = 'vendor-pdf' | 'pubmed'

const TABS: { id: IngestionTab; label: string }[] = [
  { id: 'vendor-pdf', label: 'Vendor PDFs' },
  { id: 'pubmed', label: 'PubMed' },
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
              <div className="ingestion-page__placeholder" data-testid="ingestion-pubmed-placeholder">
                <h2>PubMed</h2>
                <p>Ingest and extract from PubMed studies.</p>
                <p className="ingestion-page__note">Coming soon.</p>
              </div>
            )}
          </div>
        </div>
      }
    />
  )
}
