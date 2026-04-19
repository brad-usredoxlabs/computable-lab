/**
 * Tests for ExtractionRunnerService.
 */

import { describe, it, expect, vi } from 'vitest';
import { ExtractionRunnerService } from './ExtractionRunnerService.js';
import type { ExtractorAdapter, ExtractionRequest, ExtractionResult } from './ExtractorAdapter.js';
import type { ResolutionCandidate } from './MentionResolver.js';
import type { MentionCandidatePopulator } from './MentionCandidatePopulator.js';
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
});
