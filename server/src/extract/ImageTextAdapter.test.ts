/**
 * DOCINGEST-B B1 — the image OCR adapter (RED).
 *
 * Honesty contract, identical to the DOCX adapter and the oligo OCR precedent
 * (server/src/sequences/oligoOrder.ts:75-86): a missing config or a missing
 * binary yields an honest IMAGE_OCR_* error diagnostic — NEVER a blank page
 * presented as success. The success arm is pinned through an INJECTED exec
 * (no real tesseract in units — bait 14): the argv must be built from the
 * config-declared values (executable, language, per-call timeout, maxBuffer),
 * mirroring the oligo tesseract call shape `[page, 'stdout', '-l', language]`.
 *
 * The configPath seam is ALWAYS an absolute tmpdir path — never cwd-relative
 * (bait 9): the default resolves through import.meta.url (sequenceRuntime.ts:15
 * precedent), so `server/` vitest and any other cwd behave identically.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DOCUMENT_EXTRACTION_CONFIG_PATH,
  IMAGE_DIAGNOSTIC_CODES,
  extractImageText,
  loadImageOcrConfig,
} from './ImageTextAdapter.js';

const PNG_BYTES = Buffer.from('\u0089PNG\r\n\u001a\n fake-png-bytes-for-argv-pin');

let configDir: string;

beforeEach(async () => {
  configDir = await mkdtemp(join(tmpdir(), 'cl-image-ocr-config-'));
});

afterEach(async () => {
  await rm(configDir, { recursive: true, force: true });
});

async function writeConfig(name: string, yaml: string): Promise<string> {
  const path = join(configDir, name);
  await writeFile(path, yaml, 'utf-8');
  return path;
}

describe('ImageTextAdapter — honest failure arms (never a blank success)', () => {
  it('no images: block in the config -> IMAGE_OCR_NOT_CONFIGURED error diagnostic, empty text', async () => {
    const configPath = await writeConfig(
      'no-images.yaml',
      'docx:\n  executable: pandoc\n  args: ["--to", "plain"]\n  timeoutSeconds: 60\n',
    );
    const { text, diagnostics } = await extractImageText(PNG_BYTES, { configPath });
    expect(text).toBe('');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe('error');
    expect(diagnostics[0]?.code).toBe(IMAGE_DIAGNOSTIC_CODES.IMAGE_OCR_NOT_CONFIGURED);
  });

  it('config file absent entirely -> IMAGE_OCR_NOT_CONFIGURED (not a crash, not a silent skip)', async () => {
    const { text, diagnostics } = await extractImageText(PNG_BYTES, {
      configPath: join(configDir, 'does-not-exist.yaml'),
    });
    expect(text).toBe('');
    expect(diagnostics[0]?.severity).toBe('error');
    expect(diagnostics[0]?.code).toBe(IMAGE_DIAGNOSTIC_CODES.IMAGE_OCR_NOT_CONFIGURED);
  });

  it('config-declared binary missing on the host -> IMAGE_OCR_TOOL_MISSING, NOT an empty page (bait 1)', async () => {
    // Config-mutation probe (never an uninstall): declare a binary that cannot
    // exist. The real spawn attempt ENOENTs and the arm must say so.
    const configPath = await writeConfig(
      'missing-tool.yaml',
      'images:\n  executable: cl-definitely-not-installed-9f3e1\n  language: eng\n  timeoutSeconds: 5\n  rasterizer: pdftoppm\n  dpi: 200\n  maxPages: 40\n',
    );
    const { text, diagnostics } = await extractImageText(PNG_BYTES, { configPath, fileName: 'page.png' });
    expect(text, 'a missing tool must never present a blank OCR\u2019d page as success').toBe('');
    expect(diagnostics[0]?.severity).toBe('error');
    expect(diagnostics[0]?.code).toBe(IMAGE_DIAGNOSTIC_CODES.IMAGE_OCR_TOOL_MISSING);
    expect(diagnostics[0]?.message).toContain('cl-definitely-not-installed-9f3e1');
  });

  it('tool present but the run fails -> IMAGE_OCR_FAILED with the real message', async () => {
    const configPath = await writeConfig(
      'ok.yaml',
      'images:\n  executable: tesseract\n  language: eng\n  timeoutSeconds: 5\n  rasterizer: pdftoppm\n  dpi: 200\n  maxPages: 40\n',
    );
    const exec = async () => {
      throw new Error('tesseract: image format not supported');
    };
    const { text, diagnostics } = await extractImageText(PNG_BYTES, { configPath, exec });
    expect(text).toBe('');
    expect(diagnostics[0]?.severity).toBe('error');
    expect(diagnostics[0]?.code).toBe(IMAGE_DIAGNOSTIC_CODES.IMAGE_OCR_FAILED);
    expect(diagnostics[0]?.message).toContain('image format not supported');
  });
});

describe('ImageTextAdapter — success arm via injected exec (argv pinned from config, bait 14)', () => {
  it('argv is built from the config-declared values and mirrors the oligo tesseract call shape', async () => {
    const configPath = await writeConfig(
      'ok.yaml',
      'images:\n  executable: tesseract\n  language: eng\n  timeoutSeconds: 120\n  rasterizer: pdftoppm\n  dpi: 200\n  maxPages: 40\n',
    );
    const calls: Array<[string, string[], { timeout?: number; maxBuffer?: number }]> = [];
    const exec = async (file: string, args: string[], options: { timeout?: number; maxBuffer?: number }) => {
      calls.push([file, args, options]);
      return { stdout: 'LYSIS BUFFER ADD 500 uL\n' };
    };
    const { text, diagnostics } = await extractImageText(PNG_BYTES, {
      configPath,
      fileName: 'photographed-page.png',
      exec,
    });
    expect(text).toContain('LYSIS BUFFER ADD 500 uL');
    expect(calls).toHaveLength(1);
    const [file, args, options] = calls[0]!;
    // The buffer is written into a scratch dir under a name derived from the
    // file (oligo writes the page path; the docx adapter writes the input).
    expect(file).toMatch(/photographed-page\.png$/);
    // Oligo precedent (oligoOrder.ts:82): [input, 'stdout', '-l', language]
    expect(args[1]).toBe('stdout');
    expect(args[2]).toBe('-l');
    expect(args[3]).toBe('eng');
    // timeout + maxBuffer from config / oligo discipline (:82)
    expect(options.timeout).toBe(120_000);
    expect(options.maxBuffer).toBe(10 * 1024 * 1024);
    // Success carries the LOCAL_OCR_REVIEW warning — the caution is part of
    // the honest result, pinned wording reworded for protocols (§B2).
    const review = diagnostics.find((d) => d.code === 'LOCAL_OCR_REVIEW');
    expect(review, 'a successful OCR must carry the review caution').toBeTruthy();
    expect(review?.severity).toBe('warning');
    expect(review?.message).toBe(
      'Transcribed using local OCR (up to the configured page limit). Check page coverage and every volume against the page image before importing.',
    );
  });

  it('language is config data: a different declared language changes the argv (no hardcoded eng)', async () => {
    const configPath = await writeConfig(
      'fra.yaml',
      'images:\n  executable: tesseract\n  language: fra\n  timeoutSeconds: 30\n  rasterizer: pdftoppm\n  dpi: 200\n  maxPages: 40\n',
    );
    const calls: string[][] = [];
    const exec = async (_file: string, args: string[]) => {
      calls.push(args);
      return { stdout: 'tampon de lyse\n' };
    };
    const { text } = await extractImageText(PNG_BYTES, { configPath, exec });
    expect(text).toContain('tampon de lyse');
    expect(calls[0]![3]).toBe('fra');
  });
});

describe('loadImageOcrConfig — the images: block is config data (bait 10)', () => {
  it('reads the shipped images: block through the import.meta.url default path (bait 9: cwd-independent)', async () => {
    // The default path is absolute (import.meta.url), never cwd-relative.
    expect(DOCUMENT_EXTRACTION_CONFIG_PATH).toMatch(/^\/.*document-extraction\.yaml$/);
    const config = await loadImageOcrConfig();
    expect(config, 'the images: block must be declared in the shipped config').toBeTruthy();
    expect(config!.executable).toBe('tesseract');
    expect(config!.language).toBe('eng');
    expect(config!.timeoutSeconds).toBe(120);
    expect(config!.rasterizer).toBe('pdftoppm');
    expect(config!.dpi).toBe(200);
    expect(config!.maxPages).toBe(40);
  });

  it('an injected tmpdir config overrides the shipped one (seam is absolute-path based)', async () => {
    const configPath = await writeConfig(
      'custom.yaml',
      'images:\n  executable: myocr\n  language: eng\n  timeoutSeconds: 7\n  rasterizer: myraster\n  dpi: 150\n  maxPages: 3\n',
    );
    const config = await loadImageOcrConfig(configPath);
    expect(config?.executable).toBe('myocr');
    expect(config?.rasterizer).toBe('myraster');
    expect(config?.dpi).toBe(150);
    expect(config?.maxPages).toBe(3);
  });
});
