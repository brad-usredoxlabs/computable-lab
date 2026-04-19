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
}

/**
 * Service that wraps the extraction pipeline with adapter selection and artifact loading.
 */
export class ExtractionRunnerService {
  constructor(private readonly deps: ExtractionRunnerServiceDeps) {
    if (!this.deps.candidatesByKind && !this.deps.populator) {
      throw new Error('ExtractionRunnerService requires candidatesByKind or populator');
    }
  }

  async run(req: RunExtractionServiceArgs): Promise<ExtractionDraftBody> {
    let extractor: ExtractorAdapter;
    
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
    return draftAssembleOutput as ExtractionDraftBody;
  }
}
