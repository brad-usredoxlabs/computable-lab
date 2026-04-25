import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { RecordSearchCombobox } from '../components/registry/RecordSearchCombobox';
import { CsvImportModal } from '../components/registry/CsvImportModal';
import { ProjectionTapTabEditor } from '../editor/taptab/TapTabEditor';
import type { TapTabEditorHandle } from '../editor/taptab/types';
import type { EditorProjectionResponse } from '../types/uiSpec';
import { apiClient } from '../shared/api/client';
import { RelatedRecordsCard } from '../components/registry/RelatedRecordsCard';
import { DocumentShell, DocumentShellHeader } from '../editor/taptab/DocumentShell';

const REGISTRY_TABS = [
  { id: 'people', label: 'People', kinds: ['person'] },
  { id: 'equipment', label: 'Equipment', kinds: ['equipment', 'equipment-class'] },
  { id: 'training', label: 'Training', kinds: ['training-material', 'training-record'] },
  { id: 'authorizations', label: 'Authorizations', kinds: ['competency-authorization', 'equipment-training-requirement'] },
  { id: 'instruments', label: 'Instruments', kinds: ['instrument'] },
  { id: 'calibrations', label: 'Calibrations', kinds: ['calibration-record', 'qualification-record'] },
  { id: 'verbs', label: 'Verbs', kinds: ['verb-definition'] },
  { id: 'capabilities', label: 'Capabilities', kinds: ['equipment-capability'] },
] as const;

type TabId = (typeof REGISTRY_TABS)[number]['id'];

interface RecordData {
  recordId: string;
  schemaId: string;
  payload: Record<string, unknown>;
}

export default function RecordRegistryPage() {
  const [activeTab, setActiveTab] = useState<TabId>('people');
  const [records, setRecords] = useState<RecordData[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<RecordData | null>(null);
  const [editorMode, setEditorMode] = useState<'edit' | 'create'>('edit');
  const [csvModalOpen, setCsvModalOpen] = useState(false);

  // Editor state for inline ProjectionTapTabEditor
  const taptabRef = useRef<TapTabEditorHandle>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Projection state for the selected record
  const [projection, setProjection] = useState<EditorProjectionResponse | null>(null);
  const [projectionLoading, setProjectionLoading] = useState(false);

  useEffect(() => {
    async function refreshRecords() {
      const tab = REGISTRY_TABS.find(t => t.id === activeTab);
      if (!tab) return;
      setLoading(true);
      try {
        const promises = tab.kinds.map(kind => apiClient.listRecordsByKind(kind, 100));
        const results = await Promise.all(promises);
        const allRecords: RecordData[] = [];
        for (const { records } of results) allRecords.push(...records);
        allRecords.sort((a, b) => a.recordId.localeCompare(b.recordId));
        setRecords(allRecords);
      } catch {
        setRecords([]);
      } finally {
        setLoading(false);
      }
    }
    refreshRecords();
    setSelectedRecord(null);
    setProjection(null);
    setDirty(false);
  }, [activeTab]);

  const handleSelectRecord = (record: { recordId: string; payload: Record<string, unknown> }) => {
    const recordData: RecordData = {
      recordId: record.recordId,
      schemaId: (record.payload as { schemaId?: string }).schemaId || '',
      payload: record.payload,
    };
    setSelectedRecord(recordData);
    setEditorMode('edit');
    setDirty(false);

    // Load editor projection for the selected record
    loadProjectionForRecord(recordData);
  };

  const handleCreateRecord = (schemaId: string) => {
    setSelectedRecord({ recordId: '', schemaId, payload: {} });
    setEditorMode('create');
    setDirty(false);

    // Load draft editor projection for create mode
    loadDraftProjection(schemaId);
  };

  const handleSaved = async () => {
    await refreshRecords();
  };

  async function refreshRecords() {
    const tab = REGISTRY_TABS.find(t => t.id === activeTab);
    if (!tab) return;
    setLoading(true);
    try {
      const promises = tab.kinds.map(kind => apiClient.listRecordsByKind(kind, 100));
      const results = await Promise.all(promises);
      const allRecords: RecordData[] = [];
      for (const { records } of results) allRecords.push(...records);
      allRecords.sort((a, b) => a.recordId.localeCompare(b.recordId));
      setRecords(allRecords);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }

  const loadProjectionForRecord = async (recordData: RecordData) => {
    if (!recordData.recordId) return;
    setProjectionLoading(true);
    try {
      const proj = await apiClient.getRecordEditorProjection(recordData.recordId);
      setProjection(proj);
    } catch (err) {
      console.warn('Editor projection unavailable; falling back.', err);
      setProjection(null);
    } finally {
      setProjectionLoading(false);
    }
  };

  const loadDraftProjection = async (schemaId: string) => {
    setProjectionLoading(true);
    try {
      const proj = await apiClient.getEditorDraftProjection(schemaId);
      setProjection(proj);
    } catch (err) {
      console.warn('Editor draft projection unavailable; falling back.', err);
      setProjection(null);
    } finally {
      setProjectionLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedRecord) return;
    const editor = taptabRef.current?.getEditor();
    if (!editor) return;

    setSaving(true);
    setError(null);

    try {
      // Serialize from the TipTap editor JSON
      const docJson = editor.getJSON();
      const serialized = docJson as Record<string, unknown>;

      if (editorMode === 'create') {
        await apiClient.createRecord(selectedRecord.schemaId, serialized);
      } else {
        await apiClient.updateRecord(selectedRecord.recordId, serialized);
      }
      handleSaved();
      setSelectedRecord(null);
      setProjection(null);
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setSelectedRecord(null);
    setProjection(null);
    setDirty(false);
    setError(null);
  };

  // Event-driven dirty tracking via TapTabEditor callback — no polling
  const handleSerializedChange = useCallback((_payload: Record<string, unknown>, isDirtyFlag: boolean) => {
    setDirty(isDirtyFlag);
  }, []);

  const activeTabConfig = REGISTRY_TABS.find(t => t.id === activeTab)!;

  const title = editorMode === 'create' ? 'New Record' : (selectedRecord ? selectedRecord.recordId : 'New Record');

  // Determine if we have projection data to render
  const hasProjection = projection !== null && projection.blocks && projection.slots;

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Left Panel - Record List */}
      <div className="w-80 flex-shrink-0 flex flex-col border-r border-gray-200 bg-white">
        {/* Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-gray-200 p-2">
          {REGISTRY_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabId)}
              className={`px-2 py-1 text-xs rounded ${
                activeTab === tab.id
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* RecordSearchCombobox */}
        <div className="p-2 border-b border-gray-100">
          <RecordSearchCombobox
            kinds={activeTabConfig.kinds as unknown as string[]}
            schemaId=""
            placeholder={`Search ${activeTabConfig.label.toLowerCase()}...`}
            onSelect={(record) => {
              if (record.isNew) {
                handleCreateRecord(record.schemaId);
              } else {
                handleSelectRecord({ recordId: record.recordId, payload: record.payload });
              }
            }}
          />
        </div>
        {/* Record List - Compact */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-sm text-center py-8 text-gray-500">Loading...</div>
          ) : records.length === 0 ? (
            <div className="text-sm text-center py-8 text-gray-500">No records found</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {records.map((record) => {
                const isSelected = record.recordId === selectedRecord?.recordId;
                const displayName = (record.payload as { name?: string; title?: string; id?: string }).name ||
                                   (record.payload as { name?: string; title?: string; id?: string }).title ||
                                   record.recordId;
                const kind = (record.payload as { kind?: string }).kind || 'record';
                return (
                  <div
                    key={record.recordId}
                    onClick={() => handleSelectRecord({ recordId: record.recordId, payload: record.payload })}
                    className={`p-3 cursor-pointer hover:bg-gray-50 ${
                      isSelected ? 'bg-blue-50 border-l-4 border-blue-500' : 'border-l-4 border-transparent'
                    }`}
                  >
                    <div className="font-medium text-sm text-gray-900 truncate">{displayName}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      <span className="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {kind}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - DocumentShell Editor */}
      {selectedRecord ? (
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
                    onClick={handleCancel}
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
            selectedRecord.recordId && editorMode !== 'create' ? (
              <div className="border-t border-gray-100 p-4">
                <RelatedRecordsCard
                  recordId={selectedRecord.recordId}
                  onNavigate={(id) => {
                    window.open(`/records/${encodeURIComponent(id)}`, '_blank')
                  }}
                />
              </div>
            ) : undefined
          }
        >
          <div className="flex-1 overflow-y-auto p-4">
            {hasProjection ? (
              <ProjectionTapTabEditor
                ref={taptabRef}
                blocks={projection.blocks}
                slots={projection.slots}
                data={selectedRecord.payload}
                disabled={saving}
                onUpdate={handleSerializedChange}
              />
            ) : (
              <p className="text-gray-500">
                {projectionLoading ? 'Loading editor...' : 'Editor not available for this record'}
              </p>
            )}
          </div>
        </DocumentShell>
      ) : (
        /* Placeholder when no record selected */
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <p className="text-lg">Select a record to edit</p>
            <p className="text-sm mt-2">Or search for a record using the combobox above</p>
          </div>
        </div>
      )}

      <CsvImportModal
        open={csvModalOpen}
        onClose={() => setCsvModalOpen(false)}
        schemaId=""
        fields={[]}
        onComplete={() => {
          setCsvModalOpen(false);
          refreshRecords();
        }}
      />
    </div>
  );
}
