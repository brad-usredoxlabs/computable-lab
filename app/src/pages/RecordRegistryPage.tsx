import { useState, useEffect, useMemo, useRef } from 'react';
import { AiDraftBar } from '../components/registry/AiDraftBar';
import { CsvImportModal } from '../components/registry/CsvImportModal';
import { TapTabEditor, serializeDocument, isDirty } from '../editor/taptab';
import type { TapTabEditorHandle } from '../editor/taptab/types';
import type { UISpec } from '../types/uiSpec';
import type { JsonSchema } from '../types/kernel';
import { apiClient } from '../shared/api/client';
import { RelatedRecordsCard } from '../components/registry/RelatedRecordsCard';

const REGISTRY_TABS = [
  { id: 'people', label: 'People', kinds: ['person'] },
  { id: 'equipment', label: 'Equipment', kinds: ['equipment', 'equipment-class'] },
  { id: 'training', label: 'Training', kinds: ['training-material', 'training-record'] },
  { id: 'authorizations', label: 'Authorizations', kinds: ['competency-authorization', 'equipment-training-requirement'] },
  { id: 'instruments', label: 'Instruments', kinds: ['instrument'] },
  { id: 'calibrations', label: 'Calibrations', kinds: ['calibration-record', 'qualification-record'] },
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
  const [uiSpecs, setUiSpecs] = useState<Map<string, UISpec>>(new Map());
  const [schemas, setSchemas] = useState<Map<string, JsonSchema>>(new Map());
  const [selectedRecord, setSelectedRecord] = useState<RecordData | null>(null);
  const [selectedUiSpec, setSelectedUiSpec] = useState<UISpec | null>(null);
  const [selectedSchema, setSelectedSchema] = useState<JsonSchema | null>(null);
  const [editorMode, setEditorMode] = useState<'edit' | 'create'>('edit');
  const [csvModalOpen, setCsvModalOpen] = useState(false);

  // Editor state for inline TapTabEditor
  const taptabRef = useRef<TapTabEditorHandle>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    async function loadUiSpecs() {
      const uiSpecList = await apiClient.getAllUiSpecs();
      const specMap = new Map<string, UISpec>();
      const schemaMap = new Map<string, JsonSchema>();
      const promises = uiSpecList.map(async ({ schemaId, spec }) => {
        try {
          // The list endpoint may not include the full spec — fetch individually if missing
          if (spec) {
            specMap.set(schemaId, spec);
          } else {
            const detail = await apiClient.getUiSpec(schemaId);
            if (detail) specMap.set(schemaId, detail);
          }
          const schemaInfo = await apiClient.getSchema(schemaId);
          if (schemaInfo.schema) schemaMap.set(schemaId, schemaInfo.schema);
        } catch {}
      });
      await Promise.all(promises);
      setUiSpecs(specMap);
      setSchemas(schemaMap);
    }
    loadUiSpecs();
  }, []);

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

  useEffect(() => {
    refreshRecords();
    setSelectedRecord(null);
    setSelectedUiSpec(null);
    setSelectedSchema(null);
    setDirty(false);
  }, [activeTab]);



  function handleDraftReady(payload: Record<string, unknown>) {
    setSelectedRecord({ recordId: '', schemaId: activeTabSchemaId, payload });
    setEditorMode('create');
    setSelectedUiSpec(uiSpecs.get(activeTabSchemaId) || null);
    setSelectedSchema(schemas.get(activeTabSchemaId) || null);
  }

  const handleSelectRecord = (record: { recordId: string; payload: Record<string, unknown> }) => {
    const recordData: RecordData = {
      recordId: record.recordId,
      schemaId: (record.payload as { schemaId?: string }).schemaId || '',
      payload: record.payload,
    };
    setSelectedRecord(recordData);
    setSelectedUiSpec(uiSpecs.get(recordData.schemaId) || null);
    setSelectedSchema(schemas.get(recordData.schemaId) || null);
    setEditorMode('edit');
    setDirty(false);
  };

  const handleSaved = async () => {
    await refreshRecords();
  };

  const handleSave = async () => {
    if (!selectedRecord) return;
    const editor = taptabRef.current?.getEditor();
    if (!editor) return;

    setSaving(true);
    setError(null);

    try {
      const serialized = serializeDocument(editor.getJSON(), selectedRecord.payload);
      if (editorMode === 'create') {
        await apiClient.createRecord(selectedRecord.schemaId, serialized);
      } else {
        await apiClient.updateRecord(selectedRecord.recordId, serialized);
      }
      handleSaved();
      setSelectedRecord(null);
      setSelectedUiSpec(null);
      setSelectedSchema(null);
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setSelectedRecord(null);
    setSelectedUiSpec(null);
    setSelectedSchema(null);
    setDirty(false);
    setError(null);
  };

  const activeTabConfig = REGISTRY_TABS.find(t => t.id === activeTab)!;

  const activeTabSchemaId = useMemo(() => {
    for (const schemaId of uiSpecs.keys()) {
      if (activeTabConfig.kinds.some(kind => schemaId.endsWith(`/${kind}.schema.yaml`) || schemaId.endsWith(`/${kind}.schema.json`))) return schemaId;
    }
    return activeTabConfig.kinds[0];
  }, [uiSpecs, activeTabConfig]);

  const activeTabFields = useMemo(() => {
    const uiSpec = uiSpecs.get(activeTabSchemaId);
    if (!uiSpec?.form?.sections) return [];
    return uiSpec.form.sections.flatMap(s =>
      s.fields.filter(f => !f.hidden && !f.readOnly && !f.readonly)
        .map(f => ({ path: f.path, label: f.label || f.path, required: f.required }))
    );
  }, [uiSpecs, activeTabSchemaId]);

  // Dirty state tracking interval
  useEffect(() => {
    if (!selectedRecord || !selectedUiSpec) return;

    const interval = setInterval(() => {
      const editor = taptabRef.current?.getEditor();
      if (!editor) return;

      const currentPayload = serializeDocument(editor.getJSON(), selectedRecord.payload);
      setDirty(isDirty(selectedRecord.payload, currentPayload));
    }, 500);

    return () => clearInterval(interval);
  }, [selectedRecord, selectedUiSpec]);

  const title = editorMode === 'create' ? 'New Record' : (selectedRecord ? selectedRecord.recordId : 'New Record');

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
        {/* AiDraftBar */}
        <div className="p-2 border-b border-gray-100">
          <AiDraftBar schemaId={activeTabSchemaId} onDraftReady={handleDraftReady} />
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

      {/* Right Panel - Editor */}
      <div className="flex-1 flex flex-col bg-white">
        {selectedRecord && selectedUiSpec && selectedSchema ? (
          <>
            {/* Header with title */}
            <div className="border-b border-gray-200 p-4">
              <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            </div>
            {/* TapTab Editor */}
            <div className="flex-1 overflow-y-auto p-4">
              <TapTabEditor
                ref={taptabRef}
                data={selectedRecord.payload}
                uiSpec={selectedUiSpec}
                schema={selectedSchema}
                disabled={saving}
              />
              {selectedRecord.recordId && editorMode !== 'create' && (
                <div className="border-t border-gray-100 p-4 mt-4">
                  <RelatedRecordsCard
                    recordId={selectedRecord.recordId}
                    onNavigate={(id) => {
                      window.open(`/records/${encodeURIComponent(id)}`, '_blank')
                    }}
                  />
                </div>
              )}
            </div>
            {/* Save/Cancel Bar */}
            <div className="border-t border-gray-200 p-4 flex items-center gap-3 bg-white">
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
            </div>
          </>
        ) : (
          /* Placeholder when no record selected */
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <p className="text-lg">Select a record to edit</p>
              <p className="text-sm mt-2">Or create a new record using the AiDraftBar</p>
            </div>
          </div>
        )}
      </div>

      <CsvImportModal
        open={csvModalOpen}
        onClose={() => setCsvModalOpen(false)}
        schemaId={activeTabSchemaId}
        fields={activeTabFields}
        onComplete={() => {
          setCsvModalOpen(false);
          refreshRecords();
        }}
      />
    </div>
  );
}
