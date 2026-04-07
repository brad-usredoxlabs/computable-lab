import { Link, Outlet } from 'react-router-dom'
import { useServerMeta } from '../shared/hooks/useServerMeta'
import { RepoStatusBadge } from './settings/RepoStatusBadge'
import { AiPanelProvider } from '../shared/context/AiPanelContext'
import { AiChatPanel } from '../shared/ai/AiChatPanel'

export function Layout() {
  const { repoStatus, loading, error } = useServerMeta({ pollInterval: 60000 })

  return (
    <div className="layout">
      <header className="header">
        <nav className="nav">
          <Link to="/" className="nav-brand">Semantic ELN</Link>
          <Link to="/browser" className="nav-link">Records</Link>
          <Link to="/labware-editor?new=1" className="nav-link">Labware Editor</Link>
          <Link to="/formulations" className="nav-link">Formulations</Link>
          <Link to="/materials" className="nav-link">Materials</Link>
          <Link to="/component-library" className="nav-link">Component Library</Link>
          <Link to="/literature" className="nav-link">Literature</Link>
          <Link to="/ingestion" className="nav-link">Ingestion</Link>
          <Link to="/settings" className="nav-link">Settings</Link>
          <div className="nav-spacer" />
          <RepoStatusBadge status={repoStatus} loading={loading} error={error} />
        </nav>
      </header>
      <main className="main">
        <AiPanelProvider>
          <div className="main-content-area">
            <Outlet />
          </div>
          <AiChatPanel />
        </AiPanelProvider>
      </main>

      <style>{`
        .layout {
          height: 100vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .header {
          background: #f8f9fa;
          border-bottom: 1px solid #e9ecef;
          padding: 0 1rem;
          flex-shrink: 0;
        }
        .nav {
          display: flex;
          align-items: center;
          gap: 1rem;
          max-width: 1400px;
          margin: 0 auto;
          height: 48px;
        }
        .nav-brand {
          font-weight: 600;
          color: #228be6;
          text-decoration: none;
          margin-right: 1rem;
        }
        .nav-link {
          color: #495057;
          text-decoration: none;
          font-size: 0.9rem;
        }
        .nav-link:hover {
          color: #228be6;
        }
        .nav-spacer {
          flex: 1;
        }
        .main {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
          background: #f8f9fa;
        }
        .main-content-area {
          flex: 1;
          min-height: 0;
          overflow: auto;
        }
      `}</style>
    </div>
  )
}
