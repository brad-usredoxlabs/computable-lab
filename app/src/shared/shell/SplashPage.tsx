/**
 * SplashPage — new-tab landing surface. Fills the main window of a tab,
 * keeps GlobalNavbar + the tab strip above it (via AppShell workspace
 * layout), and provides breadcrumbs to steer the tab anywhere.
 */
import { useNavigate } from 'react-router-dom'
import { useOptionalOpenTabs } from './OpenTabsContext'
import {
  projectTabId, runTabId, claimTabId, labEntityTabId, collectionTabId,
  type WorkspaceTab,
} from '../../event-editor/workspace/types'
import { quickCreateRun } from '../../event-editor/create/quickCreateRun'
import { SCRATCH_STUDY_ID } from '../../event-editor/legacyRouteResolution'
import { loadRecentItems, groupRecentByType } from './recentStore'
import type { RecentItem } from './recentStore'
import { KIND_TO_LAB_CATEGORY } from '../lib/kindMeta'
import { openContent } from '../lib/openContent'
import { SplashSearch } from './SplashSearch'
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

  const openEntity = (tab: WorkspaceTab, path: string) => {
    openContent(openTabs, navigate, tab, path)
  }

  const recent = groupRecentByType(loadRecentItems())

  const openRecent = (item: RecentItem) => {
    if (item.entityType === 'project') {
      openEntity({ id: projectTabId(item.recordId), kind: 'project', studyId: item.recordId, title: item.title }, `/project/${item.recordId}`)
    } else if (item.entityType === 'run') {
      openEntity({ id: runTabId(item.recordId), kind: 'run', runId: item.recordId, title: item.title }, `/runs/${item.recordId}`)
    } else if (item.entityType === 'claim') {
      openEntity({ id: claimTabId(item.recordId), kind: 'claim', claimId: item.recordId, title: item.title }, `/claims/${item.recordId}`)
    } else {
      const cat = KIND_TO_LAB_CATEGORY[item.kind]
      openEntity({ id: labEntityTabId(item.recordId), kind: 'lab-entity', schemaId: '', recordId: item.recordId, entityType: item.kind, title: item.title }, cat ? `/lab/${cat}/${item.recordId}` : `/lab/materials/${item.recordId}`)
    }
  }

  const handleNewRun = async () => {
    try {
      const { recordId } = await quickCreateRun({ studyId: SCRATCH_STUDY_ID })
      openContent(openTabs, navigate, {
        id: runTabId(recordId), kind: 'run', runId: recordId, title: 'New Run',
      }, `/runs/${recordId}`)
    } catch (err) {
      console.error('Failed to create run:', err)
    }
  }

  const handleNewProject = () => navigate('/create/study')

  return (
    <div className="splash-page" data-testid="splash-page">
      <div className="splash-page__hero">
        <h1 className="splash-page__title">What do you want to open?</h1>
        <SplashSearch />
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
                openContent(openTabs, navigate, {
                  id: collectionTabId(col.id), kind: 'collection',
                  collection: col.id, title: col.label,
                }, `/${col.id}`)
              }}>
              {col.label}
            </button>
          ))}
        </div>
      </section>

      <section className="splash-page__section" data-testid="splash-recent">
        <h2 className="splash-page__section-title">Recent</h2>
        {(['project', 'run', 'claim', 'lab'] as const).map((type) => {
          const items = recent[type] ?? []
          if (items.length === 0) return null
          const label =
            type === 'project' ? 'Recent Projects'
            : type === 'run' ? 'Recent Runs'
            : type === 'claim' ? 'Recent Claims'
            : 'Recent Lab Items'
          return (
            <div key={type} className="splash-page__recent-group">
              <h3 className="splash-page__recent-label">{label}</h3>
              <div className="splash-page__chips">
                {items.map((item) => (
                  <button key={item.recordId} type="button" className="splash-page__chip"
                    data-testid={`splash-recent-${item.recordId}`}
                    onClick={() => openRecent(item)}>
                    {item.title}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
        {Object.keys(recent).length === 0 ? (
          <p className="splash-page__hint">Recently viewed items will appear here.</p>
        ) : null}
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
