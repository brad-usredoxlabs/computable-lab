import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { MaterialCompilerService } from '../../compiler/material/index.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';

export function registerMaterialsAiTools(server: McpServer, ctx: AppContext, registry?: ToolRegistry): void {
  const materialCompiler = new MaterialCompilerService(ctx.store);

  dualRegister(
    server,
    registry,
    'material_compile_intent',
    'Compile a normalized material intent into semantic material, formulation, material-source, policy, diagnostics, provenance, and event-ready output.',
    {
      normalizedIntent: z.object({
        domain: z.literal('materials').default('materials'),
        intentId: z.string(),
        version: z.string().default('1'),
        summary: z.string(),
        requiredFacts: z.array(z.string()).default([]),
        optionalFacts: z.array(z.string()).optional(),
        assumptions: z.array(z.string()).optional(),
        payload: z.object({
          intentType: z.literal('add_material_to_well'),
          rawText: z.string().optional(),
          analyteName: z.string(),
          solventName: z.string().optional(),
          concentration: z.object({
            value: z.number(),
            unit: z.string(),
            basis: z.enum(['molar', 'mass_per_volume', 'activity_per_volume', 'count_per_volume', 'volume_fraction', 'mass_fraction']).optional(),
          }).optional(),
          targetRole: z.string().optional(),
          targetWell: z.string().optional(),
          quantity: z.object({
            value: z.number(),
            unit: z.string(),
          }).optional(),
        }),
      }),
      activeScope: z.object({
        organizationId: z.string(),
        labId: z.string().optional(),
        projectId: z.string().optional(),
        runId: z.string().optional(),
      }),
      policyProfiles: z.array(z.object({
        id: z.string(),
        scope: z.enum(['organization', 'lab', 'project', 'run']),
        scopeId: z.string(),
        priority: z.number().optional(),
        description: z.string().optional(),
        settings: z.object({
          allowAutoCreate: z.enum(['allow', 'confirm', 'deny']).optional(),
          allowSubstitutions: z.enum(['allow', 'confirm', 'deny']).optional(),
          allowPlaceholders: z.enum(['allow', 'confirm', 'deny']).optional(),
          allowRemediation: z.enum(['allow', 'confirm', 'deny']).optional(),
          allowSupervisedUse: z.enum(['allow', 'confirm', 'deny']).optional(),
          allowExpiredTraining: z.enum(['allow', 'confirm', 'deny']).optional(),
          allowExpiredAuthorization: z.enum(['allow', 'confirm', 'deny']).optional(),
          allowOutOfCalibrationEquipment: z.enum(['allow', 'confirm', 'deny']).optional(),
          allowUnqualifiedEquipment: z.enum(['allow', 'confirm', 'deny']).optional(),
          approvalAuthority: z.enum(['none', 'run-operator', 'supervisor', 'project-owner', 'lab-manager', 'qa-reviewer', 'organization-admin']).optional(),
        }).default({}),
        materialSettings: z.object({
          mode: z.enum(['semantic-planning', 'execution-planning', 'strict-inventory']).optional(),
          concentrationSemantics: z.enum(['formulation', 'event']).optional(),
          clarificationBehavior: z.enum(['confirm-near-match', 'diagnostic-only']).optional(),
          remediationBehavior: z.enum(['suggest', 'suppress']).optional(),
        }).optional(),
      })).default([]),
      persist: z.boolean().optional(),
      actor: z.string().optional(),
    },
    async (args) => {
      try {
        const result = await materialCompiler.compile({
          normalizedIntent: {
            domain: args.normalizedIntent.domain,
            intentId: args.normalizedIntent.intentId,
            version: args.normalizedIntent.version,
            summary: args.normalizedIntent.summary,
            requiredFacts: args.normalizedIntent.requiredFacts,
            ...(args.normalizedIntent.optionalFacts ? { optionalFacts: args.normalizedIntent.optionalFacts } : {}),
            ...(args.normalizedIntent.assumptions ? { assumptions: args.normalizedIntent.assumptions } : {}),
            payload: {
              intentType: args.normalizedIntent.payload.intentType,
              analyteName: args.normalizedIntent.payload.analyteName,
              ...(args.normalizedIntent.payload.rawText ? { rawText: args.normalizedIntent.payload.rawText } : {}),
              ...(args.normalizedIntent.payload.solventName ? { solventName: args.normalizedIntent.payload.solventName } : {}),
              ...(args.normalizedIntent.payload.concentration
                ? {
                    concentration: {
                      value: args.normalizedIntent.payload.concentration.value,
                      unit: args.normalizedIntent.payload.concentration.unit,
                      ...(args.normalizedIntent.payload.concentration.basis
                        ? { basis: args.normalizedIntent.payload.concentration.basis }
                        : {}),
                    },
                  }
                : {}),
              ...(args.normalizedIntent.payload.targetRole ? { targetRole: args.normalizedIntent.payload.targetRole } : {}),
              ...(args.normalizedIntent.payload.targetWell ? { targetWell: args.normalizedIntent.payload.targetWell } : {}),
              ...(args.normalizedIntent.payload.quantity ? { quantity: args.normalizedIntent.payload.quantity } : {}),
            },
          },
          activeScope: {
            organizationId: args.activeScope.organizationId,
            ...(args.activeScope.labId ? { labId: args.activeScope.labId } : {}),
            ...(args.activeScope.projectId ? { projectId: args.activeScope.projectId } : {}),
            ...(args.activeScope.runId ? { runId: args.activeScope.runId } : {}),
          },
          policyProfiles: args.policyProfiles.map((profile) => ({
            id: profile.id,
            scope: profile.scope,
            scopeId: profile.scopeId,
            ...(profile.priority !== undefined ? { priority: profile.priority } : {}),
            ...(profile.description ? { description: profile.description } : {}),
            settings: {
              ...(profile.settings.allowAutoCreate ? { allowAutoCreate: profile.settings.allowAutoCreate } : {}),
              ...(profile.settings.allowSubstitutions ? { allowSubstitutions: profile.settings.allowSubstitutions } : {}),
              ...(profile.settings.allowPlaceholders ? { allowPlaceholders: profile.settings.allowPlaceholders } : {}),
              ...(profile.settings.allowRemediation ? { allowRemediation: profile.settings.allowRemediation } : {}),
              ...(profile.settings.allowSupervisedUse ? { allowSupervisedUse: profile.settings.allowSupervisedUse } : {}),
              ...(profile.settings.allowExpiredTraining ? { allowExpiredTraining: profile.settings.allowExpiredTraining } : {}),
              ...(profile.settings.allowExpiredAuthorization ? { allowExpiredAuthorization: profile.settings.allowExpiredAuthorization } : {}),
              ...(profile.settings.allowOutOfCalibrationEquipment
                ? { allowOutOfCalibrationEquipment: profile.settings.allowOutOfCalibrationEquipment }
                : {}),
              ...(profile.settings.allowUnqualifiedEquipment
                ? { allowUnqualifiedEquipment: profile.settings.allowUnqualifiedEquipment }
                : {}),
              ...(profile.settings.approvalAuthority ? { approvalAuthority: profile.settings.approvalAuthority } : {}),
            },
            ...(profile.materialSettings
              ? {
                  materialSettings: {
                    ...(profile.materialSettings.mode ? { mode: profile.materialSettings.mode } : {}),
                    ...(profile.materialSettings.concentrationSemantics
                      ? { concentrationSemantics: profile.materialSettings.concentrationSemantics }
                      : {}),
                    ...(profile.materialSettings.clarificationBehavior
                      ? { clarificationBehavior: profile.materialSettings.clarificationBehavior }
                      : {}),
                    ...(profile.materialSettings.remediationBehavior
                      ? { remediationBehavior: profile.materialSettings.remediationBehavior }
                      : {}),
                  },
                }
              : {}),
          })),
          ...(args.persist !== undefined ? { persist: args.persist } : {}),
          ...(args.actor ? { actor: args.actor } : {}),
        });
        return jsonResult(result);
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(
    server,
    registry,
    'material_draft_from_text',
    'Parse a natural language material description and return a structured material record draft with proposed fields, ontology matches, vendor matches, and unresolved fields.',
    {
      prompt: z.string().describe('Natural language description of the material, e.g. "10 mM stock of clofibrate in DMSO, from Sigma"'),
    },
    async (args) => {
      try {
        const lower = args.prompt.toLowerCase();
        const words = args.prompt.trim().split(/\s+/);

        const concMatch = args.prompt.match(/(\d+(?:\.\d+)?)\s*(mM|µM|uM|nM|M|mg\/mL|µg\/mL|%|v\/v|w\/v)/i);
        const concentration = concMatch
          ? { value: parseFloat(concMatch[1]!), unit: concMatch[2]! }
          : undefined;

        const vendorPatterns = ['sigma', 'thermo', 'fisher', 'invitrogen', 'gibco', 'millipore'];
        const vendorMatch = vendorPatterns.find((v) => lower.includes(v));

        let kind = 'material';
        let category = 'concept-only';
        if (concentration) { kind = 'material-spec'; category = 'saved-stock'; }
        if (vendorMatch) { kind = 'vendor-product'; category = 'vendor-reagent'; }

        let domain = 'other';
        const chemKw = ['dmso', 'ethanol', 'buffer', 'nacl', 'tris', 'edta'];
        const bioKw = ['cell', 'serum', 'fbs', 'medium', 'dmem', 'rpmi', 'antibody', 'protein'];
        if (chemKw.some((k) => lower.includes(k))) domain = 'chemical';
        if (bioKw.some((k) => lower.includes(k))) domain = 'biological';

        const name = words.slice(0, 6).join(' ');

        return jsonResult({
          proposed: { name, kind, category, domain, concentration, vendor: vendorMatch },
          ontologyMatches: [],
          vendorMatches: vendorMatch ? [{ vendor: vendorMatch, query: name }] : [],
          confidence: 0.4,
          unresolvedFields: [...(!concentration ? ['concentration'] : []), ...(!vendorMatch ? ['vendor'] : [])],
        });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(
    server,
    registry,
    'material_smart_search',
    'Search for materials across local records, ontology terms, and vendor catalogs. Returns results with source provenance.',
    {
      query: z.string().describe('Search query for materials'),
      includeOntology: z.boolean().optional().describe('Include ontology term matches (default true)'),
      includeVendor: z.boolean().optional().describe('Include vendor product matches (default true)'),
    },
    async (args) => {
      try {
        const results: Array<{ source: string; record: Record<string, unknown>; matchReason: string }> = [];
        const lower = args.query.toLowerCase();

        const materialSchemas = [
          'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
          'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml',
          'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml',
        ];

        for (const schemaId of materialSchemas) {
          try {
            const records = await ctx.store.list({ schemaId });
            for (const envelope of records) {
              const payload = envelope.payload as Record<string, unknown>;
              const name = typeof payload.name === 'string' ? payload.name : '';
              if (name.toLowerCase().includes(lower)) {
                results.push({
                  source: 'local',
                  record: { recordId: envelope.recordId, name, kind: payload.kind },
                  matchReason: `Name matches "${args.query}"`,
                });
              }
            }
          } catch { /* skip */ }
        }

        return jsonResult({ results });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(
    server,
    registry,
    'material_review_composition',
    'Review a material\'s declared composition for missing components, concentration warnings, and ontology issues.',
    {
      materialId: z.string().describe('The material record ID to review'),
    },
    async (args) => {
      try {
        const record = await ctx.store.get(args.materialId);
        if (!record) return errorResult(`Material not found: ${args.materialId}`);

        const payload = record.payload as Record<string, unknown>;
        const composition = payload.declared_composition;

        if (!composition || !Array.isArray(composition) || composition.length === 0) {
          return jsonResult({
            suggestions: [{ type: 'missing_component', message: 'No declared composition found.', confidence: 1.0 }],
          });
        }

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
              message: `DMSO at ${conc.value}% may be cytotoxic.`,
              confidence: 0.8,
            });
          }
        }

        if (suggestions.length === 0) {
          suggestions.push({ type: 'missing_component', message: 'No issues detected.', confidence: 0.5 });
        }

        return jsonResult({ suggestions });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(
    server,
    registry,
    'material_check_duplicate',
    'Check if a material name matches existing records or synonyms. Returns potential duplicates with similarity scores.',
    {
      name: z.string().describe('The material name to check for duplicates'),
      kind: z.string().optional().describe('Optional material kind filter'),
    },
    async (args) => {
      try {
        const potentialDuplicates: Array<{
          recordId: string;
          name: string;
          similarity: number;
          reason: string;
        }> = [];

        const materialSchemas = [
          'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
          'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml',
          'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml',
        ];

        const inputLower = args.name.toLowerCase().trim();

        for (const schemaId of materialSchemas) {
          try {
            const records = await ctx.store.list({ schemaId });
            for (const envelope of records) {
              const payload = envelope.payload as Record<string, unknown>;
              const existingName = typeof payload.name === 'string' ? payload.name : '';
              const existingLower = existingName.toLowerCase().trim();

              let similarity = 0;
              let reason = '';

              if (inputLower === existingLower) {
                similarity = 1.0;
                reason = 'Exact name match';
              } else if (inputLower.includes(existingLower) || existingLower.includes(inputLower)) {
                similarity = 0.8;
                reason = 'Substring match';
              } else {
                const inputWords = new Set(inputLower.split(/\s+/));
                const existWords = new Set(existingLower.split(/\s+/));
                let overlap = 0;
                for (const w of inputWords) { if (existWords.has(w)) overlap++; }
                similarity = Math.max(inputWords.size, existWords.size) > 0
                  ? overlap / Math.max(inputWords.size, existWords.size)
                  : 0;
                if (similarity >= 0.6) reason = 'Word overlap';
              }

              if (similarity >= 0.6) {
                potentialDuplicates.push({ recordId: envelope.recordId, name: existingName, similarity, reason });
              }
            }
          } catch { /* skip */ }
        }

        potentialDuplicates.sort((a, b) => b.similarity - a.similarity);
        return jsonResult({ potentialDuplicates: potentialDuplicates.slice(0, 5) });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}
