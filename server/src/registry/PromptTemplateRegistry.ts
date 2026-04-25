/**
 * PromptTemplateRegistry — YAML discovery + zod validation + in-memory cache.
 *
 * Discovers *.yaml / *.yml files in schema/registry/prompt-templates/,
 * validates each entry, and provides a `render(id, vars?)` helper that
 * substitutes {{name}} placeholders in template content.
 */

import { z } from 'zod';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRegistryLoader, type RegistryLoader } from './RegistryLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const PromptTemplateSchema = z.object({
  kind: z.literal('prompt-template'),
  id: z.string(),
  prompt_kind: z.string(),
  description: z.string(),
  content_format: z.enum(['markdown', 'plain']),
  content: z.string(),
  variables: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum(['string', 'number', 'boolean']),
        description: z.string(),
      }),
    )
    .optional()
    .default([]),
});

export type PromptTemplate = z.infer<typeof PromptTemplateSchema>;

// ---------------------------------------------------------------------------
// Singleton loader
// ---------------------------------------------------------------------------

const DIR = resolve(__dirname, '../../../schema/registry/prompt-templates');
let singleton: RegistryLoader<PromptTemplate> | null = null;

/**
 * Return the singleton prompt-template registry.
 */
export function getPromptTemplateRegistry(): RegistryLoader<PromptTemplate> {
  if (!singleton) {
    singleton = createRegistryLoader({
      kind: 'prompt-template',
      directory: DIR,
      schema: PromptTemplateSchema,
    });
  }
  return singleton;
}

// ---------------------------------------------------------------------------
// render helper
// ---------------------------------------------------------------------------

/**
 * Look up a template by id and substitute {{name}} placeholders.
 *
 * - Throws if the template is not found.
 * - Logs a console.warn once per missing variable and substitutes empty string.
 * - Leaves malformed {{ }} braces untouched (no crash).
 */
const warnedVars = new Set<string>();

export function renderPromptTemplate(
  id: string,
  vars: Record<string, string | number | boolean> = {},
): string {
  const registry = getPromptTemplateRegistry();
  const template = registry.get(id);
  if (!template) {
    throw new Error(`PromptTemplate not found: ${id}`);
  }

  let content = template.content;

  // Substitute each variable
  for (const [name, value] of Object.entries(vars)) {
    const placeholder = `{{${name}}}`;
    if (content.includes(placeholder)) {
      content = content.replaceAll(placeholder, String(value));
    }
  }

  // Catch any remaining {{...}} that reference undefined variables
  const varPattern = /\{\{([^}]+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = varPattern.exec(content)) !== null) {
    const varName = match[1]?.trim() ?? '';
    if (varName && !(varName in vars) && !warnedVars.has(varName)) {
      warnedVars.add(varName);
      console.warn(
        `[prompt-template] Variable "${varName}" referenced but not provided; substituting empty string.`,
      );
    }
  }

  // Substitute any remaining {{var}} with empty string
  content = content.replace(/\{\{([^}]+)\}\}/g, (_match, varName) => {
    const trimmed = varName.trim();
    return trimmed in vars ? String(vars[trimmed]) : '';
  });

  return content;
}
