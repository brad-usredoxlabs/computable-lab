/**
 * SplashPage — new-tab landing surface. Fills the main window of a tab,
 * keeps GlobalNavbar + the tab strip above it (via AppShell workspace
 * layout), and provides breadcrumbs to steer the tab anywhere.
 */
import { useNavigate } from 'react-router-dom'
import { useOptionalOpenTabs } from './OpenTabsContext'
import {
  runTabId, collectionTabId,
} from '../../event-editor/workspace/types'
import { quickCreateRun } from '../../event-editor/create/quickCreateRun'
import { SCRATCH_STUDY_ID } from '../../event-editor/legacyRouteResolution'
import './SplashPage.css'

const COLLECTIONS = [
  { id: 'projects', label: 'Projects' },
  { id: 'runs', label: 'Runs' },
  { id: 'lab', label: 'Lab' },
  { id: 'claims', label: 'Claims' },
] as const

export function SplashPage() {
  const navigate = useNavigate()
  const openTabs = useOptionalOpenTabs()

  const handleNewRun = async () => {
    try {
      const { recordId } = await quickCreateRun({ studyId: SCRATCH_STUDY_ID })
      openTabs?.openTab({
        id: runTabId(recordId), kind: 'run', runId: recordId, title: 'New Run',
      }, true)
      navigate(`/runs/${recordId}`)
    } catch (err) {
      console.error('Failed to create run:', err)
    }
  }

  const handleNewProject = () => navigate('/create/study')

  return (
    <div className="splash-page" data-testid="splash-page">
      <div className="splash-page__hero">
        <h1 className="splash-page__title">What do you want to open?</h1>
        <input
          className="splash-page__search"
          data-testid="splash-search"
          placeholder="Search everything…"
          type="text"
          autoFocus
          onChange={() => {}}
        />
      </div>

      <section className="splash-page__section">
        <h2 className="splash-page__section-title">Browse a type</h2>
        <div className="splash-page__chips">
          {(['protocols','materials','labware','equipment','people','documents'] as const)
            .map((cat) => (
              <button key={cat} type="button" className="splash-page__chip"
                data-testid={`splash-type-${cat}`}
                onClick={() => navigate(`/lab/${cat}`)}>
                {cat}
              </button>
            ))}
        </div>
      </section>

      <section className="splash-page__section">
        <h2 className="splash-page__section-title">Collections</h2>
        <div className="splash-page__chips">
          {COLLECTIONS.map((col) => (
            <button key={col.id} type="button" className="splash-page__chip"
              data-testid={`splash-nav-${col.id}`}
              onClick={() => {
                openTabs?.openTab({
                  id: collectionTabId(col.id), kind: 'collection',
                  collection: col.id, title: col.label,
                }, true)
                navigate(`/${col.id}`)
              }}>
              {col.label}
            </button>
          ))}
        </div>
      </section>

      <section className="splash-page__section" data-testid="splash-recent">
        <h2 className="splash-page__section-title">Recent</h2>
        <p className="splash-page__hint">Recently viewed items will appear here.</p>
      </section>

      <section className="splash-page__section">
        <h2 className="splash-page__section-title">Create</h2>
        <div className="splash-page__create-actions">
          <button type="button" className="splash-page__create-btn splash-page__create-btn--primary"
            data-testid="splash-new-run" onClick={handleNewRun}>
            + New Run
          </button>
          <button type="button" className="splash-page__create-btn"
            data-testid="splash-new-project" onClick={handleNewProject}>
            + New Project
          </button>
        </div>
      </section>
    </div>
  )
}
