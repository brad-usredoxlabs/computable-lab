import { useState, useEffect, useRef, useCallback } from 'react';
import { RecordSearchCombobox } from '../components/registry/RecordSearchCombobox';
import { CsvImportModal } from '../components/registry/CsvImportModal';
import { ProjectionTapTabEditor } from '../editor/taptab/TapTabEditor';
import type { TapTabEditorHandle } from '../editor/taptab/types';
import { serializeDocument } from '../editor/taptab/recordSerializer';
import type { EditorProjectionResponse } from '../types/uiSpec';
import { apiClient } from '../shared/api/client';
import { RelatedRecordsCard } from '../components/registry/RelatedRecordsCard';
import { DocumentControlBar } from '../components/registry/DocumentControlBar';
import { DocumentShell, DocumentShellHeader } from '../editor/taptab/DocumentShell';
import { deriveSchemaNode } from '../browser/SchemaTree';
import type { SchemaNode } from '../browser/SchemaTree';
import { useOptionalWorkspace } from '../event-editor/workspace/WorkspaceContext';
import { projectDetailsTabId, recordEditTabId } from '../event-editor/workspace/types';

const REGISTRY_TABS = [
  { id: 'people', label: 'People', kinds: ['person'] },
  { id: 'equipment', label: 'Equipment', kinds: ['equipment', 'equipment-class'] },
  { id: 'training', label: 'Training', kinds: ['training-material', 'training-record'] },
  { id: 'authorizations', label: 'Authorizations', kinds: ['competency-authorization', 'equipment-training-requirement'] },
  { id: 'instruments', label: 'Instruments', kinds: ['instrument'] },
  { id: 'calibrations', label: 'Calibrations', kinds: ['calibration-record', 'qualification-record'] },
  { id: 'verbs', label: 'Verbs', kinds: ['verb-definition'] },
  { id: 'capabilities', label: 'Capabilities', kinds: ['equipment-capability'] },
  { id: 'documents', label: 'Documents', kinds: ['controlled-document'] },
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
  // QMS-6A (delta D6 messaging): after a draft-copy the editing subject has
  // silently changed — one honest clarifying line, no design decision.
  const [draftRevisionNote, setDraftRevisionNote] = useState<string | null>(null);

  // Projection state for the selected record
  const [projection, setProjection] = useState<EditorProjectionResponse | null>(null);
  const [projectionLoading, setProjectionLoading] = useState(false);

  // EDITOR-9 fix-1 (browser-gate defect 2): the create-from-search affordance
  // was dead for every tab because the combobox received schemaId="" and the
  // server's precompile endpoint refuses an empty id. The kind -> schema $id
  // mapping is NOT hardcoded here: it is derived from the schema registry
  // itself (GET /schemas + SchemaTree's deriveSchemaNode, the same wiring
  // /browser uses), so a new schema/<domain>/<kind>.schema.yaml needs no
  // frontend change.
  const [schemaNodes, setSchemaNodes] = useState<SchemaNode[]>([]);
  useEffect(() => {
    let cancelled = false;
    apiClient
      .getSchemas()
      .then((infos) => {
        const nodes: SchemaNode[] = [];
        for (const info of infos) {
          const node = deriveSchemaNode(info);
          if (node) nodes.push(node);
        }
        if (!cancelled) setSchemaNodes(nodes);
      })
      .catch((err) => {
        console.warn('Schema registry unavailable; create-from-search disabled.', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // QMS-6E D5: request-sequence token for the record list. Every refresh (tab
  // switch, post-save, post-transition) bumps the token; a response whose
  // token is no longer current is STALE — its tab is gone — and is dropped
  // instead of rendering the wrong tab's rows.
  const refreshSeqRef = useRef(0);

  // Single implementation of the record-list refresh — the tab-switch effect
  // and every manual refresh (save, draft-copy, transitions, CSV import) share
  // it. Previously the effect carried a private copy with no staleness guard.
  const refreshRecords = useCallback(async () => {
    const tab = REGISTRY_TABS.find(t => t.id === activeTab);
    if (!tab) return;
    const seq = ++refreshSeqRef.current;
    setLoading(true);
    try {
      const promises = tab.kinds.map(kind => apiClient.listRecordsByKind(kind, 100));
      const results = await Promise.all(promises);
      if (seq !== refreshSeqRef.current) return; // A newer refresh won the race.
      const allRecords: RecordData[] = [];
      for (const { records } of results) allRecords.push(...records);
      allRecords.sort((a, b) => a.recordId.localeCompare(b.recordId));
      setRecords(allRecords);
    } catch {
      if (seq !== refreshSeqRef.current) return;
      setRecords([]);
    } finally {
      if (seq === refreshSeqRef.current) setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    void refreshRecords();
    setSelectedRecord(null);
    setProjection(null);
    setDirty(false);
  }, [activeTab, refreshRecords]);

  // QMS7-1 (OQ2 ruling): the AI panel's live target is the WorkspaceProvider's
  // own active tab — AiTabPanel's context memo reads it (its deps include the
  // active tab). Selecting a record re-targets it to a record-edit tab for
  // that record (ws.openTab is idempotent on id, workspace/reducer.ts);
  // clearing the selection (cancel / tab switch / save-close) returns it to
  // the study's project-details tab so the target never goes stale. NO
  // SURFACE_AI_REQUEST_EVENT here — that channel SENDS a chat turn per click.
  // Guarded by useOptionalWorkspace: the page still mounts bare (no provider)
  // in the standalone suites. Deps carry only the selection id: the context
  // VALUE identity changes on every provider state change, so depending on
  // ws.openTab directly would re-dispatch forever (the "Maximum update depth
  // exceeded" trap — cf. RecordHostPage.tsx's stable-callback comment).
  const ws = useOptionalWorkspace();
  const wsRef = useRef(ws);
  wsRef.current = ws;
  const selectedRecordId = selectedRecord?.recordId ?? null;
  useEffect(() => {
    const ctx = wsRef.current;
    if (!ctx) return;
    if (selectedRecordId) {
      ctx.openTab({
        id: recordEditTabId(selectedRecordId),
        kind: 'record-edit',
        recordId: selectedRecordId,
        title: selectedRecordId,
      });
    } else {
      ctx.activateTab(projectDetailsTabId(ctx.state.studyId));
    }
  }, [selectedRecordId]);

  const handleSelectRecord = (record: { recordId: string; payload: Record<string, unknown> }) => {
    const recordData: RecordData = {
      recordId: record.recordId,
      schemaId: (record.payload as { schemaId?: string }).schemaId || '',
      payload: record.payload,
    };
    setSelectedRecord(recordData);
    setEditorMode('edit');
    setDirty(false);
    setDraftRevisionNote(null);

    // Load editor projection for the selected record
    loadProjectionForRecord(recordData);
  };

  const handleCreateRecord = (schemaId: string, precompilePayload?: Record<string, unknown>) => {
    // EDITOR-9 fix-2 (browser-gate defect 1, 20261011T0550-regate): the
    // precompile payload the combobox already carries (kind/id/displayName/
    // status — RecordSearchCombobox.tsx:187-193) must SEED the create base.
    // serializeDocument clones this base and overlays only projection slot
    // paths; the person draft projection has no `kind` slot, so a base of {}
    // produced a POST body with no kind (Ajv 422) and no id (server 400).
    // This is the same mechanism that makes EDIT mode work: edit keeps the
    // record's own kind/id in the base. No client-side id minting here — the
    // id comes from the precompile payload the server already produced.
    setSelectedRecord({ recordId: '', schemaId, payload: { ...precompilePayload } });
    setEditorMode('create');
    setDirty(false);
    setDraftRevisionNote(null);

    // Load draft editor projection for create mode
    loadDraftProjection(schemaId);
  };

  const handleSaved = async () => {
    await refreshRecords();
  };

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
      // QMS-6E D3a: serialize the TipTap doc INTO the record's own payload —
      // exactly like the /record sibling (RecordEditPanel). PUTting the raw
      // doc as the payload loses kind/id/lifecycleId and every save of a
      // lifecycle-bearing record dies with 409 LIFECYCLE_IMMUTABLE.
      const docJson = editor.getJSON();
      const serialized = serializeDocument(
        docJson,
        selectedRecord.payload as Record<string, unknown>,
      );

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
    setDraftRevisionNote(null);
  };

  // QMS-6 (delta D6): approved/effective content is locked at HTTP and storage.
  // In-place Save is replaced by a draft-copy; the server issues fresh
  // authorship (no inherited reviewer/approver/signature assignments).
  const contentLocked =
    editorMode === 'edit' &&
    ((selectedRecord?.payload as { state?: string } | undefined)?.state === 'approved' ||
      (selectedRecord?.payload as { state?: string } | undefined)?.state === 'effective');

  const handleCreateDraftRevision = async () => {
    if (!selectedRecord?.recordId) return;
    setSaving(true);
    setError(null);
    try {
      const result = await apiClient.createDraftCopy(selectedRecord.recordId, {});
      const draft = result.record;
      const draftData: RecordData = {
        recordId: draft.recordId,
        schemaId: draft.schemaId || (draft.payload as { schemaId?: string }).schemaId || selectedRecord.schemaId,
        payload: draft.payload,
      };
      setSelectedRecord(draftData);
      setDirty(false);
      setDraftRevisionNote(
        `Created draft revision ${draft.recordId} from ${selectedRecord.recordId} — signatures and approvals do not carry over.`,
      );
      await refreshRecords();
      loadProjectionForRecord(draftData);
    } catch (err) {
      // Surface the server's refusal verbatim if the in-place path was refused.
      setError(err instanceof Error ? err.message : 'Failed to create draft revision');
    } finally {
      setSaving(false);
    }
  };

  // After a lifecycle transition (or its failure) show the server's ACTUAL state.
  const refreshSelectedRecord = async () => {
    if (!selectedRecord?.recordId) return;
    try {
      const fresh = await apiClient.getRecord(selectedRecord.recordId);
      setSelectedRecord({
        recordId: fresh.recordId,
        schemaId: fresh.schemaId,
        payload: fresh.payload,
      });
    } catch {
      // The list refresh below still reflects what the server has.
    }
    await refreshRecords();
  };

  // Event-driven dirty tracking via TapTabEditor callback — no polling
  const handleSerializedChange = useCallback((_payload: Record<string, unknown>, isDirtyFlag: boolean) => {
    setDirty(isDirtyFlag);
  }, []);

  const activeTabConfig = REGISTRY_TABS.find(t => t.id === activeTab)!;

  // EDITOR-9 fix-1: the tab's primary kind (first entry in its kinds list)
  // resolves to its registered schema $id from the schema-registry metadata.
  // Empty until the registry loads — the combobox then behaves as before
  // instead of guessing a schema.
  const activeTabSchemaId =
    schemaNodes.find((node) => node.kind === activeTabConfig.kinds[0])?.schemaId ?? '';

  const title = editorMode === 'create' ? 'New Record' : (selectedRecord ? selectedRecord.recordId : 'New Record');

  // Determine if we have projection data to render
  const hasProjection = projection !== null && projection.blocks && projection.slots;

  return (
    <div className="flex h-full min-h-0">
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
            schemaId={activeTabSchemaId}
            placeholder={`Search ${activeTabConfig.label.toLowerCase()}...`}
            onSelect={(record) => {
              if (record.isNew) {
                // EDITOR-9 fix-2: pass the combobox's precompile payload
                // through so the create base carries kind/id (see
                // handleCreateRecord).
                handleCreateRecord(record.schemaId, record.payload);
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
                  {contentLocked ? (
                    <button
                      onClick={handleCreateDraftRevision}
                      disabled={saving}
                      className="bg-blue-500 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
                    >
                      {saving ? 'Creating...' : 'Create draft revision'}
                    </button>
                  ) : (
                    <button
                      onClick={handleSave}
                      disabled={saving || !dirty}
                      className="bg-blue-500 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  )}
                  <button
                    onClick={handleCancel}
                    className="border border-gray-300 text-gray-700 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  {draftRevisionNote && (
                    <span data-testid="draft-revision-note" className="text-xs text-blue-700">
                      {draftRevisionNote}
                    </span>
                  )}
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
            {selectedRecord.recordId && editorMode === 'edit' && (
              <DocumentControlBar
                record={selectedRecord}
                dirty={dirty}
                onStateChanged={refreshSelectedRecord}
              />
            )}
            {hasProjection ? (
              <ProjectionTapTabEditor
                ref={taptabRef}
                blocks={projection.blocks}
                slots={projection.slots}
                data={selectedRecord.payload}
                disabled={saving || contentLocked}
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
