/**
 * openContent.ts — browser-model content navigation helpers for workspace tabs.
 *
 * Unlike the old model where clicking an entity opened (or re-activated) a
 * deduped top-level tab, these helpers navigate the ACTIVE tab in place
 * (`navigateActiveTab`), so a click inside a tab always stays in that tab and
 * never jumps to a different tab. The explicit new-tab affordances are "+" and
 * the context-menu "Open link in new tab" (`openInNewTab`).
 */

import type { OpenTabsContextValue } from '../shell/OpenTabsContext'
import type { BreadcrumbItem, WorkspaceTab } from '../../event-editor/workspace/types'

/**
 * Navigate the CURRENT tab to `route`, replacing its content with `tab` and
 * appending an optional breadcrumb. Keeps the same tab slot open; never
 * activates a different existing tab.
 */
export function openContent(
  openTabs: OpenTabsContextValue | null,
  navigate: (path: string) => void,
  tab: WorkspaceTab,
  route: string,
  crumb?: BreadcrumbItem,
): void {
  openTabs?.navigateActiveTab(tab, crumb)
  navigate(route)
}

/**
 * Open `tab` in a NEW tab (the user's explicit new-tab choice) and navigate to
 * its route. Mints a fresh unique slot id so it never collides with an existing
 * tab for the same entity.
 */
export function openInNewTab(
  openTabs: OpenTabsContextValue | null,
  navigate: (path: string) => void,
  tab: WorkspaceTab,
  route: string,
  seedBreadcrumb?: BreadcrumbItem[],
): void {
  openTabs?.openTab({ ...tab, id: uniqueTabSlotId(tab) }, true, seedBreadcrumb)
  navigate(route)
}

/** A fresh, unique tab slot id derived from the tab's semantic id. */
export function uniqueTabSlotId(tab: WorkspaceTab): string {
  return `${tab.id}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
}
