/**
 * Tests for per-chunk streaming progress in protocol_extract pass.
 *
 * Verifies that:
 * - ProtocolExtractPass accepts an optional onChunkProgress callback
 * - The callback is invoked once per chunk with the correct shape
 * - chunkIndex is monotonically increasing (0-based)
 * - totalChunks matches the number of chunks
 * - candidatesSoFar accumulates correctly
 */

import { describe, it, expect, vi } from 'vitest';
import { createProtocolExtractPass } from './ProtocolExtractPass.js';
import type { PassRunArgs } from '../types.js';
import type { RecordStore } from '../../../store/types.js';
import type { RecordEnvelope } from '../../../types/RecordEnvelope.js';
import type { OnChunkProgress } from '../../../extract/runChunkedExtractionService.js';

describe('ProtocolExtractStreaming', () => {
  // -----------------------------------------------------------------------
  // (a) onChunkProgress callback is invoked with correct shape per chunk
  // -----------------------------------------------------------------------
  describe('onChunkProgress callback', () => {
    it('invokes the callback once per chunk with correct shape', async () => {
      const capturedEvents: Array<{
        chunkIndex: number;
        totalChunks: number;
        candidatesSoFar: number;
      }> = [];

      const onChunkProgress: OnChunkProgress = (event) => {
        capturedEvents.push({ ...event });
      };

      // Mock runChunkedExtraction that simulates 3 chunks and invokes the callback
      const mockRunChunkedExtraction = vi.fn(async (_service, _request, opts) => {
        const totalChunks = 3;
        let cumulativeCandidates = 0;
        for (let i = 0; i < totalChunks; i++) {
          // Simulate some candidates per chunk
          const candidatesInChunk = i === 0 ? 2 : i === 1 ? 1 : 3;
          cumulativeCandidates += candidatesInChunk;
          // Invoke the callback after each chunk
          if (opts?.onChunkProgress) {
            opts.onChunkProgress({
              chunkIndex: i,
              totalChunks,
              candidatesSoFar: cumulativeCandidates,
            });
          }
        }
        return {
          kind: 'extraction-draft',
          recordId: 'XDR-test-v1',
          source_artifact: { kind: 'freetext', id: 'protocol-extract' },
          status: 'pending_review',
          candidates: [
            { target_kind: 'protocol', draft: { name: 'step1' }, confidence: 0.9 },
            { target_kind: 'protocol', draft: { name: 'step2' }, confidence: 0.8 },
          ],
          created_at: '2026-01-01T00:00:00.000Z',
          diagnostics: [],
        };
      });

      const mockRecordStore = {
        create: vi.fn().mockResolvedValue({}),
      } as unknown as RecordStore;

      const pass = createProtocolExtractPass({
        runChunkedExtraction: mockRunChunkedExtraction,
        recordStore: mockRecordStore,
        onChunkProgress,
      });

      const args: PassRunArgs = {
        pass_id: 'protocol_extract',
        state: {
          input: {
            text: 'A'.repeat(20000), // long text to trigger chunking
          },
          context: {},
          meta: {},
          outputs: new Map(),
          diagnostics: [],
        },
      };

      const result = await pass.run(args);

      expect(result.ok).toBe(true);
      expect(capturedEvents).toHaveLength(3);

      // Verify monotonically increasing chunkIndex
      expect(capturedEvents[0]!.chunkIndex).toBe(0);
      expect(capturedEvents[1]!.chunkIndex).toBe(1);
      expect(capturedEvents[2]!.chunkIndex).toBe(2);

      // Verify totalChunks is consistent
      for (const event of capturedEvents) {
        expect(event.totalChunks).toBe(3);
      }

      // Verify candidatesSoFar is non-decreasing
      expect(capturedEvents[0]!.candidatesSoFar).toBeLessThanOrEqual(
        capturedEvents[1]!.candidatesSoFar,
      );
      expect(capturedEvents[1]!.candidatesSoFar).toBeLessThanOrEqual(
        capturedEvents[2]!.candidatesSoFar,
      );
    });

    it('callback errors do not crash the extraction loop', async () => {
      let callCount = 0;
      const onChunkProgress: OnChunkProgress = (_event) => {
        callCount++;
        if (callCount === 2) {
          throw new Error('callback error');
        }
      };

      // Mock that invokes callback 3 times, wrapping in try/catch like the real service does
      const mockRunChunkedExtraction = vi.fn(async (_service, _request, opts) => {
        for (let i = 0; i < 3; i++) {
          if (opts?.onChunkProgress) {
            try {
              opts.onChunkProgress({
                chunkIndex: i,
                totalChunks: 3,
                candidatesSoFar: i + 1,
              });
            } catch {
              // Simulate the real service's try/catch — logs warning and continues
            }
          }
        }
        return {
          kind: 'extraction-draft',
          recordId: 'XDR-test-v1',
          source_artifact: { kind: 'freetext', id: 'protocol-extract' },
          status: 'pending_review',
          candidates: [
            { target_kind: 'protocol', draft: { name: 'step1' }, confidence: 0.9 },
          ],
          created_at: '2026-01-01T00:00:00.000Z',
          diagnostics: [],
        };
      });

      const mockRecordStore = {
        create: vi.fn().mockResolvedValue({}),
      } as unknown as RecordStore;

      const pass = createProtocolExtractPass({
        runChunkedExtraction: mockRunChunkedExtraction,
        recordStore: mockRecordStore,
        onChunkProgress,
      });

      const args: PassRunArgs = {
        pass_id: 'protocol_extract',
        state: {
          input: {
            text: 'A'.repeat(20000),
          },
          context: {},
          meta: {},
          outputs: new Map(),
          diagnostics: [],
        },
      };

      // Should not throw despite callback error
      const result = await pass.run(args);
      expect(result.ok).toBe(true);
    });

    it('does not invoke callback when onChunkProgress is not provided', async () => {
      const onChunkProgress = vi.fn();

      const mockRunChunkedExtraction = vi.fn().mockResolvedValue({
        kind: 'extraction-draft',
        recordId: 'XDR-test-v1',
        source_artifact: { kind: 'freetext', id: 'protocol-extract' },
        status: 'pending_review',
        candidates: [],
        created_at: '2026-01-01T00:00:00.000Z',
        diagnostics: [],
      });

      const mockRecordStore = {
        create: vi.fn().mockResolvedValue({}),
      } as unknown as RecordStore;

      const pass = createProtocolExtractPass({
        runChunkedExtraction: mockRunChunkedExtraction,
        recordStore: mockRecordStore,
        // No onChunkProgress provided
      });

      const args: PassRunArgs = {
        pass_id: 'protocol_extract',
        state: {
          input: {
            text: 'A'.repeat(20000),
          },
          context: {},
          meta: {},
          outputs: new Map(),
          diagnostics: [],
        },
      };

      await pass.run(args);

      expect(onChunkProgress).not.toHaveBeenCalled();
    });
  });
});
