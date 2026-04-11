import { useEffect, useState, useRef } from 'react';
import { SlideOverPanel } from './SlideOverPanel';
import { TapTabEditor, serializeDocument, isDirty } from '../../editor/taptab';
import type { TapTabEditorHandle } from '../../editor/taptab/types';
import type { UISpec } from '../../types/uiSpec';
import type { JsonSchema } from '../../types/kernel';
import { apiClient } from '../../shared/api/client';
import { RelatedRecordsCard } from './RelatedRecordsCard';

interface SlideOverEditorProps {
  open: boolean;
  onClose: () => void;
  record: { recordId: string; schemaId: string; payload: Record<string, unknown> } | null;
  uiSpec: UISpec | null;
  schema: JsonSchema | null;
  onSaved: () => void;
  mode?: 'edit' | 'create';
}

export function SlideOverEditor({
  open,
  onClose,
  record,
  uiSpec,
  schema,
  onSaved,
  mode = 'edit',
}: SlideOverEditorProps) {
  const taptabRef = useRef<TapTabEditorHandle>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const title = mode === 'create' ? 'New Record' : (record ? record.recordId : 'New Record');

  const handleSave = async () => {
    if (!record) return;
    const editor = taptabRef.current?.getEditor();
    if (!editor) return;

    setSaving(true);
    setError(null);

    try {
      const serialized = serializeDocument(editor.getJSON(), record.payload);
      if (mode === 'create') {
        await apiClient.createRecord(record.schemaId, serialized);
      } else {
        await apiClient.updateRecord(record.recordId, serialized);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!open || !record || !uiSpec) return;

    const interval = setInterval(() => {
      const editor = taptabRef.current?.getEditor();
      if (!editor) return;

      const currentPayload = serializeDocument(editor.getJSON(), record.payload);
      setDirty(isDirty(record.payload, currentPayload));
    }, 500);

    return () => clearInterval(interval);
  }, [open, record, uiSpec]);

  return (
    <SlideOverPanel open={open} onClose={onClose} title={title}>
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto">
          {record && uiSpec && schema ? (
            <TapTabEditor
              ref={taptabRef}
              data={record.payload}
              uiSpec={uiSpec}
              schema={schema}
              disabled={saving}
            />
          ) : (
            <p className="text-gray-500">Select a record to edit</p>
          )}
          {record && record.recordId && mode !== 'create' && (
            <div className="border-t border-gray-100 p-4">
              <RelatedRecordsCard
                recordId={record.recordId}
                onNavigate={(id) => {
                  window.open(`/records/${encodeURIComponent(id)}`, '_blank')
                }}
              />
            </div>
          )}
        </div>
        <div className="border-t border-gray-200 p-4 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="bg-blue-500 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={onClose}
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
          {dirty && !saving && (
            <span className="w-2 h-2 rounded-full bg-orange-400" title="Unsaved changes" />
          )}
          {error && <span className="text-red-500 text-xs">{error}</span>}
        </div>
      </div>
    </SlideOverPanel>
  );
}
