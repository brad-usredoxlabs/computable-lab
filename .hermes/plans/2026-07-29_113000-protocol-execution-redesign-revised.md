# Protocol Execution Redesign - Revised Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Enhance existing protocol execution UI with step-based sub-graphs, editable run metadata, "Play All" functionality, and inline deviation tracking. Build on existing infrastructure without breaking the AI→compiler pipeline.

**Key Clarifications:**
1. Settings apply to ALL protocols (controlled protocols are a future feature)
2. AI already flows through deterministic compiler - preserve this
3. Focus on UI improvements: editable run name, "Play All", editable timestamps per chip

**Architecture:** Build on existing `ProtocolTabPanel.tsx`, `EventRibbon.tsx`, `LabwareEditorContext.tsx`, and schema infrastructure. Add step-to-sub-graph compilation, execution state management, and deviation tracking.

**Tech Stack:** TypeScript, React 18, Fastify, Ajv validation, YAML schemas, existing event graph infrastructure.

---

## Phase 1: Step-to-Sub-Graph Compilation

**Objective:** Enable protocol steps to compile into sub-event-graphs that can be ghosted onto the deck and executed independently.

**Files:**
- Modify: `schema/workflow/protocol.schema.yaml` — add `subGraphTemplate` field to steps
- Verify: `schema/workflow/event-graph.schema.yaml` — ensure `stepId` field exists on `PlateEvent`
- Create: `server/src/protocol/StepGraphCompiler.ts` — compile step definitions to event graphs
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx` — wire up sub-graph fetching
- Modify: `app/src/graph/events/ribbon/EventRibbon.tsx` — support sub-graph filtering by stepId

### Task 1.1: Verify StepId Field in Event Schema

**Objective:** Confirm `stepId` exists in `PlateEvent` type and schema.

**Files:**
- Read: `app/src/types/events.ts` (lines 359-368 for PlateEvent)
- Read: `schema/workflow/event-graph.schema.yaml`

**Expected:** `stepId` field exists as optional string. If missing, add it.

**Commit if changes made:**
```bash
git add app/src/types/events.ts schema/workflow/event-graph.schema.yaml
git commit -m "feat: ensure stepId field exists on PlateEvent"
```

### Task 1.2: Add Sub-Graph Template to Protocol Step Schema

**Objective:** Allow protocol steps to define sub-graph templates that compile to event graphs.

**Files:**
- Modify: `schema/workflow/protocol.schema.yaml`

**Add to CompiledProtocolStep properties:**
```yaml
subGraphTemplate:
  type: object
  description: "Event graph template for this step"
  properties:
    events:
      type: array
      items:
        $ref: '../../workflow/event-graph.schema.yaml#/definitions/PlateEvent'
    labwares:
      type: array
      items:
        $ref: '../../workflow/event-graph.schema.yaml#/definitions/Labware'
    deckLayout:
      $ref: '../../workflow/event-graph.schema.yaml#/definitions/DeckLayout'
```

**Validate schema syntax:**
```bash
cd /home/brad/git/computable-lab/server
node -e "
import { parse } from 'yaml';
import { readFile } from 'fs/promises';
const schema = parse(await readFile('schema/workflow/protocol.schema.yaml', 'utf8'));
console.log('Schema valid:', !!schema.$defs.CompiledProtocolStep);
"
```

**Commit:**
```bash
git add schema/workflow/protocol.schema.yaml
git commit -m "feat: add subGraphTemplate to protocol step schema"
```

### Task 1.3: Create Step Graph Compiler

**Objective:** Build compiler that transforms protocol step templates into executable event graphs.

**Files:**
- Create: `server/src/protocol/StepGraphCompiler.ts`

**Write the compiler:**
```typescript
// server/src/protocol/StepGraphCompiler.ts
import { ProtocolStep, SubGraphTemplate } from '../../types/protocol';
import { EventGraph, PlateEvent } from '../../types/event-graph';
import { v4 as uuidv4 } from 'uuid';

export class StepGraphCompiler {
  static compileStepToGraph(
    step: ProtocolStep,
    bindings: Record<string, unknown>
  ): EventGraph {
    const template = step.subGraphTemplate;
    if (!template) {
      throw new Error(`Step ${step.id} has no subGraphTemplate`);
    }

    const events: PlateEvent[] = template.events.map(event => ({
      ...event,
      eventId: uuidv4(),
      stepId: step.id,
      details: this.substituteVariables(event.details, bindings)
    }));

    return {
      id: uuidv4(),
      stepId: step.id,
      events,
      labwares: template.labwares || [],
      deckLayout: template.deckLayout || { placements: [], labwareOrientations: {} },
      metadata: {
        stepName: step.label,
        compiledAt: new Date().toISOString(),
        bindings
      }
    };
  }

  private static substituteVariables(obj: unknown, bindings: Record<string, unknown>): unknown {
    if (typeof obj === 'string') {
      return obj.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        const value = bindings[key];
        return value !== undefined ? String(value) : obj;
      });
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.substituteVariables(item, bindings));
    }

    if (typeof obj === 'object' && obj !== null) {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.substituteVariables(value, bindings);
      }
      return result;
    }

    return obj;
  }

  static compileProtocolToStepGraphs(
    steps: ProtocolStep[],
    globalBindings: Record<string, unknown>
  ): EventGraph[] {
    return steps
      .filter(step => step.subGraphTemplate)
      .map(step => this.compileStepToGraph(step, globalBindings));
  }
}
```

**Write test:**
```typescript
// server/test/protocol/StepGraphCompiler.test.ts
import { describe, it, expect } from 'vitest';
import { StepGraphCompiler } from '../../src/protocol/StepGraphCompiler';

describe('StepGraphCompiler', () => {
  it('compiles a step with subGraphTemplate to event graph', () => {
    const step = {
      id: 'step-1',
      label: 'Add reagent',
      subGraphTemplate: {
        events: [{
          event_type: 'add_material',
          details: { well: 'A1', material: '{{materialName}}', volume: 100 }
        }],
        labwares: [],
        deckLayout: { placements: [], labwareOrientations: {} }
      }
    };

    const bindings = { materialName: 'PBS Buffer' };
    const graph = StepGraphCompiler.compileStepToGraph(step, bindings);

    expect(graph.stepId).toBe('step-1');
    expect(graph.events).toHaveLength(1);
    expect(graph.events[0].details).toMatchObject({
      well: 'A1',
      material: 'PBS Buffer',
      volume: 100
    });
  });
});
```

**Run test:**
```bash
cd /home/brad/git/computable-lab/server
npm run test:run -- test/protocol/StepGraphCompiler.test.ts
```

**Commit:**
```bash
git add server/src/protocol/StepGraphCompiler.ts server/test/protocol/StepGraphCompiler.test.ts
git commit -m "feat: add StepGraphCompiler for step-to-sub-graph compilation"
```

### Task 1.4: Wire Sub-Graph Fetching in ProtocolTabPanel

**Objective:** Connect ProtocolTabPanel to fetch and display step sub-graphs.

**Files:**
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`

**Add sub-graph fetching logic:**
```typescript
const [stepGraphs, setStepGraphs] = useState<Record<string, EventGraph>>({});

const fetchStepGraph = async (stepId: string) => {
  try {
    const response = await fetch(`/api/protocols/${protocolId}/steps/${stepId}/graph`);
    const graph: EventGraph = await response.json();
    setStepGraphs(prev => ({ ...prev, [stepId]: graph }));
  } catch (error) {
    console.error('Failed to fetch step graph:', error);
  }
};

const handleVisibilityToggle = async (stepId: string) => {
  const isVisible = !visibleSteps.has(stepId);
  if (isVisible && !stepGraphs[stepId]) {
    await fetchStepGraph(stepId);
  }
  toggleStepVisibility(stepId);
};
```

**Add backend route:**
```typescript
// server/src/api/protocol-routes.ts
fastify.get('/api/protocols/:protocolId/steps/:stepId/graph', async (request, reply) => {
  const { protocolId, stepId } = request.params;
  
  const protocol = await getProtocol(protocolId);
  const step = protocol.steps.find(s => s.id === stepId);
  
  if (!step) {
    return reply.code(404).send({ error: 'Step not found' });
  }

  const graph = StepGraphCompiler.compileStepToGraph(step, {});
  
  return reply.code(200).send(graph);
});
```

**Commit:**
```bash
git add app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx server/src/api/protocol-routes.ts
git commit -m "feat: wire sub-graph fetching in ProtocolTabPanel"
```

---

## Phase 2: Execution Workflow with Editable Metadata

**Objective:** Implement the execution mode with editable run name, "Play All" button, and editable timestamps per chip.

**Files:**
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx` — enhance play button logic
- Create: `app/src/hooks/useExecutionState.ts` — execution state management hook
- Modify: `server/src/api/run-routes.ts` — add execution timestamp endpoints

### Task 2.1: Create Execution State Management Hook

**Objective:** Centralize execution state (run metadata, planned vs. executed graphs, timestamps, step status).

**Files:**
- Create: `app/src/hooks/useExecutionState.ts`

**Write the hook:**
```typescript
// app/src/hooks/useExecutionState.ts
import { useState, useCallback } from 'react';
import { EventGraph, PlateEvent } from '../types/events';

export type ExecutionMode = 'plan' | 'execute';
export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'deviated';

export interface ExecutionState {
  runId: string;
  runName: string;
  isRunNameEditable: boolean;
  mode: ExecutionMode;
  plannedGraph: EventGraph | null;
  executedGraph: EventGraph | null;
  currentStepIndex: number;
  stepStatuses: Record<string, StepStatus>;
  stepTimestamps: Record<string, { startedAt?: string; completedAt?: string }>;
}

export function useExecutionState(runId: string, initialRunName: string) {
  const [state, setState] = useState<ExecutionState>({
    runId,
    runName: initialRunName,
    isRunNameEditable: true,
    mode: 'plan',
    plannedGraph: null,
    executedGraph: null,
    currentStepIndex: 0,
    stepStatuses: {},
    stepTimestamps: {}
  });

  const setRunName = useCallback((name: string) => {
    setState(prev => ({ ...prev, runName: name }));
  }, []);

  const setMode = useCallback((mode: ExecutionMode) => {
    setState(prev => ({ ...prev, mode }));
  }, []);

  const startStep = useCallback((stepId: string) => {
    setState(prev => ({
      ...prev,
      stepStatuses: { ...prev.stepStatuses, [stepId]: 'in_progress' },
      stepTimestamps: {
        ...prev.stepTimestamps,
        [stepId]: { ...prev.stepTimestamps[stepId], startedAt: new Date().toISOString() }
      }
    }));
  }, []);

  const completeStep = useCallback((stepId: string, deviations?: any[]) => {
    const status = deviations && deviations.length > 0 ? 'deviated' : 'completed';
    setState(prev => ({
      ...prev,
      stepStatuses: { ...prev.stepStatuses, [stepId]: status },
      stepTimestamps: {
        ...prev.stepTimestamps,
        [stepId]: { ...prev.stepTimestamps[stepId], completedAt: new Date().toISOString() }
      }
    }));
  }, []);

  const updateEventTimestamp = useCallback((eventId: string, at: string) => {
    setState(prev => {
      const updateGraph = (graph: EventGraph | null) => {
        if (!graph) return null;
        return {
          ...graph,
          events: graph.events.map(e =>
            e.eventId === eventId ? { ...e, at } : e
          )
        };
      };

      return {
        ...prev,
        executedGraph: updateGraph(prev.executedGraph)
      };
    });
  }, []);

  const playAll = useCallback(async () => {
    const steps = Object.keys(state.stepStatuses);
    for (const stepId of steps) {
      if (state.stepStatuses[stepId] === 'pending') {
        startStep(stepId);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate execution
        completeStep(stepId);
      }
    }
  }, [state.stepStatuses, startStep, completeStep]);

  return {
    ...state,
    setRunName,
    setMode,
    startStep,
    completeStep,
    updateEventTimestamp,
    playAll
  };
}
```

**Write test:**
```typescript
// app/src/hooks/__tests__/useExecutionState.test.tsx
import { renderHook, act } from '@testing-library/react';
import { useExecutionState } from '../useExecutionState';

describe('useExecutionState', () => {
  it('tracks step start and completion with timestamps', () => {
    const { result } = renderHook(() => useExecutionState('run-1', 'Test Run'));

    act(() => {
      result.current.startStep('step-1');
    });

    expect(result.current.stepStatuses['step-1']).toBe('in_progress');
    expect(result.current.stepTimestamps['step-1'].startedAt).toBeDefined();

    act(() => {
      result.current.completeStep('step-1');
    });

    expect(result.current.stepStatuses['step-1']).toBe('completed');
    expect(result.current.stepTimestamps['step-1'].completedAt).toBeDefined();
  });

  it('allows editable run name', () => {
    const { result } = renderHook(() => useExecutionState('run-1', 'Default Run'));

    act(() => {
      result.current.setRunName('Custom Run Name');
    });

    expect(result.current.runName).toBe('Custom Run Name');
  });
});
```

**Run test:**
```bash
cd /home/brad/git/computable-lab/app
npm run test:unit -- src/hooks/__tests__/useExecutionState.test.tsx
```

**Commit:**
```bash
git add app/src/hooks/useExecutionState.ts app/src/hooks/__tests__/useExecutionState.test.tsx
git commit -m "feat: add useExecutionState hook with editable run name"
```

### Task 2.2: Enhance ProtocolTabPanel with Run Metadata and Play All

**Objective:** Add editable run name display and "Play All" button to ProtocolTabPanel.

**Files:**
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`

**Add run metadata display:**
```typescript
// In ProtocolTabPanel component header:
<div className="bg-blue-50 p-4 border-b">
  <div className="flex items-center justify-between mb-2">
    <div>
      <label className="text-xs text-gray-500">Run Name</label>
      <input
        type="text"
        value={runName}
        onChange={e => setRunName(e.target.value)}
        className="font-medium text-lg border-b-2 border-transparent hover:border-gray-300 focus:border-blue-500 outline-none"
        editable={isRunNameEditable}
      />
    </div>
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500">
        Operator: {currentUser?.name || 'Unknown'}
      </span>
      <button
        onClick={playAll}
        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        disabled={mode !== 'execute'}
      >
        Play All Steps
      </button>
    </div>
  </div>
  <div className="text-xs text-gray-600">
    Mode: <span className="font-medium">{mode === 'plan' ? 'Planning' : 'Executing'}</span>
  </div>
</div>
```

**Enhance StepChip with editable timestamps:**
```typescript
// In StepChip component:
{stepStatuses[stepId] === 'completed' && (
  <div className="text-xs text-gray-500 mt-1">
    <label className="mr-1">Completed:</label>
    <input
      type="datetime-local"
      value={formatTimestampForInput(stepTimestamps[stepId].completedAt)}
      onChange={e => updateEventTimestamp(stepId, e.target.value)}
      className="border rounded px-1 py-0.5"
    />
  </div>
)}
```

**Commit:**
```bash
git add app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx
git commit -m "feat: add editable run name and Play All button"
```

### Task 2.3: Add Execution Timestamps API

**Objective:** Backend endpoints for recording execution timestamps.

**Files:**
- Modify: `server/src/api/run-routes.ts`

**Add timestamp endpoints:**
```typescript
fastify.post('/api/runs/:runId/step/:stepId/start', async (request, reply) => {
  const { runId, stepId } = request.params;
  const { startedAt } = request.body as { startedAt: string };

  await updateRunStepStatus(runId, stepId, 'in_progress', {
    startedAt: startedAt || new Date().toISOString()
  });

  return { success: true };
});

fastify.post('/api/runs/:runId/step/:stepId/complete', async (request, reply) => {
  const { runId, stepId } = request.params;
  const { completedAt, deviations } = request.body as { 
    completedAt: string; 
    deviations?: any[] 
  };
  
  const status = deviations && deviations.length > 0 ? 'deviated' : 'completed';
  
  await updateRunStepStatus(runId, stepId, status, {
    completedAt: completedAt || new Date().toISOString(),
    deviations
  });

  return { success: true };
});

fastify.patch('/api/runs/:runId/event/:eventId/timestamp', async (request, reply) => {
  const { runId, eventId } = request.params;
  const { at } = request.body as { at: string };

  await updateEventTimestamp(runId, eventId, at);

  return { success: true };
});
```

**Write tests:**
```typescript
// server/test/api/run-timestamps.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../../src/server';

describe('Run Timestamp API', () => {
  let app: any;

  beforeAll(async () => {
    app = await buildApp();
  });

  it('records step start timestamp', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/runs/run-123/step/step-1/start',
      payload: { startedAt: '2026-07-29T10:00:00Z' }
    });

    expect(response.statusCode).toBe(200);
  });
});
```

**Run tests:**
```bash
cd /home/brad/git/computable-lab/server
npm run test:run -- test/api/run-timestamps.test.ts
```

**Commit:**
```bash
git add server/src/api/run-routes.ts server/test/api/run-timestamps.test.ts
git commit -m "feat: add execution timestamp API endpoints"
```

---

## Phase 3: Settings System for All Protocols

**Objective:** Enable settings editing for all protocols (not just controlled ones).

**Files:**
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx` — add settings panel
- Create: `app/src/components/SettingsPanel.tsx` — settings editing component
- Modify: `server/src/api/settings-routes.ts` — settings CRUD endpoints

### Task 3.1: Create Settings Panel Component

**Objective:** Build reusable settings panel for step-level parameter editing.

**Files:**
- Create: `app/src/components/SettingsPanel.tsx`

**Write the component:**
```typescript
// app/src/components/SettingsPanel.tsx
import React, { useState } from 'react';
import { Setting, SettingType } from '../types/settings';

interface SettingsPanelProps {
  stepId: string;
  settings: Setting[];
  onSave: (settingId: string, value: unknown) => Promise<void>;
}

export function SettingsPanel({ stepId, settings, onSave }: SettingsPanelProps) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [pendingChanges, setPendingChanges] = useState<Set<string>>(new Set());

  const handleChange = (settingId: string, value: unknown) => {
    setValues(prev => ({ ...prev, [settingId]: value }));
    setPendingChanges(prev => new Set(prev).add(settingId));
  };

  const handleSave = async (settingId: string) => {
    await onSave(settingId, values[settingId]);
    setPendingChanges(prev => {
      const next = new Set(prev);
      next.delete(settingId);
      return next;
    });
  };

  const renderSettingInput = (setting: Setting) => {
    const value = values[setting.id] ?? setting.defaultValue;

    switch (setting.type) {
      case 'number':
      case 'temperature':
      case 'volume':
        return (
          <input
            type="number"
            value={value}
            onChange={e => handleChange(setting.id, parseFloat(e.target.value))}
            className="w-full px-2 py-1 border rounded"
          />
        );

      case 'duration':
        return (
          <input
            type="number"
            value={value}
            onChange={e => handleChange(setting.id, parseInt(e.target.value))}
            className="w-full px-2 py-1 border rounded"
            suffix="min"
          />
        );

      case 'string':
        return (
          <input
            type="text"
            value={value}
            onChange={e => handleChange(setting.id, e.target.value)}
            className="w-full px-2 py-1 border rounded"
          />
        );

      case 'select':
        return (
          <select
            value={value}
            onChange={e => handleChange(setting.id, e.target.value)}
            className="w-full px-2 py-1 border rounded"
          >
            {setting.options?.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );

      case 'boolean':
        return (
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={e => handleChange(setting.id, e.target.checked)}
            className="mr-2"
          />
        );

      default:
        return <span>{value}</span>;
    }
  };

  return (
    <div className="bg-gray-50 p-4 rounded-lg mt-2">
      <h4 className="font-medium mb-2">Step Settings</h4>
      {settings.map(setting => (
        <div key={setting.id} className="flex items-center justify-between mb-2">
          <span className="text-sm">{setting.name}</span>
          <div className="flex items-center gap-2">
            {renderSettingInput(setting)}
            {pendingChanges.has(setting.id) && (
              <button
                onClick={() => handleSave(setting.id)}
                className="text-blue-500 text-sm"
              >
                Save
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Write test:**
```typescript
// app/src/components/__tests__/SettingsPanel.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPanel } from '../SettingsPanel';

describe('SettingsPanel', () => {
  it('renders settings with appropriate inputs', () => {
    const settings = [
      { id: 'temp', name: 'Temperature', type: 'temperature', defaultValue: 37 },
      { id: 'time', name: 'Duration', type: 'duration', defaultValue: 60 }
    ];

    render(<SettingsPanel stepId="step-1" settings={settings} onSave={async () => {}} />);

    expect(screen.getByText('Temperature')).toBeInTheDocument();
    expect(screen.getByText('Duration')).toBeInTheDocument();
  });
});
```

**Run test:**
```bash
cd /home/brad/git/computable-lab/app
npm run test:unit -- src/components/__tests__/SettingsPanel.test.tsx
```

**Commit:**
```bash
git add app/src/components/SettingsPanel.tsx app/src/components/__tests__/SettingsPanel.test.tsx
git commit -m "feat: add SettingsPanel component"
```

### Task 3.2: Integrate Settings Panel into ProtocolTabPanel

**Objective:** Wire SettingsPanel to display when step is selected.

**Files:**
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`

**Add settings state:**
```typescript
const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
const [stepSettings, setStepSettings] = useState<Record<string, Setting[]>>({});

const fetchStepSettings = async (stepId: string) => {
  const response = await fetch(`/api/protocols/${protocolId}/steps/${stepId}/settings`);
  const settings: Setting[] = await response.json();
  setStepSettings(prev => ({ ...prev, [stepId]: settings }));
};

const handleStepClick = async (stepId: string) => {
  setSelectedStepId(stepId);
  if (!stepSettings[stepId]) {
    await fetchStepSettings(stepId);
  }
};
```

**Render SettingsPanel:**
```typescript
{selectedStepId && stepSettings[selectedStepId] && (
  <SettingsPanel
    stepId={selectedStepId}
    settings={stepSettings[selectedStepId]}
    onSave={async (settingId, value) => {
      await fetch(`/api/runs/${runId}/settings`, {
        method: 'POST',
        body: JSON.stringify({ stepId: selectedStepId, settingId, value })
      });
    }}
  />
)}
```

**Commit:**
```bash
git add app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx
git commit -m "feat: integrate SettingsPanel into ProtocolTabPanel"
```

---

## Phase 4: Deviation Tracking with Inline Storage

**Objective:** Implement deviation capture as inline diffs on events with provenance metadata.

**Files:**
- Verify: `app/src/types/events.ts` — DeviationData structure
- Create: `app/src/components/DeviationRecorder.tsx` — deviation capture UI
- Modify: `server/src/api/run-routes.ts` — deviation storage endpoints

### Task 4.1: Verify Deviation Schema

**Objective:** Ensure DeviationData type supports all required fields.

**Files:**
- Read: `app/src/types/events.ts`
- Read: `schema/workflow/execution-observation.schema.yaml`

**Expected:** DeviationData has fields: eventId, originalValue, newValue, reason, recordedBy, recordedAt

**Commit if changes needed:**
```bash
git add app/src/types/events.ts
git commit -m "feat: ensure DeviationData schema matches requirements"
```

### Task 4.2: Create DeviationRecorder Component

**Objective:** Build UI for recording deviations during execution.

**Files:**
- Create: `app/src/components/DeviationRecorder.tsx`

**Write the component:**
```typescript
// app/src/components/DeviationRecorder.tsx
import React, { useState } from 'react';
import { PlateEvent, DeviationData } from '../types/events';

interface DeviationRecorderProps {
  event: PlateEvent;
  originalEvent: PlateEvent;
  onSave: (deviation: DeviationData) => Promise<void>;
  onCancel: () => void;
}

export function DeviationRecorder({ event, originalEvent, onSave, onCancel }: DeviationRecorderProps) {
  const [reason, setReason] = useState('');

  const detectDeviations = () => {
    const changes: Array<{ field: string; original: unknown; newValue: unknown }> = [];
    
    if (event.at !== originalEvent.at) {
      changes.push({ field: 'timestamp', original: originalEvent.at, newValue: event.at });
    }
    
    if (JSON.stringify(event.details) !== JSON.stringify(originalEvent.details)) {
      changes.push({ field: 'details', original: originalEvent.details, newValue: event.details });
    }

    return changes;
  };

  const handleSave = async () => {
    const changes = detectDeviations();
    
    for (const change of changes) {
      const deviation: DeviationData = {
        eventId: event.eventId,
        field: change.field,
        originalValue: change.original,
        newValue: change.newValue,
        reason,
        recordedBy: 'current-user-id',
        recordedAt: new Date().toISOString()
      };
      
      await onSave(deviation);
    }
    
    onCancel();
  };

  return (
    <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
      <h4 className="font-medium text-yellow-800 mb-2">Record Deviation</h4>
      
      <div className="mb-3">
        <label className="block text-sm font-medium mb-1">Changes detected:</label>
        {detectDeviations().map((change, idx) => (
          <div key={idx} className="text-sm mb-1">
            <span className="font-medium">{change.field}:</span>
            <span className="text-red-600 line-through mr-2">{JSON.stringify(change.original)}</span>
            <span className="text-green-600">{JSON.stringify(change.newValue)}</span>
          </div>
        ))}
      </div>

      <div className="mb-3">
        <label className="block text-sm font-medium mb-1">Reason:</label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          className="w-full px-2 py-1 border rounded"
          rows={3}
          placeholder="Explain why this deviation occurred..."
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          className="px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700"
        >
          Save Deviation
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
```

**Write test:**
```typescript
// app/src/components/__tests__/DeviationRecorder.test.tsx
import { render, screen } from '@testing-library/react';
import { DeviationRecorder } from '../DeviationRecorder';

describe('DeviationRecorder', () => {
  it('detects and displays deviations', () => {
    const originalEvent = { eventId: 'e1', event_type: 'add_material', at: '2026-07-29T10:00:00Z', details: { well: 'A1' } };
    const modifiedEvent = { eventId: 'e1', event_type: 'add_material', at: '2026-07-29T10:05:00Z', details: { well: 'A1' } };

    render(<DeviationRecorder event={modifiedEvent} originalEvent={originalEvent} onSave={async () => {}} onCancel={() => {}} />);

    expect(screen.getByText('timestamp')).toBeInTheDocument();
  });
});
```

**Run test:**
```bash
cd /home/brad/git/computable-lab/app
npm run test:unit -- src/components/__tests__/DeviationRecorder.test.tsx
```

**Commit:**
```bash
git add app/src/components/DeviationRecorder.tsx app/src/components/__tests__/DeviationRecorder.test.tsx
git commit -m "feat: add DeviationRecorder component"
```

### Task 4.3: Add Deviation API Endpoints

**Objective:** Backend endpoints for storing deviations.

**Files:**
- Modify: `server/src/api/run-routes.ts`

**Add deviation endpoints:**
```typescript
fastify.post('/api/runs/:runId/deviations', async (request, reply) => {
  const { runId } = request.params;
  const deviation = request.body as DeviationData;

  await storeDeviation(runId, deviation);

  return { success: true, deviationId: deviation.eventId };
});

fastify.get('/api/runs/:runId/deviations', async (request, reply) => {
  const { runId } = request.params;

  const deviations = await getRunDeviations(runId);

  return reply.code(200).send(deviations);
});

fastify.get('/api/runs/:runId/deviations/diff', async (request, reply) => {
  const { runId } = request.params;

  const plannedGraph = await getPlannedEventGraph(runId);
  const executedGraph = await getExecutedEventGraph(runId);

  const diff = computeDiff(plannedGraph, executedGraph);

  return reply.code(200).send(diff);
});
```

**Implement computeDiff helper:**
```typescript
// server/src/utils/eventGraphDiff.ts
import { EventGraph, PlateEvent } from '../types/event-graph';

export interface EventDiff {
  eventId: string;
  changes: Array<{
    field: string;
    original: unknown;
    newValue: unknown;
  }>;
  status: 'modified' | 'added' | 'removed';
}

export function computeDiff(planned: EventGraph, executed: EventGraph): EventDiff[] {
  const diffs: EventDiff[] = [];
  const plannedMap = new Map(planned.events.map(e => [e.eventId, e]));
  const executedMap = new Map(executed.events.map(e => [e.eventId, e]));

  for (const [eventId, executedEvent] of executedMap) {
    const plannedEvent = plannedMap.get(eventId);
    if (plannedEvent) {
      const changes: Array<{ field: string; original: unknown; newValue: unknown }> = [];
      
      if (executedEvent.at !== plannedEvent.at) {
        changes.push({ field: 'at', original: plannedEvent.at, newValue: executedEvent.at });
      }
      
      if (JSON.stringify(executedEvent.details) !== JSON.stringify(plannedEvent.details)) {
        changes.push({ field: 'details', original: plannedEvent.details, newValue: executedEvent.details });
      }

      if (changes.length > 0) {
        diffs.push({ eventId, changes, status: 'modified' });
      }
    }
  }

  for (const eventId of executedMap.keys()) {
    if (!plannedMap.has(eventId)) {
      diffs.push({ eventId, changes: [], status: 'added' });
    }
  }

  for (const eventId of plannedMap.keys()) {
    if (!executedMap.has(eventId)) {
      diffs.push({ eventId, changes: [], status: 'removed' });
    }
  }

  return diffs;
}
```

**Write tests:**
```typescript
// server/test/utils/eventGraphDiff.test.ts
import { describe, it, expect } from 'vitest';
import { computeDiff } from '../../src/utils/eventGraphDiff';

describe('computeDiff', () => {
  it('detects timestamp changes', () => {
    const planned = { events: [{ eventId: 'e1', event_type: 'add_material', at: '2026-07-29T10:00:00Z', details: {} }] };
    const executed = { events: [{ eventId: 'e1', event_type: 'add_material', at: '2026-07-29T10:05:00Z', details: {} }] };

    const diff = computeDiff(planned as any, executed as any);

    expect(diff).toHaveLength(1);
    expect(diff[0].changes).toContainEqual(expect.objectContaining({ field: 'at' }));
  });
});
```

**Run tests:**
```bash
cd /home/brad/git/computable-lab/server
npm run test:run -- test/utils/eventGraphDiff.test.ts
```

**Commit:**
```bash
git add server/src/api/run-routes.ts server/src/utils/eventGraphDiff.ts server/test/utils/eventGraphDiff.test.ts
git commit -m "feat: add deviation tracking API and diff engine"
```

---

## Phase 5: Integration & Testing

**Objective:** End-to-end testing and verification of the complete workflow.

### Task 5.1: Run Full Test Suite

**Objective:** Ensure no regressions in existing functionality, especially the AI→compiler pipeline.

**Step 1: Run all tests:**
```bash
cd /home/brad/git/computable-lab
npm run test:run -w server
npm run test:unit -w app
```

**Expected:** All tests pass, no regressions.

**Step 2: Verify AI→compiler pipeline:**
```bash
# Check that event-graph-agent.md still has execution context support
grep -A 10 "Execution Context" /home/brad/git/computable-lab/server/prompts/event-graph-agent.md

# Verify LabwareEditorContext has INSERT_EVENT_AT
grep "INSERT_EVENT_AT" /home/brad/git/computable-lab/app/src/graph/context/LabwareEditorContext.tsx
```

**Expected:** Both features are present and functional.

**Step 3: Commit if fixes needed:**
```bash
git add .
git commit -m "fix: resolve test failures from protocol execution changes"
```

---

## Verification Checklist

After completing all phases, verify:

- [ ] Protocol steps compile to sub-graphs correctly
- [ ] Step chips display with visibility toggle and play button
- [ ] Run name is editable with reasonable default
- [ ] Execution mode toggles between plan and execute
- [ ] Play buttons record timestamps
- [ ] "Play All" button executes all steps sequentially
- [ ] Timestamps are editable per chip
- [ ] Settings panel displays and edits correctly for all protocols
- [ ] Deviations are captured and stored inline
- [ ] Deviation diff shows planned vs. executed changes
- [ ] AI commands still flow through deterministic compiler (no regression)
- [ ] All tests pass (unit + integration)
- [ ] No TypeScript errors or lint warnings

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Step compilation breaks existing event graph rendering | Write comprehensive tests before modifying, use feature flags |
| Deviation tracking creates data bloat | Implement pagination and lazy loading for deviation history |
| Settings schema too complex for simple use cases | Start with basic types (number, string, boolean), add complexity as needed |
| AI→compiler pipeline regression | Verify event-graph-agent.md still has execution context support after all changes |

---

## Open Questions

1. Should settings be persisted per-run or globally across runs? (Recommend: per-run with defaults from protocol)
2. How many levels of deviation nesting should we support? (Recommend: single level)
3. Should "Play All" be blocking or non-blocking? (Recommend: blocking with progress indicator)

---

**Plan saved to:** `/home/brad/git/computable-lab/.hermes/plans/2026-07-29_113000-protocol-execution-redesign-revised.md`

Ready to execute? I'll dispatch coder subagents to implement each task sequentially, with reviewer subagents validating after each phase.
