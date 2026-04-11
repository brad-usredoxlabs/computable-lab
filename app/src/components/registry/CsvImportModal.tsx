import { useState, useEffect } from 'react';
import { parseCsv } from '../../lib/csvParser';
import { apiClient } from '../../shared/api/client';

interface CsvImportModalProps {
  open: boolean;
  onClose: () => void;
  schemaId: string;
  fields: Array<{ path: string; label: string; required?: boolean }>;
  onComplete: (created: number) => void;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: string): void {
  const keys = path.replace(/^\$\.?/, '').split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current)) current[key] = {};
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}

export function CsvImportModal({ open, onClose, schemaId, fields, onComplete }: CsvImportModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [csvText, setCsvText] = useState('');
  const [parsed, setParsed] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; errors: string[] }>({ done: 0, total: 0, errors: [] });

  useEffect(() => {
    if (step === 2 && parsed) {
      const autoMap: Record<string, string> = {};
      parsed.headers.forEach(header => {
        const h = header.toLowerCase().trim();
        const match = fields.find(f => f.label.toLowerCase().trim() === h);
        if (match) autoMap[header] = match.path;
      });
      setColumnMap(autoMap);
    }
  }, [step, parsed, fields]);

  if (!open) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { const reader = new FileReader(); reader.onload = (ev) => setCsvText(ev.target?.result as string); reader.readAsText(file); }
  };

  const handleParse = () => { setParsed(parseCsv(csvText)); setStep(2); };
  const handleColumnChange = (header: string, path: string) => setColumnMap(prev => ({ ...prev, [header]: path }));
  const requiredFields = fields.filter(f => f.required);
  const hasRequiredMapping = requiredFields.every(f => Object.values(columnMap).includes(f.path));

  const handleImport = async () => {
    if (!parsed) return;
    setImporting(true);
    setProgress({ done: 0, total: parsed.rows.length, errors: [] });
    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i], payload: Record<string, unknown> = {};
      for (const [header, path] of Object.entries(columnMap)) {
        if (path && row[header] !== undefined) setNestedValue(payload, path, row[header]);
      }
      try { await apiClient.createRecord(schemaId, payload); setProgress(prev => ({ ...prev, done: prev.done + 1 })); }
      catch (err) { setProgress(prev => ({ ...prev, errors: [...prev.errors, `Row ${i + 1}: ${err instanceof Error ? err.message : String(err)}`] })); }
    }
    setImporting(false);
    onComplete(progress.done);
    onClose();
  };

  const mappedFields = fields.filter(f => Object.values(columnMap).includes(f.path));
  const ModalContent = () => (
    <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900">Import CSV</h2>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded text-gray-400">
          <svg viewBox="0 0 24 24" className="w-5 h-5"><path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="2" fill="none" /></svg>
        </button>
      </div>
      <div className="flex gap-2 mb-4">
        <span className={`w-3 h-3 rounded-full ${step >= 1 ? 'bg-blue-500' : 'bg-gray-300'}`} />
        <span className={`w-3 h-3 rounded-full ${step >= 2 ? 'bg-blue-500' : 'bg-gray-300'}`} />
        <span className={`w-3 h-3 rounded-full ${step >= 3 ? 'bg-blue-500' : 'bg-gray-300'}`} />
      </div>
      {step === 1 && (
        <div className="space-y-4">
          <input type="file" accept=".csv,.tsv,.txt" onChange={handleFileChange} className="w-full" />
          <textarea className="w-full h-40 border rounded p-2" placeholder="Or paste CSV content here..." value={csvText} onChange={(e) => setCsvText(e.target.value)} />
          <div className="flex justify-end"><button onClick={handleParse} disabled={!csvText.trim()} className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50">Next</button></div>
        </div>
      )}
      {step === 2 && parsed && (
        <div className="space-y-4">
          <table className="w-full border-collapse border">
            <thead><tr className="bg-gray-100"><th className="border p-2 text-left">CSV Column</th><th className="border p-2 text-left">Maps To</th></tr></thead>
            <tbody>{parsed.headers.map(header => (
              <tr key={header}><td className="border p-2">{header}</td><td className="border p-2">
                <select className="w-full" value={columnMap[header] || ''} onChange={(e) => handleColumnChange(header, e.target.value)}>
                  <option value="">— skip —</option>
                  {fields.map(f => <option key={f.path} value={f.path}>{f.label}{f.required ? ' *' : ''}</option>)}
                </select>
              </td></tr>
            ))}</tbody>
          </table>
          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="px-4 py-2 bg-gray-200 rounded">Back</button>
            <button onClick={() => setStep(3)} disabled={!hasRequiredMapping} className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50">Next</button>
          </div>
        </div>
      )}
      {step === 3 && parsed && (
        <div className="space-y-4">
          <p className="text-gray-600">{parsed.rows.length} records will be created</p>
          <table className="w-full border-collapse border text-sm">
            <thead><tr className="bg-gray-100">{mappedFields.map(f => <th key={f.path} className="border p-2 text-left">{f.label}</th>)}</tr></thead>
            <tbody>{parsed.rows.slice(0, 5).map((row, i) => (
              <tr key={i}>{mappedFields.map(f => <td key={f.path} className="border p-2">{row[columnMap[f.path] || ''] || ''}</td>)}</tr>
            ))}</tbody>
          </table>
          {importing && <p className="text-blue-600">{progress.done} / {progress.total}</p>}
          {progress.errors.length > 0 && <div className="text-red-600 text-sm"><p>Errors:</p><ul className="list-disc ml-4">{progress.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
          <div className="flex justify-between">
            <button onClick={() => setStep(2)} disabled={importing} className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50">Back</button>
            <button onClick={handleImport} disabled={importing} className="px-4 py-2 bg-green-500 text-white rounded disabled:opacity-50">{importing ? 'Importing...' : 'Import'}</button>
          </div>
        </div>
      )}
    </div>
  );

  return <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center"><ModalContent /></div>;
}
