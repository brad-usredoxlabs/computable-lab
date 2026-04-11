import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/api/client';

interface RelatedRecord {
  recordId: string;
  schemaId: string;
  kind: string;
  title: string;
  refField: string;
}

interface RelatedRecordsCardProps {
  recordId: string;
  onNavigate: (recordId: string) => void;
}

export function RelatedRecordsCard({ recordId, onNavigate }: RelatedRecordsCardProps) {
  const [related, setRelated] = useState<RelatedRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!recordId) return;

    setLoading(true);
    apiClient
      .getRelatedRecords(recordId)
      .then((data) => setRelated(data.related || []))
      .catch(() => setRelated([]))
      .finally(() => setLoading(false));
  }, [recordId]);

  if (loading) {
    return <div className="text-gray-500 text-sm">Loading related...</div>;
  }

  if (related.length === 0) {
    return <div className="text-gray-400 text-sm">No related records</div>;
  }

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-2">Related Records</h3>
      <div className="space-y-1">
        {related.map((item) => (
          <button
            key={item.recordId}
            onClick={() => onNavigate(item.recordId)}
            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 w-full text-left text-sm"
          >
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
              {item.kind}
            </span>
            <span className="text-gray-900 truncate flex-1">{item.title}</span>
            <span className="text-xs text-gray-400">via {item.refField}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
