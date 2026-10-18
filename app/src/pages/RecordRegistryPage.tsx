import { useState, useEffect, useRef, useCallback } from 'react';
import { RecordSearchCombobox } from '../components/registry/RecordSearchCombobox';
import { ProjectionTapTabEditor } from '../editor/taptab/TapTabEditor';
import type { TapTabEditorHandle } from '../editor/taptab/types';
import { serializeDocument } from '../editor/taptab/recordSerializer';
import type { EditorProjectionResponse } from '../types/uiSpec';
import { apiClient } from '../shared/api/client';
import { RelatedRecordsCard } from '../components/registry/RelatedRecordsCard';
import { RecordProvenanceCard } from '../components/registry/RecordProvenanceCard';
import { DocumentControlBar } from '../components/registry/DocumentControlBar';
import { DocumentShell, DocumentShellHeader } from '../editor/taptab/DocumentShell';
import { deriveSchemaNode } from '../browser/SchemaTree';
import type { SchemaNode } from '../browser/SchemaTree';
import type { JsonSchema } from '../types/kernel';
import { useOptionalWorkspace } from '../event-editor/workspace/WorkspaceContext';
import { projectDetailsTabId, recordEditTabId } from '../event-editor/workspace/types';
import './RecordRegistryPage.css';

// Exported for the test suites: the tab/kinds DATA is the single source for
// the tab strip, the combobox kinds, and the Create picker (no test-side
// kind maps — the tests read the same data the page renders).
export const REGISTRY_TABS = [
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

/**
 * QMS7-5 (OQ-3 ruling): the per-tab Create button has no precompile step, so
 * the create base must seed its own schema-compliant id. The prefix is NOT a
 * client-side table (RecordCreatePanel's ID_PREFIXES is the anti-pattern —
 * CLAUDE.md "The Hard Boundary"): it is parsed from the schema's OWN
 * declaration. GET /schemas/:id returns the full schema document and every
 * registry kind declares properties.id.pattern `^PREFIX-[A-Z0-9][A-Z0-9_-]*$`
 * (verified live on :3092 for all 13 registry kinds). The seed id is
 * PREFIX + '-NEW-' + an uppercase alphanumeric suffix (spec Design §id
 * seeding, literal shape; FIX1 DEFECT 3) — compliant by construction against
 * the declared pattern because the random suffix starts with an [A-Z0-9]
 * char. A schema whose id pattern is missing or has no parseable ^PREFIX-
 * anchor returns null: the caller shows an actionable error and does NOT open
 * the editor. No prefix is ever fabricated.
 */
function seedIdFromDeclaredPattern(schema: JsonSchema | undefined): string | null {
  const pattern = schema?.properties?.id?.pattern;
  if (typeof pattern !== 'string') return null;
  // The declared pattern is itself anchored: `^PER-[A-Z0-9][A-Z0-9_-]*$`.
  // Consume the literal ^ anchor, then capture the PREFIX- segment.
  const anchor = /^\^([A-Z]+)-/.exec(pattern);
  if (!anchor) return null;
  // Spec Design §id seeding: PREFIX + '-NEW-' + <uppercase alphanumeric
  // suffix>. base36 uppercase is [0-9A-Z]+ — the suffix starts with an
  // [A-Z0-9] char, so the whole id satisfies the declared pattern.
  const suffix = Math.floor(Math.random() * 1e6).toString(36).toUpperCase().padStart(4, '0');
  return `${anchor[1]}-NEW-${suffix}`;
}

interface RecordMetaLike {
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  contentSha?: string;
  gitCommit?: string;
  commitSha?: string;
  path?: string;
}

interface RecordData {
  recordId: string;
  schemaId: string;
  payload: Record<string, unknown>;
  meta?: RecordMetaLike;
}

export default function RecordRegistryPage() {
  const [activeTab, setActiveTab] = useState<TabId>('people');
  const [records, setRecords] = useState<RecordData[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<RecordData | null>(null);
  const [editorMode, setEditorMode] = useState<'edit' | 'create'>('edit');
  // QMS7-5: per-tab Create affordance state. Multi-kind tabs open a small
  // picker listing the tab's `kinds` DATA (REGISTRY_TABS) — no kind→schema
  // map. pendingCreateKind is the picker's selection (default: the tab's
  // primary kind, mirroring activeTabSchemaId's kinds[0] rule).
  const [createKindPickerOpen, setCreateKindPickerOpen] = useState(false);
  const [pendingCreateKind, setPendingCreateKind] = useState<string | null>(null);

  // Editor state for inline ProjectionTapTabEditor
  const taptabRef = useRef<TapTabEditorHandle>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // QMS-6A (delta D6 messaging): after a draft-copy the editing subject has
  // silently changed — one honest clarifying line, no design decision.
  const [draftRevisionNote, setDraftRevisionNote] = useState<string | null>(null);
  // QMS7-5: actionable error for the Create affordance (e.g. a schema whose
  // declared id pattern cannot be parsed). Distinct from the save `error`.
  const [createError, setCreateError] = useState<string | null>(null);

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

  // QMS7-6 (OQ-1 ruling A): lifecycle terminal facts, read from the server's
  // read-only echo of the lifecycle YAML `terminal: true` declarations
  // (GET /lifecycle/:lifecycleId/transitions -> terminalStates). ONE call per
  // DISTINCT lifecycleId among the loaded rows, WITHOUT recordId (the fact is
  // lifecycle-scoped, not record-scoped). NO terminal-state list is invented
  // in TS (bait 3): when a lifecycle's facts are unavailable the map stays
  // empty and browsing FAILS OPEN (rows remain visible).
  const [terminalStatesByLifecycle, setTerminalStatesByLifecycle] = useState<Record<string, string[]>>({});
  const terminalFetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const pending = new Set<string>();
    for (const record of records) {
      const lifecycleId = (record.payload as { lifecycleId?: string }).lifecycleId;
      if (lifecycleId && !terminalFetchedRef.current.has(lifecycleId)) pending.add(lifecycleId);
    }
    if (pending.size === 0) return;
    let cancelled = false;
    void Promise.all(
      [...pending].map(async (lifecycleId) => {
        try {
          const states = await apiClient.getLifecycleTerminalStates(lifecycleId);
          return [lifecycleId, states] as const;
        } catch (err) {
          // Fail open for this render: no facts -> nothing is hidden (no
          // invented policy). The failure is NOT committed and the lifecycle
          // is NOT marked fetched (FIX1 defect 2): the accessor already
          // normalises a definitive 404 to a SUCCESSFUL [], so anything
          // reaching this catch is a transient/server failure and must stay
          // retryable on the next `records` change.
          console.warn(`Lifecycle terminal facts unavailable for ${lifecycleId}; terminal filtering skipped.`, err);
          return null;
        }
      }),
    ).then((results) => {
      // FIX1 defect 1: a superseded run (cleanup fired because `records`
      // changed identity mid-flight) discards its entries AND leaves the
      // lifecycles un-fetched, so the next effect run retries instead of
      // permanently skipping them. Marking fetched happens ONLY where the
      // result is actually committed.
      if (cancelled) return;
      const entries = results.filter((r): r is readonly [string, string[]] => r !== null);
      if (entries.length === 0) return;
      for (const [lifecycleId] of entries) terminalFetchedRef.current.add(lifecycleId);
      setTerminalStatesByLifecycle((prev) => {
        const next = { ...prev };
        for (const [lifecycleId, states] of entries) next[lifecycleId] = states;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [records]);

  // QMS7-6 (AC-5): archived browsing is RENDER-LEVEL state over whatever
  // `records` currently holds — toggling never refetches (bait 6: the
  // refresh seq-token stays untouched). "Show archived" below is label COPY;
  // the branch condition is the data-driven rule, never the label text.
  const [showArchived, setShowArchived] = useState(false);

  // THE single data-driven terminal rule (OQ-1(A) + OQ-2(A) — one mechanism,
  // zero new state strings, bait 1): a row is terminal iff its lifecycle's
  // DECLARED terminal set contains its payload.state. Rows with no
  // lifecycleId are never terminal. Reads `state`, NEVER `status` (bait 2 —
  // equipment payloads carry both; cf. RecordHandlers.ts:289-291).
  const isTerminalRow = useCallback(
    (row: { payload: Record<string, unknown> }): boolean => {
      const lifecycleId = (row.payload as { lifecycleId?: string }).lifecycleId;
      if (!lifecycleId) return false;
      const declared = terminalStatesByLifecycle[lifecycleId];
      if (!declared) return false;
      const state = (row.payload as { state?: string }).state;
      return typeof state === 'string' && declared.includes(state);
    },
    [terminalStatesByLifecycle],
  );

  // Single implementation of the record-list refresh — the tab-switch effect
  // and every manual refresh (save, draft-copy, transitions) share it.
  // Previously the effect carried a private copy with no staleness guard.
  // (QMS7-5 FIX1 DEFECT 5a: "CSV import" dropped — that affordance's dead
  // chrome was deleted, it is no longer a refresh trigger.)
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

  // QMS7-5 FIX1 (adv-review DEFECT 1, MAJOR + DEFECT 5b): the Create affordance
  // state belongs to the tab it was opened on. Without this reset the picker
  // stayed rendered after a tab switch while pendingCreateKind still named a
  // kind of the PREVIOUS tab — Confirm then opened a create for a kind outside
  // the active tab, contradicting the per-tab kind-source contract (kinds come
  // only from the ACTIVE tab's kinds DATA). The actionable createError is
  // cleared here too (DEFECT 5b): an error about the old tab must not linger.
  useEffect(() => {
    setCreateKindPickerOpen(false);
    setPendingCreateKind(null);
    setCreateError(null);
  }, [activeTab]);

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

  const handleSelectRecord = (record: {
    recordId: string;
    payload: Record<string, unknown>;
    meta?: RecordMetaLike;
  }) => {
    const recordData: RecordData = {
      recordId: record.recordId,
      schemaId: (record.payload as { schemaId?: string }).schemaId || '',
      payload: record.payload,
      ...(record.meta ? { meta: record.meta } : {}),
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

  // QMS7-5: the per-tab Create affordance. It reuses handleCreateRecord —
  // the identical governed path create-from-search uses (editor-draft
  // projection + serializeDocument base seed). Nothing persists until Save:
  // POST /ui/schema/:schemaId/editor-draft is read-only by construction
  // (UIHandlers.ts), and Cancel leaves no record.
  //
  // The kind source is the ACTIVE tab's `kinds` DATA (REGISTRY_TABS) only:
  // single-kind tabs create kinds[0] directly; multi-kind tabs open a picker
  // listing the tab's kinds (default = kinds[0], mirroring the primary-kind
  // rule that drives activeTabSchemaId). The kind -> schema $id resolution is
  // the EDITOR-9 fix-1 wiring (schemaNodes from GET /schemas +
  // deriveSchemaNode) — no kind->schema map, no literals.
  const openCreateForKind = async (kind: string) => {
    setCreateKindPickerOpen(false);
    setCreateError(null);
    // QMS7-5 FIX1 (adv-review DEFECT 1): belt-and-braces validation at the
    // create path itself — the confirmed kind must belong to the ACTIVE tab's
    // kinds DATA. The activeTab effect above already resets the picker; this
    // guard makes an off-tab create impossible even if a future refactor
    // re-introduces a stale selection.
    const activeKinds = REGISTRY_TABS.find((t) => t.id === activeTab)?.kinds ?? []
    if (!(activeKinds as readonly string[]).includes(kind)) {
      setCreateError(
        `Kind "${kind}" does not belong to the active tab — the create selection was stale and has been cleared.`,
      );
      return;
    }
    const schemaId = schemaNodes.find((node) => node.kind === kind)?.schemaId;
    if (!schemaId) {
      setCreateError(
        `No registered schema found for kind "${kind}" — the schema registry may still be loading.`,
      );
      return;
    }
    // The create base MUST carry kind + id (EDITOR-9 fix-2: serializeDocument
    // clones the base; the draft projection has no `kind` slot and the server
    // rejects a payload without an id — RecordHandlers.ts). The id is seeded
    // from the schema's DECLARED properties.id.pattern (OQ-3 ruling); an
    // unparseable pattern is an actionable error, NOT a fabricated prefix.
    let seed: string | null = null;
    try {
      const info = await apiClient.getSchema(schemaId);
      seed = seedIdFromDeclaredPattern(info.schema);
    } catch {
      setCreateError(`Could not load the schema for kind "${kind}" to derive its id pattern.`);
      return;
    }
    if (!seed) {
      setCreateError(
        `No id pattern declared for this schema (${kind}) — a schema-compliant id cannot be derived.`,
      );
      return;
    }
    handleCreateRecord(schemaId, { kind, id: seed });
  };

  const handleCreateFromTab = () => {
    const kinds = REGISTRY_TABS.find((t) => t.id === activeTab)?.kinds ?? [];
    if (kinds.length === 0) return;
    if (kinds.length === 1) {
      void openCreateForKind(kinds[0]);
      return;
    }
    // Multi-kind tab: picker over the tab's kinds data, default = primary kind.
    setPendingCreateKind(kinds[0]);
    setCreateKindPickerOpen(true);
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
    // QMS7-5 FIX1 (adv-review DEFECT 5b): Cancel exits the whole Create
    // affordance state — a stale picker or Create error banner must not
    // persist until the next Create attempt.
    setCreateKindPickerOpen(false);
    setPendingCreateKind(null);
    setCreateError(null);
  };

  // QMS-6 (delta D6): approved/effective content is locked at HTTP and storage.
  // In-place Save is replaced by a draft-copy; the server issues fresh
  // authorship (no inherited reviewer/approver/signature assignments).
  const contentLocked =
    editorMode === 'edit' &&
    ((selectedRecord?.payload as { state?: string } | undefined)?.state === 'approved' ||
      (selectedRecord?.payload as { state?: string } | undefined)?.state === 'effective');

  // QMS7-6 (OQ-2 ruling A): an archived/terminal record opens READ-ONLY via
  // the SAME single data-driven predicate the list filter uses — the row is
  // lifecycle-bearing AND its lifecycle's DECLARED terminal set contains its
  // payload.state. One mechanism, zero new state strings (bait 1). This
  // intentionally does NOT extend to approved/effective: those stay with the
  // existing reviewed contentLocked branch above (ruling: do not touch it).
  // Server-side the same content edit already fails 409 CONTROLLED_RECORD_LOCKED
  // (RecordHandlers.ts, QMS7-4) — the UI simply does not offer a doomed Save.
  const terminalLocked =
    editorMode === 'edit' && selectedRecord !== null && isTerminalRow(selectedRecord);

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
        ...(fresh.meta ? { meta: fresh.meta } : {}),
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

  // D2 (REG-3 fix1): the editor's mount identity is the editing SUBJECT.
  // @tiptap/react's useEditor(options, deps=[]) NEVER rebuilds the doc when
  // `content` changes — with empty deps the instance manager only calls
  // editor.setOptions(), which merges options and calls view.updateState(this.state):
  // the existing ProseMirror doc (every fieldRow's attrs.value) is REUSED.
  // Without a subject key, flipping edit -> create keeps the OPEN record's
  // doc, and serializeDocument(oldDoc, seedBase) re-applies its values over
  // the seed base — the gate's "New Record shows TRR-DEMO-1" carryover.
  // The key changes ONLY when the subject changes (a different record, or
  // edit <-> create); editing the same record keeps the same key, so no
  // legitimate editor state is lost to a blanket remount.
  const editorSubjectKey = selectedRecord
    ? `${editorMode}:${selectedRecord.recordId || String((selectedRecord.payload as { id?: unknown }).id ?? '')}`
    : 'none';

  // QMS7-6 (AC-5): the archived-browsing filter is applied AT RENDER TIME over
  // whatever `records` state holds (bait 6: no refetch on toggle, the
  // refreshRecords seq-token is untouched). Terminal rows are hidden unless
  // the toggle is on; ungoverned rows are never hidden.
  const visibleRecords = showArchived ? records : records.filter((row) => !isTerminalRow(row));

  // Determine if we have projection data to render
  const hasProjection = projection !== null && projection.blocks && projection.slots;

  return (
    <div className="registry-page">
      {/* Left Panel - Record List */}
      <div className="registry-list">
        {/* Tabs */}
        <div className="registry-list__tabs">
          {REGISTRY_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabId)}
              className={`registry-tab${activeTab === tab.id ? ' registry-tab--active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* QMS7-5: per-tab Create — the affordance beside the per-tab
            combobox. Single-kind tabs create directly; multi-kind tabs open
            a picker listing the tab's kinds data (ontology kind strings
            verbatim — no invented display vocab). */}
        <div className="registry-list__actions">
          <button
            data-testid="registry-create-button"
            onClick={handleCreateFromTab}
            // Create resolves kind -> schema $id from the schema registry;
            // until GET /schemas resolves there is nothing to create against
            // (same degradation as the combobox's activeTabSchemaId='').
            disabled={schemaNodes.length === 0}
            className="registry-btn registry-btn--primary"
          >
            Create
          </button>
          {createKindPickerOpen && (
            <div data-testid="registry-create-kind-picker" className="registry-kind-picker">
              {activeTabConfig.kinds.map((kind) => (
                <button
                  key={kind}
                  onClick={() => setPendingCreateKind(kind)}
                  className={`registry-kind-chip${pendingCreateKind === kind ? ' registry-kind-chip--active' : ''}`}
                >
                  {kind}
                </button>
              ))}
              <button
                onClick={() => void openCreateForKind(pendingCreateKind ?? activeTabConfig.kinds[0])}
                className="registry-btn registry-btn--primary"
              >
                Confirm
              </button>
              <button
                data-testid="registry-create-kind-cancel"
                onClick={() => {
                  setCreateKindPickerOpen(false);
                  setPendingCreateKind(null);
                }}
                className="registry-btn registry-btn--ghost"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        {createError && (
          <div data-testid="registry-create-error" className="registry-error">
            {createError}
          </div>
        )}
        {/* QMS7-6 (AC-5): archived browsing. The checkbox is the ONLY affordance;
            the hide rule itself is the data-driven isTerminalRow predicate
            (declared terminal facts + payload.state) — "Show archived" here is
            label COPY only and is never read as a branch condition (bait 1). */}
        <div className="registry-list__archived">
          <label className="registry-list__archived-label">
            <input
              type="checkbox"
              data-testid="registry-show-archived"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show archived
          </label>
        </div>
        {/* RecordSearchCombobox */}
        <div className="registry-list__search">
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
        {/* Record List - Compact (QMS7-6: renders visibleRecords — the
            render-time archived filter, see above) */}
        <div className="registry-list__scroll">
          {loading ? (
            <div className="registry-list__empty">Loading...</div>
          ) : visibleRecords.length === 0 ? (
            <div className="registry-list__empty">No records found</div>
          ) : (
            <div className="registry-list__rows">
              {visibleRecords.map((record) => {
                const isSelected = record.recordId === selectedRecord?.recordId;
                const displayName = (record.payload as { name?: string; title?: string; id?: string }).name ||
                                   (record.payload as { name?: string; title?: string; id?: string }).title ||
                                   record.recordId;
                const kind = (record.payload as { kind?: string }).kind || 'record';
                return (
                  <div
                    key={record.recordId}
                    onClick={() => handleSelectRecord({ recordId: record.recordId, payload: record.payload, ...(record.meta ? { meta: record.meta } : {}) })}
                    className={`registry-row${isSelected ? ' registry-row--selected' : ''}`}
                  >
                    <div className="registry-row__title">{displayName}</div>
                    <div className="registry-row__meta">
                      <span className="registry-kind-badge">
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
          width="full"
          railResizable
          topBar={
            <DocumentShellHeader
              title={title}
              actions={
                <>
                  {contentLocked || terminalLocked ? (
                    // QMS-6 (delta D6) + QMS7-6 (OQ-3 ruling: KEPT): locked or
                    // terminal content offers the DECLARED draft-copy route
                    // (routes.ts draft-copy) — it mints a NEW record id, never
                    // an unarchive of the terminal record.
                    <button
                      onClick={handleCreateDraftRevision}
                      disabled={saving}
                      className="registry-btn registry-btn--primary"
                    >
                      {saving ? 'Creating...' : 'Create draft revision'}
                    </button>
                  ) : (
                    <button
                      onClick={handleSave}
                      disabled={saving || !dirty}
                      className="registry-btn registry-btn--primary"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  )}
                  <button
                    onClick={handleCancel}
                    className="registry-btn registry-btn--ghost"
                  >
                    Cancel
                  </button>
                  {draftRevisionNote && (
                    <span data-testid="draft-revision-note" className="registry-note">
                      {draftRevisionNote}
                    </span>
                  )}
                  {dirty && !saving && (
                    <span className="registry-dirty-dot" title="Unsaved changes" />
                  )}
                  {error && <span className="registry-save-error">{error}</span>}
                </>
              }
            />
          }
          rail={
            selectedRecord ? (
              <div className="registry-rail">
                <RecordProvenanceCard
                  recordId={selectedRecord.recordId}
                  {...(selectedRecord.meta ? { meta: selectedRecord.meta } : {})}
                  payload={selectedRecord.payload}
                />
                {selectedRecord.recordId && editorMode !== 'create' ? (
                  <RelatedRecordsCard
                    recordId={selectedRecord.recordId}
                    onNavigate={(id) => {
                      window.open(`/records/${encodeURIComponent(id)}`, '_blank')
                    }}
                  />
                ) : null}
              </div>
            ) : undefined
          }
        >
          <div className="registry-editor-body">
            {selectedRecord.recordId && editorMode === 'edit' && (
              <DocumentControlBar
                record={selectedRecord}
                dirty={dirty}
                onStateChanged={refreshSelectedRecord}
              />
            )}
            {hasProjection ? (
              <ProjectionTapTabEditor
                key={editorSubjectKey}
                ref={taptabRef}
                blocks={projection.blocks}
                slots={projection.slots}
                data={selectedRecord.payload}
                disabled={saving || contentLocked || terminalLocked}
                onUpdate={handleSerializedChange}
              />
            ) : (
              <p className="registry-editor-empty">
                {projectionLoading ? 'Loading editor...' : 'Editor not available for this record'}
              </p>
            )}
          </div>
        </DocumentShell>
      ) : (
        /* Placeholder when no record selected */
        <div className="registry-placeholder">
          <div className="text-center">
            <p className="registry-placeholder__title">Select a record to edit</p>
            <p className="registry-placeholder__hint">Or search for a record using the combobox above</p>
          </div>
        </div>
      )}
    </div>
  );
}
