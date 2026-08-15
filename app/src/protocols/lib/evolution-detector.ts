/**
 * Protocol Evolution Detector
 * 
 * Client-side analysis module for detecting deviation patterns in protocol executions.
 * This module provides utilities for analyzing execution runs and identifying patterns
 that warrant protocol updates.
 */

export interface DeviationPattern {
  deviationType: string;
  expectedValue?: string;
  actualValue: string;
  count: number;
  totalRuns: number;
  frequency: number;
  sampleRunIds: string[];
  description: string;
}

export interface EvolutionSuggestion {
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
  confidence: number;
  explanation: string;
}

export interface ProtocolVersionEntry {
  version: string;
  previousVersion?: string;
  createdAt: string;
  changeLog: string;
  informedByRuns: string[];
  changeSummary: string;
}

export interface ProtocolEvolutionAnalysis {
  protocolId: string;
  totalRunsAnalyzed: number;
  patternsDetected: DeviationPattern[];
  suggestions: EvolutionSuggestion[];
  versionHistory: ProtocolVersionEntry[];
}

/**
 * Analyze deviation patterns from execution data
 * @param deviations Array of deviation records from execution runs
 * @param totalRuns Total number of runs analyzed
 * @param threshold Minimum frequency threshold (default: 0.5 for 50%)
 * @returns Array of detected patterns exceeding the threshold
 */
export function analyzeDeviationPatterns(
  deviations: Array<{
    runId: string;
    deviationType: string;
    expectedValue?: string;
    actualValue: string;
  }>,
  totalRuns: number,
  threshold: number = 0.5
): DeviationPattern[] {
  const deviationMap = new Map<string, {
    actualValue: string;
    expectedValue?: string;
    deviationType: string;
    runIds: string[];
  }>();

  // Group deviations by type and value
  for (const dev of deviations) {
    const key = `${dev.deviationType}:${dev.actualValue}`;
    
    if (!deviationMap.has(key)) {
      deviationMap.set(key, {
        actualValue: dev.actualValue,
        expectedValue: dev.expectedValue,
        deviationType: dev.deviationType,
        runIds: [],
      });
    }
    
    const entry = deviationMap.get(key)!;
    if (!entry.runIds.includes(dev.runId)) {
      entry.runIds.push(dev.runId);
    }
  }

  // Convert to patterns with frequency analysis
  const patterns: DeviationPattern[] = [];
  
  for (const [_, data] of deviationMap) {
    const frequency = data.runIds.length / totalRuns;
    
    // Only include patterns that meet the threshold
    if (frequency >= threshold) {
      const pattern: DeviationPattern = {
        deviationType: data.deviationType,
        ...(data.expectedValue !== undefined ? { expectedValue: data.expectedValue } : {}),
        actualValue: data.actualValue,
        count: data.runIds.length,
        totalRuns,
        frequency,
        sampleRunIds: data.runIds.slice(0, 5),
        description: describeDeviation(data.deviationType, data.actualValue, data.expectedValue),
      };
      patterns.push(pattern);
    }
  }

  // Sort by frequency descending
  return patterns.sort((a, b) => b.frequency - a.frequency);
}

/**
 * Generate evolution suggestions from detected patterns
 * @param patterns Array of deviation patterns
 * @returns Array of evolution suggestions
 */
export function generateEvolutionSuggestions(
  patterns: DeviationPattern[]
): EvolutionSuggestion[] {
  if (patterns.length === 0) return [];

  // Group patterns by deviation type
  const groupedPatterns = new Map<string, DeviationPattern[]>();
  for (const pattern of patterns) {
    if (!groupedPatterns.has(pattern.deviationType)) {
      groupedPatterns.set(pattern.deviationType, []);
    }
    groupedPatterns.get(pattern.deviationType)!.push(pattern);
  }

  const suggestions: EvolutionSuggestion[] = [];
  let suggestionId = 1;

  for (const [_devType, typePatterns] of groupedPatterns) {
    const recommendedChanges = typePatterns.map((pattern, idx) => {
      const currentAction: string = pattern.expectedValue ?? 'original protocol value';
      return {
        stepOrdinal: idx + 1,
        currentAction,
        proposedAction: pattern.actualValue,
        rationale: `Observed in ${pattern.count} of ${pattern.totalRuns} runs (${Math.round(pattern.frequency * 100)}%)`,
        supportingEvidence: pattern.sampleRunIds,
      };
    });

    const suggestion: EvolutionSuggestion = {
      suggestionId: `SUG-${String(suggestionId).padStart(3, '0')}`,
      detectedAt: new Date().toISOString(),
      patterns: typePatterns,
      recommendedChanges,
      confidence: calculateConfidence(typePatterns),
      explanation: generateExplanation(typePatterns),
    };
    suggestions.push(suggestion);
    suggestionId++;
  }

  return suggestions;
}

/**
 * Calculate confidence score for suggestions
 */
function calculateConfidence(patterns: DeviationPattern[]): number {
  if (patterns.length === 0) return 0;
  
  const totalWeighted = patterns.reduce((sum, p) => sum + (p.frequency * p.count), 0);
  const totalCount = patterns.reduce((sum, p) => sum + p.count, 0);
  
  return totalCount > 0 ? totalWeighted / totalCount : 0;
}

/**
 * Generate human-readable explanation for suggestions
 */
function generateExplanation(patterns: DeviationPattern[]): string {
  const totalPatterns = patterns.length;
  const avgFrequency = patterns.reduce((sum, p) => sum + p.frequency, 0) / totalPatterns;
  
  return `Detected ${totalPatterns} deviation pattern(s) that occur in ${Math.round(avgFrequency * 100)}% of execution runs. ` +
         `These patterns suggest the protocol may need updating to reflect actual practice. ` +
         `Review the recommended changes below to incorporate frequently-used alternatives into the protocol.`;
}

/**
 * Describe a deviation in human-readable terms
 */
function describeDeviation(_devType: string, actual: string, expected?: string): string {
  const expectedStr = expected ? `expected "${expected}"` : 'no expected value';
  return `Deviation: ${actual} (was ${expectedStr})`;
}
