/**
 * SchemaTree — left sidebar listing every record type in the system,
 * grouped by domain. Selecting a type narrows `/browser`'s results.
 *
 * Driven entirely from `apiClient.getSchemas()` and the schema file path.
 * No per-type code: when a new schema lands in `schema/<domain>/`, it
 * appears here without any frontend change.
 */

import { useEffect, useMemo, useState } from 'react'
import { apiClient } from '../shared/api/client'
import type { SchemaInfo } from '../types/kernel'

export interface SchemaNode {
  /** Discriminator used as the JSON-LD index `type` filter (e.g. "material"). */
  kind: string
  /** Domain folder under `schema/` (e.g. "lab", "studies"). */
  domain: string
  schemaId: string
  title: string
}

export interface SchemaTreeProps {
  activeType: string | null
  onSelect: (kind: string | null) => void
}

const DOMAIN_ORDER = ['core', 'studies', 'lab', 'workflow', 'knowledge', 'bio', 'ingestion']
const DOMAIN_LABELS: Record<string, string> = {
  core: 'Core',
  studies: 'Studies',
  lab: 'Lab',
  workflow: 'Workflow',
  knowledge: 'Knowledge',
  bio: 'Biology',
  ingestion: 'Ingestion',
}

export function deriveSchemaNode(info: SchemaInfo): SchemaNode | null {
  if (!info.path) return null
  // Path looks like `schema/lab/material.schema.yaml`. Pull `domain` and
  // `kind` from the segments; reject anything that doesn't fit so a
  // malformed entry can never produce a broken tree row.
  const trimmed = info.path.replace(/^\/+/, '').replace(/^schema\//, '')
  const parts = trimmed.split('/')
  if (parts.length < 2) return null
  const file = parts[parts.length - 1] ?? ''
  const kind = file.replace(/\.schema\.yaml$/, '')
  if (!kind || kind === file) return null
  // Domain is the *first* segment under schema/ when there's nesting
  // (e.g. `lab/datatypes/ref.schema.yaml` → domain `lab`).
  const domain = parts[0] ?? 'core'
  return {
    kind,
    domain,
    schemaId: info.id,
    title: info.title || kind,
  }
}

export function groupByDomain(schemas: SchemaInfo[]): Array<{ domain: string; nodes: SchemaNode[] }> {
  const byDomain = new Map<string, SchemaNode[]>()
  for (const info of schemas) {
    const node = deriveSchemaNode(info)
    if (!node) continue
    const list = byDomain.get(node.domain) ?? []
    list.push(node)
    byDomain.set(node.domain, list)
  }
  // Stable order: known domains first in our preferred order, then any
  // unknown domain alphabetised.
  const known = DOMAIN_ORDER.filter((d) => byDomain.has(d))
  const unknown = Array.from(byDomain.keys())
    .filter((d) => !DOMAIN_ORDER.includes(d))
    .sort()
  return [...known, ...unknown].map((domain) => ({
    domain,
    nodes: (byDomain.get(domain) ?? []).slice().sort((a, b) =>
      a.title.localeCompare(b.title),
    ),
  }))
}

export function SchemaTree({ activeType, onSelect }: SchemaTreeProps) {
  const [schemas, setSchemas] = useState<SchemaInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    apiClient
      .getSchemas()
      .then((res) => {
        if (!cancelled) setSchemas(res)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const groups = useMemo(() => (schemas ? groupByDomain(schemas) : []), [schemas])

  if (error) {
    return (
      <aside className="cl-browser__sidebar" aria-label="Record types">
        <div className="cl-browser__sidebar-error">Failed to load schemas: {error}</div>
      </aside>
    )
  }

  if (!schemas) {
    return (
      <aside className="cl-browser__sidebar" aria-label="Record types">
        <div className="cl-browser__sidebar-empty">Loading…</div>
      </aside>
    )
  }

  return (
    <aside className="cl-browser__sidebar" aria-label="Record types">
      <button
        type="button"
        className={`cl-browser__type-row${activeType === null ? ' is-active' : ''}`}
        onClick={() => onSelect(null)}
      >
        All records
      </button>
      {groups.map((group) => (
        <section key={group.domain} className="cl-browser__domain">
          <h3 className="cl-browser__domain-heading">
            {DOMAIN_LABELS[group.domain] ?? group.domain}
          </h3>
          <ul className="cl-browser__type-list">
            {group.nodes.map((node) => (
              <li key={node.schemaId}>
                <button
                  type="button"
                  className={`cl-browser__type-row${
                    activeType === node.kind ? ' is-active' : ''
                  }`}
                  onClick={() => onSelect(node.kind)}
                  title={node.schemaId}
                >
                  {node.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  )
}
