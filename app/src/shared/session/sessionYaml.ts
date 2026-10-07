/**
 * sessionYaml — the session document: one YAML string that rebuilds a whole
 * workspace (which tabs are open, which is active, each one's right-pane mode).
 *
 * It is the OpenTabsState shape serialized — ONE model, no parallel schema, no
 * prose parsing. Routes are NOT stored: `tabPath(tab)` (WorkspaceTabStrip)
 * derives them, so this module has no route table to drift.
 *
 * Example document (what an AI can utter):
 *
 *   version: 1
 *   activeTabId: run:RUN-2026-09-12
 *   tabs:
 *     - kind: project
 *       studyId: STU-DHVC
 *       title: DHVC
 *     - kind: run
 *       runId: RUN-2026-09-12
 *       title: 2026-09-12 Run
 *       activeRightPaneMode: protocol
 */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { BreadcrumbItem, WorkspaceRightPaneMode, WorkspaceTab } from '../../event-editor/workspace/types'
import { defaultRightPaneMode } from '../shell/OpenTabsContext'
import type { OpenTabState, OpenTabsState } from '../shell/OpenTabsContext'
import { stableTabId } from './tabId'

export interface SessionTabDoc {
  kind: string
  title?: string
  activeRightPaneMode?: WorkspaceRightPaneMode
  breadcrumb?: BreadcrumbItem[]
  /** Every other tab-kind field (runId, studyId, claimId, recordId, ...). */
  [field: string]: unknown
}

export interface SessionDocument {
  version: 1
  activeTabId?: string | null
  tabs: SessionTabDoc[]
}

/** Serialize the live session to the AI-emittable document. */
export function sessionToYaml(state: OpenTabsState): string {
  const doc: SessionDocument = {
    version: 1,
    activeTabId: state.activeTabId,
    tabs: state.tabs.map((entry) => {
      // The tab's `id` is a slot id (it can carry a freshness suffix), so it is
      // deliberately NOT part of the document — ids are re-derived on load.
      const { id: _slotId, ...rest } = entry.tab as WorkspaceTab & Record<string, unknown>
      const tab: SessionTabDoc = { ...rest, kind: entry.tab.kind }
      if (entry.activeRightPaneMode) tab.activeRightPaneMode = entry.activeRightPaneMode
      if (entry.breadcrumb.length > 0) tab.breadcrumb = entry.breadcrumb
      return tab
    }),
  }
  return stringifyYaml(doc)
}

/**
 * Validate a plain VALUE into a SessionDocument (throws on malformed input).
 *
 * Extracted from sessionFromYaml so the drafts accept body — a JSON OBJECT
 * response, not YAML — shares the exact same rules without a
 * stringify→re-parse round-trip. validate ≠ rebuild: no slot-id minting and
 * no PROTO-AI-14 F3 dedupe here; those stay in sessionDocumentToState.
 *
 * The `tabs` array is COPIED (shallow) so a caller-held parsed value can never
 * alias into the live tab store.
 */
export function sessionDocumentFromValue(value: unknown): SessionDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('session document must be a mapping')
  }
  const doc = value as Partial<SessionDocument>
  if (doc.version !== 1) throw new Error('session document version must be 1')
  if (!Array.isArray(doc.tabs)) throw new Error('session document must have a tabs array')
  for (const [i, tab] of doc.tabs.entries()) {
    if (!tab || typeof tab !== 'object' || typeof (tab as SessionTabDoc).kind !== 'string') {
      throw new Error(`session tab ${i} must have a kind`)
    }
  }
  return { version: 1, activeTabId: doc.activeTabId ?? null, tabs: [...doc.tabs] }
}

/** Parse + validate a session document from YAML (throws on malformed input). */
export function sessionFromYaml(yaml: string): SessionDocument {
  return sessionDocumentFromValue(parseYaml(yaml))
}

/**
 * Rebuild an OpenTabsState from a document, deriving each tab's slot id with the
 * caller-supplied id policy (stableTabId). Applying the same document twice is
 * idempotent because the ids are a pure function of the tab content.
 */
export function sessionDocumentToState(
  doc: SessionDocument,
  tabIdFor: (tab: WorkspaceTab) => string,
): OpenTabsState {
  // PROTO-AI-14 F3 — dedupe at the LOAD entry site, on the value-derived id.
  // The document deliberately carries no ids (see sessionToYaml above), so ids
  // are re-derived here; two document entries with the same tab VALUE therefore
  // collapse to the SAME id, and both landing in `tabs` is what makes
  // WorkspaceTabStrip's `key={tab.id}` hit React's duplicate-key warning. The
  // reducer's 'open' case already replaces a same-id tab (OpenTabsContext.tsx
  // ~136-168), so the loader follows the SAME convention: LAST-WINS — the later
  // duplicate replaces the earlier entry in place (keeping the earlier slot's
  // position), and the state can never hold two entries with one tab.id.
  const byId = new Map<string, OpenTabState>()
  for (const rawTab of doc.tabs) {
    const { activeRightPaneMode, breadcrumb, ...kindFields } = rawTab
    const tab = { ...kindFields, id: tabIdFor(kindFields as unknown as WorkspaceTab) } as WorkspaceTab
    byId.set(tab.id, {
      tab,
      activeRightPaneMode: activeRightPaneMode ?? defaultRightPaneMode(tab),
      breadcrumb: breadcrumb ?? [],
      contentHistory: [tab],
      contentCursor: 0,
    })
  }
  const tabs: OpenTabState[] = [...byId.values()]
  const activeTabId =
    doc.activeTabId && tabs.some((t) => t.tab.id === doc.activeTabId)
      ? doc.activeTabId
      : (tabs[tabs.length - 1]?.tab.id ?? null)
  const history = activeTabId ? [activeTabId] : []
  return { tabs, activeTabId, history, historyCursor: history.length - 1 }
}

/** Adopt a tab list straight from a server session row (no schema re-parse hop). */
export function sessionTabsToState(tabs: unknown[], activeTabId: string | null): OpenTabsState {
  return sessionDocumentToState({ version: 1, activeTabId, tabs: tabs as SessionTabDoc[] }, stableTabId)
}
