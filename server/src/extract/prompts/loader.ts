/**
 * Extraction prompt loader module.
 * 
 * Provides functionality to load extraction prompts from markdown files
 * with YAML frontmatter.
 * 
 * Spec: spec-076-seed-extraction-prompts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';

/**
 * Metadata extracted from prompt frontmatter.
 */
export interface ExtractionPromptMetadata {
  target_kind: string;
  version: string;
  description: string;
}

/**
 * Result of loading an extraction prompt.
 */
export interface LoadedExtractionPrompt {
  metadata: ExtractionPromptMetadata;
  body: string;                      // prompt body (everything after frontmatter)
  path: string;                      // absolute path to the prompt file
}

/**
 * Internal helper to parse frontmatter from markdown content.
 * 
 * Frontmatter is expected to be in YAML format between the first two
 * `---` delimiters at the start of the file.
 * 
 * @param content The full markdown file content
 * @returns Object with { metadata, body } or throws on parse error
 */
function parseFrontmatter(content: string, filePath: string): { metadata: ExtractionPromptMetadata; body: string } {
  // Split on --- boundaries
  const parts = content.split(/^---\s*$/m);
  
  if (parts.length < 3) {
    // No valid frontmatter block found
    throw new Error(`invalid frontmatter in ${filePath}: missing frontmatter block`);
  }

  const frontmatterYaml = parts[1]!;
  const body = parts.slice(2).join('\n---\n');

  let parsed: unknown;
  try {
    parsed = parseYaml(frontmatterYaml) as unknown;
  } catch (parseError) {
    throw new Error(`invalid frontmatter in ${filePath}: YAML parse error - ${parseError instanceof Error ? parseError.message : String(parseError)}`);
  }

  if (parsed === null || parsed === undefined || typeof parsed !== 'object') {
    throw new Error(`invalid frontmatter in ${filePath}: frontmatter is not a YAML object`);
  }

  const metadata = parsed as Record<string, unknown>;

  // Validate required fields
  const requiredFields: (keyof ExtractionPromptMetadata)[] = ['target_kind', 'version', 'description'];
  for (const field of requiredFields) {
    if (!(field in metadata)) {
      throw new Error(`invalid frontmatter in ${filePath}: missing ${field}`);
    }
    if (typeof metadata[field] !== 'string') {
      throw new Error(`invalid frontmatter in ${filePath}: ${field} must be a string`);
    }
  }

  return {
    metadata: {
      target_kind: metadata.target_kind as string,
      version: metadata.version as string,
      description: metadata.description as string
    },
    body: body.trim()
  };
}

/**
 * Load an extraction prompt by kind.
 * 
 * Looks up server/src/extract/prompts/<kind>.md.
 * Throws Error(`no prompt for kind: ${kind}`) if file missing.
 * Throws Error(`invalid frontmatter in <path>: missing <field>`) on missing metadata.
 * 
 * @param kind The prompt kind (e.g., 'observation', 'claim', 'material')
 * @returns The loaded prompt with metadata, body, and path
 */
export function loadExtractionPrompt(kind: string): LoadedExtractionPrompt {
  const promptPath = path.join(__dirname, `${kind}.md`);

  let content: string;
  try {
    content = fs.readFileSync(promptPath, 'utf-8');
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      throw new Error(`no prompt for kind: ${kind}`);
    }
    throw err;
  }

  const { metadata, body } = parseFrontmatter(content, promptPath);

  return {
    metadata,
    body,
    path: promptPath
  };
}

/**
 * Get a list of all available prompt kinds.
 * 
 * Reads the prompts directory and returns the base names (without .md extension).
 * 
 * @returns Array of prompt kind strings
 */
export function getAvailablePromptKinds(): string[] {
  const promptsDir = __dirname;
  
  try {
    const files = fs.readdirSync(promptsDir);
    return files
      .filter(file => file.endsWith('.md'))
      .map(file => file.slice(0, -3)); // Remove .md extension
  } catch (err) {
    // If directory doesn't exist or can't be read, return empty array
    return [];
  }
}
