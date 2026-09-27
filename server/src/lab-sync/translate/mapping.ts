/**
 * Lab-Sync controlled-vocabulary bridge loader (config/lab-sync/mapping.yaml).
 *
 * The wire format speaks website slugs (fatty-acid-analysis, fat); CL speaks
 * controlled terms (fatty_acid_profile, cf:fat-matrix). This module is the
 * ONLY place that reads the bridge, and resolve* is the ONLY way a slug
 * becomes a term. A slug missing from mapping.yaml resolves to `undefined` —
 * callers MUST treat that as a hard stop (ProcessedEvent unknown_type) and
 * never invent a term (principles §5, §9; mapping.yaml header).
 */

import { readFile } from 'node:fs/promises'
import yaml from 'yaml'

export interface LabSyncMapping {
  sourceSystem: string
  /** Website product slug -> CL service code. */
  services: Record<string, { code: string; label: string }>
  /** Website sample-type slug -> CL controlled matrix term. */
  matrices: Record<string, { term: string; label: string }>
  /** Recognized barcode identifier systems. */
  identifiers: Record<string, { pattern: string; label: string }>
}

/**
 * Load the mapping file. Throws on malformed content — a broken vocabulary
 * bridge is a deployment error, not a per-event condition.
 */
export async function loadMapping(path: string): Promise<LabSyncMapping> {
  const text = await readFile(path, 'utf8')
  const doc = yaml.parse(text) as Record<string, unknown>

  const services: LabSyncMapping['services'] = {}
  if (doc.services !== null && typeof doc.services === 'object') {
    for (const [slug, v] of Object.entries(doc.services as Record<string, unknown>)) {
      if (v !== null && typeof v === 'object' && typeof (v as Record<string, unknown>).code === 'string') {
        services[slug] = {
          code: (v as Record<string, unknown>).code as string,
          label: typeof (v as Record<string, unknown>).label === 'string' ? (v as Record<string, unknown>).label as string : slug,
        }
      }
    }
  }

  const matrices: LabSyncMapping['matrices'] = {}
  if (doc.matrices !== null && typeof doc.matrices === 'object') {
    for (const [slug, v] of Object.entries(doc.matrices as Record<string, unknown>)) {
      if (v !== null && typeof v === 'object' && typeof (v as Record<string, unknown>).term === 'string') {
        matrices[slug] = {
          term: (v as Record<string, unknown>).term as string,
          label: typeof (v as Record<string, unknown>).label === 'string' ? (v as Record<string, unknown>).label as string : slug,
        }
      }
    }
  }

  const identifiers: LabSyncMapping['identifiers'] = {}
  if (doc.identifiers !== null && typeof doc.identifiers === 'object') {
    for (const [slug, v] of Object.entries(doc.identifiers as Record<string, unknown>)) {
      if (v !== null && typeof v === 'object' && typeof (v as Record<string, unknown>).pattern === 'string') {
        identifiers[slug] = {
          pattern: (v as Record<string, unknown>).pattern as string,
          label: typeof (v as Record<string, unknown>).label === 'string' ? (v as Record<string, unknown>).label as string : slug,
        }
      }
    }
  }

  return {
    sourceSystem: typeof doc.sourceSystem === 'string' ? doc.sourceSystem : 'unknown',
    services,
    matrices,
    identifiers,
  }
}

/** Website product slug -> service entry; undefined = unmapped (hard stop). */
export function resolveService(
  mapping: LabSyncMapping,
  slug: string,
): { code: string; label: string } | undefined {
  return mapping.services[slug]
}

/** Website sample-type slug -> matrix entry; undefined = unmapped (hard stop). */
export function resolveMatrix(
  mapping: LabSyncMapping,
  slug: string,
): { term: string; label: string } | undefined {
  return mapping.matrices[slug]
}
