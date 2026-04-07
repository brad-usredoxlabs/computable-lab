type RunWorkspaceTab = 'overview' | 'plan' | 'biology' | 'readouts' | 'results' | 'claims'

interface RunWorkspaceNavProps {
  activeTab: RunWorkspaceTab
  onTabChange: (tab: RunWorkspaceTab) => void
  counts: Record<'plan' | 'biology' | 'readouts' | 'results' | 'claims', string>
}

const TAB_LABELS = {
  overview: 'Overview',
  plan: 'Plan',
  biology: 'Biology',
  readouts: 'Readouts',
  results: 'Results',
  claims: 'Claims',
} as const

export function RunWorkspaceNav({ activeTab, onTabChange, counts }: RunWorkspaceNavProps) {
  return (
    <nav className="run-workspace-nav">
      {(Object.keys(TAB_LABELS) as Array<keyof typeof TAB_LABELS>).map((tab) => (
        <button
          key={tab}
          type="button"
          className={`run-workspace-nav__item ${activeTab === tab ? 'is-active' : ''}`}
          onClick={() => onTabChange(tab)}
        >
          <span>{TAB_LABELS[tab]}</span>
          {tab !== 'overview' && <small>{counts[tab]}</small>}
        </button>
      ))}
    </nav>
  )
}
