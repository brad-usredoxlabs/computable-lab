/**
 * Tests for ExtractionRunnerService.
 */

import { describe, it, expect, vi } from 'vitest';
import { ExtractionRunnerService } from './ExtractionRunnerService.js';
import type { ExtractorAdapter, ExtractionRequest, ExtractionResult } from './ExtractorAdapter.js';
import type { ResolutionCandidate } from './MentionResolver.js';
import type { MentionCandidatePopulator } from './MentionCandidatePopulator.js';
import type { ExtractionLogger } from './ExtractionRunnerService.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Fake ExtractorAdapter for testing.
 */
class FakeExtractorAdapter implements ExtractorAdapter {
  async extract(_req: ExtractionRequest): Promise<ExtractionResult> {
    return {
      candidates: [
        {
          target_kind: 'material',
          draft: { name: 'x' },
          confidence: 0.9,
          ambiguity_spans: [],
        },
      ],
      diagnostics: [],
    };
  }
}

describe('ExtractionRunnerService', () => {
  it('should run extraction pipeline and return draft body with correct shape', async () => {
    // Build a fake ExtractorAdapter
    const fakeExtractor = new FakeExtractorAdapter();
    
    // Create extractor factory that returns our fake
    const extractorFactory = (_targetKind: string): ExtractorAdapter => fakeExtractor;
    
    // Create empty candidatesByKind map
    const candidatesByKind = new Map<string, readonly unknown[]>();
    
    // Use absolute path to the pipeline file
    const pipelinePath = join(__dirname, '../../../schema/registry/compile-pipelines/extraction-compile.yaml');
    
    // Create the service
    const service = new ExtractionRunnerService({
      extractorFactory,
      candidatesByKind,
      pipelinePath,
      recordIdPrefix: 'XDR-run-',
    });
    
    // Run the service
    const result = await service.run({
      target_kind: 'material',
      text: 'Sample text for extraction',
      source: {
        kind: 'freetext',
        id: 'test-source-1',
      },
    });
    
    // Assert the returned draft body has the expected shape
    expect(result.kind).toBe('extraction-draft');
    expect(result.recordId).toMatch(/^XDR-/);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].target_kind).toBe('material');
  });

  it('should use populator to build candidatesByKind when provided', async () => {
    // Build a fake ExtractorAdapter
    const fakeExtractor = new FakeExtractorAdapter();
    
    // Create extractor factory that returns our fake
    const extractorFactory = (_targetKind: string): ExtractorAdapter => fakeExtractor;
    
    // Create a fake populator
    const fakePopulator: MentionCandidatePopulator = {
      populate: vi.fn().mockResolvedValue(
        new Map<string, ResolutionCandidate[]>([
          ['material-spec', [{ record_id: 'M-1', kind: 'material-spec', name: 'Material A' }]],
          ['protocol', [{ record_id: 'P-1', kind: 'protocol', name: 'Protocol X' }]],
        ])
      ),
    };
    
    // Use absolute path to the pipeline file
    const pipelinePath = join(__dirname, '../../../schema/registry/compile-pipelines/extraction-compile.yaml');
    
    // Create the service with populator
    const service = new ExtractionRunnerService({
      extractorFactory,
      populator: fakePopulator,
      resolutionKinds: ['material-spec', 'protocol'],
      pipelinePath,
      recordIdPrefix: 'XDR-run-',
    });
    
    // Run the service
    const result = await service.run({
      target_kind: 'material',
      text: 'Sample text for extraction',
      source: {
        kind: 'freetext',
        id: 'test-source-1',
      },
    });
    
    // Assert populator.populate was called with the expected kinds
    expect(fakePopulator.populate).toHaveBeenCalledWith(['material-spec', 'protocol']);
    
    // Assert the pipeline was invoked (extractor's extract was called)
    expect(result.kind).toBe('extraction-draft');
    expect(result.recordId).toMatch(/^XDR-/);
  });

  it('should throw when neither candidatesByKind nor populator is provided', () => {
    // Build a fake ExtractorAdapter
    const fakeExtractor = new FakeExtractorAdapter();
    
    // Create extractor factory that returns our fake
    const extractorFactory = (_targetKind: string): ExtractorAdapter => fakeExtractor;
    
    // Use absolute path to the pipeline file
    const pipelinePath = join(__dirname, '../../../schema/registry/compile-pipelines/extraction-compile.yaml');
    
    // Creating the service without candidatesByKind or populator should throw
    expect(() => {
      new ExtractionRunnerService({
        extractorFactory,
        pipelinePath,
        recordIdPrefix: 'XDR-run-',
      });
    }).toThrow('ExtractionRunnerService requires candidatesByKind or populator');
  });

  it('should emit extraction_start and extraction_finish events with correct fields', async () => {
    // Build a fake ExtractorAdapter
    const fakeExtractor = new FakeExtractorAdapter();
    
    // Create extractor factory that returns our fake
    const extractorFactory = (_targetKind: string): ExtractorAdapter => fakeExtractor;
    
    // Create empty candidatesByKind map
    const candidatesByKind = new Map<string, readonly unknown[]>();
    
    // Use absolute path to the pipeline file
    const pipelinePath = join(__dirname, '../../../schema/registry/compile-pipelines/extraction-compile.yaml');
    
    // Create a captured logger
    const capturedEvents: unknown[] = [];
    const capturedLogger: ExtractionLogger = {
      info: (o: object) => capturedEvents.push(o),
      error: (o: object) => capturedEvents.push(o),
    };
    
    // Create the service with captured logger
    const service = new ExtractionRunnerService({
      extractorFactory,
      candidatesByKind,
      pipelinePath,
      recordIdPrefix: 'XDR-run-',
      logger: capturedLogger,
    });
    
    // Run the service
    const result = await service.run({
      target_kind: 'material',
      text: 'Sample text for extraction',
      source: {
        kind: 'freetext',
        id: 'test-source-1',
      },
    });
    
    // Assert the returned draft body has the expected shape
    expect(result.kind).toBe('extraction-draft');
    expect(result.recordId).toMatch(/^XDR-/);
    
    // Assert extraction_start event was emitted with correct fields
    const startEvent = capturedEvents.find(e => (e as { event: string }).event === 'extraction_start');
    expect(startEvent).toBeDefined();
    expect((startEvent as { event: string; target_kind: string; source_id: string; text_length: number }).event).toBe('extraction_start');
    expect((startEvent as { target_kind: string }).target_kind).toBe('material');
    expect((startEvent as { source_id: string }).source_id).toBe('test-source-1');
    expect((startEvent as { text_length: number }).text_length).toBe(26); // 'Sample text for extraction'.length
    
    // Assert extraction_finish event was emitted with correct fields
    const finishEvent = capturedEvents.find(e => (e as { event: string }).event === 'extraction_finish');
    expect(finishEvent).toBeDefined();
    expect((finishEvent as { event: string }).event).toBe('extraction_finish');
    expect((finishEvent as { target_kind: string }).target_kind).toBe('material');
    expect((finishEvent as { source_id: string }).source_id).toBe('test-source-1');
    expect((finishEvent as { candidate_count: number }).candidate_count).toBe(1);
    expect(typeof (finishEvent as { duration_ms: number }).duration_ms).toBe('number');
    expect((finishEvent as { diagnostic_count: number }).diagnostic_count).toBe(0);
  });

  it('should emit extraction_error event and rethrow when extractor throws', async () => {
    // Create a fake extractor that throws
    const throwingExtractor: ExtractorAdapter = {
      async extract(_req: ExtractionRequest): Promise<ExtractionResult> {
        throw new Error('Simulated extraction failure');
      },
    };
    
    // Create extractor factory that returns the throwing extractor
    const extractorFactory = (_targetKind: string): ExtractorAdapter => throwingExtractor;
    
    // Create empty candidatesByKind map
    const candidatesByKind = new Map<string, readonly unknown[]>();
    
    // Use absolute path to the pipeline file
    const pipelinePath = join(__dirname, '../../../schema/registry/compile-pipelines/extraction-compile.yaml');
    
    // Create a captured logger
    const capturedEvents: unknown[] = [];
    const capturedLogger: ExtractionLogger = {
      info: (o: object) => capturedEvents.push(o),
      error: (o: object) => capturedEvents.push(o),
    };
    
    // Create the service with captured logger
    const service = new ExtractionRunnerService({
      extractorFactory,
      candidatesByKind,
      pipelinePath,
      recordIdPrefix: 'XDR-run-',
      logger: capturedLogger,
    });
    
    // Run the service and expect it to throw
    await expect(
      service.run({
        target_kind: 'material',
        text: 'Sample text for extraction',
        source: {
          kind: 'freetext',
          id: 'test-source-1',
        },
      })
    ).rejects.toThrow('draft_assemble');
    
    // Assert extraction_error event was emitted with correct fields
    const errorEvent = capturedEvents.find(e => (e as { event: string }).event === 'extraction_error');
    expect(errorEvent).toBeDefined();
    expect((errorEvent as { event: string }).event).toBe('extraction_error');
    expect((errorEvent as { target_kind: string }).target_kind).toBe('material');
    expect((errorEvent as { source_id: string }).source_id).toBe('test-source-1');
    expect((errorEvent as { error: string }).error).toContain('draft_assemble');
  });
});
