import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { primaryParsedCompositionEntries, type ParsedCompositionEntry } from '../../materials/composition.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';

const SCHEMA_IDS = {
  material: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
  materialSpec: 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml',
  recipe: 'https://computable-lab.com/schema/computable-lab/recipe.schema.yaml',
  aliquot: 'https://computable-lab.com/schema/computable-lab/aliquot.schema.yaml',
  vendorProduct: 'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml',
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

function quantityValue(value: unknown): { value: number; unit: string } | undefined {
  if (!isObject(value)) return undefined;
  if (typeof value.value !== 'number' || !Number.isFinite(value.value)) return undefined;
  const unit = stringValue(value.unit);
  if (!unit) return undefined;
  return { value: value.value, unit };
}

function concentrationValue(
  value: unknown,
): { value: number; unit: string; basis?: string } | undefined {
  if (!isObject(value)) return undefined;
  if (typeof value.value !== 'number' || !Number.isFinite(value.value)) return undefined;
  const unit = stringValue(value.unit);
  if (!unit) return undefined;
  const basis = stringValue(value.basis);
  return { value: value.value, unit, ...(basis ? { basis } : {}) };
}

type ConcentrationShape = ReturnType<typeof concentrationValue>;
type RefShape = NonNullable<ReturnType<typeof refValue>>;

type MaterialSpecSummary = {
  recordType: 'material-spec';
  recordId: string;
  name: string;
  representedMaterial?: {
    id: string;
    label: string;
  };
  concentration?: NonNullable<ConcentrationShape>;
  concentrationUnknown?: boolean;
  composition?: ParsedCompositionEntry[];
  solventRef?: {
    id: string;
    label?: string;
  };
  recipe?: {
    id: string;
    name: string;
    inputRoles: Array<{
      roleId: string;
      roleType: string;
      materialRef?: RefShape;
      quantity?: { value: number; unit: string };
    }>;
  };
};

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
            const specFormulation = asPayload(specPayload?.formulation);
            const recipeOutput = asPayload(payload.output);
            const concentration = concentrationValue(recipeOutput?.concentration) ?? concentrationValue(specFormulation?.concentration);
            const composition = primaryParsedCompositionEntries(recipeOutput?.composition, specFormulation?.composition);
            const solventRef = refValue(recipeOutput?.solvent_ref) ?? refValue(specFormulation?.solvent_ref);
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
              outputSpec: {
                id: outputSpecRef.id,
                name: stringValue(specPayload?.name) ?? outputSpecRef.label ?? outputSpecRef.id,
                ...(representedMaterialRef?.id
                  ? {
                      representedMaterial: {
                        id: representedMaterialRef.id,
                        label: stringValue(representedMaterialPayload?.name) ?? representedMaterialRef.label ?? representedMaterialRef.id,
                      },
                    }
                  : {}),
                ...(concentration ? { concentration } : {}),
                ...(composition.length > 0 ? { composition } : {}),
                ...(solventRef?.id ? { solventRef: { id: solventRef.id, ...(solventRef.label ? { label: solventRef.label } : {}) } } : {}),
              },
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
              inputRoles: Array.isArray(payload.input_roles)
                ? payload.input_roles
                    .filter(isObject)
                    .map((role) => ({
                      roleId: stringValue(role.role_id) ?? 'input',
                      roleType: stringValue(role.role_type) ?? 'other',
                      ...(refValue(role.material_ref)?.id
                        ? { materialRef: refValue(role.material_ref) }
                        : {}),
                      ...(refValue(role.vendor_product_ref)?.id
                        ? { vendorProductRef: refValue(role.vendor_product_ref) }
                        : {}),
                      ...(Array.isArray(role.allowed_material_spec_refs)
                        ? {
                            allowedMaterialSpecRefs: role.allowed_material_spec_refs
                              .map(refValue)
                              .filter((entry): entry is NonNullable<ReturnType<typeof refValue>> => Boolean(entry)),
                          }
                        : {}),
                      ...(quantityValue(role.quantity) ? { quantity: quantityValue(role.quantity) } : {}),
                    }))
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
            const specFormulation = asPayload(specPayload?.formulation);
            const concentration = concentrationValue(payload.concentration) ?? concentrationValue(specFormulation?.concentration);
            const solventRef = refValue(specFormulation?.solvent_ref);
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
              ...(quantityValue(payload.volume) ? { volume: quantityValue(payload.volume) } : {}),
              ...(concentration ? { concentration } : { concentrationUnknown: true }),
              ...(solventRef?.id ? { solventRef: { id: solventRef.id, ...(solventRef.label ? { label: solventRef.label } : {}) } } : {}),
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
        const specMeta = new Map<string, { concentration?: NonNullable<ConcentrationShape>; solventLabel?: string }>();
        for (const recipe of recipes) {
          const payload = asPayload(recipe.payload);
          const outputSpecRef = refValue(payload?.output_material_spec_ref);
          if (outputSpecRef?.id) {
            recipeByOutputSpec.set(outputSpecRef.id, stringValue(payload?.name) ?? recipe.recordId);
          }
        }
        for (const spec of specs) {
          const payload = asPayload(spec.payload);
          if (!payload) continue;
          const formulation = asPayload(payload.formulation);
          const solventRef = refValue(formulation?.solvent_ref);
          const entry: { concentration?: NonNullable<ConcentrationShape>; solventLabel?: string } = {};
          const concentration = concentrationValue(formulation?.concentration);
          if (concentration) entry.concentration = concentration;
          if (solventRef?.label) entry.solventLabel = solventRef.label;
          specMeta.set(spec.recordId, entry);
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
            ...(specMeta.get(spec.recordId)?.concentration ? { concentration: specMeta.get(spec.recordId)!.concentration } : {}),
            ...(specMeta.get(spec.recordId)?.solventLabel ? { solventLabel: specMeta.get(spec.recordId)!.solventLabel } : {}),
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
            ...(specRef?.id && specMeta.get(specRef.id)?.concentration ? { concentration: specMeta.get(specRef.id)!.concentration } : {}),
            ...(specRef?.id && specMeta.get(specRef.id)?.solventLabel ? { solventLabel: specMeta.get(specRef.id)!.solventLabel } : {}),
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

  dualRegister(
    server,
    registry,
    'material_composition_get',
    'Get concentration-bearing formulation or aliquot details for a material-spec, aliquot, recipe, vendor-product, or generic record ID. Use this when you need exact concentration, solvent, output composition, or to distinguish known vs unknown concentration.',
    {
      recordId: z.string().optional().describe('Generic record ID for a material-spec, aliquot, or recipe'),
      materialSpecId: z.string().optional().describe('Material-spec ID'),
      aliquotId: z.string().optional().describe('Aliquot ID'),
      recipeId: z.string().optional().describe('Recipe ID'),
    },
    async (args) => {
      try {
        const targetId = args.materialSpecId || args.aliquotId || args.recipeId || args.recordId;
        if (!targetId) return errorResult('Provide one of recordId, materialSpecId, aliquotId, or recipeId');

        const [materials, specs, recipes] = await Promise.all([
          ctx.store.list({ schemaId: SCHEMA_IDS.material, limit: 10000 }),
          ctx.store.list({ schemaId: SCHEMA_IDS.materialSpec, limit: 10000 }),
          ctx.store.list({ schemaId: SCHEMA_IDS.recipe, limit: 10000 }),
        ]);

        const materialMap = new Map(materials.map((envelope) => [envelope.recordId, envelope]));
        const specMap = new Map(specs.map((envelope) => [envelope.recordId, envelope]));
        const recipeMap = new Map(recipes.map((envelope) => [envelope.recordId, envelope]));

        const recipeForSpec = (materialSpecId: string) =>
          recipes.find((envelope) => refValue(asPayload(envelope.payload)?.output_material_spec_ref)?.id === materialSpecId) ?? null;

        const envelope = await ctx.store.get(targetId);
        const payload = asPayload(envelope?.payload);

        const buildSpecSummary = (specId: string): MaterialSpecSummary | null => {
          const specPayload = asPayload(specMap.get(specId)?.payload);
          if (!specPayload) return null;
          const formulation = asPayload(specPayload.formulation);
          const materialRef = refValue(specPayload.material_ref);
          const materialPayload = asPayload(materialRef?.id ? materialMap.get(materialRef.id)?.payload : null);
          const solventRef = refValue(formulation?.solvent_ref);
          const recipeEnvelope = recipeForSpec(specId);
          const recipePayload = asPayload(recipeEnvelope?.payload);
          const composition = primaryParsedCompositionEntries(asPayload(recipePayload?.output)?.composition, formulation?.composition);
          const summary: MaterialSpecSummary = {
            recordType: 'material-spec',
            recordId: specId,
            name: stringValue(specPayload.name) ?? specId,
            ...(materialRef?.id
              ? {
                  representedMaterial: {
                    id: materialRef.id,
                    label: stringValue(materialPayload?.name) ?? materialRef.label ?? materialRef.id,
                  },
                }
              : {}),
            ...(concentrationValue(formulation?.concentration)
              ? { concentration: concentrationValue(formulation?.concentration)! }
              : { concentrationUnknown: true }),
            ...(composition.length > 0 ? { composition } : {}),
            ...(solventRef?.id ? { solventRef: { id: solventRef.id, ...(solventRef.label ? { label: solventRef.label } : {}) } } : {}),
            ...(recipeEnvelope && recipePayload
              ? {
                  recipe: {
                    id: recipeEnvelope.recordId,
                    name: stringValue(recipePayload.name) ?? recipeEnvelope.recordId,
                    inputRoles: Array.isArray(recipePayload.input_roles)
                      ? recipePayload.input_roles
                          .filter(isObject)
                          .map((role) => {
                            const materialRef = refValue(role.material_ref);
                            const quantity = quantityValue(role.quantity);
                            return {
                              roleId: stringValue(role.role_id) ?? 'input',
                              roleType: stringValue(role.role_type) ?? 'other',
                              ...(materialRef?.id ? { materialRef } : {}),
                              ...(quantity ? { quantity } : {}),
                            };
                          })
                      : [],
                  },
                }
              : {}),
          };
          return summary;
        };

        if (payload?.kind === 'aliquot' || args.aliquotId) {
          const aliquotPayload = payload ?? asPayload((await ctx.store.get(args.aliquotId!))?.payload);
          if (!aliquotPayload) return errorResult(`Aliquot not found: ${targetId}`);
          const specRef = refValue(aliquotPayload.material_spec_ref);
          const specSummary = specRef?.id ? buildSpecSummary(specRef.id) : null;
          const concentration = concentrationValue(aliquotPayload.concentration) ?? specSummary?.concentration;
          return jsonResult({
            recordType: 'aliquot',
            recordId: stringValue(aliquotPayload.id) ?? targetId,
            name: stringValue(aliquotPayload.name) ?? targetId,
            ...(specRef?.id ? { materialSpec: { id: specRef.id, ...(specRef.label ? { label: specRef.label } : {}) } } : {}),
            ...(quantityValue(aliquotPayload.volume) ? { volume: quantityValue(aliquotPayload.volume) } : {}),
            ...(concentration ? { concentration } : { concentrationUnknown: true }),
            ...(specSummary?.composition?.length ? { composition: specSummary.composition } : {}),
            ...(specSummary?.solventRef ? { solventRef: specSummary.solventRef } : {}),
            ...(specSummary?.representedMaterial ? { representedMaterial: specSummary.representedMaterial } : {}),
            ...(isObject(aliquotPayload.lot)
              ? {
                  lot: {
                    vendor: stringValue(aliquotPayload.lot.vendor),
                    catalogNumber: stringValue(aliquotPayload.lot.catalog_number),
                    lotNumber: stringValue(aliquotPayload.lot.lot_number),
                  },
                }
              : {}),
          });
        }

        if (payload?.kind === 'recipe' || args.recipeId) {
          const recipePayload = payload ?? asPayload(recipeMap.get(args.recipeId!)?.payload);
          if (!recipePayload) return errorResult(`Recipe not found: ${targetId}`);
          const outputSpecRef = refValue(recipePayload.output_material_spec_ref);
          const output = asPayload(recipePayload.output);
          const specSummary = outputSpecRef?.id ? buildSpecSummary(outputSpecRef.id) : null;
          const solventRef = refValue(output?.solvent_ref) ?? specSummary?.solventRef;
          const composition = primaryParsedCompositionEntries(output?.composition, specSummary?.composition);
          return jsonResult({
            recordType: 'recipe',
            recordId: stringValue(recipePayload.id) ?? targetId,
            name: stringValue(recipePayload.name) ?? targetId,
            ...(outputSpecRef?.id ? { outputSpec: { id: outputSpecRef.id, ...(outputSpecRef.label ? { label: outputSpecRef.label } : {}) } } : {}),
            ...(concentrationValue(output?.concentration) ?? specSummary?.concentration
              ? { concentration: concentrationValue(output?.concentration) ?? specSummary?.concentration }
              : { concentrationUnknown: true }),
            ...(composition.length > 0 ? { composition } : {}),
            ...(solventRef?.id ? { solventRef: { id: solventRef.id, ...(solventRef.label ? { label: solventRef.label } : {}) } } : {}),
            inputRoles: Array.isArray(recipePayload.input_roles)
              ? recipePayload.input_roles
                  .filter(isObject)
                  .map((role) => ({
                    roleId: stringValue(role.role_id) ?? 'input',
                    roleType: stringValue(role.role_type) ?? 'other',
                    ...(refValue(role.material_ref)?.id ? { materialRef: refValue(role.material_ref) } : {}),
                    ...(refValue(role.vendor_product_ref)?.id ? { vendorProductRef: refValue(role.vendor_product_ref) } : {}),
                    ...(quantityValue(role.quantity) ? { quantity: quantityValue(role.quantity) } : {}),
                  }))
              : [],
          });
        }

        if (payload?.kind === 'vendor-product') {
          const composition = primaryParsedCompositionEntries(payload.declared_composition);
          return jsonResult({
            recordType: 'vendor-product',
            recordId: stringValue(payload.id) ?? targetId,
            name: stringValue(payload.name) ?? targetId,
            ...(composition.length > 0 ? { composition } : {}),
            ...(refValue(payload.material_ref)?.id ? { representedMaterial: refValue(payload.material_ref) } : {}),
          });
        }

        const specId = payload?.kind === 'material-spec' ? targetId : args.materialSpecId;
        if (specId) {
          const summary = buildSpecSummary(specId);
          if (!summary) return errorResult(`Material spec not found: ${specId}`);
          return jsonResult(summary);
        }

        return errorResult(`Record ${targetId} is not a supported concentration-bearing material record`);
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}
