/**
 * IssueCardTemplateRegistry — YAML discovery + zod validation + in-memory cache.
 *
 * Discovers *.yaml / *.yml files in schema/registry/issue-card-templates/,
 * validates each entry, and provides lookup helpers for card generation.
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

export const IssueCardTemplateSchema = z.object({
  kind: z.literal('issue-card-template'),
  id: z.string(),
  category: z.enum(['user', 'system', 'mixed']),
  subcategory: z.string().optional(),
  title_template: z.string(),
  body_template: z.string(),
  suggested_change_template: z.string(),
});

export type IssueCardTemplate = z.infer<typeof IssueCardTemplateSchema>;

// ---------------------------------------------------------------------------
// Singleton loader
// ---------------------------------------------------------------------------

const DIR = resolve(__dirname, '../../../schema/registry/issue-card-templates');
let singleton: RegistryLoader<IssueCardTemplate> | null = null;

/**
 * Return the singleton issue-card-template registry.
 */
export function getIssueCardTemplateRegistry(): RegistryLoader<IssueCardTemplate> {
  if (!singleton) {
    singleton = createRegistryLoader({
      kind: 'issue-card-template',
      directory: DIR,
      schema: IssueCardTemplateSchema,
    });
  }
  return singleton;
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Look up a template by category and optional subcategory.
 * Throws if no matching template is found.
 */
export function getIssueCardTemplateByCategory(
  category: string,
  subcategory?: string,
): IssueCardTemplate {
  const registry = getIssueCardTemplateRegistry();
  const all = registry.list();

  const match = all.find((t) => {
    if (t.category !== category) return false;
    if (subcategory !== undefined && t.subcategory !== subcategory) return false;
    return true;
  });

  if (!match) {
    throw new Error(
      `IssueCardTemplate not found: category=${category}${subcategory ? `, subcategory=${subcategory}` : ''}`,
    );
  }

  return match;
}

// ---------------------------------------------------------------------------
// render helper
// ---------------------------------------------------------------------------

/**
 * Look up a template by id and substitute {{name}} placeholders in all
 * three template fields (title, body, suggested_change).
 *
 * Uses two-pass rendering: first resolves title and body from the provided
 * variables, then re-renders suggested_change_template with the resolved
 * title and body available as {{title}} and {{body}}.
 *
 * Returns { title, body, suggestedChange } with placeholders resolved.
 *
 * - Throws if the template is not found.
 * - Logs a console.warn once per missing variable and substitutes empty string.
 * - Leaves malformed {{ }} braces untouched (no crash).
 */
const warnedVars = new Set<string>();

export function renderIssueCardTemplate(
  id: string,
  vars: Record<string, string | number | boolean> = {},
): { title: string; body: string; suggestedChange: string } {
  const registry = getIssueCardTemplateRegistry();
  const template = registry.get(id);
  if (!template) {
    throw new Error(`IssueCardTemplate not found: ${id}`);
  }

  /**
   * Substitute {{name}} placeholders in a single template string.
   */
  const substitute = (
    content: string,
    additionalVars?: Record<string, string>,
  ): string => {
    const allVars = { ...vars, ...additionalVars };
    // Substitute each known variable
    let result = content;
    for (const [name, value] of Object.entries(allVars)) {
      const placeholder = `{{${name}}}`;
      if (result.includes(placeholder)) {
        result = result.replaceAll(placeholder, String(value));
      }
    }

    // Catch any remaining {{...}} that reference undefined variables
    const varPattern = /\{\{([^}]+)\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = varPattern.exec(result)) !== null) {
      const varName = match[1]?.trim() ?? '';
      if (varName && !(varName in allVars) && !warnedVars.has(varName)) {
        warnedVars.add(varName);
        console.warn(
          `[issue-card-template] Variable "${varName}" referenced but not provided; substituting empty string.`,
        );
      }
    }

    // Substitute any remaining {{var}} with empty string
    result = result.replace(/\{\{([^}]+)\}\}/g, (_match, varName) => {
      const trimmed = varName.trim();
      return trimmed in allVars ? String(allVars[trimmed]) : '';
    });

    return result;
  };

  // Pass 1: render title and body from the provided variables
  const title = substitute(template.title_template);
  const body = substitute(template.body_template);

  // Pass 2: render suggested_change with title and body available
  const suggestedChange = substitute(template.suggested_change_template, {
    title,
    body,
  });

  return { title, body, suggestedChange };
}
