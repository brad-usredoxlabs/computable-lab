/**
 * workstateExecutor — the ONE shared client executor core (PB-CH-3).
 *
 * Pure planning/applying pair, no React, no fetch, no DOM:
 *  - Tier 1: a compiled agent action (focus / open-surface — the frozen
 *    agent-action schema shape) becomes registry-backed navigation through the
 *    dormant `openSurface` composition seams (surfaceRoute + tabForSurface +
 *    openContent). Tier 1 is NON-DESTRUCTIVE: it rides activateTab /
 *    navigateActiveTab / openContent only — never replace, never close, never
 *    a confirm dialog. Unknown/unroutable/unmappable targets are diagnostics
 *    with ZERO state movement (the stop-boundary made mechanical).
 *  - Tier 2 (validateAcceptedWorkstate, below): an ACCEPTED compiled session
 *    document (the drafts accept-body contract) is validated with the shared
 *    session-document validator and guarded by accept identity
 *    (draftId:revision:reviewHash — never document bytes), so unaccepted
 *    documents structurally cannot enter the tab store and a repeat accept
 *    cannot double-apply. The raw replaceState is NOT re-exported here; the
 *    hook layer funnels the accepted doc through useApplySessionDocument, and
 *    the only push is useSessionSync's existing debounced state effect.
 *
 * Registry membership is `registry.find` only (repo rule: registry is data —
 * no surface-name literals, no local tab-kind switch; tab mapping composes
 * openSurface.ts's tabForSurface).
 */
import type { OpenTabsContextValue } from '../shell/OpenTabsContext'
import type { SurfaceSpec } from '../surfaces'
import { surfaceRoute, type SurfaceTarget } from '../surfaces/surfaceRoute'
import { tabForSurface } from './openSurface'
import { openContent } from '../lib/openContent'
import { sessionDocumentFromValue, type SessionDocument } from './sessionYaml'
import type { WorkspaceTab } from '../../event-editor/workspace/types'

/**
 * Local structural type of the drafts accept body's compiled result — the
 * CONTRACT (flat body: sessionDocument/summary/resolvedTerms at top level,
 * orchestrator OQ1 resolution). NOT imported from server/**. Identity fields
 * (draftId/revision/reviewHash) are NOT in the response body — the caller
 * holds them from the compile envelope and supplies them separately.
 */
export interface SessionDocumentLike {
  version: 1
  activeTabId?: string | null
  tabs: Array<Record<string, unknown> & { kind: string }>
}
export interface AcceptedWorkstateBody {
  sessionDocument: SessionDocumentLike
  summary?: string
  resolvedTerms?: unknown[]
}

/** The accept identity the duplicate guard keys on — never the document bytes. */
export interface AcceptedWorkstateIdentity {
  draftId: string
  revision: number
  reviewHash: string
}
export type AcceptGuardKey = string

/** Mirrors the frozen agent-action schema shape (focus | open-surface). */
export type Tier1ActionLike =
  | {
      action: 'open-surface'
      surface: string
      target?: { kind: string; id: string; type?: string; label?: string }
    }
  | {
      action: 'focus'
      target:
        | { kind: 'protocol-step'; protocolId: string; stepId: string; label?: string }
        | { kind: string; id: string; type?: string; label?: string }
    }

export type ExecutorDiagnostic =
  | {
      code:
        | 'UNKNOWN_SURFACE'
        | 'UNROUTABLE_SURFACE'
        | 'UNMAPPABLE_TARGET'
        | 'NO_TAB_STORE'
        | 'NO_FOCUS_PROVIDER'
        | 'STALE_TARGET'
        | 'MALFORMED_ACCEPTED_DOCUMENT'
        | 'ACCEPT_ATTESTATION_MISSING'
      message: string
      path?: string
    }

export type ExecutorOutcome =
  | { ok: true; kind: 'navigated' | 'activated' | 'focused' | 'replaced' | 'duplicate-ignored'; route?: string; diagnostics: [] }
  | { ok: false; kind: 'noop'; route?: undefined; diagnostics: ExecutorDiagnostic[] }

/** What a tier-1 plan resolved to (or why it resolved to nothing). */
export interface Tier1Plan {
  target?: SurfaceTarget & { title?: string }
  tab?: WorkspaceTab
  route?: string
  /** label is always present ('' when the action carries none) so the plan
   *  plugs straight into setFocusedStep's required-label signature. */
  protocolStep?: { stepId: string; label: string }
  diagnostic?: ExecutorDiagnostic
}

function diag(code: ExecutorDiagnostic['code'], message: string, path?: string): ExecutorDiagnostic {
  return { code, message, ...(path ? { path } : {}) }
}

function noop(...diagnostics: ExecutorDiagnostic[]): ExecutorOutcome {
  return { ok: false, kind: 'noop', diagnostics }
}

/**
 * Stage 1 of tier 1: resolve the action against the registry. Each stage that
 * fails names itself — this is why the executor composes surfaceRoute +
 * tabForSurface + openContent directly instead of calling openSurface() and
 * squinting at a bare null.
 *
 * Conservative focus policy (orchestrator OQ2 resolution): a bare ref focus
 * navigates ONLY when the action itself carries a routable surface; otherwise
 * it is activate-existing-or-diagnostic. No deep-linking is pre-implemented.
 */
export function planTier1Action(action: Tier1ActionLike, registry: SurfaceSpec[] | null): Tier1Plan {
  if (action.action === 'focus') {
    const ref = action.target
    if ('stepId' in ref && ref.kind === 'protocol-step') {
      // Protocol-step focus is display focus via the selection context — zero
      // navigation (the action shape carries no surface for it).
      return { protocolStep: { stepId: ref.stepId, label: ref.label ?? '' } }
    }
    // Bare ref: map to the tab the store would use for this entity via the
    // SAME tabForSurface seam openSurface uses — no local kind switch.
    const tab = tabForSurface({
      surface: ref.kind,
      active: { objectType: ref.kind, objectId: ref.id },
      ...(ref.label ? { title: ref.label } : {}),
    })
    if (!tab) return { diagnostic: diag('UNMAPPABLE_TARGET', `focus target kind '${ref.kind}' has no tab mapping`, 'target') }
    return { tab }
  }

  // open-surface
  if (!registry) {
    // Registry not loaded yet: diagnostics, never a throw (render-nothing
    // convention until GET /api/surfaces lands).
    return { diagnostic: diag('UNROUTABLE_SURFACE', 'surface registry not loaded', 'registry') }
  }
  const spec = registry.find((s) => s.id === action.surface)
  if (!spec) return { diagnostic: diag('UNKNOWN_SURFACE', `surface '${action.surface}' is not in the registry`, 'surface') }
  const ref = action.target
  if (!ref || typeof ref.id !== 'string' || ref.id.length === 0) {
    return { diagnostic: diag('UNROUTABLE_SURFACE', `open-surface '${action.surface}' needs a target id to route`, 'target') }
  }
  const target: SurfaceTarget & { title?: string } = {
    surface: action.surface,
    active: { objectType: ref.kind, objectId: ref.id },
    ...(ref.label ? { title: ref.label } : {}),
  }
  const route = surfaceRoute(target, registry)
  if (!route) {
    return {
      diagnostic: diag(
        'UNROUTABLE_SURFACE',
        `surface '${action.surface}' is not deep-linkable for objectType '${ref.kind}'`,
        'target',
      ),
    }
  }
  const tab = tabForSurface(target)
  if (!tab) return { diagnostic: diag('UNMAPPABLE_TARGET', `objectType '${ref.kind}' does not fill any tab kind`, 'target') }
  return { target, tab, route }
}

export interface Tier1ApplyDeps {
  /** null when no OpenTabsProvider is mounted (standalone routes). */
  openTabs: OpenTabsContextValue | null
  navigate: (path: string) => void
  /**
   * Supplied by the hook from useProtocolSelection().setFocusedStep (same
   * signature, so the hook passes it through untouched); absent outside a
   * provider. The executor only ever passes a concrete step, never null.
   */
  focusProtocolStep?: (step: { stepId: string; label: string; ordinal?: number } | null) => void
}

/**
 * Stage 2 of tier 1: apply the plan through the established state primitives.
 *  - already-open target ⇒ activateTab(existing slot) — focus without touching
 *    any other tab (never navigate someone else's dirty active tab out of the way);
 *  - else a routable surface ⇒ openContent (in-place navigateActiveTab);
 *  - protocol-step ⇒ focusProtocolStep ONLY, zero navigation;
 *  - missing store / provider / route ⇒ diagnostic + ZERO movement.
 * Tier 1 never dispatches replace or close, and performs no record writes.
 */
export function applyTier1Action(plan: Tier1Plan, deps: Tier1ApplyDeps): ExecutorOutcome {
  if (plan.diagnostic) return noop(plan.diagnostic)

  if (plan.protocolStep) {
    if (!deps.focusProtocolStep) {
      // The stop-boundary made mechanical: no provider is a diagnostic, never
      // a dialog and never a fallback hack.
      return noop(diag('NO_FOCUS_PROVIDER', 'protocol-step focus requested outside a ProtocolSelectionProvider', 'focus'))
    }
    deps.focusProtocolStep(plan.protocolStep)
    return { ok: true, kind: 'focused', diagnostics: [] }
  }

  if (!plan.tab) return noop(diag('UNMAPPABLE_TARGET', 'tier-1 plan carries no tab', 'target'))
  if (!deps.openTabs) return noop(diag('NO_TAB_STORE', 'no OpenTabsProvider mounted; tier-1 actions do not fall back to window hacks', 'openTabs'))

  const tab = plan.tab
  // Same-entity convention matches the reducer's (OpenTabsContext.tsx:189-190):
  // a slot id may carry a freshness suffix after the base id.
  const existing = deps.openTabs.state.tabs.find((e) => e.tab.id === tab.id || e.tab.id.startsWith(`${tab.id}:`))
  if (existing) {
    deps.openTabs.activateTab(existing.tab.id)
    return { ok: true, kind: 'activated', diagnostics: [] }
  }
  if (!plan.route) {
    // Bare focus with no existing slot and no routable surface on the action:
    // conservative no-op (OQ2 resolution — deep-linking is not this executor's call).
    return noop(diag('UNROUTABLE_SURFACE', 'no existing tab slot for the focus target and the action carries no routable surface', 'target'))
  }
  openContent(deps.openTabs, deps.navigate, tab, plan.route)
  return { ok: true, kind: 'navigated', route: plan.route, diagnostics: [] }
}

/**
 * Duplicate guard keyed on the ACCEPT IDENTITY (`draftId:revision:reviewHash`),
 * never on document bytes: a legitimate later revision carries a new reviewHash
 * (the drafts service content-hashes the projection) and is therefore NEVER
 * blocked, while a repeat delivery of the same accepted revision is.
 * Records the key on 'fresh'.
 */
export function acceptGuard(identity: AcceptedWorkstateIdentity, seenKeys: Set<AcceptGuardKey>): 'fresh' | 'duplicate' {
  const key = `${identity.draftId}:${identity.revision}:${identity.reviewHash}`
  if (seenKeys.has(key)) return 'duplicate'
  seenKeys.add(key)
  return 'fresh'
}

/**
 * Structural validation of the FLAT accept body (no {result:{...}} wrapper —
 * orchestrator OQ1 resolution). Shares sessionYaml's rules via the extracted
 * sessionDocumentFromValue validator (validate ≠ rebuild: no dedupe / slot-id
 * minting here — sessionDocumentToState keeps that).
 */
export function validateAcceptedWorkstate(
  body: unknown,
): { ok: true; doc: SessionDocument } | { ok: false; diagnostic: ExecutorDiagnostic } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, diagnostic: diag('MALFORMED_ACCEPTED_DOCUMENT', 'accept body must be an object', 'body') }
  }
  const sessionDocument = (body as { sessionDocument?: unknown }).sessionDocument
  if (sessionDocument === undefined) {
    return { ok: false, diagnostic: diag('MALFORMED_ACCEPTED_DOCUMENT', 'accept body carries no sessionDocument', 'body.sessionDocument') }
  }
  try {
    return { ok: true, doc: sessionDocumentFromValue(sessionDocument) }
  } catch (err) {
    return {
      ok: false,
      diagnostic: diag('MALFORMED_ACCEPTED_DOCUMENT', err instanceof Error ? err.message : String(err), 'body.sessionDocument'),
    }
  }
}
