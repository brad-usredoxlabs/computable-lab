import { useState, useRef, useCallback, useEffect } from 'react';
import { SlideOverPanel } from './SlideOverPanel';
import { ProjectionTapTabEditor } from '../../editor/taptab/TapTabEditor';
import type { TapTabEditorHandle } from '../../editor/taptab/types';
import type { EditorProjectionResponse } from '../../types/uiSpec';
import { apiClient } from '../../shared/api/client';
import { RelatedRecordsCard } from './RelatedRecordsCard';
import { DocumentShell, DocumentShellHeader } from '../../editor/taptab/DocumentShell';

interface SlideOverEditorProps {
  open: boolean;
  onClose: () => void;
  record: { recordId: string; schemaId: string; payload: Record<string, unknown> } | null;
  uiSpec: unknown;
  schema: unknown;
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

  // Projection state for projection-backed TapTab
  const [projection, setProjection] = useState<EditorProjectionResponse | null>(null);
  const [projectionLoading, setProjectionLoading] = useState(false);

  const title = mode === 'create' ? 'New Record' : (record ? record.recordId : 'New Record');

  // Load editor projection for the record/schema
  useEffect(() => {
    if (!open || !record) {
      setProjection(null);
      return;
    }

    setProjectionLoading(true);

    const loadProjection = async () => {
      try {
        if (mode === 'edit' && record.recordId) {
          const proj = await apiClient.getRecordEditorProjection(record.recordId);
          setProjection(proj);
        } else if (mode === 'create' && record.schemaId) {
          const proj = await apiClient.getEditorDraftProjection(record.schemaId);
          setProjection(proj);
        }
      } catch (err) {
        console.warn('Editor projection unavailable; falling back.', err);
        setProjection(null);
      } finally {
        setProjectionLoading(false);
      }
    };

    loadProjection();
  }, [open, record, mode]);

  const handleSave = async () => {
    if (!record) return;
    const editor = taptabRef.current?.getEditor();
    if (!editor) return;

    setSaving(true);
    setError(null);

    try {
      // Serialize from the TipTap editor JSON
      const docJson = editor.getJSON();
      const serialized = docJson as Record<string, unknown>;

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

  // Event-driven dirty tracking via TapTabEditor callback — no polling
  const handleSerializedChange = useCallback((_payload: Record<string, unknown>, isDirtyFlag: boolean) => {
    setDirty(isDirtyFlag);
  }, []);

  // Determine if we have projection data to render
  const hasProjection = projection !== null && projection.blocks && projection.slots;

  return (
    <SlideOverPanel open={open} onClose={onClose} title={title}>
      <DocumentShell
        topBar={
          <DocumentShellHeader
            title={title}
            actions={
              <>
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
              </>
            }
          />
        }
        rail={
          record && record.recordId && mode !== 'create' ? (
            <div className="border-t border-gray-100 p-4">
              <RelatedRecordsCard
                recordId={record.recordId}
                onNavigate={(id) => {
                  window.open(`/records/${encodeURIComponent(id)}`, '_blank')
                }}
              />
            </div>
          ) : undefined
        }
      >
        <div className="flex-1 overflow-y-auto">
          {record && hasProjection ? (
            <ProjectionTapTabEditor
              ref={taptabRef}
              blocks={projection.blocks}
              slots={projection.slots}
              data={record.payload}
              disabled={saving}
              onUpdate={handleSerializedChange}
            />
          ) : record ? (
            <p className="text-gray-500">
              {projectionLoading ? 'Loading editor...' : 'Editor not available for this record'}
            </p>
          ) : (
            <p className="text-gray-500">Select a record to edit</p>
          )}
        </div>
      </DocumentShell>
    </SlideOverPanel>
  );
}
