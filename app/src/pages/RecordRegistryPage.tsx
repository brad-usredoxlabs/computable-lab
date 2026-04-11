import { useState, useEffect, useMemo } from 'react';
import { RecordListTable } from '../components/registry/RecordListTable';
import { SlideOverEditor } from '../components/registry/SlideOverEditor';
import { AiDraftBar } from '../components/registry/AiDraftBar';
import { CsvImportModal } from '../components/registry/CsvImportModal';
import { apiClient } from '../shared/api/client';
import type { UISpec } from '../types/uiSpec';
import type { JsonSchema } from '../types/kernel';

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
  }, [activeTab]);

  const columns = useMemo(() => {
    const tab = REGISTRY_TABS.find(t => t.id === activeTab);
    if (!tab) return [];
    for (const schemaId of tab.kinds) {
      const uiSpec = uiSpecs.get(schemaId);
      if (uiSpec?.list?.columns?.length) {
        return uiSpec.list.columns.map(c => ({ path: c.path, label: c.label, width: c.width as string }));
      }
    }
    return [{ path: '$.id', label: 'ID', width: '140px' }, { path: '$.kind', label: 'Kind' }, { path: '$.status', label: 'Status' }];
  }, [activeTab, uiSpecs]);

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
  };

  const handleSaved = async () => {
    await refreshRecords();
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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-gray-900">Records</h1>
        <button
          onClick={() => setCsvModalOpen(true)}
          className="text-sm px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
        >
          Import CSV
        </button>
      </div>
      <div className="flex gap-1 border-b border-gray-200 mb-4">
        {REGISTRY_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabId)}
            className={`px-4 py-2 text-sm ${
              activeTab === tab.id
                ? 'border-b-2 border-blue-500 text-blue-600 font-medium'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <AiDraftBar schemaId={activeTabSchemaId} onDraftReady={handleDraftReady} />
      <RecordListTable records={records} columns={columns} onSelect={handleSelectRecord} selectedId={selectedRecord?.recordId} loading={loading} />
      <SlideOverEditor
        open={selectedRecord !== null}
        onClose={() => {
          setSelectedRecord(null);
          setSelectedUiSpec(null);
          setSelectedSchema(null);
        }}
        record={selectedRecord}
        uiSpec={selectedUiSpec}
        schema={selectedSchema}
        onSaved={handleSaved}
        mode={editorMode}
      />
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
