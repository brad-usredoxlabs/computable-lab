import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/api/client';

interface Transition {
  event: string;
  targetState: string;
  label: string;
  role: string;
  allowed: boolean;
}

interface DocumentControlBarProps {
  record: {
    recordId: string;
    payload: Record<string, unknown>;
  };
  onStateChanged: () => void;
}

const stateColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  in_review: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  effective: 'bg-emerald-100 text-emerald-700',
  superseded: 'bg-gray-100 text-gray-500 line-through',
  archived: 'bg-gray-100 text-gray-500 line-through',
};

export function DocumentControlBar({ record, onStateChanged }: DocumentControlBarProps) {
  const lifecycleId = record.payload.lifecycleId as string | undefined;
  const stateValue = record.payload.state as string | undefined;
  const statusValue = record.payload.status as string | undefined;
  const currentState = stateValue || statusValue || 'draft';

  // Hooks must be called before any conditional returns (Rules of Hooks)
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [loading, setLoading] = useState(false);
  const [advancing, setAdvancing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lifecycleId) return;
    setLoading(true);
    apiClient
      .getValidTransitions(record.recordId, lifecycleId)
      .then((data) => setTransitions(data.transitions || []))
      .catch(() => setTransitions([]))
      .finally(() => setLoading(false));
  }, [record.recordId, lifecycleId]);

  // Early return after all hooks are called
  if (!lifecycleId) return null;

  const handleTransition = async (transition: Transition) => {
    setAdvancing(transition.event);
    setError(null);
    try {
      await apiClient.updateRecord(record.recordId, { ...record.payload, state: transition.targetState });
      onStateChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to advance state');
    } finally {
      setAdvancing(null);
    }
  };

  const stateColor = stateColors[currentState] || 'bg-gray-100 text-gray-700';
  const hasAllowedTransitions = transitions.some((t) => t.allowed);
  const isTerminal = !hasAllowedTransitions && ['superseded', 'archived'].includes(currentState);

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 mb-4">
      <span className={`text-sm font-medium px-2.5 py-1 rounded ${stateColor}`}>
        {currentState.replace('_', ' ')}
      </span>
      {loading && <span className="text-sm text-gray-500">Loading...</span>}
      {!loading && transitions.length === 0 && <span className="text-sm text-gray-500">No transitions</span>}
      {!loading &&
        transitions.map(
          (t) =>
            t.allowed && (
              <button
                key={t.event}
                onClick={() => handleTransition(t)}
                disabled={advancing !== null}
                className="text-sm px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-50"
              >
                {t.label}
              </button>
            )
        )}
      {!loading && !hasAllowedTransitions && isTerminal && (
        <span className="text-sm text-gray-500">This document is {currentState}</span>
      )}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
