# Protocol Execution Redesign Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Enhance existing protocol execution UI to support step-based sub-graphs, inline deviations, and AI-assisted editing with deterministic compiler validation.

**Architecture:** Build on existing `ProtocolTabPanel.tsx`, `EventRibbon.tsx`, and schema infrastructure. Add step-to-sub-graph compilation, execution state management, deviation tracking, and AI command parsing. All AI modifications flow through the deterministic event graph compiler.

**Tech Stack:** TypeScript, React 18, Fastify, Ajv validation, YAML schemas, existing event graph infrastructure.

---

## Phase 1: Step-to-Sub-Graph Compilation

**Objective:** Enable protocol steps to compile into sub-event-graphs that can be ghosted onto the deck and executed independently.

**Files:**
- Modify: `schema/workflow/protocol.schema.yaml` — add `subGraphTemplate` field to steps
- Modify: `schema/workflow/event-graph.schema.yaml` — add `stepId` reference (already exists, verify usage)
- Create: `server/src/protocol/StepGraphCompiler.ts` — compile step definitions to event graphs
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx` — wire up sub-graph fetching
- Modify: `app/src/graph/events/ribbon/EventRibbon.tsx` — support sub-graph filtering by stepId

### Task 1.1: Verify StepId Field in Event Schema

**Objective:** Confirm `stepId` exists in `PlateEvent` type and schema.

**Files:**
- Read: `app/src/types/events.ts` (lines 359-368 for PlateEvent)
- Read: `schema/workflow/event-graph.schema.yaml`

**Step 1: Read event type definition**

```typescript
// app/src/types/events.ts
export interface PlateEvent {
  eventId: string;
  event_type: EventType;
  details: EventDetails;
  stepId?: string;  // ← Verify this exists
  at?: string;
  t_offset?: string;
  notes?: string;
  deviations?: DeviationData[];
  executionState?: ExecutionState;
}
```

**Step 2: Verify schema definition**

```yaml
# schema/workflow/event-graph.schema.yaml
properties:
  events:
    type: array
    items:
      $ref: '#/$defs/PlateEvent'
  # Check if stepId is defined in PlateEvent properties
```

**Expected:** `stepId` field exists as optional string. If missing, add it.

**Step 3: Commit if changes made**

```bash
git add app/src/types/events.ts schema/workflow/event-graph.schema.yaml
git commit -m "feat: ensure stepId field exists on PlateEvent"
```

---

### Task 1.2: Add Sub-Graph Template to Protocol Step Schema

**Objective:** Allow protocol steps to define sub-graph templates that compile to event graphs.

**Files:**
- Modify: `schema/workflow/protocol.schema.yaml`

**Step 1: Read current protocol schema**

```yaml
# schema/workflow/protocol.schema.yaml
# Find the CompiledProtocolStep or ProtocolStep definition
```

**Step 2: Add subGraphTemplate field**

```yaml
# Add to CompiledProtocolStep properties:
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

**Step 3: Validate schema syntax**

```bash
cd /home/brad/git/computable-lab/server
node -e "
import { parse } from 'yaml';
import { readFile } from 'fs/promises';
const schema = parse(await readFile('schema/workflow/protocol.schema.yaml', 'utf8'));
console.log('Schema valid:', !!schema.$defs.CompiledProtocolStep);
"
```

**Expected:** Schema parses without errors.

**Step 4: Commit**

```bash
git add schema/workflow/protocol.schema.yaml
git commit -m "feat: add subGraphTemplate to protocol step schema"
```

---

### Task 1.3: Create Step Graph Compiler

**Objective:** Build compiler that transforms protocol step templates into executable event graphs.

**Files:**
- Create: `server/src/protocol/StepGraphCompiler.ts`

**Step 1: Write the compiler**

```typescript
// server/src/protocol/StepGraphCompiler.ts
import { ProtocolStep, SubGraphTemplate } from '../../types/protocol';
import { EventGraph, PlateEvent } from '../../types/event-graph';
import { v4 as uuidv4 } from 'uuid';

export class StepGraphCompiler {
  /**
   * Compile a protocol step into an event graph
   * @param step - The protocol step with subGraphTemplate
   * @param bindings - Variable bindings (materials, labware, etc.)
   * @returns Compiled event graph for this step
   */
  static compileStepToGraph(
    step: ProtocolStep,
    bindings: Record<string, unknown>
  ): EventGraph {
    const template = step.subGraphTemplate;
    if (!template) {
      throw new Error(`Step ${step.id} has no subGraphTemplate`);
    }

    // Clone template and substitute variables
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

  /**
   * Recursively substitute {{variable}} placeholders with bound values
   */
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

  /**
   * Compile all steps in a protocol into separate event graphs
   */
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

**Step 2: Write test**

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

**Step 3: Run test**

```bash
cd /home/brad/git/computable-lab/server
npm run test:run -- test/protocol/StepGraphCompiler.test.ts
```

**Expected:** Test passes, compiler produces correct event graphs.

**Step 4: Commit**

```bash
git add server/src/protocol/StepGraphCompiler.ts server/test/protocol/StepGraphCompiler.test.ts
git commit -m "feat: add StepGraphCompiler for step-to-sub-graph compilation"
```

---

### Task 1.4: Wire Sub-Graph Fetching in ProtocolTabPanel

**Objective:** Connect ProtocolTabPanel to fetch and display step sub-graphs.

**Files:**
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`

**Step 1: Read current implementation**

```typescript
// app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx
// Lines 1-100: Understand current structure, state management, and API calls
```

**Step 2: Add sub-graph fetching logic**

```typescript
// Add to ProtocolTabPanel component:
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

// In StepChip component, when visibility toggled:
const handleVisibilityToggle = async (stepId: string) => {
  const isVisible = !visibleSteps.has(stepId);
  if (isVisible && !stepGraphs[stepId]) {
    await fetchStepGraph(stepId);
  }
  toggleStepVisibility(stepId);
};
```

**Step 3: Add backend route**

```typescript
// server/src/api/protocol-routes.ts
fastify.get('/api/protocols/:protocolId/steps/:stepId/graph', async (request, reply) => {
  const { protocolId, stepId } = request.params;
  
  // Fetch protocol and step
  const protocol = await getProtocol(protocolId);
  const step = protocol.steps.find(s => s.id === stepId);
  
  if (!step) {
    return reply.code(404).send({ error: 'Step not found' });
  }

  // Compile step to graph
  const graph = StepGraphCompiler.compileStepToGraph(step, {});
  
  return reply.code(200).send(graph);
});
```

**Step 4: Test integration**

```bash
# Start backend
cd /home/brad/git/computable-lab
./start-app.sh

# In browser, navigate to protocol page and check network tab for /api/protocols/*/steps/*/graph calls
```

**Step 5: Commit**

```bash
git add app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx server/src/api/protocol-routes.ts
git commit -m "feat: wire sub-graph fetching in ProtocolTabPanel"
```

---

## Phase 2: Execution Workflow with Timestamps

**Objective:** Implement the execution mode with play buttons, timestamp collection, and execution state management.

**Files:**
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx` — enhance play button logic
- Modify: `app/src/graph/events/ribbon/EventRibbon.tsx` — add execution state indicators
- Create: `app/src/hooks/useExecutionState.ts` — execution state management hook
- Modify: `server/src/api/run-routes.ts` — add execution timestamp endpoints

### Task 2.1: Create Execution State Management Hook

**Objective:** Centralize execution state (planned vs. executed graphs, timestamps, step status).

**Files:**
- Create: `app/src/hooks/useExecutionState.ts`

**Step 1: Write the hook**

```typescript
// app/src/hooks/useExecutionState.ts
import { useState, useCallback, useEffect } from 'react';
import { EventGraph, PlateEvent } from '../types/events';

export type ExecutionMode = 'plan' | 'execute';
export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'deviated';

export interface ExecutionState {
  mode: ExecutionMode;
  runId: string;
  plannedGraph: EventGraph | null;
  executedGraph: EventGraph | null;
  currentStepIndex: number;
  stepStatuses: Record<string, StepStatus>;
  stepTimestamps: Record<string, { startedAt?: string; completedAt?: string }>;
}

export function useExecutionState(runId: string) {
  const [state, setState] = useState<ExecutionState>({
    mode: 'plan',
    runId,
    plannedGraph: null,
    executedGraph: null,
    currentStepIndex: 0,
    stepStatuses: {},
    stepTimestamps: {}
  });

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
    // Execute all steps sequentially with timestamps
    const steps = Object.keys(state.stepStatuses);
    for (const stepId of steps) {
      if (state.stepStatuses[stepId] === 'pending') {
        startStep(stepId);
        // Simulate step execution (replace with actual execution logic)
        await new Promise(resolve => setTimeout(resolve, 1000));
        completeStep(stepId);
      }
    }
  }, [state.stepStatuses, startStep, completeStep]);

  return {
    ...state,
    setMode,
    startStep,
    completeStep,
    updateEventTimestamp,
    playAll
  };
}
```

**Step 2: Write test**

```typescript
// app/src/hooks/__tests__/useExecutionState.test.tsx
import { renderHook, act } from '@testing-library/react';
import { useExecutionState } from '../useExecutionState';

describe('useExecutionState', () => {
  it('tracks step start and completion with timestamps', () => {
    const { result } = renderHook(() => useExecutionState('run-1'));

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
});
```

**Step 3: Run test**

```bash
cd /home/brad/git/computable-lab/app
npm run test:unit -- src/hooks/__tests__/useExecutionState.test.tsx
```

**Step 4: Commit**

```bash
git add app/src/hooks/useExecutionState.ts app/src/hooks/__tests__/useExecutionState.test.tsx
git commit -m "feat: add useExecutionState hook for execution workflow"
```

---

### Task 2.2: Enhance ProtocolTabPanel Play Button Logic

**Objective:** Wire play buttons to execution state management with timestamp collection.

**Files:**
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`

**Step 1: Read current StepExecutionModal implementation**

```typescript
// app/src/event-editor/right-pane/protocol/StepExecutionModal.tsx
// Understand current modal structure
```

**Step 2: Integrate with useExecutionState**

```typescript
// In ProtocolTabPanel:
const { 
  mode, 
  setMode, 
  startStep, 
  completeStep, 
  stepTimestamps,
  stepStatuses,
  playAll 
} = useExecutionState(runId);

// In StepChip component:
const handlePlay = () => {
  if (mode !== 'execute') return;
  
  startStep(stepId);
  
  // Open modal with step settings
  setOpenStepModal(true);
};

const handleStepComplete = (deviations?: DeviationData[]) => {
  completeStep(stepId, deviations);
  setOpenStepModal(false);
};

// Play All button:
const handlePlayAll = async () => {
  await playAll();
};
```

**Step 3: Add timestamp display to StepChip**

```typescript
// In StepChip:
{stepStatuses[stepId] === 'completed' && (
  <div className="text-xs text-gray-500">
    Completed: {new Date(stepTimestamps[stepId].completedAt).toLocaleTimeString()}
  </div>
)}
```

**Step 4: Commit**

```bash
git add app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx
git commit -m "feat: wire play buttons to execution state management"
```

---

### Task 2.3: Add Execution Timestamps API

**Objective:** Backend endpoints for recording execution timestamps.

**Files:**
- Modify: `server/src/api/run-routes.ts`

**Step 1: Add timestamp endpoints**

```typescript
// server/src/api/run-routes.ts
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

**Step 2: Write tests**

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

**Step 3: Run tests**

```bash
cd /home/brad/git/computable-lab/server
npm run test:run -- test/api/run-timestamps.test.ts
```

**Step 4: Commit**

```bash
git add server/src/api/run-routes.ts server/test/api/run-timestamps.test.ts
git commit -m "feat: add execution timestamp API endpoints"
```

---

## Phase 3: Settings System for Controlled Protocols

**Objective:** Enable settings editing with controlled/variable semantics and inline editing UI.

**Files:**
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx` — add settings panel
- Create: `app/src/components/SettingsPanel.tsx` — settings editing component
- Modify: `server/src/api/settings-routes.ts` — settings CRUD endpoints

### Task 3.1: Create Settings Panel Component

**Objective:** Build reusable settings panel for step-level parameter editing.

**Files:**
- Create: `app/src/components/SettingsPanel.tsx`

**Step 1: Write the component**

```typescript
// app/src/components/SettingsPanel.tsx
import React, { useState } from 'react';
import { Setting, SettingType } from '../types/settings';

interface SettingsPanelProps {
  stepId: string;
  settings: Setting[];
  isControlled: boolean;
  onSave: (settingId: string, value: unknown) => Promise<void>;
}

export function SettingsPanel({ stepId, settings, isControlled, onSave }: SettingsPanelProps) {
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
    const isEditable = !isControlled || setting.isEditableInControlled;
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
            disabled={!isEditable}
            className="w-full px-2 py-1 border rounded"
          />
        );

      case 'duration':
        return (
          <input
            type="number"
            value={value}
            onChange={e => handleChange(setting.id, parseInt(e.target.value))}
            disabled={!isEditable}
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
            disabled={!isEditable}
            className="w-full px-2 py-1 border rounded"
          />
        );

      case 'select':
        return (
          <select
            value={value}
            onChange={e => handleChange(setting.id, e.target.value)}
            disabled={!isEditable}
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
            disabled={!isEditable}
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
          <div className="flex items-center gap-2">
            <span className="text-sm">{setting.name}</span>
            {isControlled && !setting.isEditableInControlled && (
              <span title="Controlled setting" className="text-red-500">🔒</span>
            )}
          </div>
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

**Step 2: Write test**

```typescript
// app/src/components/__tests__/SettingsPanel.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPanel } from '../SettingsPanel';

describe('SettingsPanel', () => {
  it('renders settings with appropriate inputs', () => {
    const settings = [
      { id: 'temp', name: 'Temperature', type: 'temperature', defaultValue: 37, isEditableInControlled: true },
      { id: 'time', name: 'Duration', type: 'duration', defaultValue: 60, isEditableInControlled: true }
    ];

    render(<SettingsPanel stepId="step-1" settings={settings} isControlled={false} onSave={async () => {}} />);

    expect(screen.getByText('Temperature')).toBeInTheDocument();
    expect(screen.getByText('Duration')).toBeInTheDocument();
  });

  it('disables controls for controlled settings', () => {
    const settings = [
      { id: 'temp', name: 'Temperature', type: 'temperature', defaultValue: 37, isEditableInControlled: false }
    ];

    render(<SettingsPanel stepId="step-1" settings={settings} isControlled={true} onSave={async () => {}} />);

    const input = screen.getByDisplayValue('37');
    expect(input).toBeDisabled();
  });
});
```

**Step 3: Run test**

```bash
cd /home/brad/git/computable-lab/app
npm run test:unit -- src/components/__tests__/SettingsPanel.test.tsx
```

**Step 4: Commit**

```bash
git add app/src/components/SettingsPanel.tsx app/src/components/__tests__/SettingsPanel.test.tsx
git commit -m "feat: add SettingsPanel component with controlled editing"
```

---

### Task 3.2: Integrate Settings Panel into ProtocolTabPanel

**Objective:** Wire SettingsPanel to display when step is selected.

**Files:**
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`

**Step 1: Add settings state**

```typescript
// In ProtocolTabPanel:
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

**Step 2: Render SettingsPanel**

```typescript
// In ProtocolTabPanel render:
{selectedStepId && stepSettings[selectedStepId] && (
  <SettingsPanel
    stepId={selectedStepId}
    settings={stepSettings[selectedStepId]}
    isControlled={protocol.isControlled}
    onSave={async (settingId, value) => {
      await fetch(`/api/runs/${runId}/settings`, {
        method: 'POST',
        body: JSON.stringify({ stepId: selectedStepId, settingId, value })
      });
    }}
  />
)}
```

**Step 3: Commit**

```bash
git add app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx
git commit -m "feat: integrate SettingsPanel into ProtocolTabPanel"
```

---

## Phase 4: Deviation Tracking with Inline Storage

**Objective:** Implement deviation capture as inline diffs on events with provenance metadata.

**Files:**
- Modify: `app/src/types/events.ts` — verify DeviationData structure
- Create: `app/src/components/DeviationRecorder.tsx` — deviation capture UI
- Modify: `server/src/api/run-routes.ts` — deviation storage endpoints

### Task 4.1: Verify and Enhance Deviation Schema

**Objective:** Ensure DeviationData type supports all required fields.

**Files:**
- Read: `app/src/types/events.ts`
- Read: `schema/workflow/execution-observation.schema.yaml`

**Step 1: Read current DeviationData definition**

```typescript
// app/src/types/events.ts
export interface DeviationData {
  eventId: string;
  originalValue: unknown;
  newValue: unknown;
  reason: string;
  recordedBy: string;
  recordedAt: string;
}
```

**Step 2: Verify schema supports it**

```yaml
# schema/workflow/execution-observation.schema.yaml
# Check if DeviationData is defined and matches TypeScript type
```

**Step 3: Commit if changes needed**

```bash
git add app/src/types/events.ts
git commit -m "feat: ensure DeviationData schema matches TypeScript type"
```

---

### Task 4.2: Create DeviationRecorder Component

**Objective:** Build UI for recording deviations during execution.

**Files:**
- Create: `app/src/components/DeviationRecorder.tsx`

**Step 1: Write the component**

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
  const [deviation, setDeviation] = useState<DeviationData | null>(null);

  const detectDeviations = () => {
    const changes: Array<{ field: string; original: unknown; newValue: unknown }> = [];
    
    // Compare event fields
    if (event.at !== originalEvent.at) {
      changes.push({ field: 'timestamp', original: originalEvent.at, newValue: event.at });
    }
    
    // Compare details
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
        recordedBy: 'current-user-id', // Get from auth context
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

**Step 2: Write test**

```typescript
// app/src/components/__tests__/DeviationRecorder.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
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

**Step 3: Run test**

```bash
cd /home/brad/git/computable-lab/app
npm run test:unit -- src/components/__tests__/DeviationRecorder.test.tsx
```

**Step 4: Commit**

```bash
git add app/src/components/DeviationRecorder.tsx app/src/components/__tests__/DeviationRecorder.test.tsx
git commit -m "feat: add DeviationRecorder component"
```

---

### Task 4.3: Add Deviation API Endpoints

**Objective:** Backend endpoints for storing deviations.

**Files:**
- Modify: `server/src/api/run-routes.ts`

**Step 1: Add deviation endpoints**

```typescript
// server/src/api/run-routes.ts
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

**Step 2: Implement computeDiff helper**

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

  // Find modified events
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

  // Find added events
  for (const eventId of executedMap.keys()) {
    if (!plannedMap.has(eventId)) {
      diffs.push({ eventId, changes: [], status: 'added' });
    }
  }

  // Find removed events
  for (const eventId of plannedMap.keys()) {
    if (!executedMap.has(eventId)) {
      diffs.push({ eventId, changes: [], status: 'removed' });
    }
  }

  return diffs;
}
```

**Step 3: Write tests**

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

**Step 4: Run tests**

```bash
cd /home/brad/git/computable-lab/server
npm run test:run -- test/utils/eventGraphDiff.test.ts
```

**Step 5: Commit**

```bash
git add server/src/api/run-routes.ts server/src/utils/eventGraphDiff.ts server/test/utils/eventGraphDiff.test.ts
git commit -m "feat: add deviation tracking API and diff engine"
```

---

## Phase 5: AI Integration with Deterministic Compiler

**Objective:** Enable natural language commands for step editing that flow through the deterministic compiler.

**Files:**
- Create: `app/src/services/AICommandParser.ts` — parse natural language to structured changes
- Modify: `server/src/ai/protocol-ai-agent.ts` — integrate with event graph compiler
- Create: `app/src/components/AIAssistant.tsx` — AI command interface

### Task 5.1: Create AI Command Parser

**Objective:** Parse natural language commands into structured event graph modifications.

**Files:**
- Create: `app/src/services/AICommandParser.ts`

**Step 1: Write the parser**

```typescript
// app/src/services/AICommandParser.ts
import { PlateEvent, EventDetails } from '../types/events';

export interface AICommand {
  type: 'modify_timestamp' | 'modify_setting' | 'add_event' | 'remove_event' | 'modify_details';
  target: {
    eventId?: string;
    stepId?: string;
    field?: string;
  };
  value: unknown;
}

export class AICommandParser {
  private static patterns = [
    {
      regex: /change (?:the )?incubation (?:time|duration) to (\d+) (?:minutes?|min)/i,
      parse: (match): AICommand => ({
        type: 'modify_setting',
        target: { field: 'incubationTime' },
        value: parseInt(match[1])
      })
    },
    {
      regex: /set (?:the )?temperature to (\d+)°?C/i,
      parse: (match): AICommand => ({
        type: 'modify_setting',
        target: { field: 'temperature' },
        value: parseInt(match[1])
      })
    },
    {
      regex: /change (?:event )?timestamp (?:for )?(?:step )?(\S+) to ([\d\-:TZ]+)/i,
      parse: (match): AICommand => ({
        type: 'modify_timestamp',
        target: { eventId: match[1] },
        value: match[2]
      })
    },
    {
      regex: /use (?:the )?(\w+) (?:in|for) (?:well )?([A-H]?[0-9]+)/i,
      parse: (match): AICommand => ({
        type: 'modify_details',
        target: { field: 'material' },
        value: { material: match[1], well: match[2] }
      })
    },
    {
      regex: /add (?:a )?(\w+) (?:event|step) (?:after|before) (?:step )?(\S+)/i,
      parse: (match): AICommand => ({
        type: 'add_event',
        target: { eventId: match[2], position: match[1] === 'after' ? 'after' : 'before' },
        value: { event_type: match[1] }
      })
    }
  ];

  static parse(command: string): AICommand[] {
    const commands: AICommand[] = [];
    
    for (const { regex, parse } of this.patterns) {
      const matches = command.match(regex);
      if (matches) {
        commands.push(parse(matches));
      }
    }

    if (commands.length === 0) {
      throw new Error(`No recognized command pattern in: "${command}"`);
    }

    return commands;
  }

  static async applyToEventGraph(
    commands: AICommand[],
    eventGraph: PlateEvent[],
    compiler: EventGraphCompiler
  ): Promise<PlateEvent[]> {
    let modifiedGraph = [...eventGraph];

    for (const cmd of commands) {
      switch (cmd.type) {
        case 'modify_timestamp':
          modifiedGraph = this.applyTimestampModification(modifiedGraph, cmd);
          break;
        case 'modify_setting':
          modifiedGraph = this.applySettingModification(modifiedGraph, cmd);
          break;
        case 'modify_details':
          modifiedGraph = this.applyDetailsModification(modifiedGraph, cmd);
          break;
        case 'add_event':
          modifiedGraph = this.applyEventAddition(modifiedGraph, cmd);
          break;
      }
    }

    // Validate through deterministic compiler
    const validated = await compiler.compile(modifiedGraph);
    
    return validated;
  }

  private static applyTimestampModification(graph: PlateEvent[], cmd: AICommand): PlateEvent[] {
    return graph.map(event =>
      event.eventId === cmd.target.eventId
        ? { ...event, at: cmd.value as string }
        : event
    );
  }

  private static applySettingModification(graph: PlateEvent[], cmd: AICommand): PlateEvent[] {
    return graph.map(event => ({
      ...event,
      details: {
        ...event.details,
        [cmd.target.field as string]: cmd.value
      }
    }));
  }

  private static applyDetailsModification(graph: PlateEvent[], cmd: AICommand): PlateEvent[] {
    return graph.map(event => ({
      ...event,
      details: { ...event.details, ...cmd.value }
    }));
  }

  private static applyEventAddition(graph: PlateEvent[], cmd: AICommand): PlateEvent[] {
    const index = graph.findIndex(e => e.eventId === cmd.target.eventId);
    if (index === -1) return graph;

    const newEvent: PlateEvent = {
      eventId: `new-${Date.now()}`,
      event_type: cmd.value as any,
      details: {},
      at: new Date().toISOString()
    };

    const newGraph = [...graph];
    const insertIndex = cmd.target.position === 'after' ? index + 1 : index;
    newGraph.splice(insertIndex, 0, newEvent);

    return newGraph;
  }
}
```

**Step 2: Write test**

```typescript
// app/src/services/__tests__/AICommandParser.test.ts
import { describe, it, expect } from 'vitest';
import { AICommandParser } from '../AICommandParser';

describe('AICommandParser', () => {
  it('parses incubation time command', () => {
    const commands = AICommandParser.parse('Change the incubation time to 45 minutes');
    
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      type: 'modify_setting',
      target: { field: 'incubationTime' },
      value: 45
    });
  });

  it('parses temperature command', () => {
    const commands = AICommandParser.parse('Set the temperature to 37°C');
    
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      type: 'modify_setting',
      target: { field: 'temperature' },
      value: 37
    });
  });
});
```

**Step 3: Run test**

```bash
cd /home/brad/git/computable-lab/app
npm run test:unit -- src/services/__tests__/AICommandParser.test.ts
```

**Step 4: Commit**

```bash
git add app/src/services/AICommandParser.ts app/src/services/__tests__/AICommandParser.test.ts
git commit -m "feat: add AICommandParser for natural language editing"
```

---

### Task 5.2: Integrate AI with Event Graph Compiler

**Objective:** Ensure AI modifications flow through deterministic compiler validation.

**Files:**
- Modify: `server/src/ai/protocol-ai-agent.ts`

**Step 1: Read current AI agent implementation**

```typescript
// server/src/ai/protocol-ai-agent.ts
// Understand current prompt structure and event generation
```

**Step 2: Add compiler validation layer**

```typescript
// server/src/ai/protocol-ai-agent.ts
import { EventGraphCompiler } from '../protocol/EventGraphCompiler';
import { AICommandParser } from '../../app/src/services/AICommandParser';

export class ProtocolAIAgent {
  private compiler: EventGraphCompiler;

  constructor(compiler: EventGraphCompiler) {
    this.compiler = compiler;
  }

  async processNaturalLanguageCommand(command: string, currentGraph: PlateEvent[]): Promise<PlateEvent[]> {
    // Parse natural language to structured commands
    const commands = AICommandParser.parse(command);

    // Apply through deterministic compiler
    const validatedGraph = await AICommandParser.applyToEventGraph(
      commands,
      currentGraph,
      this.compiler
    );

    return validatedGraph;
  }

  async generateEventGraphFromProtocol(
    protocol: Protocol,
    bindings: Record<string, unknown>
  ): Promise<PlateEvent[]> {
    // Use existing compilation logic
    const graph = await this.compiler.compileProtocol(protocol, bindings);

    return graph;
  }
}
```

**Step 3: Write test**

```typescript
// server/test/ai/protocol-ai-agent.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ProtocolAIAgent } from '../../src/ai/protocol-ai-agent';
import { EventGraphCompiler } from '../../src/protocol/EventGraphCompiler';

describe('ProtocolAIAgent', () => {
  let agent: ProtocolAIAgent;

  beforeEach(() => {
    const compiler = new EventGraphCompiler();
    agent = new ProtocolAIAgent(compiler);
  });

  it('processes natural language command through compiler', async () => {
    const initialGraph = [{ eventId: 'e1', event_type: 'incubate', at: '2026-07-29T10:00:00Z', details: { duration: 30 } }];
    
    const result = await agent.processNaturalLanguageCommand(
      'Change the incubation time to 45 minutes',
      initialGraph
    );

    expect(result[0].details.duration).toBe(45);
  });
});
```

**Step 4: Run tests**

```bash
cd /home/brad/git/computable-lab/server
npm run test:run -- test/ai/protocol-ai-agent.test.ts
```

**Step 5: Commit**

```bash
git add server/src/ai/protocol-ai-agent.ts server/test/ai/protocol-ai-agent.test.ts
git commit -m "feat: integrate AI with deterministic compiler validation"
```

---

## Phase 6: Integration & Testing

**Objective:** End-to-end testing and verification of the complete workflow.

### Task 6.1: End-to-End Integration Test

**Objective:** Verify complete protocol execution workflow from step selection to deviation recording.

**Files:**
- Create: `app/e2e/protocol-execution.spec.ts`

**Step 1: Write E2E test**

```typescript
// app/e2e/protocol-execution.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Protocol Execution Workflow', () => {
  test('creates run from protocol and executes with deviations', async ({ page }) => {
    // Navigate to protocol page
    await page.goto('/protocols/protocol-123');

    // Switch to execute mode
    await page.click('[data-testid="execute-mode-toggle"]');

    // Click play on first step
    await page.click('[data-testid="step-1-play-button"]');

    // Verify step status changed to in_progress
    await expect(page.locator('[data-testid="step-1-status"]')).toContainText('In Progress');

    // Complete step with deviation
    await page.click('[data-testid="complete-step-button"]');
    await page.fill('[data-testid="deviation-reason"]', 'Used different reagent batch');
    await page.click('[data-testid="save-deviation-button"]');

    // Verify deviation was recorded
    await expect(page.locator('[data-testid="step-1-status"]')).toContainText('Deviated');

    // Check deviation in run details
    await page.click('[data-testid="run-details-tab"]');
    await expect(page.locator('[data-testid="deviation-list"]')).toContainText('Used different reagent batch');
  });
});
```

**Step 2: Run E2E test**

```bash
cd /home/brad/git/computable-lab/app
npm run test:e2e -- protocol-execution.spec.ts
```

**Step 3: Commit**

```bash
git add app/e2e/protocol-execution.spec.ts
git commit -m "test: add E2E test for protocol execution workflow"
```

---

### Task 6.2: Run Full Test Suite

**Objective:** Ensure no regressions in existing functionality.

**Step 1: Run all tests**

```bash
cd /home/brad/git/computable-lab
npm run test:run -w server
npm run test:unit -w app
```

**Expected:** All tests pass, no regressions.

**Step 2: Commit if fixes needed**

```bash
git add .
git commit -m "fix: resolve test failures from protocol execution changes"
```

---

## Verification Checklist

After completing all phases, verify:

- [ ] Protocol steps compile to sub-graphs correctly
- [ ] Step chips display with visibility toggle and play button
- [ ] Execution mode toggles between plan and execute
- [ ] Play buttons record timestamps
- [ ] Settings panel displays and edits correctly
- [ ] Controlled protocols restrict editable settings
- [ ] Deviations are captured and stored inline
- [ ] Deviation diff shows planned vs. executed changes
- [ ] AI commands parse and apply correctly
- [ ] All modifications pass through deterministic compiler
- [ ] All tests pass (unit + E2E)
- [ ] No TypeScript errors or lint warnings

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Step compilation breaks existing event graph rendering | Write comprehensive tests before modifying, use feature flags |
| AI command parser misses valid commands | Start with conservative pattern set, expand based on user feedback |
| Deviation tracking creates data bloat | Implement pagination and lazy loading for deviation history |
| Settings schema too complex for simple use cases | Start with basic types (number, string, boolean), add complexity as needed |

---

## Open Questions

1. Should settings be persisted per-run or globally across runs? (Recommend: per-run with defaults from protocol)
2. How many levels of deviation nesting should we support? (Recommend: single level - deviation records don't themselves have deviations)
3. Should "Play All" be blocking or non-blocking? (Recommend: blocking with progress indicator for simplicity)

---

**Plan saved to:** `.hermes/plans/2026-07-29_101600-protocol-execution-redesign.md`

Ready to execute using subagent-driven-development — I'll dispatch a fresh coder subagent per task with two-stage review (spec compliance then code quality). Shall I proceed?
