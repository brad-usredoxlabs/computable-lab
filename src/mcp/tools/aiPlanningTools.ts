import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';

const SCHEMA_IDS = {
  material: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
  materialSpec: 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml',
  recipe: 'https://computable-lab.com/schema/computable-lab/recipe.schema.yaml',
  aliquot: 'https://computable-lab.com/schema/computable-lab/aliquot.schema.yaml',
} as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function refValue(value: unknown): { id: string; type: string; label?: string } | null {
  if (!isObject(value)) return null;
  const id = stringValue(value.id);
  const type = stringValue(value.type);
  const label = stringValue(value.label);
  if (!id || !type) return null;
  return { id, type, ...(label ? { label } : {}) };
}

function asPayload(value: unknown): Record<string, unknown> | null {
  return isObject(value) ? value : null;
}

function normalize(text: string | undefined): string {
  return (text ?? '').trim().toLowerCase();
}

function matchScore(query: string, ...candidates: Array<string | undefined>): number {
  const q = normalize(query);
  if (!q) return 1;
  let score = 0;
  for (const candidate of candidates) {
    const value = normalize(candidate);
    if (!value) continue;
    if (value === q) score = Math.max(score, 100);
    else if (value.startsWith(q)) score = Math.max(score, 75);
    else if (value.includes(q)) score = Math.max(score, 50);
  }
  return score;
}

function effectiveMaterialTracking(ctx: AppContext) {
  return {
    mode: ctx.appConfig?.lab?.materialTracking?.mode ?? 'relaxed',
    allowAdHocEventInstances: ctx.appConfig?.lab?.materialTracking?.allowAdHocEventInstances ?? true,
  };
}

export function registerAiPlanningTools(server: McpServer, ctx: AppContext, registry?: ToolRegistry): void {
  dualRegister(
    server,
    registry,
    'platforms_list',
    'List available planning platforms and deck variants.',
    {},
    async () => jsonResult({ platforms: ctx.platformRegistry.listPlatforms() }),
  );

  dualRegister(
    server,
    registry,
    'platform_get',
    'Get a single planning platform manifest by ID.',
    {
      platformId: z.string().describe('Platform ID, such as manual, opentrons_ot2, opentrons_flex, or integra_assist'),
    },
    async (args) => {
      const platform = ctx.platformRegistry.getPlatform(args.platformId);
      if (!platform) return errorResult(`Unknown platform: ${args.platformId}`);
      return jsonResult(platform);
    },
  );

  dualRegister(
    server,
    registry,
    'lab_settings_get',
    'Get current lab planning settings such as material tracking mode. Use this to decide whether formulation-spec additions can rely on implicit instances or should prefer explicit tracked instances.',
    {},
    async () => jsonResult({ materialTracking: effectiveMaterialTracking(ctx) }),
  );

  dualRegister(
    server,
    registry,
    'formulations_summary',
    'List local formulation specs with recipe, represented material, ingredients, preferred sources, and available instance count. Use this when the user asks what reagents or materials are available in the library; formulations are usually the primary addable objects.',
    {
      query: z.string().optional().describe('Search query'),
      outputSpecId: z.string().optional().describe('Filter by output material-spec ID'),
      hasAvailableInstances: z.boolean().optional().describe('Filter by whether the formulation has available instances'),
      limit: z.number().optional().describe('Maximum results'),
    },
    async (args) => {
      try {
        const [materials, specs, recipes, aliquots] = await Promise.all([
          ctx.store.list({ schemaId: SCHEMA_IDS.material, limit: 10000 }),
          ctx.store.list({ schemaId: SCHEMA_IDS.materialSpec, limit: 10000 }),
          ctx.store.list({ schemaId: SCHEMA_IDS.recipe, limit: 10000 }),
          ctx.store.list({ schemaId: SCHEMA_IDS.aliquot, limit: 10000 }),
        ]);

        const materialMap = new Map(materials.map((envelope) => [envelope.recordId, envelope]));
        const specMap = new Map(specs.map((envelope) => [envelope.recordId, envelope]));
        const availableAliquotsBySpec = new Map<string, number>();
        for (const envelope of aliquots) {
          const payload = asPayload(envelope.payload);
          if (!payload || payload.kind !== 'aliquot') continue;
          const specRef = refValue(payload.material_spec_ref);
          if (!specRef?.id) continue;
          const status = stringValue(payload.status);
          if (status && status !== 'available') continue;
          availableAliquotsBySpec.set(specRef.id, (availableAliquotsBySpec.get(specRef.id) ?? 0) + 1);
        }

        let items = recipes
          .map((envelope) => {
            const payload = asPayload(envelope.payload);
            if (!payload || payload.kind !== 'recipe') return null;
            const outputSpecRef = refValue(payload.output_material_spec_ref);
            if (!outputSpecRef?.id) return null;
            const specPayload = asPayload(specMap.get(outputSpecRef.id)?.payload);
            const representedMaterialRef = refValue(specPayload?.material_ref);
            const representedMaterialPayload = asPayload(
              representedMaterialRef?.id ? materialMap.get(representedMaterialRef.id)?.payload : null,
            );
            const score = matchScore(
              args.query ?? '',
              stringValue(payload.name),
              stringValue(specPayload?.name),
              stringValue(representedMaterialPayload?.name),
            );
            if (normalize(args.query ?? '').length > 0 && score === 0) return null;
            return {
              recipeId: envelope.recordId,
              recipeName: stringValue(payload.name) ?? envelope.recordId,
              outputSpecId: outputSpecRef.id,
              outputSpecName: stringValue(specPayload?.name) ?? outputSpecRef.label ?? outputSpecRef.id,
              ...(representedMaterialRef?.id
                ? {
                    representedMaterial: {
                      id: representedMaterialRef.id,
                      label: stringValue(representedMaterialPayload?.name) ?? representedMaterialRef.label ?? representedMaterialRef.id,
                    },
                  }
                : {}),
              ingredients: Array.isArray(payload.input_roles)
                ? payload.input_roles
                    .filter(isObject)
                    .map((role) => {
                      const materialRef = refValue(role.material_ref);
                      const materialPayload = asPayload(materialRef?.id ? materialMap.get(materialRef.id)?.payload : null);
                      const specRef = Array.isArray(role.allowed_material_spec_refs)
                        ? refValue(role.allowed_material_spec_refs.find(isObject))
                        : null;
                      return (
                        stringValue(materialPayload?.name)
                        ?? materialRef?.label
                        ?? specRef?.label
                        ?? stringValue(role.role_id)
                        ?? 'ingredient'
                      );
                    })
                : [],
              preferredSources: Array.isArray(payload.preferred_sources)
                ? payload.preferred_sources.filter(isObject).map((source) => ({
                    roleId: stringValue(source.role_id) ?? '',
                    vendor: stringValue(source.vendor),
                    catalogNumber: stringValue(source.catalog_number),
                  })).filter((source) => source.roleId)
                : [],
              inventoryAvailableCount: availableAliquotsBySpec.get(outputSpecRef.id) ?? 0,
              score,
            };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item));

        if (args.outputSpecId) {
          items = items.filter((item) => item.outputSpecId === args.outputSpecId);
        }
        if (typeof args.hasAvailableInstances === 'boolean') {
          items = items.filter((item) => (item.inventoryAvailableCount > 0) === args.hasAvailableInstances);
        }

        items.sort((a, b) => b.score - a.score || a.recipeName.localeCompare(b.recipeName));
        if (typeof args.limit === 'number' && args.limit > 0) {
          items = items.slice(0, args.limit);
        }

        return jsonResult({ items });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(
    server,
    registry,
    'inventory_list',
    'List local prepared instances with formulation/spec and lot metadata. Use this when the user asks what tracked batches, prepared tubes, or lot-backed instances are available.',
    {
      query: z.string().optional().describe('Search query'),
      materialSpecId: z.string().optional().describe('Filter by material-spec ID'),
      status: z.string().optional().describe('Filter by instance status'),
      limit: z.number().optional().describe('Maximum results'),
    },
    async (args) => {
      try {
        const [specs, aliquots] = await Promise.all([
          ctx.store.list({ schemaId: SCHEMA_IDS.materialSpec, limit: 10000 }),
          ctx.store.list({ schemaId: SCHEMA_IDS.aliquot, limit: 10000 }),
        ]);
        const specMap = new Map(specs.map((envelope) => [envelope.recordId, envelope]));
        let items = aliquots
          .map((envelope) => {
            const payload = asPayload(envelope.payload);
            if (!payload || payload.kind !== 'aliquot') return null;
            const specRef = refValue(payload.material_spec_ref);
            if (!specRef?.id) return null;
            const specPayload = asPayload(specMap.get(specRef.id)?.payload);
            const score = matchScore(
              args.query ?? '',
              stringValue(payload.name),
              stringValue(specPayload?.name),
              stringValue(payload.status),
            );
            if (normalize(args.query ?? '').length > 0 && score === 0) return null;
            return {
              aliquotId: envelope.recordId,
              name: stringValue(payload.name) ?? envelope.recordId,
              status: stringValue(payload.status),
              materialSpec: {
                id: specRef.id,
                name: stringValue(specPayload?.name) ?? specRef.label ?? specRef.id,
              },
              lot: isObject(payload.lot)
                ? {
                    vendor: stringValue(payload.lot.vendor),
                    catalogNumber: stringValue(payload.lot.catalog_number),
                    lotNumber: stringValue(payload.lot.lot_number),
                  }
                : undefined,
              score,
            };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item));

        if (args.materialSpecId) {
          items = items.filter((item) => item.materialSpec.id === args.materialSpecId);
        }
        if (args.status) {
          items = items.filter((item) => item.status === args.status);
        }
        items.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
        if (typeof args.limit === 'number' && args.limit > 0) {
          items = items.slice(0, args.limit);
        }
        return jsonResult({ items });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(
    server,
    registry,
    'materials_search_addable',
    'Primary tool for answering what materials are available or addable in the lab. Searches local addable results ranked for event authoring: formulations first, instances second, material concepts third. Prefer this over generic library_search for availability questions.',
    {
      query: z.string().describe('Search query'),
      limit: z.number().optional().describe('Maximum results'),
    },
    async (args) => {
      try {
        const [materials, specs, recipes, aliquots] = await Promise.all([
          ctx.store.list({ schemaId: SCHEMA_IDS.material, limit: 10000 }),
          ctx.store.list({ schemaId: SCHEMA_IDS.materialSpec, limit: 10000 }),
          ctx.store.list({ schemaId: SCHEMA_IDS.recipe, limit: 10000 }),
          ctx.store.list({ schemaId: SCHEMA_IDS.aliquot, limit: 10000 }),
        ]);

        const recipeByOutputSpec = new Map<string, string>();
        for (const recipe of recipes) {
          const payload = asPayload(recipe.payload);
          const outputSpecRef = refValue(payload?.output_material_spec_ref);
          if (outputSpecRef?.id) {
            recipeByOutputSpec.set(outputSpecRef.id, stringValue(payload?.name) ?? recipe.recordId);
          }
        }

        const results: Array<Record<string, unknown>> = [];

        for (const spec of specs) {
          const payload = asPayload(spec.payload);
          if (!payload) continue;
          const name = stringValue(payload.name) ?? spec.recordId;
          const score = matchScore(args.query, name, recipeByOutputSpec.get(spec.recordId));
          if (score === 0) continue;
          results.push({
            kind: 'formulation',
            ref: { kind: 'record', id: spec.recordId, type: 'material-spec', label: name },
            label: name,
            recipeName: recipeByOutputSpec.get(spec.recordId),
            score: score + 300,
          });
        }

        for (const aliquot of aliquots) {
          const payload = asPayload(aliquot.payload);
          if (!payload || payload.kind !== 'aliquot') continue;
          const name = stringValue(payload.name) ?? aliquot.recordId;
          const specRef = refValue(payload.material_spec_ref);
          const score = matchScore(args.query, name, specRef?.label);
          if (score === 0) continue;
          results.push({
            kind: 'instance',
            ref: { kind: 'record', id: aliquot.recordId, type: 'aliquot', label: name },
            label: name,
            materialSpecId: specRef?.id,
            score: score + 200,
          });
        }

        for (const material of materials) {
          const payload = asPayload(material.payload);
          if (!payload) continue;
          const name = stringValue(payload.name) ?? material.recordId;
          const score = matchScore(args.query, name, material.recordId);
          if (score === 0) continue;
          results.push({
            kind: 'material',
            ref: { kind: 'record', id: material.recordId, type: 'material', label: name },
            label: name,
            score: score + 100,
          });
        }

        results.sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0) || String(a.label).localeCompare(String(b.label)));
        const limited = typeof args.limit === 'number' && args.limit > 0 ? results.slice(0, args.limit) : results.slice(0, 25);

        return jsonResult({
          results: limited,
          groups: {
            formulations: limited.filter((entry) => entry.kind === 'formulation'),
            instances: limited.filter((entry) => entry.kind === 'instance'),
            materials: limited.filter((entry) => entry.kind === 'material'),
          },
        });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}
