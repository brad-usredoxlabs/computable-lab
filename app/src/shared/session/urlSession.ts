/**
 * urlSession — the URL codec for the open workspace-tab strip
 * (cl:workspace-strip-binding).
 *
 * One query-param scheme for every surface:
 *   ws  — comma-separated strip of open tabs IN STRIP ORDER, each entry the
 *         STABLE id (stableTabId, slot suffix stripped)
 *   wsa — the ACTIVE tab's stable id
 *
 * It inverts sessionYaml.ts's choice deliberately: sessionYaml excludes ids and
 * re-derives them from a full document; the URL budget is far smaller, so the
 * IDS are the encoding and the tab fields are re-derived from them. Titles are
 * re-derived too — the host page's mount re-registration enriches the tab
 * exactly as a localStorage reload does today.
 *
 * Pure module: no router, no DOM beyond URLSearchParams. The provider above
 * BrowserRouter reads `window.location.search` through decodeWorkspaceParams;
 * the router-side writer (TabUrlSync) uses encodeWorkspaceParams.
 */
import type { WorkspaceTab } from '../../event-editor/workspace/types'
import { defaultRightPaneMode } from '../shell/OpenTabsContext'
import type { OpenTabState, OpenTabsState } from '../shell/OpenTabsContext'
import { stableTabId } from './tabId'

export const WS_PARAM = 'ws'
export const WSA_PARAM = 'wsa'

/** Diagnostic codes follow the ExecutorDiagnostic SCREAMING convention. */
export interface WorkspaceParamDiagnostic {
  code: 'MALFORMED_WS_PARAM'
  message: string
}

export interface DecodedWorkspace {
  state: OpenTabsState | null
  diagnostic?: WorkspaceParamDiagnostic
}

/** Kinds whose stable id carries a random slot suffix (tabId.ts slotSuffix()). */
function isSlotSuffixedKind(kind: WorkspaceTab['kind']): boolean {
  return kind === 'project-details' || kind === 'splash'
}

/** The BASE stable id of a tab: slot suffixes stripped, everything else is
 *  already value-derived by the ONE id policy (tabId.ts). */
function baseStableId(tab: WorkspaceTab): string {
  return isSlotSuffixedKind(tab.kind) ? tab.kind : stableTabId(tab)
}

/**
 * Encode the strip into a `ws=...&wsa=...` search-string fragment.
 * '' when there is nothing to encode — never an empty `ws`.
 */
export function encodeWorkspaceParams(state: OpenTabsState): string {
  if (state.tabs.length === 0) return ''
  const params = new URLSearchParams()
  params.set(WS_PARAM, state.tabs.map((t) => baseStableId(t.tab)).join(','))
  const active = state.tabs.find((t) => t.tab.id === state.activeTabId)
  if (active) params.set(WSA_PARAM, baseStableId(active.tab))
  return params.toString()
}

/** The collections the WorkspaceTab union declares (types.ts). */
const COLLECTIONS = ['projects', 'runs', 'claims', 'lab'] as const

/**
 * tabFromStableId — the mirror switch of stableTabId (tabId.ts), exhaustive
 * like tabPath/defaultRightPaneMode. Returns null for an id it cannot decode
 * (never throws). The round-trip pin in urlSession.test.ts is the drift gate
 * if tabId.ts or the WorkspaceTab union changes.
 */
export function tabFromStableId(id: string): WorkspaceTab | null {
  const trimmed = id.trim()
  if (!trimmed) return null
  const [head, ...rest] = trimmed.split(':')
  switch (head) {
    case 'project': {
      const studyId = rest[0]
      if (!studyId) return null
      return { id: trimmed, kind: 'project', studyId, title: studyId }
    }
    case 'project-details':
      // Slot-suffixed kind: the base id is the bare kind; a rebuilt tab gets a
      // fresh slot (tabId.ts), so decode accepts both forms.
      return { id: `project-details:${slotSuffix()}`, kind: 'project-details', title: 'Project' }
    case 'run': {
      const runId = rest[0]
      if (!runId) return null
      return { id: trimmed, kind: 'run', runId, title: runId }
    }
    case 'execution': {
      const eventGraphId = rest[0]
      if (!eventGraphId) return null
      return { id: trimmed, kind: 'execution', eventGraphId, runId: '', title: eventGraphId }
    }
    case 'deck': {
      const eventGraphId = rest[0]
      if (!eventGraphId) return null
      return { id: trimmed, kind: 'deck', eventGraphId, title: eventGraphId }
    }
    case 'claim': {
      const claimId = rest[0]
      if (!claimId) return null
      return { id: trimmed, kind: 'claim', claimId, title: claimId }
    }
    case 'lab': {
      const recordId = rest[0]
      if (!recordId) return null
      return { id: trimmed, kind: 'lab-entity', schemaId: '', recordId, entityType: '', title: recordId }
    }
    case 'record': {
      const recordId = rest[0]
      if (!recordId) return null
      return { id: trimmed, kind: 'record-edit', recordId, title: recordId }
    }
    case 'create': {
      const nodeType = rest[0]
      if (nodeType !== 'study' && nodeType !== 'experiment' && nodeType !== 'run') return null
      const parentId = rest[1]
      if (nodeType === 'study') {
        return { id: trimmed, kind: 'record-create', nodeType, title: 'New study' }
      }
      if (!parentId) return null
      return nodeType === 'experiment'
        ? { id: trimmed, kind: 'record-create', nodeType, studyId: parentId, title: 'New experiment' }
        : { id: trimmed, kind: 'record-create', nodeType, experimentId: parentId, title: 'New run' }
    }
    case 'collection': {
      const collection = rest[0]
      if (!collection || !(COLLECTIONS as readonly string[]).includes(collection)) return null
      return { id: trimmed, kind: 'collection', collection: collection as (typeof COLLECTIONS)[number], title: collection }
    }
    case 'registry':
      return { id: 'registry', kind: 'registry', title: 'Registry' }
    case 'pdf':
    case 'document': {
      const artifactId = rest[0]
      if (!artifactId) return null
      return { id: trimmed, kind: head, artifactId, title: artifactId }
    }
    case 'protocol-review': {
      const recordId = rest[0]
      if (!recordId) return null
      return { id: trimmed, kind: 'protocol-review', recordId, title: recordId }
    }
    case 'splash':
      return { id: `splash:${slotSuffix()}`, kind: 'splash', title: 'New Tab' }
    default: {
      return null
    }
  }
}

/** A unique-ish slot suffix for the kinds tabId.ts gives random slots to. */
function slotSuffix(): string {
  return `${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Decode a search string into an OpenTabsState.
 *
 * Per-entry errors drop THAT entry and keep the rest (never silently swallow a
 * valid entry). wsa missing from the surviving strip → activate the first
 * surviving tab + diagnostic. Zero decodable entries → state null + diagnostic.
 * Absent params → state null, NO diagnostic (the storage/default workspace
 * wins). Never throws.
 */
export function decodeWorkspaceParams(search: string): DecodedWorkspace {
  const params = new URLSearchParams(search)
  const wsRaw = params.get(WS_PARAM)
  if (wsRaw === null) return { state: null }

  const dropped: string[] = []
  const tabs: OpenTabState[] = []
  for (const raw of wsRaw.split(',')) {
    const tab = tabFromStableId(raw)
    if (tab === null) {
      if (raw.trim()) dropped.push(raw.trim())
      continue
    }
    tabs.push({
      tab,
      activeRightPaneMode: defaultRightPaneMode(tab),
      breadcrumb: [],
      contentHistory: [tab],
      contentCursor: 0,
    })
  }

  if (tabs.length === 0) {
    return {
      state: null,
      diagnostic: {
        code: 'MALFORMED_WS_PARAM',
        message: `The workspace link "${wsRaw}" carries no tab this app can open.`,
      },
    }
  }

  const wsaRaw = params.get(WSA_PARAM)
  let activeTabId = tabs[0]!.tab.id
  let activeFound = true
  if (wsaRaw !== null) {
    // Slot suffixes are re-minted on decode, so match on the BASE id.
    const match = tabs.find((t) => baseStableId(t.tab) === wsaRaw.trim())
    if (match) activeTabId = match.tab.id
    else {
      activeFound = false
      dropped.push(wsaRaw.trim() || wsaRaw)
    }
  }

  const diagnostic: WorkspaceParamDiagnostic | undefined =
    dropped.length > 0 || !activeFound
      ? {
          code: 'MALFORMED_WS_PARAM',
          message:
            `The workspace link carried ${dropped.length === 1 ? '1 entry' : `${dropped.length} entries`} this app could not open (${dropped.join(', ')}); the rest of the strip was restored.`,
        }
      : undefined

  return {
    state: {
      tabs,
      activeTabId,
      history: [activeTabId],
      historyCursor: 0,
    },
    ...(diagnostic ? { diagnostic } : {}),
  }
}
