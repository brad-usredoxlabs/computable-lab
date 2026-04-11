interface RecordListTableProps {
  records: Array<{ recordId: string; payload: Record<string, unknown> }>;
  columns: Array<{ path: string; label: string; width?: string }>;
  onSelect: (record: { recordId: string; payload: Record<string, unknown> }) => void;
  selectedId?: string | null;
  loading?: boolean;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const cleanPath = path.startsWith('$.') ? path.slice(2) : path;
  const parts = cleanPath.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('label' in value) return String(value.label);
    if ('id' in value) return String(value.id);
    return '[object]';
  }
  return String(value);
}

function getStatusClass(value: unknown): string {
  const str = String(value).toLowerCase();
  if (['active', 'pass', 'passed', 'completed'].includes(str)) return 'bg-green-100 text-green-800';
  if (['inactive', 'retired', 'revoked', 'failed'].includes(str)) return 'bg-red-100 text-red-800';
  if (['maintenance', 'suspended', 'in_progress', 'limited_use', 'adjusted'].includes(str)) return 'bg-amber-100 text-amber-800';
  return 'bg-gray-100 text-gray-800';
}

export function RecordListTable({
  records, columns, onSelect, selectedId, loading = false,
}: RecordListTableProps) {
  if (loading) return <div className="w-full text-sm text-center py-8 text-gray-500">Loading...</div>;
  if (records.length === 0) return <div className="w-full text-sm text-center py-8 text-gray-500">No records found</div>;

  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b border-gray-200">
          {columns.map((col) => (
            <th key={col.path} className="text-left font-medium text-gray-700 py-2 px-3 border-b" style={{ width: col.width }}>
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {records.map((record) => {
          const isSelected = record.recordId === selectedId;
          return (
            <tr key={record.recordId} onClick={() => onSelect(record)} className={`cursor-pointer hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}>
              {columns.map((col) => {
                const value = getNestedValue(record.payload, col.path);
                const isStatusField = col.path.toLowerCase().includes('status');
                const displayValue = formatValue(value);
                if (isStatusField && value) {
                  return (
                    <td key={col.path} className="py-2 px-3">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getStatusClass(value)}`}>{displayValue}</span>
                    </td>
                  );
                }
                return <td key={col.path} className="py-2 px-3 text-gray-700">{displayValue}</td>;
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
