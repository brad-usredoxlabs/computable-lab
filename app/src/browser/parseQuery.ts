/**
 * parseQuery — human search-bar input → JSON-LD query DSL.
 *
 * Accepts the search syntax called out in the appliance plan §8:
 *
 *   pH:7.4 type:material vendor:"Sigma" tris hcl
 *
 * Rules:
 * - `type:X` (or comma-separated `type:X,Y`) sets the type filter.
 * - `key:value` or `key:"value with spaces"` becomes a facet filter. The
 *   key resolves to a `$.key` ui.yaml column path; the search bar surfaces
 *   richer facet selection via dropdowns once values are inspected.
 * - Bare tokens (anything not key:value) are joined into the free-text `q`.
 *
 * Phase 3 deliberately stops short of comparator syntax (`pH:<4`,
 * `count:>=10`). The JSON-LD index supports equality only today; once the
 * index gains comparators in a later phase, the parser grows with it.
 */

import type { FacetValue } from '../shared/api/jsonLdSearchClient'

export interface ParsedQuery {
  q: string
  type?: string[]
  facets: Record<string, FacetValue[]>
}

// Token regex, in order of preference:
//   1. `key:"value with spaces"` — bare key then a quoted value
//   2. `"bare quoted string"`     — a quoted free-text fragment
//   3. `\S+`                       — any non-whitespace run
const TOKEN_PATTERN = /([^\s:"]+:"[^"]*")|"([^"]*)"|(\S+)/g

export function parseQuery(input: string): ParsedQuery {
  const facets: Record<string, FacetValue[]> = {}
  const types = new Set<string>()
  const free: string[] = []

  if (!input.trim()) return { q: '', facets }

  TOKEN_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TOKEN_PATTERN.exec(input)) !== null) {
    // For `key:"value"` tokens, strip the quotes from the value half
    // before downstream parsing so the colon split works.
    const keyValueQuoted = match[1]
    const quotedBare = match[2]
    const bareToken = match[3]
    let token = ''
    if (keyValueQuoted) {
      const colon = keyValueQuoted.indexOf(':')
      token = keyValueQuoted.slice(0, colon + 1) + keyValueQuoted.slice(colon + 2, -1)
    } else if (quotedBare !== undefined) {
      token = quotedBare
    } else if (bareToken) {
      token = bareToken
    }
    if (!token) continue

    const colon = findKeyValueColon(token)
    if (colon === -1) {
      free.push(token)
      continue
    }

    const rawKey = token.slice(0, colon).trim()
    const rawValue = token.slice(colon + 1).trim()
    if (!rawKey || !rawValue) {
      free.push(token)
      continue
    }

    // `type` is special — it routes to the index's typed filter, not facets.
    if (rawKey.toLowerCase() === 'type') {
      for (const v of rawValue.split(',')) {
        const t = v.trim()
        if (t) types.add(t)
      }
      continue
    }

    const field = rawKey.startsWith('$.') ? rawKey : `$.${rawKey}`
    const values = rawValue.split(',').map((v) => coerceFacetValue(v.trim())).filter((v) => v !== '')
    if (values.length === 0) continue
    facets[field] = [...(facets[field] ?? []), ...values]
  }

  const result: ParsedQuery = {
    q: free.join(' '),
    facets,
  }
  if (types.size > 0) result.type = Array.from(types)
  return result
}

/** Pretty-print a parsed query back to the search-bar text format. Stable
 *  for round-trips so the URL stays human-readable. */
export function stringifyQuery(parsed: ParsedQuery): string {
  const parts: string[] = []
  if (parsed.type && parsed.type.length > 0) {
    parts.push(`type:${parsed.type.join(',')}`)
  }
  for (const [field, values] of Object.entries(parsed.facets)) {
    const key = field.startsWith('$.') ? field.slice(2) : field
    parts.push(
      `${key}:${values
        .map((v) => (typeof v === 'string' && /\s/.test(v) ? `"${v}"` : String(v)))
        .join(',')}`,
    )
  }
  if (parsed.q) parts.push(parsed.q)
  return parts.join(' ')
}

/**
 * `value:foo:bar` — only the first `:` after a non-empty key separates
 * key from value. `://` and similar tokens that look like URLs are left
 * as free text by returning -1.
 */
function findKeyValueColon(token: string): number {
  const idx = token.indexOf(':')
  if (idx <= 0) return -1
  // URL-style `http://example` — don't treat as a key:value pair.
  if (token.slice(idx, idx + 3) === '://') return -1
  return idx
}

function coerceFacetValue(raw: string): FacetValue {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) {
    const n = Number(raw)
    if (Number.isFinite(n) && String(n) === raw) return n
  }
  return raw
}
