/**
 * ExtractionRunnerService - Wraps runExtractionPipeline with adapter selection + artifact loading.
 * 
 * This module provides a clean entrypoint for running the extraction pipeline that:
 * - Picks the right extractor (material / protocol / equipment / ...) for the target kind
 * - Loads text from a source artifact (file, publication, freetext)
 * - Runs the three-pass pipeline
 * - Returns the assembled extraction-draft record body
 */

import type { ExtractorAdapter } from './ExtractorAdapter.js';
import type { ResolutionCandidate } from './MentionResolver.js';
import type { ExtractionDraftBody } from './ExtractionDraftBuilder.js';
import { runExtractionPipeline } from '../compiler/pipeline/extractionPipelineRun.js';
import { MentionCandidatePopulator } from './MentionCandidatePopulator.js';
import type { ExtractionMetrics } from './ExtractionMetrics.js';

/**
 * Arguments for running the extraction service.
 */
export interface RunExtractionServiceArgs {
  target_kind: string;                                  // 'material' | 'protocol' | ...
  text: string;
  source: {
    kind: 'file' | 'publication' | 'freetext';
    id: string;
    locator?: string;
  };
  fileName?: string;                                    // optional, for library matcher
  hint?: { target_kind?: string; [k: string]: unknown };
}

/**
 * Logger interface for structured logging.
 */
export interface ExtractionLogger {
  info: (o: object) => void;
  error: (o: object) => void;
}

/**
 * Dependencies for the ExtractionRunnerService.
 */
export interface ExtractionRunnerServiceDeps {
  extractorFactory: (targetKind: string) => ExtractorAdapter;
  candidatesByKind?: ReadonlyMap<string, ReadonlyArray<ResolutionCandidate>>;
  populator?: MentionCandidatePopulator;
  resolutionKinds?: ReadonlyArray<string>;   // used with populator
  pipelinePath: string;              // path to extraction-compile.yaml
  recordIdPrefix?: string;           // default 'XDR-run-'
  libraryMatcher?: (fileName: string, contentPreview: string) => Promise<ExtractorAdapter | null>;
  logger?: ExtractionLogger;
  metrics?: ExtractionMetrics;
}

/**
 * Default logger that uses console.log/console.error with JSON.stringify.
 */
const defaultLogger: ExtractionLogger = {
  info: (o: object) => console.log(JSON.stringify(o)),
  error: (o: object) => console.error(JSON.stringify(o)),
};

/**
 * Service that wraps the extraction pipeline with adapter selection and artifact loading.
 */
export class ExtractionRunnerService {
  private readonly logger: ExtractionLogger;

  constructor(private readonly deps: ExtractionRunnerServiceDeps) {
    if (!this.deps.candidatesByKind && !this.deps.populator) {
      throw new Error('ExtractionRunnerService requires candidatesByKind or populator');
    }
    this.logger = this.deps.logger ?? defaultLogger;
  }

  async run(req: RunExtractionServiceArgs): Promise<ExtractionDraftBody> {
    let extractor: ExtractorAdapter;
    
    // Emit extraction_start event
    this.logger.info({
      event: 'extraction_start',
      target_kind: req.target_kind,
      source_id: req.source.id,
      text_length: req.text.length,
    });

    const startTime = Date.now();
    
    try {
      // Try library matcher first if configured and we have a file source
      if (this.deps.libraryMatcher && req.source.kind === 'file' && req.fileName) {
        const contentPreview = req.text.slice(0, 4000);
        const matchedAdapter = await this.deps.libraryMatcher(req.fileName, contentPreview);
        if (matchedAdapter) {
          extractor = matchedAdapter;
        } else {
          // Fall back to factory
          extractor = this.deps.extractorFactory(req.target_kind);
        }
      } else {
        // No matcher or no file source - use factory directly
        extractor = this.deps.extractorFactory(req.target_kind);
      }
      
      // Compute candidatesByKind: use populator if provided, otherwise use static map
      const defaultKinds = ['material-spec','protocol','operator','facility-zone'];
      const candidatesByKind = this.deps.populator
        ? await this.deps.populator.populate(this.deps.resolutionKinds ?? defaultKinds)
        : this.deps.candidatesByKind!;
      const result = await runExtractionPipeline({
        pipelinePath: this.deps.pipelinePath,
        extractor,
        candidatesByKind,
        source_artifact: req.source,
        text: req.text,
        recordIdPrefix: this.deps.recordIdPrefix ?? 'XDR-run-',
      });
      const draftAssembleOutput = result.outputs.get('draft_assemble');
      if (!draftAssembleOutput) {
        throw new Error('ExtractionRunnerService: draft_assemble pass produced no output');
      }
      
      // Emit extraction_finish event
      const duration_ms = Date.now() - startTime;
      const draftBody = draftAssembleOutput as ExtractionDraftBody;
      
      // Record metrics if a metrics instance is provided
      if (this.deps.metrics) {
        const diagnosticCodes = result.diagnostics?.map(d => d.code).filter(Boolean) ?? [];
        this.deps.metrics.recordRun(duration_ms, draftBody.candidates.length, diagnosticCodes);
      }
      
      this.logger.info({
        event: 'extraction_finish',
        target_kind: req.target_kind,
        source_id: req.source.id,
        candidate_count: draftBody.candidates.length,
        diagnostic_count: result.diagnostics?.length ?? 0,
        duration_ms,
      });
      
      return draftBody;
    } catch (error) {
      // Emit extraction_error event
      this.logger.error({
        event: 'extraction_error',
        target_kind: req.target_kind,
        source_id: req.source.id,
        error: error instanceof Error ? error.message : String(error),
      });
      
      // Rethrow the original error
      throw error;
    }
  }
}
