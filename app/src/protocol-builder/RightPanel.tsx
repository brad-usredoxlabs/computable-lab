/**
 * RightPanel — tabbed interface for the right side of the protocol builder page.
 *
 * Provides "Preview" and "Configure" tabs. Content is passed via the `children`
 * prop object so the parent can control what renders in each tab.
 */

import type { ReactNode } from 'react'
import './protocolBuilderPage.css'

type TabId = 'preview' | 'configure' | 'draft' | 'promote'

export interface RightPanelProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  children: { preview: ReactNode; configure: ReactNode; draft: ReactNode; promote: ReactNode }
}

export function RightPanel({ activeTab, onTabChange, children }: RightPanelProps) {
  const tabs: { id: TabId; label: string }[] = [
    { id: 'preview', label: 'Preview' },
    { id: 'configure', label: 'Configure' },
    { id: 'draft', label: 'Draft' },
    { id: 'promote', label: 'Promote' },
  ]

  return (
    <div className="protocol-builder-right-panel" data-testid="protocol-builder-right-panel">
      <div className="protocol-builder-right-panel__tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`protocol-builder-right-panel__tab${activeTab === tab.id ? ' protocol-builder-right-panel__tab--active' : ''}`}
            onClick={() => onTabChange(tab.id)}
            data-testid={`right-panel-tab-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="protocol-builder-right-panel__content">
        {children[activeTab] ?? children.preview}
      </div>
    </div>
  )
}
