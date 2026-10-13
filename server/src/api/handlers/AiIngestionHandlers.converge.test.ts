/**
 * DOCINGEST-A convergence site 4 — AiIngestionHandlers.extractFileContent
 * delegates to the ONE dispatcher instead of its hand-rolled if/else with
 * private utf8 fallbacks (OQ1).
 *
 * Pinned:
 *  - the PDF arm is byte-identical: layout extraction via
 *    ingestion/pdf/TableExtractionService (spy), pages joined, truncated;
 *  - csv / html / md arms still return TEXT (csv and md byte-identical for
 *    the fixtures; html stays tag-stripped via the controlled extractHtmlText
 *    reader rather than a private regex);
 *  - xlsx stops being the "[Excel file: ... requires spreadsheet parser]"
 *    placeholder and goes through the real reader (its honest parse-failure
 *    diagnostic on junk bytes is the proof the dispatcher ran).
 *
 * The arms are observed through analyzeIngestion: the stub inference client
 * captures the system prompt, which embeds the extracted content and the
 * fileType label verbatim.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';

const layoutSpy = vi.hoisted(() => vi.fn());

vi.mock('../../ingestion/pdf/TableExtractionService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ingestion/pdf/TableExtractionService.js')>();
  return {
    ...actual,
    extractPdfLayoutText: (...args: Parameters<typeof actual.extractPdfLayoutText>) => {
      layoutSpy(...args);
      return actual.extractPdfLayoutText(...args);
    },
  };
});

import { createAiIngestionHandlers } from './AiIngestionHandlers.js';
import type { InferenceClient } from '../../ai/types.js';

const CSV = 'compound,dose\nRotenone,10 uM\nAntimycin,5 uM\n';
const MARKDOWN = '# Lysis protocol\n\n1. Add 500 uL of buffer.\n';
const HTML = '<html><body><h1>Lysis protocol</h1><p>Add 500 uL of buffer.</p></body></html>';

function makeReply() {
  let statusCode = 200;
  const reply = {
    status(code: number) {
      statusCode = code;
      return reply;
    },
    send() {
      return reply;
    },
  } as unknown as FastifyReply;
  return { reply, get statusCode() { return statusCode; } };
}

function multipartRequest(parts: unknown[]) {
  return {
    parts: async function* () {
      for (const part of parts) yield part;
    },
    log: { error: vi.fn(), warn: vi.fn() },
  } as unknown as FastifyRequest;
}

function filePart(filename: string, mimetype: string, content: Buffer) {
  return {
    type: 'file',
    fieldname: 'file',
    filename,
    mimetype,
    toBuffer: async () => content,
  };
}

const promptPart = { type: 'field', fieldname: 'prompt', value: 'what is in this file?' };

/** Stub client that captures the prompt the extraction fed into the AI. */
function stubClient(): { client: InferenceClient; systemPrompt: () => string } {
  let captured = '';
  const client = {
    async complete(request: { messages: Array<{ role: string; content: string | null }> }) {
      captured = request.messages.map((m) => m.content ?? '').join('\n');
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                analysis: { fileType: 'stub', contentSummary: 'stub', detectedStructure: 'prose_steps' },
                draftSpec: { targets: [] },
                questions: [],
                confidence: 0.5,
              }),
            },
          },
        ],
      };
    },
    // eslint-disable-next-line require-yield
    async *completeStream() {
      return;
    },
  } as unknown as InferenceClient;
  return { client, systemPrompt: () => captured };
}

async function analyze(filename: string, mimetype: string, content: Buffer) {
  const { client, systemPrompt } = stubClient();
  const handlers = createAiIngestionHandlers(client, 'test-model', {} as never);
  const { reply, statusCode } = makeReply();
  const result = await handlers.analyzeIngestion(
    multipartRequest([filePart(filename, mimetype, content), promptPart]) as Parameters<typeof handlers.analyzeIngestion>[0],
    reply,
  );
  return { result, statusCode, prompt: systemPrompt() };
}

describe('AiIngestionHandlers.extractFileContent — ONE dispatcher (converged)', () => {
  beforeEach(() => {
    layoutSpy.mockClear();
  });

  it('csv arm unchanged in text: the raw csv text reaches the prompt with label csv', async () => {
    const { result, prompt } = await analyze('plate.csv', 'text/csv', Buffer.from(CSV));
    expect(result.success).toBe(true);
    expect(prompt).toContain('(csv,');
    expect(prompt).toContain('compound,dose\nRotenone,10 uM\nAntimycin,5 uM');
    expect(layoutSpy).not.toHaveBeenCalled();
  });

  it('md arm unchanged in text: the markdown reaches the prompt verbatim', async () => {
    const { result, prompt } = await analyze('lysis.md', '', Buffer.from(MARKDOWN));
    expect(result.success).toBe(true);
    expect(prompt).toContain('# Lysis protocol\n\n1. Add 500 uL of buffer.');
    expect(layoutSpy).not.toHaveBeenCalled();
  });

  it('html arm stays tag-stripped text via the controlled reader (no private regex, no raw tags)', async () => {
    const { result, prompt } = await analyze('page.html', 'text/html', Buffer.from(HTML));
    expect(result.success).toBe(true);
    expect(prompt).toContain('(html,');
    expect(prompt).toContain('Lysis protocol');
    expect(prompt).toContain('Add 500 uL of buffer.');
    expect(prompt).not.toContain('<h1>');
    expect(layoutSpy).not.toHaveBeenCalled();
  });

  it('PDF arm byte-identical: layout extraction via TableExtractionService (spy), pages joined', async () => {
    const { result } = await analyze('manual.pdf', 'application/pdf', Buffer.from('%PDF-1.4 fake'));
    expect(result.success).toBe(true);
    expect(layoutSpy, 'the pdf arm must keep the exact current layout call').toHaveBeenCalledTimes(1);
  });

  it('xlsx is no longer the binary placeholder: the real reader runs (honest parse diagnostic on junk bytes)', async () => {
    const { result, prompt } = await analyze(
      'plate.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      Buffer.from([0x89, 0x8a, 0x8b]),
    );
    expect(result.success).toBe(true);
    expect(prompt).toContain('(xlsx,');
    expect(prompt, 'the placeholder text is gone — the dispatcher ran the real reader').not.toContain(
      'Binary format requires spreadsheet parser',
    );
    expect(layoutSpy).not.toHaveBeenCalled();
  });
});
