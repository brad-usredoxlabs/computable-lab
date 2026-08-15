/**
 * Version History Panel
 * 
 * Displays the version tree of a protocol, showing the evolution lineage
 * and what changed between versions.
 */

import { useState, useEffect } from 'react';

interface ProtocolVersionEntry {
  version: string;
  previousVersion?: string;
  createdAt: string;
  changeLog: string;
  informedByRuns: string[];
  changeSummary: string;
}

interface VersionHistoryPanelProps {
  protocolId: string;
  currentVersion?: string;
}

export function VersionHistoryPanel({ protocolId, currentVersion }: VersionHistoryPanelProps) {
  const [history, setHistory] = useState<ProtocolVersionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);

  useEffect(() => {
    loadVersionHistory();
  }, [protocolId]);

  async function loadVersionHistory() {
    try {
      setLoading(true);
      const response = await fetch(`/api/protocols/${protocolId}/evolution-suggestions`);
      if (!response.ok) throw new Error('Failed to load version history');
      const data = await response.json();
      setHistory(data.versionHistory || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load version history');
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  function toggleExpand(version: string) {
    setExpandedVersion(expandedVersion === version ? null : version);
  }

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-3 bg-gray-200 rounded w-1/3" />
          <div className="h-3 bg-gray-200 rounded w-1/4" />
          <div className="h-3 bg-gray-200 rounded w-2/5" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded">
        <p className="text-red-800 font-medium">Error loading version history</p>
        <p className="text-red-600 text-sm mt-1">{error}</p>
        <button onClick={loadVersionHistory} className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm">
          Retry
        </button>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded">
        <p className="text-gray-600 text-sm">No version history available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border-b border-gray-200 pb-2">
        <h3 className="text-lg font-semibold text-gray-900">Version History</h3>
        <p className="text-sm text-gray-600 mt-1">Track the evolution of this protocol through its versions.</p>
      </div>

      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-300" />
        <div className="space-y-4">
          {history.map((entry) => {
            const isExpanded = expandedVersion === entry.version;
            const isCurrent = currentVersion === entry.version;

            return (
              <div key={entry.version} className="relative pl-10">
                <div className="absolute left-2 top-1 w-4 h-4 rounded-full bg-blue-500 border-4 border-white shadow" />
                <div className={`border rounded-lg p-4 ${isCurrent ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200'}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-gray-900">Version {entry.version}</h4>
                        {isCurrent && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">Current</span>}
                        {entry.previousVersion && <span className="text-sm text-gray-500">from v{entry.previousVersion}</span>}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{entry.changeSummary}</p>
                      <p className="text-xs text-gray-500 mt-2">Created: {formatDate(entry.createdAt)}</p>
                    </div>
                    <button onClick={() => toggleExpand(entry.version)} className="ml-4 text-gray-500 hover:text-gray-700">
                      {isExpanded ? '▲' : '▼'}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="mb-3">
                        <h5 className="text-sm font-medium text-gray-700 mb-2">Change Log:</h5>
                        <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded">{entry.changeLog}</p>
                      </div>
                      {entry.informedByRuns && entry.informedByRuns.length > 0 && (
                        <div>
                          <h5 className="text-sm font-medium text-gray-700 mb-2">Informed By Execution Runs:</h5>
                          <ul className="text-sm text-gray-600 space-y-1">
                            {entry.informedByRuns.map((runId) => (
                              <li key={runId} className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                                {runId}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="mt-3 flex gap-2">
                        <button className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded">View Diff</button>
                        <button className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded">Compare with Previous</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {history.length > 1 && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <p className="text-sm text-yellow-800">
            <strong>Note:</strong> This protocol has evolved through {history.length} versions.
          </p>
        </div>
      )}
    </div>
  );
}
