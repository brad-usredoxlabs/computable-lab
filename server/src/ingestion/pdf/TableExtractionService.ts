import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface PdfPageText {
  pageNumber: number;
  text: string;
}

export interface PdfExtractionResult {
  pages: PdfPageText[];
  sha256: string;
}

export async function extractPdfLayoutText(buffer: Buffer, fileName = 'document.pdf'): Promise<PdfExtractionResult> {
  const tempDir = await mkdtemp(join(tmpdir(), 'cl-ingestion-pdf-'));
  const tempFile = join(tempDir, fileName);
  try {
    await writeFile(tempFile, buffer);
    const { stdout } = await execFileAsync('pdftotext', ['-layout', tempFile, '-']);
    const pages = stdout
      .split('\f')
      .map((text, index) => ({ pageNumber: index + 1, text: text.trimEnd() }))
      .filter((page) => page.text.trim().length > 0);
    return {
      pages,
      sha256: createHash('sha256').update(buffer).digest('hex'),
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
