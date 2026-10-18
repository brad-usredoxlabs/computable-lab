import { useEffect, useState } from 'react';
import { apiClient } from '../../shared/api/client';
import './RelatedRecordsCard.css';

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
    return <div className="related-records__empty">Loading related...</div>;
  }

  if (related.length === 0) {
    return <div className="related-records__empty">No related records</div>;
  }

  return (
    <div className="related-records">
      <h3 className="related-records__title">Related Records</h3>
      <div className="related-records__rows">
        {related.map((item) => (
          <button
            key={item.recordId}
            onClick={() => onNavigate(item.recordId)}
            className="related-records__row"
          >
            <span className="related-records__kind">{item.kind}</span>
            <span className="related-records__label">{item.title}</span>
            <span className="related-records__via">via {item.refField}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
