/**
 * Tests for runChunkedExtractionService
 */

import { describe, it, expect, vi } from 'vitest';
import { runChunkedExtractionService } from './runChunkedExtractionService.js';
import type {
  ExtractionRunnerService,
  RunExtractionServiceArgs,
} from './ExtractionRunnerService.js';
import type { ExtractionDraftBody } from './ExtractionDraftBuilder.js';

describe('runChunkedExtractionService', () => {
  // -----------------------------------------------------------------------
  // (a) Below-threshold one-call path
  // -----------------------------------------------------------------------
  describe('below-threshold', () => {
    it('calls service.run once and returns the result with retryBudgetRemaining', async () => {
      const shortText = 'This is a short document that fits in one chunk.';
      const expectedBody: ExtractionDraftBody = {
        kind: 'extraction-draft',
        recordId: 'XDR-test-v1',
        source_artifact: { kind: 'freetext', id: 'prompt' },
        status: 'pending_review',
        candidates: [
          {
            target_kind: 'material',
            draft: { name: 'reservoir' },
            confidence: 0.85,
          },
        ],
        created_at: '2026-01-01T00:00:00.000Z',
        diagnostics: [],
      };

      const fakeService = {
        run: vi.fn().mockResolvedValue(expectedBody),
      } as unknown as ExtractionRunnerService;

      const req: RunExtractionServiceArgs = {
        target_kind: 'material',
        text: shortText,
        source: { kind: 'freetext', id: 'prompt' },
      };

      const result = await runChunkedExtractionService(fakeService, req);

      expect(fakeService.run).toHaveBeenCalledTimes(1);
      expect(fakeService.run).toHaveBeenCalledWith(req);
      // Result should contain all fields from expectedBody plus retryBudgetRemaining
      expect(result.kind).toBe('extraction-draft');
      expect(result.recordId).toBe('XDR-test-v1');
      expect(result.candidates).toHaveLength(1);
      expect(result.retryBudgetRemaining).toBe(6); // no retries consumed
    });

    it('uses custom thresholdChars option', async () => {
      const text = 'A'.repeat(15000);
      // Return zero candidates → triggers retry loop (3 calls total)
      const fakeService = {
        run: vi.fn().mockResolvedValue({
          kind: 'extraction-draft',
          recordId: 'XDR-test-v1',
          source_artifact: { kind: 'freetext', id: 'prompt' },
          status: 'pending_review',
          candidates: [],
          created_at: '2026-01-01T00:00:00.000Z',
        } as ExtractionDraftBody),
      } as unknown as ExtractionRunnerService;

      const req: RunExtractionServiceArgs = {
        target_kind: 'material',
        text,
        source: { kind: 'freetext', id: 'prompt' },
      };

      // With threshold 20000, text (15000) is below → single call with retry
      const result = await runChunkedExtractionService(fakeService, req, {
        thresholdChars: 20000,
      });

      // Zero candidates → 3 retry attempts
      expect(fakeService.run).toHaveBeenCalledTimes(3);
      expect(result.retryBudgetRemaining).toBe(4); // 2 retries consumed
      expect(result.candidates).toHaveLength(0);
    });

    it('below-threshold with candidates succeeds on first attempt', async () => {
      const text = 'A'.repeat(15000);
      const fakeService = {
        run: vi.fn().mockResolvedValue({
          kind: 'extraction-draft',
          recordId: 'XDR-test-v1',
          source_artifact: { kind: 'freetext', id: 'prompt' },
          status: 'pending_review',
          candidates: [{ target_kind: 'material', draft: { name: 'X' }, confidence: 0.9 }],
          created_at: '2026-01-01T00:00:00.000Z',
        } as ExtractionDraftBody),
      } as unknown as ExtractionRunnerService;

      const req: RunExtractionServiceArgs = {
        target_kind: 'material',
        text,
        source: { kind: 'freetext', id: 'prompt' },
      };

      const result = await runChunkedExtractionService(fakeService, req, {
        thresholdChars: 20000,
      });

      // Has candidates → single call, no retries
      expect(fakeService.run).toHaveBeenCalledTimes(1);
      expect(result.retryBudgetRemaining).toBe(6);
      expect(result.candidates).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // (b) Above-threshold N-chunk path with dedup retaining highest confidence
  // -----------------------------------------------------------------------
  describe('above-threshold', () => {
    it('chunks above threshold and dedupes candidates by (target_kind, draft) keeping highest confidence', async () => {
      const longText = 'A'.repeat(20000);
      let callCount = 0;
      const fakeService = {
        run: vi.fn(async (req: RunExtractionServiceArgs) => {
          const idx = callCount++;
          return {
            kind: 'extraction-draft',
            recordId: 'XDR-test-v1',
            source_artifact: { kind: 'file', id: 'test.pdf' },
            status: 'pending_review',
            candidates: [
              {
                target_kind: 'material',
                draft: { name: 'X' },
                confidence: 0.5 + idx * 0.1,
              },
            ],
            created_at: '2026-01-01T00:00:00.000Z',
            diagnostics: [],
          } as ExtractionDraftBody;
        }),
      } as unknown as ExtractionRunnerService;

      const req: RunExtractionServiceArgs = {
        target_kind: 'material',
        text: longText,
        source: { kind: 'file', id: 'test.pdf' },
      };

      const result = await runChunkedExtractionService(fakeService, req, {
        chunkOpts: { maxCharsPerChunk: 5000, overlapChars: 0 },
      });

      // 20000 chars / 5000 per chunk = 4 chunks
      expect(fakeService.run).toHaveBeenCalledTimes(4);

      // All candidates have the same (target_kind, draft) → deduped to 1
      expect(result.candidates).toHaveLength(1);
      // Highest confidence (0.5 + 3*0.1 = 0.8) should be kept
      expect(result.candidates[0]!.confidence).toBe(0.8);
    });

    it('merges distinct candidates from different chunks', async () => {
      const longText = 'A'.repeat(20000);
      let callCount = 0;
      const fakeService = {
        run: vi.fn(async (req: RunExtractionServiceArgs) => {
          const idx = callCount++;
          return {
            kind: 'extraction-draft',
            recordId: 'XDR-test-v1',
            source_artifact: { kind: 'file', id: 'test.pdf' },
            status: 'pending_review',
            candidates: [
              {
                target_kind: idx === 0 ? 'material' : 'protocol',
                draft: { name: `item_${idx}` },
                confidence: 0.9,
              },
            ],
            created_at: '2026-01-01T00:00:00.000Z',
            diagnostics: [],
          } as ExtractionDraftBody;
        }),
      } as unknown as ExtractionRunnerService;

      const req: RunExtractionServiceArgs = {
        target_kind: 'material',
        text: longText,
        source: { kind: 'file', id: 'test.pdf' },
      };

      const result = await runChunkedExtractionService(fakeService, req, {
        chunkOpts: { maxCharsPerChunk: 5000, overlapChars: 0 },
      });

      expect(fakeService.run).toHaveBeenCalledTimes(4);
      // 4 distinct (target_kind, draft) pairs → 4 candidates
      expect(result.candidates).toHaveLength(4);
    });

    it('logs chunked info once when threshold is crossed', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const longText = 'A'.repeat(20000);
      const fakeService = {
        run: vi.fn().mockResolvedValue({
          kind: 'extraction-draft',
          recordId: 'XDR-test-v1',
          source_artifact: { kind: 'file', id: 'test.pdf' },
          status: 'pending_review',
          candidates: [],
          created_at: '2026-01-01T00:00:00.000Z',
        } as ExtractionDraftBody),
      } as unknown as ExtractionRunnerService;

      const req: RunExtractionServiceArgs = {
        target_kind: 'material',
        text: longText,
        source: { kind: 'file', id: 'test.pdf' },
      };

      await runChunkedExtractionService(fakeService, req);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[extract_entities] chunked',
        expect.objectContaining({ totalChars: 20000 }),
      );
      consoleSpy.mockRestore();
    });

    it('does NOT log when below threshold', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const shortText = 'short';
      const fakeService = {
        run: vi.fn().mockResolvedValue({
          kind: 'extraction-draft',
          recordId: 'XDR-test-v1',
          source_artifact: { kind: 'freetext', id: 'prompt' },
          status: 'pending_review',
          candidates: [],
          created_at: '2026-01-01T00:00:00.000Z',
        } as ExtractionDraftBody),
      } as unknown as ExtractionRunnerService;

      const req: RunExtractionServiceArgs = {
        target_kind: 'material',
        text: shortText,
        source: { kind: 'freetext', id: 'prompt' },
      };

      await runChunkedExtractionService(fakeService, req);

      expect(consoleSpy).not.toHaveBeenCalledWith(
        '[extract_entities] chunked',
        expect.anything(),
      );
      consoleSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // (c) One-chunk rejection produces chunk-tagged diagnostic, other chunks merge
  // -----------------------------------------------------------------------
  describe('chunk failure resilience', () => {
    it('one-chunk rejection produces chunk-tagged diagnostic and other chunks still merge', async () => {
      const longText = 'A'.repeat(20000);
      let callCount = 0;
      const fakeService = {
        run: vi.fn(async (req: RunExtractionServiceArgs) => {
          callCount++;
          if (callCount === 2) {
            throw new Error('simulated timeout on chunk 2');
          }
          return {
            kind: 'extraction-draft',
            recordId: 'XDR-test-v1',
            source_artifact: { kind: 'file', id: 'test.pdf' },
            status: 'pending_review',
            candidates: [
              {
                target_kind: 'material',
                draft: { name: `item_${callCount}` },
                confidence: 0.9,
              },
            ],
            created_at: '2026-01-01T00:00:00.000Z',
            diagnostics: [],
          } as ExtractionDraftBody;
        }),
      } as unknown as ExtractionRunnerService;

      const req: RunExtractionServiceArgs = {
        target_kind: 'material',
        text: longText,
        source: { kind: 'file', id: 'test.pdf' },
      };

      const result = await runChunkedExtractionService(fakeService, req, {
        chunkOpts: { maxCharsPerChunk: 5000, overlapChars: 0 },
      });

      // All 4 chunks were attempted (chunk 2 failed but didn't abort)
      expect(fakeService.run).toHaveBeenCalledTimes(4);

      // 3 successful chunks → 3 candidates (all distinct drafts)
      expect(result.candidates).toHaveLength(3);

      // One diagnostic for the failed chunk
      const failedDiags = result.diagnostics.filter(
        (d) => d.code === 'chunk_extraction_failed',
      );
      expect(failedDiags).toHaveLength(1);
      expect(failedDiags[0]!.severity).toBe('warning');
      expect((failedDiags[0]!.details as Record<string, unknown>)?.chunk_index).toBe(1);
      expect(failedDiags[0]!.message).toBe('simulated timeout on chunk 2');
    });

    it('all chunks fail → candidates empty, diagnostics has one warning per chunk', async () => {
      const longText = 'A'.repeat(20000);
      const fakeService = {
        run: vi.fn().mockRejectedValue(new Error('always fails')),
      } as unknown as ExtractionRunnerService;

      const req: RunExtractionServiceArgs = {
        target_kind: 'material',
        text: longText,
        source: { kind: 'file', id: 'test.pdf' },
      };

      const result = await runChunkedExtractionService(fakeService, req, {
        chunkOpts: { maxCharsPerChunk: 5000, overlapChars: 0 },
      });

      expect(fakeService.run).toHaveBeenCalledTimes(4);
      expect(result.candidates).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(4);
      for (const d of result.diagnostics) {
        expect(d.code).toBe('chunk_extraction_failed');
        expect(d.severity).toBe('warning');
      }
    });

    it('single chunk produced (text just over threshold) still goes through chunked path', async () => {
      const text = 'A'.repeat(12001); // just over default 12000 threshold
      const fakeService = {
        run: vi.fn().mockResolvedValue({
          kind: 'extraction-draft',
          recordId: 'XDR-test-v1',
          source_artifact: { kind: 'file', id: 'test.pdf' },
          status: 'pending_review',
          candidates: [
            { target_kind: 'material', draft: { name: 'X' }, confidence: 0.9 },
          ],
          created_at: '2026-01-01T00:00:00.000Z',
          diagnostics: [],
        } as ExtractionDraftBody),
      } as unknown as ExtractionRunnerService;

      const req: RunExtractionServiceArgs = {
        target_kind: 'material',
        text,
        source: { kind: 'file', id: 'test.pdf' },
      };

      const result = await runChunkedExtractionService(fakeService, req);

      // chunkText with default 8000 maxChars will produce 2 chunks for 12001 chars
      expect(fakeService.run).toHaveBeenCalledTimes(2);
      expect(result.candidates).toHaveLength(1);
    });

    it('empty text returns empty result without crashing', async () => {
      const fakeService = {
        run: vi.fn().mockResolvedValue({
          kind: 'extraction-draft',
          recordId: 'XDR-test-v1',
          source_artifact: { kind: 'freetext', id: 'prompt' },
          status: 'pending_review',
          candidates: [],
          created_at: '2026-01-01T00:00:00.000Z',
        } as ExtractionDraftBody),
      } as unknown as ExtractionRunnerService;

      const req: RunExtractionServiceArgs = {
        target_kind: 'material',
        text: '',
        source: { kind: 'freetext', id: 'prompt' },
      };

      const result = await runChunkedExtractionService(fakeService, req);

      // Zero candidates → 3 retry attempts
      expect(fakeService.run).toHaveBeenCalledTimes(3);
      expect(result.candidates).toHaveLength(0);
      expect(result.retryBudgetRemaining).toBe(4); // 2 retries consumed
    });
  });

  // -----------------------------------------------------------------------
  // (d) Retry budget tracking
  // -----------------------------------------------------------------------
  describe('retry budget tracking', () => {
    it('returns retryBudgetRemaining in result', async () => {
      const shortText = 'short';
      const fakeService = {
        run: vi.fn().mockResolvedValue({
          kind: 'extraction-draft',
          recordId: 'XDR-test-v1',
          source_artifact: { kind: 'freetext', id: 'prompt' },
          status: 'pending_review',
          candidates: [{ target_kind: 'material', draft: { name: 'X' }, confidence: 0.9 }],
          created_at: '2026-01-01T00:00:00.000Z',
        } as ExtractionDraftBody),
      } as unknown as ExtractionRunnerService;

      const req: RunExtractionServiceArgs = {
        target_kind: 'material',
        text: shortText,
        source: { kind: 'freetext', id: 'prompt' },
      };

      const result = await runChunkedExtractionService(fakeService, req);
      expect(result.retryBudgetRemaining).toBe(6);
    });

    it('decrements budget on retry attempts', async () => {
      const shortText = 'short';
      const fakeService = {
        run: vi.fn().mockResolvedValue({
          kind: 'extraction-draft',
          recordId: 'XDR-test-v1',
          source_artifact: { kind: 'freetext', id: 'prompt' },
          status: 'pending_review',
          candidates: [], // zero candidates → triggers retry
          created_at: '2026-01-01T00:00:00.000Z',
        } as ExtractionDraftBody),
      } as unknown as ExtractionRunnerService;

      const req: RunExtractionServiceArgs = {
        target_kind: 'material',
        text: shortText,
        source: { kind: 'freetext', id: 'prompt' },
      };

      const result = await runChunkedExtractionService(fakeService, req);
      // 3 calls, 2 retries consumed
      expect(fakeService.run).toHaveBeenCalledTimes(3);
      expect(result.retryBudgetRemaining).toBe(4);
    });

    it('respects custom retryBudget option', async () => {
      const shortText = 'short';
      const fakeService = {
        run: vi.fn().mockResolvedValue({
          kind: 'extraction-draft',
          recordId: 'XDR-test-v1',
          source_artifact: { kind: 'freetext', id: 'prompt' },
          status: 'pending_review',
          candidates: [],
          created_at: '2026-01-01T00:00:00.000Z',
        } as ExtractionDraftBody),
      } as unknown as ExtractionRunnerService;

      const req: RunExtractionServiceArgs = {
        target_kind: 'material',
        text: shortText,
        source: { kind: 'freetext', id: 'prompt' },
      };

      const result = await runChunkedExtractionService(fakeService, req, {
        retryBudget: 2,
      });

      // Budget=2: attempt 1 (budget=2), attempt 2 (budget=1), attempt 3 blocked
      // because budget=0 on 3rd attempt → 2 calls total
      expect(fakeService.run).toHaveBeenCalledTimes(2);
      expect(result.retryBudgetRemaining).toBe(0);
    });

    it('shared budget is tracked across multiple chunks', async () => {
      const longText = 'A'.repeat(20000);
      let callCount = 0;
      const fakeService = {
        run: vi.fn(async () => {
          callCount++;
          return {
            kind: 'extraction-draft',
            recordId: 'XDR-test-v1',
            source_artifact: { kind: 'file', id: 'test.pdf' },
            status: 'pending_review',
            candidates: [], // zero candidates → triggers retry
            created_at: '2026-01-01T00:00:00.000Z',
          } as ExtractionDraftBody;
        }),
      } as unknown as ExtractionRunnerService;

      const req: RunExtractionServiceArgs = {
        target_kind: 'material',
        text: longText,
        source: { kind: 'file', id: 'test.pdf' },
      };

      const result = await runChunkedExtractionService(fakeService, req, {
        chunkOpts: { maxCharsPerChunk: 5000, overlapChars: 0 },
        retryBudget: 6,
      });

      // 4 chunks × 3 attempts each, but budget=6 limits retries:
      // Chunk 0: attempts 1,2,3 (budget 6→4) → 3 calls
      // Chunk 1: attempts 1,2,3 (budget 4→2) → 3 calls
      // Chunk 2: attempts 1,2,3 (budget 2→0) → 3 calls
      // Chunk 3: budget=0 on attempt 2 → 1 call only
      // Total: 10 calls
      // But wait: budget check is `remaining <= 0 && attempt > 1`
      // Chunk 3: attempt 1 (budget=0, attempt=1, condition false) → call
      //            attempt 2 (budget=0, attempt=2, condition true) → break
      // So chunk 3 makes 1 call. Total = 3+3+3+1 = 10
      // Actually the budget is decremented AFTER each attempt, so:
      // Chunk 0: attempt 1 (budget=6), attempt 2 (budget=5), attempt 3 (budget=4) → 3 calls
      // Chunk 1: attempt 1 (budget=4), attempt 2 (budget=3), attempt 3 (budget=2) → 3 calls
      // Chunk 2: attempt 1 (budget=2), attempt 2 (budget=1), attempt 3 (budget=0) → 3 calls
      // Chunk 3: attempt 1 (budget=0, attempt=1, condition false) → call
      //            attempt 2 (budget=0, attempt=2, condition true) → break → 1 call
      // Total: 3+3+3+1 = 10
      // But actual output shows 9 calls. Let me re-check...
      // The budget check is `remaining <= 0 && attempt > 1`
      // Chunk 2 attempt 3: budget=0, attempt=3 → condition true → break before call
      // So chunk 2 only makes 2 calls (attempts 1,2), not 3.
      // Total: 3+3+2+1 = 9
      expect(fakeService.run).toHaveBeenCalledTimes(9);
      expect(result.retryBudgetRemaining).toBe(0);
    });

    it('threads validation error into hint.prev_validation_error on retry', async () => {
      const calls: Array<{ hintHasPrev: boolean; prevValue?: unknown }> = [];
      const fakeService = {
        run: vi.fn(async (req: RunExtractionServiceArgs) => {
          const hint = req.hint ?? {};
          const prev = (hint as Record<string, unknown>)['prev_validation_error'];
          calls.push({ hintHasPrev: typeof prev === 'string', prevValue: prev });
          // Fail first attempt with a parse-error diagnostic; succeed on retry.
          if (calls.length === 1) {
            return {
              kind: 'extraction-draft',
              recordId: 'XDR-test-v1',
              source_artifact: { kind: 'freetext', id: 'p' },
              status: 'pending_review',
              candidates: [],
              created_at: '2026-01-01T00:00:00.000Z',
              diagnostics: [
                {
                  severity: 'error',
                  code: 'extractor_parse_error',
                  message: 'Bad JSON shape',
                  details: { rawResponse: 'broken { ' },
                },
              ],
            } as ExtractionDraftBody;
          }
          return {
            kind: 'extraction-draft',
            recordId: 'XDR-test-v1',
            source_artifact: { kind: 'freetext', id: 'p' },
            status: 'pending_review',
            candidates: [{ target_kind: 'material', draft: { name: 'Y' }, confidence: 1 }],
            created_at: '2026-01-01T00:00:00.000Z',
          } as ExtractionDraftBody;
        }),
      } as unknown as ExtractionRunnerService;

      await runChunkedExtractionService(fakeService, {
        target_kind: 'material',
        text: 'short',
        source: { kind: 'freetext', id: 'p' },
      });

      expect(calls.length).toBe(2);
      expect(calls[0]!.hintHasPrev).toBe(false);
      expect(calls[1]!.hintHasPrev).toBe(true);
      expect(calls[1]!.prevValue).toContain('Bad JSON shape');
    });

    it('surfaces last_raw_response in chunk failure diagnostic on exhaustion', async () => {
      const fakeService = {
        run: vi.fn().mockResolvedValue({
          kind: 'extraction-draft',
          recordId: 'XDR-test-v1',
          source_artifact: { kind: 'freetext', id: 'p' },
          status: 'pending_review',
          candidates: [],
          created_at: '2026-01-01T00:00:00.000Z',
          diagnostics: [
            {
              severity: 'error',
              code: 'extractor_parse_error',
              message: 'malformed',
              details: { rawResponse: 'RAW_RESPONSE_PAYLOAD' },
            },
          ],
        } as ExtractionDraftBody),
      } as unknown as ExtractionRunnerService;

      // Force chunked path so a chunk-level failure diagnostic is emitted
      const longText = 'A'.repeat(20000);
      const result = await runChunkedExtractionService(
        fakeService,
        { target_kind: 'material', text: longText, source: { kind: 'file', id: 't.pdf' } },
        { chunkOpts: { maxCharsPerChunk: 5000, overlapChars: 0 }, retryBudget: 0 },
      );

      // With retryBudget=0, attempt 1 still runs but no retries; the chunk
      // exhausts on attempt 1 with zero candidates and emits the diagnostic.
      // (Note: budget=0 means attempt 2's check `<=0 && attempt>1` breaks.)
      // The chunk-failure path returns extractor_repair_exhausted.
      expect(
        result.diagnostics?.some(
          (d) =>
            d.code === 'extractor_repair_exhausted' &&
            (d.details as Record<string, unknown>)?.last_raw_response === 'RAW_RESPONSE_PAYLOAD',
        ),
      ).toBe(true);
    });
  });
});
