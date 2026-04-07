/**
 * MCP prompts for guided record creation and study overview.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';

export function registerScientificPrompts(server: McpServer, ctx: AppContext): void {
  // create_record — Guided record creation prompt
  server.prompt(
    'create_record',
    'Get guidance for creating a new record of a given schema type. Returns the schema structure, required fields, and constraints.',
    { schemaId: z.string().describe('Schema ID for the record type to create') },
    async (args) => {
      const entry = ctx.schemaRegistry.getById(args.schemaId);
      if (!entry) {
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Schema not found: ${args.schemaId}\n\nAvailable schemas:\n${ctx.schemaRegistry.getAllIds().join('\n')}`,
              },
            },
          ],
        };
      }

      const schema = entry.schema as Record<string, unknown>;
      const required = (schema.required as string[]) ?? [];
      const properties = schema.properties as Record<string, unknown> ?? {};

      // Build field descriptions
      const fieldDescriptions = Object.entries(properties).map(([name, prop]) => {
        const p = prop as Record<string, unknown>;
        const isRequired = required.includes(name);
        const type = p.type ?? 'unknown';
        const desc = p.description ?? '';
        const enumValues = p.enum ? ` (values: ${(p.enum as string[]).join(', ')})` : '';
        return `  - ${name}${isRequired ? ' (REQUIRED)' : ''}: ${type}${enumValues}${desc ? ` — ${desc}` : ''}`;
      });

      const text = [
        `# Create a new ${args.schemaId} record`,
        '',
        `Schema: ${entry.id}`,
        `Path: ${entry.path}`,
        '',
        '## Required fields:',
        ...required.map((f) => `  - ${f}`),
        '',
        '## All fields:',
        ...fieldDescriptions,
        '',
        '## Instructions:',
        '1. Use the `record_create` tool with the schemaId and a payload object',
        '2. The payload MUST include a `recordId` or `id` field for identity',
        '3. All required fields must be present',
        '4. Validation and lint results will be returned inline for correction',
      ].join('\n');

      return {
        messages: [
          { role: 'user', content: { type: 'text', text } },
        ],
      };
    }
  );

  // study_overview — Get a structured overview of a study
  server.prompt(
    'study_overview',
    'Get a structured overview of a study including its hierarchy and record counts.',
    { studyId: z.string().describe('Study record ID') },
    async (args) => {
      const studies = await ctx.indexManager.getStudyTree();
      const study = studies.find((s) => s.recordId === args.studyId);

      if (!study) {
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Study not found: ${args.studyId}\n\nAvailable studies:\n${studies.map((s) => `  - ${s.recordId}: ${s.title}`).join('\n')}`,
              },
            },
          ],
        };
      }

      // Get the study record for full details
      const record = await ctx.store.get(args.studyId);

      const lines = [
        `# Study: ${study.title}`,
        `ID: ${study.recordId}`,
        `Path: ${study.path}`,
        '',
      ];

      if (record) {
        const payload = record.payload as Record<string, unknown>;
        if (payload.description) {
          lines.push(`Description: ${payload.description}`, '');
        }
      }

      lines.push(`## Experiments (${study.experiments.length})`);
      for (const exp of study.experiments) {
        lines.push(`### ${exp.title} (${exp.recordId})`);
        lines.push(`  Runs: ${exp.runs.length}`);
        for (const run of exp.runs) {
          const counts = run.recordCounts;
          const total = Object.values(counts).reduce((a, b) => a + b, 0);
          lines.push(`  - ${run.title} (${run.recordId}): ${total} records`);
          if (total > 0) {
            const parts = [];
            if (counts.eventGraphs) parts.push(`${counts.eventGraphs} event graphs`);
            if (counts.plates) parts.push(`${counts.plates} plates`);
            if (counts.claims) parts.push(`${counts.claims} claims`);
            if (counts.materials) parts.push(`${counts.materials} materials`);
            if (counts.contexts) parts.push(`${counts.contexts} contexts`);
            if (counts.attachments) parts.push(`${counts.attachments} attachments`);
            if (counts.other) parts.push(`${counts.other} other`);
            lines.push(`    (${parts.join(', ')})`);
          }
        }
        lines.push('');
      }

      return {
        messages: [
          { role: 'user', content: { type: 'text', text: lines.join('\n') } },
        ],
      };
    }
  );
}
