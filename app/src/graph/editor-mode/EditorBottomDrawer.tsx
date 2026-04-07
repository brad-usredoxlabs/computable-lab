import type { ReactNode } from 'react'

export interface EditorBottomDrawerTab {
  id: string
  label: string
  content: ReactNode
}

interface EditorBottomDrawerProps {
  open: boolean
  tabs: EditorBottomDrawerTab[]
  activeTab: string
  onTabChange: (tabId: string) => void
  onToggleOpen: () => void
}

export function EditorBottomDrawer({
  open,
  tabs,
  activeTab,
  onTabChange,
  onToggleOpen,
}: EditorBottomDrawerProps) {
  const currentTab = tabs.find((tab) => tab.id === activeTab) ?? tabs[0] ?? null
  if (!currentTab) return null

  return (
    <div className={`editor-bottom-drawer ${open ? 'is-open' : ''}`}>
      <div className="editor-bottom-drawer__header">
        <div className="editor-bottom-drawer__tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`editor-bottom-drawer__tab ${tab.id === currentTab.id ? 'is-active' : ''}`}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button type="button" className="editor-bottom-drawer__toggle" onClick={onToggleOpen}>
          {open ? 'Hide Drawer' : 'Show Drawer'}
        </button>
      </div>

      {open ? (
        <>
          <div className="editor-bottom-drawer__content">{currentTab.content}</div>
          <div className="editor-bottom-drawer__tail-spacer" aria-hidden="true" />
        </>
      ) : null}

      <style>{`
        .editor-bottom-drawer {
          margin-top: 1rem;
          border: 1px solid #d8dee4;
          border-radius: 16px;
          background: #ffffff;
          overflow: hidden;
        }

        .editor-bottom-drawer__header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem 1rem;
          background: #f6f8fa;
          border-bottom: 1px solid #d8dee4;
          flex-wrap: wrap;
        }

        .editor-bottom-drawer__tabs {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .editor-bottom-drawer__tab,
        .editor-bottom-drawer__toggle {
          border: 1px solid #d0d7de;
          background: #ffffff;
          color: #24292f;
          font-size: 0.82rem;
          font-weight: 600;
          border-radius: 999px;
          padding: 0.4rem 0.8rem;
          cursor: pointer;
        }

        .editor-bottom-drawer__tab.is-active {
          background: #0969da;
          border-color: #0969da;
          color: #ffffff;
        }

        .editor-bottom-drawer__content {
          padding: 1rem;
          min-height: clamp(32rem, 52vh, 48rem);
        }

        .editor-bottom-drawer__tail-spacer {
          height: clamp(20rem, 36vh, 30rem);
          background: linear-gradient(180deg, rgba(246, 248, 250, 0) 0%, #f6f8fa 100%);
        }
      `}</style>
    </div>
  )
}
