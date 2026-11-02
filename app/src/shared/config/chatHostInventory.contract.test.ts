/**
 * CONTRACT (L2-CHATHOST-SWEEP-1) — the shorthand-drafting SURFACE list is a
 * SUBSET of the chat-host INVENTORY (YAML-vs-YAML).
 *
 * The existing shorthandDraftingSurfaces.contract.test.ts pins the policy's
 * surfaces against the app's AiSurface UNION (TS). This test crosses the other
 * seam: the policy is DATA read by the server, and the chat-host inventory
 * (config/chat/chat-hosts.yaml, Change 1) is the data-declared set of every
 * chat host a browser gate must sweep. A drafting surface that is NOT a named
 * inventory host would be a chat surface the sweep is structurally blind to —
 * the exact green-gate/dead-UI defect class this item kills. So the drafting
 * list must remain a SUBSET of the inventory's host ids.
 *
 * Both sides are read from the DATA files (never a TS copy) so neither can
 * drift the way `workspace.deck` drifted (the fixture and the policy agreed on
 * a name no client sent; the union never could).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import YAML from 'yaml'
import { describe, expect, it } from 'vitest'

// jsdom gives import.meta.url an http: scheme, so resolve from the workspace
// root the way the sibling contract test does (cwd === app/).
const inventoryPath = join(process.cwd(), '..', 'config', 'chat', 'chat-hosts.yaml')
const policyPath = join(process.cwd(), '..', 'config', 'drafting', 'shorthand-drafting.yaml')

/** The inventory's host ids (config/chat/chat-hosts.yaml `hosts[].id`). */
function inventoryHostIds(): string[] {
  const source = readFileSync(inventoryPath, 'utf8')
  const doc = YAML.parse(source) as { hosts?: Array<{ id?: string }> }
  const hosts = doc?.hosts
  expect(Array.isArray(hosts) && hosts.length > 0,
    'chat-hosts.yaml has no non-empty `hosts` list').toBe(true)
  const ids = (hosts ?? []).map((h) => h.id)
  expect(
    ids.every((id) => typeof id === 'string' && id.length > 0),
    `chat-hosts.yaml has a host with a missing/empty id: ${JSON.stringify(hosts)}`,
  ).toBe(true)
  return ids as string[]
}

/** The `surfaces: [...]` list from the policy YAML (flow style — one line),
 * read the SAME way the sibling contract test reads it (ONE parser). */
function policySurfaces(): string[] {
  const source = readFileSync(policyPath, 'utf8')
  const match = /^surfaces:[ \t]*\[([^\]]*)\]/m.exec(source)
  expect(match, 'shorthand-drafting.yaml has no `surfaces: [...]` list').not.toBeNull()
  return match![1]!
    .split(',')
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
    .filter((entry) => entry.length > 0)
}

describe('shorthand-drafting surfaces vs the chat-host inventory (YAML-vs-YAML)', () => {
  it('every drafting surface is a named inventory host (subset)', () => {
    const ids = inventoryHostIds()
    const unknown = policySurfaces().filter((s) => !ids.includes(s))
    expect(
      unknown,
      `shorthand-drafting.yaml declares surface(s) that are NOT chat-host ` +
        `inventory ids: ${unknown.join(', ')} — those surfaces would be ` +
        `structurally outside the sweep (the green-gate/dead-UI class). Either ` +
        `add the host to config/chat/chat-hosts.yaml (with a re-bless of the ` +
        `blessed manifest) or remove the surface from the drafting policy.`,
    ).toEqual([])
  })

  it('the inventory is not empty (an empty inventory makes the subset vacuous)', () => {
    expect(inventoryHostIds().length).toBeGreaterThan(0)
  })

  it('the drafting list is not empty (the existing contract keeps this pin too)', () => {
    expect(policySurfaces().length).toBeGreaterThan(0)
  })

  it('the inventory names >=3 hosts today (spec: the real grep set is >=4)', () => {
    expect(inventoryHostIds().length).toBeGreaterThanOrEqual(3)
  })
})
