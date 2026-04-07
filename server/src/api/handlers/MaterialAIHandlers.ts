/**
 * REST handlers for AI-assisted material endpoints.
 *
 * These endpoints provide AI-powered features for:
 * - Material creation from natural language descriptions
 * - Smart multi-source material search (local + ontology + vendor)
 * - Composition review with warnings and suggestions
 * - Duplicate / synonym detection
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AgentOrchestrator } from '../../ai/types.js';
import type { RecordStore } from '../../store/types.js';

interface DraftMaterialBody {
  prompt: string;
}

interface SmartSearchBody {
  query: string;
  includeOntology?: boolean;
  includeVendor?: boolean;
}

interface ReviewCompositionBody {
  materialId: string;
}

interface CheckDuplicateBody {
  name: string;
  kind?: string;
}

export interface MaterialAIHandlers {
  draftMaterial(
    request: FastifyRequest<{ Body: DraftMaterialBody }>,
    reply: FastifyReply,
  ): Promise<unknown>;
  searchMaterials(
    request: FastifyRequest<{ Body: SmartSearchBody }>,
    reply: FastifyReply,
  ): Promise<unknown>;
  reviewComposition(
    request: FastifyRequest<{ Body: ReviewCompositionBody }>,
    reply: FastifyReply,
  ): Promise<unknown>;
  checkDuplicate(
    request: FastifyRequest<{ Body: CheckDuplicateBody }>,
    reply: FastifyReply,
  ): Promise<unknown>;
}

/**
 * Heuristic material draft when AI is not available.
 */
function heuristicDraftMaterial(prompt: string) {
  const lower = prompt.toLowerCase();
  const words = prompt.trim().split(/\s+/);

  // Try to extract concentration pattern (e.g. "10 mM", "0.1%")
  const concMatch = prompt.match(/(\d+(?:\.\d+)?)\s*(mM|µM|uM|nM|M|mg\/mL|µg\/mL|ug\/mL|%|v\/v|w\/v)/i);
  const concentration = concMatch
    ? { value: parseFloat(concMatch[1]!), unit: concMatch[2]! }
    : undefined;

  // Try to extract vendor
  const vendorPatterns = ['sigma', 'thermo', 'fisher', 'invitrogen', 'gibco', 'millipore', 'corning', 'bd', 'roche'];
  const vendorMatch = vendorPatterns.find((v) => lower.includes(v));

  // Infer kind
  let kind: string = 'material';
  let category: string = 'concept-only';
  if (lower.includes('stock') || concentration) {
    kind = 'material-spec';
    category = 'saved-stock';
  }
  if (vendorMatch) {
    kind = 'vendor-product';
    category = 'vendor-reagent';
  }

  // Infer domain
  let domain = 'other';
  const chemKeywords = ['dmso', 'ethanol', 'methanol', 'buffer', 'nacl', 'hcl', 'naoh', 'tris', 'edta', 'sds'];
  const bioKeywords = ['cell', 'culture', 'serum', 'fbs', 'bsa', 'medium', 'media', 'dmem', 'rpmi', 'antibody', 'enzyme', 'protein'];
  if (chemKeywords.some((k) => lower.includes(k))) domain = 'chemical';
  if (bioKeywords.some((k) => lower.includes(k))) domain = 'biological';

  // Build a reasonable name from the prompt
  const name = words.slice(0, 6).join(' ');

  const unresolvedFields: string[] = [];
  if (!concentration) unresolvedFields.push('concentration');
  if (!vendorMatch) unresolvedFields.push('vendor');

  return {
    proposed: {
      name,
      kind,
      category,
      domain,
      ...(concentration ? { concentration } : {}),
      ...(vendorMatch ? { vendor: vendorMatch } : {}),
    },
    ontologyMatches: [],
    vendorMatches: vendorMatch ? [{ vendor: vendorMatch, query: name }] : [],
    confidence: 0.4,
    unresolvedFields,
  };
}

/**
 * Heuristic duplicate check using simple string similarity.
 */
function simpleSimilarity(a: string, b: string): number {
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();
  if (al === bl) return 1.0;
  if (al.includes(bl) || bl.includes(al)) return 0.8;

  // Word overlap
  const aWords = new Set(al.split(/\s+/));
  const bWords = new Set(bl.split(/\s+/));
  let overlap = 0;
  for (const w of aWords) {
    if (bWords.has(w)) overlap++;
  }
  const total = Math.max(aWords.size, bWords.size);
  return total > 0 ? overlap / total : 0;
}

export function createMaterialAIHandlers(
  orchestrator: AgentOrchestrator | undefined,
  store: RecordStore,
): MaterialAIHandlers {
  return {
    async draftMaterial(request, reply) {
      const { prompt } = request.body ?? {};

      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'prompt is required' };
      }

      if (orchestrator) {
        try {
          const result = await orchestrator.run({
            prompt: `Parse this natural language material description and return a structured material record draft.

Description: "${prompt}"

Return ONLY a JSON object (no markdown fencing) with this structure:
{
  "proposed": {
    "name": "<material name>",
    "kind": "<material|material-spec|vendor-product>",
    "category": "<saved-stock|vendor-reagent|prepared-material|biological-derived|concept-only>",
    "domain": "<chemical|biological|other>",
    "concentration": {"value": <number>, "unit": "<unit>"} or null,
    "vendor": "<vendor name>" or null,
    "cas_number": "<CAS>" or null,
    "molecular_formula": "<formula>" or null
  },
  "ontologyMatches": [{"id": "<ontology_id>", "label": "<term>", "namespace": "<ontology>"}],
  "vendorMatches": [{"vendor": "<name>", "catalogNumber": "<number>"}],
  "confidence": <0-1>,
  "unresolvedFields": ["<field_name>"]
}`,
            context: {
              labwares: [],
              eventSummary: '',
              vocabPackId: 'general',
              availableVerbs: [],
            },
            surface: 'materials',
          });

          const text = typeof result === 'string'
            ? result
            : (result as unknown as Record<string, unknown>)?.text as string ?? '';
          try {
            const jsonMatch = text.match(/\{[\s\S]*?"proposed"[\s\S]*?\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.proposed) return parsed;
            }
          } catch {
            // Fall through to heuristic
          }
        } catch (err) {
          request.log.warn(err, 'AI draft-material failed, falling back to heuristic');
        }
      }

      return heuristicDraftMaterial(prompt);
    },

    async searchMaterials(request, reply) {
      const { query, includeOntology = true, includeVendor = true } = request.body ?? {};

      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'query is required' };
      }

      const results: Array<{
        source: 'local' | 'ontology' | 'vendor';
        record: Record<string, unknown>;
        matchReason: string;
      }> = [];

      // Search local records
      try {
        const materialSchemas = [
          'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
          'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml',
          'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml',
          'https://computable-lab.com/schema/computable-lab/material-instance.schema.yaml',
        ];

        const lower = query.toLowerCase();
        for (const schemaId of materialSchemas) {
          try {
            const records = await store.list({ schemaId });
            for (const envelope of records) {
              const payload = envelope.payload as Record<string, unknown>;
              const name = typeof payload.name === 'string' ? payload.name : '';
              const synonyms = Array.isArray(payload.synonyms) ? payload.synonyms : [];
              const allNames = [name, ...synonyms.map(String)];

              if (allNames.some((n) => n.toLowerCase().includes(lower))) {
                results.push({
                  source: 'local',
                  record: {
                    recordId: envelope.recordId,
                    name,
                    kind: payload.kind,
                    category: payload.category,
                  },
                  matchReason: name.toLowerCase().includes(lower)
                    ? `Name matches "${query}"`
                    : `Synonym matches "${query}"`,
                });
              }
            }
          } catch {
            // Schema may not exist yet, skip
          }
        }
      } catch {
        // Store access failed, continue with other sources
      }

      // If AI is available and we want ontology/vendor, use it
      if (orchestrator && (includeOntology || includeVendor)) {
        try {
          const result = await orchestrator.run({
            prompt: `Search for materials matching: "${query}"
${includeOntology ? 'Include ontology terms (ChEBI, NCIT, etc.).' : ''}
${includeVendor ? 'Include vendor/commercial product matches.' : ''}

Return ONLY a JSON object (no markdown fencing):
{
  "results": [
    {"source": "ontology", "record": {"id": "<id>", "label": "<label>", "namespace": "<ontology>"}, "matchReason": "<reason>"},
    {"source": "vendor", "record": {"vendor": "<name>", "productName": "<name>", "catalogNumber": "<number>"}, "matchReason": "<reason>"}
  ]
}`,
            context: {
              labwares: [],
              eventSummary: '',
              vocabPackId: 'general',
              availableVerbs: [],
            },
            surface: 'materials',
          });

          const text = typeof result === 'string'
            ? result
            : (result as unknown as Record<string, unknown>)?.text as string ?? '';
          try {
            const jsonMatch = text.match(/\{[\s\S]*?"results"[\s\S]*?\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (Array.isArray(parsed.results)) {
                results.push(...parsed.results);
              }
            }
          } catch {
            // Ignore parse failures
          }
        } catch (err) {
          request.log.warn(err, 'AI search-materials failed for ontology/vendor');
        }
      }

      return { results };
    },

    async reviewComposition(request, reply) {
      const { materialId } = request.body ?? {};

      if (!materialId || typeof materialId !== 'string') {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'materialId is required' };
      }

      // Load the material record
      let materialRecord;
      try {
        materialRecord = await store.get(materialId);
      } catch {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Material not found: ${materialId}` };
      }

      if (!materialRecord) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Material not found: ${materialId}` };
      }

      const payload = materialRecord.payload as Record<string, unknown>;
      const composition = payload.declared_composition;

      if (!composition || !Array.isArray(composition) || composition.length === 0) {
        return {
          suggestions: [{
            type: 'missing_component',
            message: 'No declared composition found for this material. Consider adding composition data.',
            confidence: 1.0,
          }],
        };
      }

      if (orchestrator) {
        try {
          const result = await orchestrator.run({
            prompt: `Review this material composition and suggest improvements.

Material: ${payload.name || materialId}
Kind: ${payload.kind || 'unknown'}
Composition: ${JSON.stringify(composition)}

Check for:
1. Missing typical components for this type of material
2. Concentration warnings (e.g. cytotoxicity thresholds)
3. Ontology alignment issues

Return ONLY a JSON object (no markdown fencing):
{
  "suggestions": [
    {"type": "missing_component|concentration_warning|ontology_issue", "message": "<description>", "confidence": <0-1>}
  ]
}`,
            context: {
              labwares: [],
              eventSummary: '',
              vocabPackId: 'general',
              availableVerbs: [],
            },
            surface: 'materials',
          });

          const text = typeof result === 'string'
            ? result
            : (result as unknown as Record<string, unknown>)?.text as string ?? '';
          try {
            const jsonMatch = text.match(/\{[\s\S]*?"suggestions"[\s\S]*?\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (Array.isArray(parsed.suggestions)) return parsed;
            }
          } catch {
            // Fall through
          }
        } catch (err) {
          request.log.warn(err, 'AI review-composition failed');
        }
      }

      // Heuristic review
      const suggestions: Array<{ type: string; message: string; confidence: number }> = [];
      const componentNames = composition.map((c: Record<string, unknown>) => {
        const ref = c.component_ref as Record<string, unknown> | undefined;
        return (ref?.label ?? ref?.id ?? '').toString().toLowerCase();
      });

      if (componentNames.some((n: string) => n.includes('dmso'))) {
        const dmsoEntry = composition.find((c: Record<string, unknown>) => {
          const ref = c.component_ref as Record<string, unknown> | undefined;
          return (ref?.label ?? '').toString().toLowerCase().includes('dmso');
        }) as Record<string, unknown> | undefined;
        const conc = dmsoEntry?.concentration as Record<string, unknown> | undefined;
        if (conc && typeof conc.value === 'number' && conc.value > 1 && conc.unit === '%') {
          suggestions.push({
            type: 'concentration_warning',
            message: `DMSO concentration (${conc.value}%) exceeds 1% — may be cytotoxic to many cell lines.`,
            confidence: 0.8,
          });
        }
      }

      if (suggestions.length === 0) {
        suggestions.push({
          type: 'missing_component',
          message: 'No issues detected. Composition appears reasonable.',
          confidence: 0.5,
        });
      }

      return { suggestions };
    },

    async checkDuplicate(request, reply) {
      const { name } = request.body ?? {};

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'name is required' };
      }

      const potentialDuplicates: Array<{
        recordId: string;
        name: string;
        similarity: number;
        reason: string;
      }> = [];

      // Check across material schemas
      const materialSchemas = [
        'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
        'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml',
        'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml',
      ];

      for (const schemaId of materialSchemas) {
        try {
          const records = await store.list({ schemaId });
          for (const envelope of records) {
            const payload = envelope.payload as Record<string, unknown>;
            const existingName = typeof payload.name === 'string' ? payload.name : '';
            const synonyms = Array.isArray(payload.synonyms) ? payload.synonyms.map(String) : [];

            // Check name similarity
            const nameSim = simpleSimilarity(name, existingName);
            if (nameSim >= 0.6) {
              potentialDuplicates.push({
                recordId: envelope.recordId,
                name: existingName,
                similarity: nameSim,
                reason: nameSim >= 0.95
                  ? 'Exact or near-exact name match'
                  : 'Similar name',
              });
              continue;
            }

            // Check synonym matches
            for (const synonym of synonyms) {
              const synSim = simpleSimilarity(name, synonym);
              if (synSim >= 0.6) {
                potentialDuplicates.push({
                  recordId: envelope.recordId,
                  name: existingName,
                  similarity: synSim,
                  reason: `Matches synonym "${synonym}"`,
                });
                break;
              }
            }
          }
        } catch {
          // Schema may not exist, skip
        }
      }

      // Sort by similarity descending
      potentialDuplicates.sort((a, b) => b.similarity - a.similarity);

      return { potentialDuplicates: potentialDuplicates.slice(0, 5) };
    },
  };
}
