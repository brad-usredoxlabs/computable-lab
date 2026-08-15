/**
 * Protocol Evolution Service
 * 
 * Analyzes execution runs to detect patterns in deviations and suggest protocol updates.
 * This service identifies when deviations occur frequently enough (>50% threshold) to warrant
 * protocol evolution.
 */

import type { AppContext } from '../server.js';
import { ExecutionEvidenceService } from '../execution/ExecutionEvidenceService.js';

/**
 * Deviation pattern with frequency analysis
 */
export interface DeviationPattern {
  deviationType: string;
  expectedValue?: string;
  actualValue: string;
  count: number;
  totalRuns: number;
  frequency: number; // 0.0 to 1.0
  sampleRunIds: string[];
  description: string;
}

/**
 * Evolution suggestion for a protocol
 */
export interface EvolutionSuggestion {
  protocolId: string;
  suggestionId: string;
  detectedAt: string;
  patterns: DeviationPattern[];
  recommendedChanges: Array<{
    stepOrdinal: number;
    currentAction: string;
    proposedAction: string;
    rationale: string;
    supportingEvidence: string[];
  }>;
  confidence: number; // 0.0 to 1.0
  explanation: string;
}

/**
 * Version history entry for a protocol
 */
export interface ProtocolVersionEntry {
  version: string;
  previousVersion: string | undefined;
  createdAt: string;
  changeLog: string;
  informedByRuns: string[];
  changeSummary: string;
}

/**
 * Protocol evolution analysis result
 */
export interface ProtocolEvolutionAnalysis {
  protocolId: string;
  totalRunsAnalyzed: number;
  patternsDetected: DeviationPattern[];
  suggestions: EvolutionSuggestion[];
  versionHistory: ProtocolVersionEntry[];
}

export class ProtocolEvolutionService {
  private ctx: AppContext;
  private evidenceService: ExecutionEvidenceService;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
    this.evidenceService = new ExecutionEvidenceService(ctx);
  }

  /**
   * Analyze all execution runs for a given protocol and detect deviation patterns
   */
  async analyzeProtocolEvolution(protocolId: string): Promise<ProtocolEvolutionAnalysis> {
    // Find all execution runs linked to this protocol
    // This requires finding the plannedRun -> robotPlan -> execution-run chain
    const allRuns = await this.ctx.store.list({ kind: 'execution-run', limit: 5000 });
    
    // Filter runs that are linked to this protocol (via plannedRun -> protocol)
    const protocolRuns = await this.filterRunsByProtocol(allRuns, protocolId);
    
    // Analyze deviations across all runs
    const deviationPatterns = await this.analyzeDeviationPatterns(protocolRuns);
    
    // Generate suggestions if patterns exceed threshold
    const suggestions = this.generateSuggestions(deviationPatterns);
    
    // Get version history
    const versionHistory = await this.getVersionHistory(protocolId);
    
    return {
      protocolId,
      totalRunsAnalyzed: protocolRuns.length,
      patternsDetected: deviationPatterns,
      suggestions,
      versionHistory,
    };
  }

  /**
   * Filter execution runs by protocol id
   */
  private async filterRunsByProtocol(
    allRuns: Array<{ recordId: string; payload: unknown }>,
    protocolId: string
  ): Promise<Array<{ recordId: string; payload: unknown }>> {
    const filtered: Array<{ recordId: string; payload: unknown }> = [];
    
    for (const run of allRuns) {
      const payload = run.payload as Record<string, unknown>;
      const plannedRunRef = payload.plannedRunRef as { id?: string } | undefined;
      
      if (!plannedRunRef?.id) continue;
      
      // Fetch planned run to check protocol
      const plannedRun = await this.ctx.store.get(plannedRunRef.id);
      if (!plannedRun) continue;
      
      const plannedPayload = plannedRun.payload as Record<string, unknown>;
      const protocolRef = plannedPayload.protocolRef as { id?: string } | undefined;
      
      if (protocolRef?.id === protocolId || protocolRef?.id === `protocol/${protocolId}` || protocolRef?.id === `PRT-${protocolId.replace('PRT-', '')}`) {
        filtered.push(run);
      }
    }
    
    return filtered;
  }

  /**
   * Analyze deviations across execution runs to find patterns
   */
  private async analyzeDeviationPatterns(
    runs: Array<{ recordId: string; payload: unknown }>
  ): Promise<DeviationPattern[]> {
    const deviationMap = new Map<string, {
      actualValue: string;
      expectedValue: string | undefined;
      deviationType: string;
      runIds: string[];
    }>();
    
    for (const run of runs) {
      const evidence = await this.evidenceService.listExecutionEvidence(run.recordId);
      
      for (const deviation of evidence.deviations) {
        const dev = deviation as unknown as Record<string, unknown>;
        const devType = dev.deviationType as string;
        const diff = dev.diff as { path?: string; value?: unknown; previousValue?: unknown } | undefined;
        
        if (!diff?.path) continue;
        
        // Create a key for grouping similar deviations
        const key = `${devType}:${diff.path}`;
        const actualValue = String(diff.value ?? 'unknown');
        const expectedValue = diff.previousValue ? String(diff.previousValue) : undefined;
        
        if (!deviationMap.has(key)) {
          const entryData: { actualValue: string; expectedValue: string | undefined; deviationType: string; runIds: string[] } = {
            actualValue,
            expectedValue,
            deviationType: devType,
            runIds: [],
          };
          deviationMap.set(key, entryData);
        }
        
        const entry = deviationMap.get(key)!;
        entry.runIds.push(run.recordId);
      }
    }
    
    // Convert to patterns with frequency analysis
    const totalRuns = runs.length;
    const patterns: DeviationPattern[] = [];
    
    for (const [_, data] of deviationMap) {
      const frequency = data.runIds.length / totalRuns;
      
      // Only include patterns that appear in at least 2 runs
      if (data.runIds.length >= 2) {
        const expVal: string | undefined = data.expectedValue;
        const pattern: DeviationPattern = {
          deviationType: data.deviationType,
          ...(expVal !== undefined ? { expectedValue: expVal } : {}),
          actualValue: data.actualValue,
          count: data.runIds.length,
          totalRuns,
          frequency,
          sampleRunIds: data.runIds.slice(0, 5),
          description: this.describeDeviation(data.deviationType, data.actualValue, expVal),
        };
        patterns.push(pattern);
      }
    }
    
    // Sort by frequency descending
    return patterns.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Generate evolution suggestions for patterns exceeding threshold
   */
  private generateSuggestions(patterns: DeviationPattern[]): EvolutionSuggestion[] {
    const suggestions: EvolutionSuggestion[] = [];
    const threshold = 0.5; // 50% threshold
    
    // Group patterns by deviation type
    const groupedPatterns = new Map<string, DeviationPattern[]>();
    for (const pattern of patterns) {
      if (pattern.frequency >= threshold) {
        if (!groupedPatterns.has(pattern.deviationType)) {
          groupedPatterns.set(pattern.deviationType, []);
        }
        groupedPatterns.get(pattern.deviationType)!.push(pattern);
      }
    }
    
    let suggestionId = 1;
    for (const [_devType, typePatterns] of groupedPatterns) {
      const recommendedChanges = typePatterns.map((pattern, idx) => {
        const currentAct: string = pattern.expectedValue ?? 'original protocol value';
        return {
          stepOrdinal: idx + 1,
          currentAction: currentAct,
          proposedAction: pattern.actualValue,
          rationale: `Observed in ${pattern.count} of ${pattern.totalRuns} runs (${Math.round(pattern.frequency * 100)}%)`,
          supportingEvidence: pattern.sampleRunIds,
        };
      });
      
      const suggestion: EvolutionSuggestion = {
        protocolId: 'unknown', // Will be set by caller
        suggestionId: `SUG-${String(suggestionId).padStart(3, '0')}`,
        detectedAt: new Date().toISOString(),
        patterns: typePatterns,
        recommendedChanges,
        confidence: this.calculateConfidence(typePatterns),
        explanation: this.generateExplanation(typePatterns),
      };
      suggestions.push(suggestion);
      
      suggestionId++;
    }
    
    return suggestions;
  }

  /**
   * Calculate confidence score for suggestions
   */
  private calculateConfidence(patterns: DeviationPattern[]): number {
    if (patterns.length === 0) return 0;
    
    // Average frequency weighted by sample size
    const totalWeighted = patterns.reduce((sum, p) => sum + (p.frequency * p.count), 0);
    const totalCount = patterns.reduce((sum, p) => sum + p.count, 0);
    
    return totalCount > 0 ? totalWeighted / totalCount : 0;
  }

  /**
   * Generate human-readable explanation for suggestions
   */
  private generateExplanation(patterns: DeviationPattern[]): string {
    const totalPatterns = patterns.length;
    const avgFrequency = patterns.reduce((sum, p) => sum + p.frequency, 0) / totalPatterns;
    
    return `Detected ${totalPatterns} deviation pattern(s) that occur in ${Math.round(avgFrequency * 100)}% of execution runs. ` +
           `These patterns suggest the protocol may need updating to reflect actual practice. ` +
           `Review the recommended changes below to incorporate frequently-used alternatives into the protocol.`;
  }

  /**
   * Describe a deviation in human-readable terms
   */
  private describeDeviation(_type: string, actual: string, expected?: string): string {
    const expectedStr = expected ? `expected "${expected}"` : 'no expected value';
    return `Deviation: ${actual} (was ${expectedStr})`;
  }

  /**
   * Get version history for a protocol
   */
  private async getVersionHistory(protocolId: string): Promise<ProtocolVersionEntry[]> {
    const protocol = await this.ctx.store.get(protocolId);
    if (!protocol) return [];
    
    const payload = protocol.payload as Record<string, unknown>;
    const evolvedFrom = payload.evolvedFrom as Array<Record<string, unknown>> | undefined;
    const version: string | undefined = payload.version as string | undefined;
    
    if (!evolvedFrom || evolvedFrom.length === 0) {
      if (version) {
        const entry: ProtocolVersionEntry = {
          version,
          previousVersion: undefined,
          createdAt: new Date().toISOString(),
          changeLog: 'Initial version',
          informedByRuns: [] as string[],
          changeSummary: 'Original protocol',
        };
        return [entry];
      }
      return [] as ProtocolVersionEntry[];
    }
    
    const history: ProtocolVersionEntry[] = evolvedFrom.map((ev, idx) => {
      const ver: string = (ev.version as string) || `v1.${idx}`;
      const prevVer: string | undefined = idx > 0 ? `v1.${idx - 1}` : undefined;
      const changeLog: string = (ev.reason as string) || 'Protocol evolution';
      const entry: ProtocolVersionEntry = {
        version: ver,
        previousVersion: prevVer,
        createdAt: (ev.evolvedAt as string) || new Date().toISOString(),
        changeLog,
        informedByRuns: [] as string[],
        changeSummary: changeLog,
      };
      return entry;
    });
    
    // Add current version if not in evolvedFrom
    const lastVersion: string | undefined = history.length > 0 ? history[history.length - 1]?.version : undefined;
    if (version && (history.length === 0 || lastVersion !== version)) {
      const currentEntry: ProtocolVersionEntry = {
        version,
        previousVersion: lastVersion,
        createdAt: new Date().toISOString(),
        changeLog: 'Current version',
        informedByRuns: [] as string[],
        changeSummary: 'Latest version',
      };
      history.push(currentEntry);
    }
    
    return history.reverse(); // Oldest first
  }

  /**
   * Create a new protocol version from suggestions
   */
  async createProtocolVersion(
    protocolId: string,
    suggestionId: string,
    changes: Array<{
      stepOrdinal: number;
      proposedAction: string;
      rationale: string;
    }>,
    userNotes?: string
  ): Promise<{ newProtocolId: string; version: string }> {
    const protocol = await this.ctx.store.get(protocolId);
    if (!protocol) {
      throw new Error(`Protocol not found: ${protocolId}`);
    }
    
    const payload = protocol.payload as Record<string, unknown>;
    const steps = payload.steps as Array<Record<string, unknown>> | undefined;
    const currentVersion: string = (payload.version as string) || '1.0.0';
    
    // Parse current version
    const versionParts = currentVersion.split('.').map(Number);
    const major = versionParts[0] ?? 1;
    const minor = (versionParts[1] ?? 0) + 1;
    const newVersion = `${major}.${minor}.0`;
    
    // Create new steps with changes applied
    const newSteps: Array<Record<string, unknown>> | undefined = steps?.map((step, idx) => {
      const change = changes.find((c) => c.stepOrdinal === idx + 1);
      if (change) {
        return {
          ...step,
          action: change.proposedAction,
          note: change.rationale,
        };
      }
      return step;
    }) || steps;
    
    // Create new protocol record
    const newProtocolId = `PRT-${String(Date.now()).slice(-6)}`; // Simple ID generation
    const changeLog = `Updated based on evolution suggestion ${suggestionId}. ${userNotes || ''}`;
    
    const newPayload: Record<string, unknown> = {
      ...payload,
      recordId: newProtocolId,
      version: newVersion,
      steps: newSteps,
      evolvedFrom: [
        ...(payload.evolvedFrom as Array<Record<string, unknown>> || []),
        {
          sourceType: 'protocol',
          sourceRef: { kind: 'record', id: protocolId, type: 'protocol' },
          reason: changeLog,
          evolvedAt: new Date().toISOString(),
        },
      ],
    };
    
    // Store the new protocol
    await this.ctx.store.create({
      envelope: {
        recordId: newProtocolId,
        schemaId: 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml',
        payload: newPayload,
      },
      message: `Create protocol version ${newVersion} from ${protocolId}`,
      skipValidation: false,
      skipLint: false,
    });
    
    return { newProtocolId, version: newVersion };
  }
}

/**
 * Factory function to create ProtocolEvolutionService
 */
export function createProtocolEvolutionService(ctx: AppContext): ProtocolEvolutionService {
  return new ProtocolEvolutionService(ctx);
}
