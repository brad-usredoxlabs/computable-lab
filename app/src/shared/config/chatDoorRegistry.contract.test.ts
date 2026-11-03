/**
 * CHATHOST-CONSOLIDATE-1 T-1 — the ONE door-registry contract test.
 *
 * The chat-door registry (config/chat/chat-hosts.yaml) is the single source of
 * the door set + its per-host capability facts (required_providers /
 * optional_providers / ghost_mount) and the closed slice vocabulary. This test
 * pins the DATA — no TypeScript copy of the inventory, the surface list, or the
 * slice vocabulary (bait #7/#8). It is the anti-drift pin that replaces the
 * per-host bridges: a door that names itself with a `host="…"` literal in
 * app/src must be in the YAML, and every YAML host must name a door (exact-set
 * equality, pin 5 — the grep-over-source pin the spec names as "what replaces
 * per-host bridges as the anti-drift pin").
 *
 * RED-first (spec §8.2 T-1): pins 1-4 + 6 are green against the STEP-1 DATA
 * (the additive fields + slices: block); pin 5 is RED until the six call sites
 * pass a literal `host="…"` (the STEP-4 retarget) and the two bespoke bridges
 * are deleted. Written failing first; the product + call-site commit turns it
 * green.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import hostRegistryRaw from '../../../../config/chat/chat-hosts.yaml?raw'

interface HostEntry {
  id: string
  surface: string
  required_providers?: string[]
  optional_providers?: string[]
  ghost_mount?: boolean
}
interface SliceEntry {
  id: string
  publisher: string
  carries: string
}
interface Registry {
  hosts: HostEntry[]
  slices?: SliceEntry[]
}

const registry = parseYaml(hostRegistryRaw) as Registry

// The six surface values are unchanged from today (pin 6): run-workspace,
// event-editor, and `analysis` four times (the four-way collision). The host
// ORDER is the manifest's order (the shrink-guard pins it).
const EXPECTED_HOSTS = [
  'run-workspace',
  'event-editor',
  'project-deck-tab',
  'record-host',
  'artifact-host',
  'registry-host',
] as const
const EXPECTED_SURFACES = [
  'run-workspace',
  'event-editor',
  'analysis',
  'analysis',
  'analysis',
  'analysis',
] as const

describe('chatDoorRegistry — the ONE door registry (config/chat/chat-hosts.yaml)', () => {
  it('pin 1: every host entry carries required_providers, optional_providers, ghost_mount (total declaration)', () => {
    expect(registry.hosts).toHaveLength(6)
    for (const host of registry.hosts) {
      expect(host, `host ${host.id} id`).toBeTruthy()
      expect(
        Array.isArray(host.required_providers),
        `host ${host.id} must declare required_providers (an array; an empty array is a declared fact, an absent key is an omission)`,
      ).toBe(true)
      expect(
        Array.isArray(host.optional_providers),
        `host ${host.id} must declare optional_providers`,
      ).toBe(true)
      expect(
        typeof host.ghost_mount === 'boolean',
        `host ${host.id} must declare ghost_mount (a boolean)`,
      ).toBe(true)
    }
  })

  it('pin 2: every id in any required_providers/optional_providers is declared in slices:', () => {
    const sliceIds = new Set((registry.slices ?? []).map((s) => s.id))
    expect(sliceIds.size).toBeGreaterThan(0)
    for (const host of registry.hosts) {
      for (const id of [...(host.required_providers ?? []), ...(host.optional_providers ?? [])]) {
        expect(
          sliceIds.has(id),
          `host ${host.id} references slice '${id}' which is not declared in the slices: block`,
        ).toBe(true)
      }
    }
  })

  it('pin 3: every slices[].publisher line names its truth (the path before :line exists; a published slice shows a usePublishSurfaceSlice( call; a NOT-PUBLISHED slice has none in app/src)', () => {
    for (const slice of registry.slices ?? []) {
      const filePath = slice.publisher.split(':')[0]!
      const abs = resolve(repoRoot(), filePath)
      expect(
        existsSync(abs),
        `slice ${slice.id} publisher ${slice.publisher} — file ${filePath} does not exist`,
      ).toBe(true)
      const fileText = readFileSync(abs, 'utf8')
      if (/NOT PUBLISHED/.test(slice.publisher)) {
        // Honest non-publisher: no call site anywhere in app/src may contradict it.
        const callSites = callSitesOf(slice.id)
        expect(
          callSites,
          `slice ${slice.id} is declared NOT PUBLISHED but usePublishSurfaceSlice('${slice.id}', ...) exists at: ${callSites.join(', ')}`,
        ).toEqual([])
      } else {
        expect(
          fileText.includes('usePublishSurfaceSlice('),
          `slice ${slice.id} publisher ${slice.publisher} — ${filePath} contains no usePublishSurfaceSlice( call`,
        ).toBe(true)
      }
    }
  })

  it('pin 4: slice ids, host ids, and surface values stay three DISJOINT vocabularies', () => {
    const hostIds = new Set(registry.hosts.map((h) => h.id))
    const surfaces = new Set(registry.hosts.map((h) => h.surface))
    const sliceIds = new Set((registry.slices ?? []).map((s) => s.id))
    // A slice id is never a host id (a slice names a published bundle, not a door).
    expect([...sliceIds].filter((id) => hostIds.has(id))).toEqual([])
    // A slice id is never a surface value.
    expect([...sliceIds].filter((id) => surfaces.has(id))).toEqual([])
    // Only `deck` is ever *required* (spec §2.3).
    for (const host of registry.hosts) {
      for (const id of host.required_providers ?? []) {
        expect(id, `host ${host.id} requires a non-deck slice '${id}'`).toBe('deck')
      }
    }
  })

  it('pin 5: exact-set equality between the YAML host ids and the host="…" literals in app/src (the anti-drift pin)', () => {
    const yamlIds = new Set(registry.hosts.map((h) => h.id))
    const literalIds = new Set(collectHostLiterals())
    expect(
      [...literalIds].sort(),
      `app/src host="…" literals ${[...literalIds].sort()} must equal the YAML host ids ${[...yamlIds].sort()}`,
    ).toEqual([...yamlIds].sort())
  })

  it('pin 6: the six surface values are unchanged from today (run-workspace, event-editor, analysis ×4, in manifest order)', () => {
    expect(registry.hosts.map((h) => h.id)).toEqual(EXPECTED_HOSTS)
    expect(registry.hosts.map((h) => h.surface)).toEqual(EXPECTED_SURFACES)
  })
})

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Real call sites of usePublishSurfaceSlice('<sliceId>', …) in app/src source (the grep a NOT-PUBLISHED truth rests on). */
function callSitesOf(sliceId: string): string[] {
  const root = srcRoot()
  const prefix = repoRoot() + '/'
  const out: string[] = []
  // Plain-string needles, no escape sequences (robust across transform
  // layers): a hook call is the name, a paren, optional space, a quoted
  // slice id. Test files are excluded: this pin's own failure messages
  // name the call form, and a self-match is not a call site (same idiom
  // as collectHostLiterals below).
  const name = 'usePublishSurfaceSlice'
  const q1 = String.fromCharCode(39) // single quote
  const q2 = String.fromCharCode(34) // double quote
  const needles = [
    name + '(' + q1 + sliceId + q1,
    name + '(' + q2 + sliceId + q2,
    name + ' (' + q1 + sliceId + q1,
    name + ' (' + q2 + sliceId + q2,
  ]
  const walk = (dir: string) => {
    for (const fname of readdirSync(dir)) {
      const full = join(dir, fname)
      const st = statSync(full)
      if (st.isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.(tsx|ts)$/.test(fname)) continue
      if (/\.test\.(tsx|ts)$/.test(fname)) continue
      const text = readFileSync(full, 'utf8')
      if (needles.some((nd) => text.includes(nd))) {
        out.push(full.startsWith(prefix) ? full.slice(prefix.length) : full)
      }
    }
  }
  walk(root)
  return out
}

function repoRoot(): string {
  // This test lives at app/src/shared/config/. The repo root is four up.
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
}

function srcRoot(): string {
  return join(repoRoot(), 'app', 'src')
}

/** Walk app/src (non-test sources) for `host="<id>"` JSX literals. */
function collectHostLiterals(): string[] {
  const root = srcRoot()
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      const st = statSync(full)
      if (st.isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.(tsx|ts)$/.test(name)) continue
      // Exclude test files: the pins name the PRODUCTION door set; a test
      // literal is not a door. (The spec's grep is over source.)
      if (/\.test\.(tsx|ts)$/.test(name)) continue
      const text = readFileSync(full, 'utf8')
      for (const m of text.matchAll(/host="([a-z][a-z0-9-]*)"/g)) {
        out.push(m[1]!)
      }
    }
  }
  walk(root)
  return out
}
