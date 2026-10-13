/**
 * DOCX/RTF -> plain text via a CONFIG-DECLARED external tool (pandoc).
 *
 * A .docx is a ZIP; the repo has no zip reader and we do not add one for a
 * text extraction. The reader tool is declared in
 * config/ingestion/document-extraction.yaml exactly like the oligo OCR tools
 * are, so swapping the tool is a data edit, not a code edit.
 *
 * Honesty contract (CLAUDE.md: "a missing tool must produce a diagnostic,
 * never an empty document"): an unset config yields DOCX_TOOL_NOT_CONFIGURED;
 * a declared-but-absent binary yields DOCX_TOOL_MISSING; a failing run yields
 * DOCX_EXTRACTION_FAILED. Every arm returns empty text WITH an error
 * diagnostic — a blank success is never possible.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import type { ExtractionDiagnostic } from './ExtractorAdapter.js';

export const DOCX_DIAGNOSTIC_CODES = {
  DOCX_TOOL_NOT_CONFIGURED: 'DOCX_TOOL_NOT_CONFIGURED',
  DOCX_TOOL_MISSING: 'DOCX_TOOL_MISSING',
  DOCX_EXTRACTION_FAILED: 'DOCX_EXTRACTION_FAILED',
} as const;

export interface DocxExtractionResult {
  text: string;
  diagnostics: ExtractionDiagnostic[];
}

interface DocxToolConfig {
  executable: string;
  args: string[];
  timeoutSeconds: number;
}

/**
 * The repo's document-extraction config, resolved via import.meta.url
 * (sequenceRuntime.ts:15 precedent). A cwd-relative default NEVER resolves
 * under server vitest (cwd is `server/`) — it would silently take the
 * NOT_CONFIGURED arm on a host where the tool IS configured. Tests inject an
 * explicit configPath instead.
 */
export const DOCUMENT_EXTRACTION_CONFIG_PATH = fileURLToPath(
  new URL('../../../config/ingestion/document-extraction.yaml', import.meta.url),
);

async function docxToolConfig(configPath?: string): Promise<DocxToolConfig | null> {
  const path = configPath ?? DOCUMENT_EXTRACTION_CONFIG_PATH;
  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch {
    return null;
  }
  let doc: { docx?: Partial<DocxToolConfig> } | null = null;
  try {
    doc = parseYaml(raw) as { docx?: Partial<DocxToolConfig> } | null;
  } catch {
    return null;
  }
  const docx = doc?.docx;
  if (!docx || typeof docx.executable !== 'string' || docx.executable.trim().length === 0) {
    return null;
  }
  return {
    executable: docx.executable.trim(),
    args: Array.isArray(docx.args) ? docx.args.map((arg) => String(arg)) : ['--to', 'plain', '--wrap=none'],
    timeoutSeconds: typeof docx.timeoutSeconds === 'number' && docx.timeoutSeconds > 0 ? docx.timeoutSeconds : 60,
  };
}

export async function extractDocxText(
  buffer: Buffer,
  options: { configPath?: string; fileName?: string } = {},
): Promise<DocxExtractionResult> {
  const config = await docxToolConfig(options.configPath);
  if (!config) {
    return {
      text: '',
      diagnostics: [
        {
          severity: 'error',
          code: DOCX_DIAGNOSTIC_CODES.DOCX_TOOL_NOT_CONFIGURED,
          message:
            'No DOCX reader is configured (config/ingestion/document-extraction.yaml: docx.executable). The document was stored, but its text could not be read.',
        },
      ],
    };
  }

  const dir = await mkdtemp(join(tmpdir(), 'cl-docx-'));
  const input = join(dir, options.fileName ?? 'document.docx');
  try {
    await writeFile(input, buffer);
    const exec = promisify(execFile);
    // '--to plain' writes to stdout: `pandoc --to plain --wrap=none <input>`
    const { stdout } = await exec(config.executable, [...config.args, input], {
      timeout: config.timeoutSeconds * 1000,
      maxBuffer: 32 * 1024 * 1024,
    });
    return { text: stdout, diagnostics: [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const missing = /ENOENT/.test(message);
    return {
      text: '',
      diagnostics: [
        {
          severity: 'error',
          code: missing ? DOCX_DIAGNOSTIC_CODES.DOCX_TOOL_MISSING : DOCX_DIAGNOSTIC_CODES.DOCX_EXTRACTION_FAILED,
          message: missing
            ? `The configured DOCX reader "${config.executable}" is not installed on this host. Install it, or clear the field and paste the text.`
            : `DOCX extraction failed: ${message}`,
        },
      ],
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
