/**
 * DOCINGEST-A A1 — the DOCX reader's honesty contract.
 *
 * A .docx is read by a CONFIG-DECLARED external tool (pandoc is declared in
 * config/ingestion/document-extraction.yaml, never hardcoded). On a host where
 * the tool is not installed, the ONLY acceptable outcome is an honest
 * diagnostic — a blank text with no diagnostic is a fake success and the exact
 * failure mode CLAUDE.md forbids ("a missing tool must produce a diagnostic,
 * never an empty document").
 *
 * Tests use an injected tmpdir configPath — NEVER a cwd-relative default
 * (server vitest runs with cwd `server/`, so a cwd-relative default never
 * resolves; the adapter must load its config via import.meta.url).
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { DOCUMENT_EXTRACTION_CONFIG_PATH, extractDocxText } from './DocxTextAdapter.js';

function configFile(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'cl-docx-cfg-'));
  const path = join(dir, 'document-extraction.yaml');
  writeFileSync(path, body, 'utf-8');
  return path;
}

// A byte string that is shaped like a .docx (ZIP local-header magic) without
// being one — the arms under test must never depend on the bytes parsing.
const DOCX_BYTES = Buffer.from('PK\u0003\u0004 fake-docx-bytes');

describe('DOCX text adapter (config-declared tool, honest diagnostics)', () => {
  it('reports DOCX_TOOL_NOT_CONFIGURED when no reader is configured', async () => {
    const { text, diagnostics } = await extractDocxText(DOCX_BYTES, {
      configPath: join(tmpdir(), 'cl-docx-absent', 'document-extraction.yaml'),
    });
    expect(text).toBe('');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe('error');
    expect(diagnostics[0]?.code).toBe('DOCX_TOOL_NOT_CONFIGURED');
    expect(diagnostics[0]?.message).toContain('docx.executable');
  });

  it('reports DOCX_TOOL_MISSING (not an empty document) when the declared binary is absent', async () => {
    const configPath = configFile(
      'docx:\n  executable: definitely-not-a-real-binary-xyz\n  args: ["--to", "plain", "--wrap=none"]\n  timeoutSeconds: 5\n',
    );
    const { text, diagnostics } = await extractDocxText(DOCX_BYTES, { configPath });
    expect(text).toBe('');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe('error');
    expect(diagnostics[0]?.code).toBe('DOCX_TOOL_MISSING');
    expect(diagnostics[0]?.message).toContain('definitely-not-a-real-binary-xyz');
  });

  it('resolves the repo config via import.meta.url, not cwd (cwd-trap probe)', async () => {
    // The default config path is absolute and anchored to the module's own
    // location (sequenceRuntime.ts:15 precedent), so a cwd-relative default
    // (which never resolves under server vitest, cwd = `server/`) is not even
    // possible. The repo config exists at that path and declares docx.
    expect(isAbsolute(DOCUMENT_EXTRACTION_CONFIG_PATH)).toBe(true);
    expect(DOCUMENT_EXTRACTION_CONFIG_PATH).toContain(join('config', 'ingestion', 'document-extraction.yaml'));
    const raw = await readFile(DOCUMENT_EXTRACTION_CONFIG_PATH, 'utf-8');
    expect(raw).toContain('docx:');
    expect(raw).toContain('executable:');
    // With no injected configPath the adapter takes the TOOL arm (the config
    // resolved), never the NOT_CONFIGURED arm. Which tool arm is host state
    // (pandoc is declared and ABSENT on this host -> DOCX_TOOL_MISSING); the
    // test only pins that the CONFIG resolved, which is host-robust.
    const { text, diagnostics } = await extractDocxText(DOCX_BYTES);
    expect(text).toBe('');
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]?.code).not.toBe('DOCX_TOOL_NOT_CONFIGURED');
    expect(diagnostics[0]?.code).toMatch(/^DOCX_/);
  });
});
