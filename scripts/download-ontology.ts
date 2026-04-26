#!/usr/bin/env tsx
/**
 * download-ontology.ts — Generic ontology download/convert script.
 *
 * Usage: pnpm tsx scripts/download-ontology.ts <source-id>
 *
 * Reads scripts/ontology-sources.yaml for source configs, fetches the
 * OBO/JSON-LD file, parses it, filters to the curated subset, and writes
 * schema/registry/ontology-terms/<source>.yaml in the aggregate-loader shape.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import https from 'node:https';
import http from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SourceConfig {
  id: string;
  format: string;
  url: string;
  output: string;
  include_ids: string[];
}

interface OboTerm {
  id: string;
  name: string;
  def: string;
  synonyms: { label: string; type: string }[];
  parents: string[];
  is_obsolete: boolean;
}

interface OntologyTerm {
  kind: 'ontology-term';
  id: string;
  source: string;
  label: string;
  definition?: string;
  synonyms?: string[];
  parents?: string[];
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const sourceId = process.argv[2];
if (!sourceId) {
  console.error('Usage: pnpm tsx scripts/download-ontology.ts <source-id>');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fetchUrl(url: string, maxRedirects = 5): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http;
    mod
      .get(url, (res) => {
        // Follow redirects (301, 302, 303, 307, 308)
        if ([301, 302, 303, 307, 308].includes(res.statusCode!) && maxRedirects > 0) {
          const location = res.headers.location;
          if (location) {
            res.resume(); // drain the response
            fetchUrl(location, maxRedirects - 1).then(resolve).catch(reject);
            return;
          }
        }
        if (res.statusCode !== 200) {
          reject(
            new Error(
              `HTTP ${res.statusCode} fetching ${url}: ${res.statusMessage}`,
            ),
          );
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

function parseObo(text: string): OboTerm[] {
  const stanzas = text.split(/\n\s*\n/);
  const terms: OboTerm[] = [];

  for (const stanza of stanzas) {
    const trimmed = stanza.trim();
    if (!trimmed.startsWith('[Term]')) continue;

    const lines = trimmed.split('\n').map((l) => l.trim());
    const term: OboTerm = {
      id: '',
      name: '',
      def: '',
      synonyms: [],
      parents: [],
      is_obsolete: false,
    };

    for (const line of lines) {
      if (line.startsWith('id:')) {
        term.id = line.slice(3).trim();
      } else if (line.startsWith('name:')) {
        term.name = line.slice(6).trim();
      } else if (line.startsWith('def:')) {
        term.def = line.slice(5).trim();
      } else if (line.startsWith('synonym:')) {
        const synMatch = line.match(
          /^synonym:\s+"([^"]+)"\s+(\w+)\s+\[.*\]/,
        );
        if (synMatch) {
          term.synonyms.push({
            label: synMatch[1],
            type: synMatch[2],
          });
        }
      } else if (line.startsWith('is_a:')) {
        const parentMatch = line.match(/^is_a:\s+([A-Z0-9]+:\d+)/);
        if (parentMatch) {
          term.parents.push(parentMatch[1]);
        }
      } else if (line.startsWith('is_obsolete: true')) {
        term.is_obsolete = true;
      }
    }

    terms.push(term);
  }

  return terms;
}

function stripDef(def: string): string {
  let s = def.trim();
  // Strip trailing citation like [PMID:12345] or [] or [Chebi_20001]
  s = s.replace(/\s*\[.*?\]\s*$/, '').trim();
  // Strip wrapping quotes
  if (s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Load source config
  const sourcesPath = join(ROOT, 'scripts', 'ontology-sources.yaml');
  const sourcesRaw = readFileSync(sourcesPath, 'utf8');
  const sourcesConfig = parseYaml(sourcesRaw) as { sources: SourceConfig[] };

  const source = sourcesConfig.sources.find((s) => s.id === sourceId);
  if (!source) {
    const valid = sourcesConfig.sources.map((s) => s.id).join(', ');
    console.error(`Error: unknown source id "${sourceId}". Valid ids: ${valid}`);
    process.exit(1);
  }

  // Fetch (with cache)
  const CACHE_DIR = join(ROOT, 'scripts', '.ontology-cache');
  mkdirSync(CACHE_DIR, { recursive: true });

  const cacheKey = `${sourceId}.${source.format}`;
  const cachePath = join(CACHE_DIR, cacheKey);

  let rawBytes: Buffer;

  if (existsSync(cachePath)) {
    console.log(`[cache] using cached ${cacheKey}`);
    rawBytes = readFileSync(cachePath);
  } else {
    console.log(`[fetch] ${source.url}`);
    rawBytes = await fetchUrl(source.url);
    writeFileSync(cachePath, rawBytes);
    console.log(`[cache] saved ${cacheKey} (${rawBytes.length} bytes)`);
  }

  // Decompress if needed
  let oboText: string;
  if (source.url.endsWith('.gz')) {
    oboText = gunzipSync(rawBytes).toString('utf8');
  } else {
    oboText = rawBytes.toString('utf8');
  }

  // Parse OBO
  const allTerms = parseObo(oboText);

  // Filter to curated subset
  const includeSet = new Set(source.include_ids);
  const filtered = allTerms.filter(
    (t) =>
      !t.is_obsolete &&
      includeSet.has(t.id) &&
      t.name !== '',
  );

  if (filtered.length === 0) {
    console.warn(`[warn] no terms matched the curated subset for ${sourceId}`);
  }

  // Map to OntologyTerm shape
  const terms: OntologyTerm[] = filtered.map((t) => {
    const exactSynonyms = t.synonyms
      .filter((s) => s.type === 'EXACT')
      .map((s) => s.label);

    return {
      kind: 'ontology-term',
      id: t.id,
      source: sourceId,
      label: t.name,
      definition: stripDef(t.def) || undefined,
      synonyms: exactSynonyms.length > 0 ? exactSynonyms : undefined,
      parents: t.parents.length > 0 ? t.parents : undefined,
    };
  });

  // Sort by id ascending for deterministic output
  terms.sort((a, b) => a.id.localeCompare(b.id));

  // Write output YAML
  const outputPath = join(ROOT, source.output);
  const outputDir = dirname(outputPath);
  mkdirSync(outputDir, { recursive: true });

  const outputDoc = {
    source: sourceId,
    terms,
  };

  const yamlOutput = stringifyYaml(outputDoc, {
    lineWidth: 0,
  });

  writeFileSync(outputPath, yamlOutput, 'utf8');
  console.log(`[${sourceId}] wrote ${terms.length} terms to ${source.output}`);
}

main().catch((err) => {
  console.error(`[error] ${err.message}`);
  process.exit(1);
});
