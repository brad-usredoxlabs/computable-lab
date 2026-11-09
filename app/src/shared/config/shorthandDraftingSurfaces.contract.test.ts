/**
 * CONTRACT — every surface declared in the shorthand-drafting policy must be a
 * surface this app can actually post.
 *
 * The regression this stops: `config/drafting/shorthand-drafting.yaml` declared
 * `surfaces: [workspace.deck]`. No client has ever sent that id — the app's
 * `AiSurface` union carries `run-workspace` / `event-editor`, and the deck
 * bridge posts `event-editor`. `surfaceDraftsShorthand()` was therefore FALSE
 * for every live surface, silently disabling the deterministic clarification-
 * answer fold (plus the repeat-ask ledger, the event_graph->shorthand refusal
 * and the no-model wall).
 *
 * Nothing caught it because the tests that exercise the fold declared their
 * request surface as `workspace.deck` too — the fixture and the policy agreed
 * on a name no client sends, so the gate was true in tests and false in
 * production. This test crosses that seam: the policy is DATA read by the
 * server, the union is the app's own authority, and one must be a subset of
 * the other.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// jsdom gives import.meta.url an http: scheme, so resolve from the workspace
// root the way the other app-level file-reading tests do (cwd === app/).
const policyPath = join(process.cwd(), '..', 'config', 'drafting', 'shorthand-drafting.yaml')
const surfaceTypePath = join(process.cwd(), 'src', 'types', 'aiContext.ts')

/** The `surfaces: [...]` list from the policy YAML (flow style — one line). */
function policySurfaces(): string[] {
  const source = readFileSync(policyPath, 'utf8')
  const match = /^surfaces:[ \t]*\[([^\]]*)\]/m.exec(source)
  expect(match, 'shorthand-drafting.yaml has no `surfaces: [...]` list').not.toBeNull()
  return match![1]!
    .split(',')
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
    .filter((entry) => entry.length > 0)
}

/**
 * The string literals of the app's `AiSurface` union, read from the type
 * declaration itself — a runtime copy of the list would be a second authority
 * and could drift exactly the way the policy did.
 */
function declaredSurfaces(): Set<string> {
  const source = readFileSync(surfaceTypePath, 'utf8')
  const start = source.indexOf('export type AiSurface')
  expect(start, 'AiSurface union not found in types/aiContext.ts').toBeGreaterThanOrEqual(0)
  // The declaration is unterminated by a semicolon and its comments contain
  // them, so anchor on the NEXT top-level `export` instead.
  const end = source.indexOf('\nexport ', start + 'export type AiSurface'.length)
  const block = source.slice(start, end === -1 ? source.length : end)
  const literals = new Set<string>()
  for (const match of block.matchAll(/'([^']+)'/g)) literals.add(match[1]!)
  return literals
}

describe('shorthand-drafting policy vs the surfaces this app posts', () => {
  it('every declared policy surface is a member of the app AiSurface union', () => {
    const declared = declaredSurfaces()
    const unknown = policySurfaces().filter((surface) => !declared.has(surface))
    expect(
      unknown,
      `shorthand-drafting.yaml declares surface(s) no client can send: ${unknown.join(', ')} — ` +
        'the shorthand gate would be false for every real surface',
    ).toEqual([])
  })

  it('the policy is not empty (an empty list silently disables the fold)', () => {
    expect(policySurfaces().length).toBeGreaterThan(0)
  })

  it('the run chat surface — where the answer loop was measured — is declared', () => {
    expect(policySurfaces()).toContain('run-workspace')
  })
})
