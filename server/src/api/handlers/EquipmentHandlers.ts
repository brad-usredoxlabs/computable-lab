import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiError } from '../types.js';
import type { AppConfig } from '../../config/types.js';
import { exaSearch, resolveExaConfig } from '../../integrations/exa.js';
import type { RecordStore } from '../../store/types.js';
import { createEnvelope } from '../../types/RecordEnvelope.js';

const EQUIPMENT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/equipment.schema.yaml';

export interface EquipmentExaSearchItem {
  id: string;
  title: string;
  url: string;
  snippet?: string;
  score?: number;
  manufacturer?: string;
  model?: string;
  source: 'exa';
}

export interface EquipmentExaSearchResponse {
  configured: boolean;
  query: string;
  items: EquipmentExaSearchItem[];
}

export interface EquipmentHandlers {
  searchExa(
    request: FastifyRequest<{ Querystring: { q?: string; limit?: string } }>,
    reply: FastifyReply,
  ): Promise<EquipmentExaSearchResponse | ApiError>;

  createFromExa(
    request: FastifyRequest<{ Body: { candidate?: unknown } }>,
    reply: FastifyReply,
  ): Promise<{ success: true; recordId: string; label: string; record: unknown } | ApiError>;
}

export function createEquipmentHandlers(deps: {
  getAppConfig: () => AppConfig | undefined;
  store: RecordStore;
}): EquipmentHandlers {
  const { getAppConfig, store } = deps;

  return {
    async searchExa(request, reply) {
      const q = (request.query.q || '').trim();
      if (q.length < 2) {
        reply.status(400);
        return {
          error: 'BAD_REQUEST',
          message: 'Query parameter "q" must be at least 2 characters.',
        };
      }

      const config = resolveExaConfig(getAppConfig());
      if (!config) {
        reply.status(503);
        return {
          error: 'EXA_NOT_CONFIGURED',
          message: 'Exa is not configured. Configure integrations.exa.apiKey before searching equipment.',
        };
      }

      const limit = Math.min(Math.max(Number(request.query.limit) || 8, 1), 20);
      try {
        const response = await exaSearch(config, {
          query: `${q} laboratory equipment manufacturer model`,
          searchType: 'auto',
          numResults: Math.min(limit * 2, 25),
          contentMode: 'highlights',
          maxCharacters: 1200,
          highlightQuery: q,
        });
        const seen = new Set<string>();
        const items = exaResults(response)
          .map((entry, index) => shapeEquipmentResult(entry, index))
          .filter((entry): entry is EquipmentExaSearchItem => Boolean(entry))
          .filter((entry) => {
            const key = entry.url.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, limit);
        return { configured: true, query: q, items };
      } catch (err) {
        reply.status(502);
        return {
          error: 'EXA_SEARCH_FAILED',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async createFromExa(request, reply) {
      const candidate = objectValue(request.body?.candidate);
      const title = stringValue(candidate?.title);
      const url = stringValue(candidate?.url);
      if (!title || !url) {
        reply.status(400);
        return {
          error: 'BAD_REQUEST',
          message: 'candidate.title and candidate.url are required.',
        };
      }

      const recordId = await uniqueEquipmentId(store, title, url);
      const manufacturer = stringValue(candidate?.manufacturer);
      const model = stringValue(candidate?.model);
      const snippet = stringValue(candidate?.snippet);
      const payload: Record<string, unknown> = {
        kind: 'equipment',
        id: recordId,
        name: title,
        status: 'active',
        ...(manufacturer ? { manufacturer } : {}),
        ...(model ? { model } : {}),
        notes: provenanceNotes(url, snippet),
      };
      const envelope = createEnvelope(payload, EQUIPMENT_SCHEMA_ID);
      if (!envelope) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'Failed to create equipment envelope.' };
      }

      const result = await store.create({
        envelope,
        message: `Create equipment from Exa search: ${recordId}`,
      });
      if (!result.success || !result.envelope) {
        if (result.validation && !result.validation.valid) {
          reply.status(422);
          return { error: 'VALIDATION_FAILED', message: 'Equipment record failed validation.' };
        }
        reply.status(result.error?.includes('already exists') ? 409 : 400);
        return { error: 'CREATE_FAILED', message: result.error || 'Failed to create equipment record.' };
      }

      reply.status(201);
      return { success: true, recordId, label: title, record: result.envelope };
    },
  };
}

function exaResults(response: unknown): Array<Record<string, unknown>> {
  const root = objectValue(response);
  const results = root?.results;
  return Array.isArray(results)
    ? results.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    : [];
}

function shapeEquipmentResult(entry: Record<string, unknown>, index: number): EquipmentExaSearchItem | null {
  const url = stringValue(entry.url);
  const title = stringValue(entry.title) ?? url;
  if (!url || !title) return null;
  const snippet = snippetValue(entry);
  const text = [title, snippet, stringValue(entry.text)].filter(Boolean).join(' ');
  const inferred = inferEquipmentMetadata(text);
  const score = numberValue(entry.score);
  return {
    id: stringValue(entry.id) ?? `exa-equipment-${index + 1}`,
    title,
    url,
    source: 'exa',
    ...(snippet ? { snippet } : {}),
    ...(typeof score === 'number' ? { score } : {}),
    ...(inferred.manufacturer ? { manufacturer: inferred.manufacturer } : {}),
    ...(inferred.model ? { model: inferred.model } : {}),
  };
}

function snippetValue(entry: Record<string, unknown>): string | undefined {
  const direct = stringValue(entry.summary) ?? stringValue(entry.text);
  if (direct) return direct.slice(0, 500);
  const highlights = entry.highlights;
  if (Array.isArray(highlights)) {
    return highlights.map((item) => stringValue(item)).filter(Boolean).join(' ').slice(0, 500) || undefined;
  }
  return undefined;
}

function inferEquipmentMetadata(text: string): { manufacturer?: string; model?: string } {
  const manufacturers = [
    'Thermo Fisher',
    'Eppendorf',
    'Bio-Rad',
    'Agilent',
    'Beckman Coulter',
    'Hamilton',
    'Tecan',
    'PerkinElmer',
    'Sartorius',
    'Mettler Toledo',
    'Qiagen',
    'Illumina',
  ];
  const lower = text.toLowerCase();
  const manufacturer = manufacturers.find((name) => lower.includes(name.toLowerCase()));
  const modelMatch = text.match(/(?:model|system|instrument)\s+([A-Z0-9][A-Z0-9._-]{2,})/i);
  return {
    ...(manufacturer ? { manufacturer } : {}),
    ...(modelMatch?.[1] ? { model: modelMatch[1].trim() } : {}),
  };
}

async function uniqueEquipmentId(store: RecordStore, title: string, url: string): Promise<string> {
  const hash = createHash('sha1').update(`${title}|${url}`).digest('hex').slice(0, 8).toUpperCase();
  const base = `EQP-${slugId(title) || `EXA-${hash}`}`.slice(0, 48).replace(/[-_]+$/g, '');
  const first = `${base}-${hash.slice(0, 4)}`;
  if (!(await store.get(first))) return first;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base}-${hash.slice(0, 4)}-${i}`;
    if (!(await store.get(candidate))) return candidate;
  }
  return `EQP-EXA-${hash}`;
}

function slugId(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
}

function provenanceNotes(url: string, snippet?: string): string {
  return [
    `Imported from Exa equipment search: ${url}`,
    snippet ? `Source snippet: ${snippet}` : undefined,
  ].filter(Boolean).join('\n');
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
