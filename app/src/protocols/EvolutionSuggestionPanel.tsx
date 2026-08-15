/**
 * Evolution Suggestion Panel
 * 
 * Displays evolution suggestions for a protocol, including detected deviation patterns
 * and recommended changes. Users can accept suggestions to create new protocol versions.
 */

import { useState, useEffect } from 'react';

interface EvolutionSuggestion {
  suggestionId: string;
  detectedAt: string;
  patterns: Array<{
    deviationType: string;
    actualValue: string;
    expectedValue?: string;
    count: number;
    totalRuns: number;
    frequency: number;
    description: string;
  }>;
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

interface EvolutionSuggestionPanelProps {
  protocolId: string;
  onVersionCreated?: (newProtocolId: string, version: string) => void;
}

export function EvolutionSuggestionPanel({ protocolId, onVersionCreated }: EvolutionSuggestionPanelProps) {
  const [suggestions, setSuggestions] = useState<EvolutionSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState<EvolutionSuggestion | null>(null);
  const [userNotes, setUserNotes] = useState('');
  const [creatingVersion, setCreatingVersion] = useState(false);

  useEffect(() => {
    loadSuggestions();
  }, [protocolId]);

  async function loadSuggestions() {
    try {
      setLoading(true);
      const response = await fetch(`/api/protocols/${protocolId}/evolution-suggestions`);
      if (!response.ok) {
        throw new Error('Failed to load evolution suggestions');
      }
      const data = await response.json();
      setSuggestions(data.suggestions || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load suggestions');
    } finally {
      setLoading(false);
    }
  }

  async function handleAcceptSuggestion(suggestion: EvolutionSuggestion) {
    try {
      setCreatingVersion(true);
      const response = await fetch(`/api/protocols/${protocolId}/evolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestionId: suggestion.suggestionId,
          changes: suggestion.recommendedChanges,
          userNotes: userNotes || undefined,
        }),
      });

      if (!response.ok) throw new Error('Failed to create protocol version');

      const result = await response.json();
      if (onVersionCreated) onVersionCreated(result.newProtocolId, result.version);
      setUserNotes('');
      setSelectedSuggestion(null);
      loadSuggestions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create version');
    } finally {
      setCreatingVersion(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-4 bg-gray-200 rounded w-5/6" />
        </div>
      </div>
    );
  }

  if (error && !suggestions.length) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded">
        <p className="text-red-800 font-medium">Error loading suggestions</p>
        <p className="text-red-600 text-sm mt-1">{error}</p>
        <button onClick={loadSuggestions} className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm">
          Retry
        </button>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="p-4 bg-green-50 border border-green-200 rounded">
        <p className="text-green-800 font-medium">No evolution suggestions</p>
        <p className="text-green-600 text-sm mt-1">
          No deviation patterns detected that exceed the 50% threshold.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded p-4">
        <h3 className="text-blue-900 font-semibold mb-2">Evolution Suggestions Available</h3>
        <p className="text-blue-700 text-sm">
          We've detected patterns in execution deviations that suggest the protocol could be improved.
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded p-3"><p className="text-red-800 text-sm">{error}</p></div>}

      <div className="space-y-4">
        {suggestions.map((suggestion) => (
          <div key={suggestion.suggestionId} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="font-semibold text-gray-900">Suggestion {suggestion.suggestionId}</h4>
                <p className="text-sm text-gray-600 mt-1">{suggestion.explanation}</p>
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {Math.round(suggestion.confidence * 100)}% confidence
              </span>
            </div>

            <div className="mb-4">
              <h5 className="text-sm font-medium text-gray-700 mb-2">Detected Patterns:</h5>
              <ul className="space-y-2">
                {suggestion.patterns.map((pattern, idx) => (
                  <li key={idx} className="text-sm bg-gray-50 p-2 rounded">
                    <span className="font-medium">{pattern.deviationType}:</span> {pattern.description}
                    <span className="text-gray-500 ml-2">({pattern.count} of {pattern.totalRuns} runs, {Math.round(pattern.frequency * 100)}%)</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mb-4">
              <h5 className="text-sm font-medium text-gray-700 mb-2">Recommended Changes:</h5>
              <div className="space-y-2">
                {suggestion.recommendedChanges.map((change, idx) => (
                  <div key={idx} className="bg-yellow-50 border border-yellow-200 rounded p-3">
                    <p className="text-sm">
                      <span className="font-medium">Step {change.stepOrdinal}:</span>{' '}
                      <span className="text-gray-600">"{change.currentAction}" → "{change.proposedAction}"</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-1">{change.rationale}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => setSelectedSuggestion(suggestion)} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium">
                Review & Accept
              </button>
              <button onClick={() => setSuggestions(suggestions.filter(s => s.suggestionId !== suggestion.suggestionId))} className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm">
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedSuggestion && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Accept Evolution Suggestion</h3>
            <p className="text-gray-600 mb-4">This will create a new version incorporating the recommended changes.</p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Additional Notes (optional)</label>
              <textarea value={userNotes} onChange={(e) => setUserNotes(e.target.value)} className="w-full border border-gray-300 rounded p-2 text-sm" rows={4} placeholder="Add context about these changes..." />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setSelectedSuggestion(null)} className="px-4 py-2 text-gray-600 hover:text-gray-800" disabled={creatingVersion}>Cancel</button>
              <button onClick={() => handleAcceptSuggestion(selectedSuggestion)} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium" disabled={creatingVersion}>
                {creatingVersion ? 'Creating...' : 'Create New Version'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
