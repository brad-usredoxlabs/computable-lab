# Protocol Execution Mode Redesign - Complete Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Redesign computable-lab's protocol execution to support protocol steps as sub-event-graphs, with planned/run/analyze lifecycle, settings-based parameter editing, and proper user selection.

**Architecture:**
- **Run** has three phases: planned event graph, executed event graph, analysis
- **Protocol** defines steps, each mapping to a sub-event-graph (via graph-component-instance)
- **Settings** concept: editable parameters at step level (incubation time, temp, speed, etc.)
- **User selection** from registered users list (dropdown/search), defaults to current user
- **Right pane** shows Protocol tab when viewing a run, with step chips and visibility toggles
- **Deviations** captured as diff between planned and executed event graphs

**Tech Stack:** React, TypeScript, Tailwind CSS, existing schema-driven architecture

---

## Current State Analysis

### Schema Layer
- **Run** (`schema/studies/run.schema.yaml`): Thin header with `methodEventGraphId`, `plannedRunRef`, `localProtocolRef`, `executionTracking`
- **Event Graph** (`schema/workflow/event-graph.schema.yaml`): Contains `events[]`, `labwares[]`, `executionMeta`, `methodContext`
- **Protocol** (`schema/workflow/protocol.schema.yaml`): Has `steps[]`, `parameters[]`, `phases[]`, `roles[]`
- **Planned Run** (`schema/workflow/planned-run.schema.yaml`): Binds protocol roles to concrete instances
- **Graph Component Instance** (`schema/workflow/graph-component-instance.schema.yaml`): Can represent sub-graphs

**Gaps:**
- No explicit `steps[]` on Run or Event Graph to map protocol steps → sub-graphs
- No `settings` concept for editable parameters at step level
- No `plannedEventGraphId` vs `executedEventGraphId` distinction on Run
- No `version` field on Protocol for versioned/controlled protocols

### Frontend Layer
- **Right Pane**: Currently has AI, Find, Search, Details tabs (Execution tab was added but needs redesign)
- **ExecutionTabPanel**: Currently shows mock steps, opens modal for execution metadata
- **ExecutionContext**: State management for execution (isActive, executionId, operator, etc.)
- **RunWorkspacePage**: Separate route with Plan/Execute toggle
- **ProjectWorkspacePage**: Main project view with workspace tabs

**Gaps:**
- No Protocol tab in right pane for viewing/editing protocol steps
- No step visibility toggles to ghost events onto deck
- No step highlighting for current step's wells
- No settings editing interface
- No planned vs executed view switching
- No "play all" functionality

### User Management
- **User Schema** (`schema/identity/user.schema.yaml`): Local login principal with `recordId`, `displayName`, `email`, `active`
- **CurrentUserProvider**: Loads active user from `x-user-id` header + list of selectable users
- **UserSwitcher**: Top-bar dropdown to view/select current user (local-first, not auth)
- **Access Policy**: Study/project permission structure with roles (owner, admin, editor, operator, viewer)

**Approach:** Use existing user list from `listUsers()` API, default to current user, allow selection from dropdown.

---

## Phased Implementation Plan

### Phase 1: Schema Extensions

#### Task 1.1: Add Settings Schema
**Objective:** Define settings as first-class concept for editable parameters at step level

**Files:**
- Create: `schema/workflow/setting.schema.yaml`

**Schema Definition:**
```yaml
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/setting.schema.yaml"
title: "Setting"
description: >
  A setting is an editable parameter at the step level. Examples:
  incubation time, temperature, shaking speed, sample names, volumes.
  Settings can be marked as isControlled (cannot be changed without approval)
  or isVariable (free to edit during execution).

type: object
additionalProperties: false
required:
- settingId
- label
- type
properties:
  settingId:
    type: string
    pattern: "^[a-z][a-z0-9-]*$"
    description: "Unique identifier within protocol/step."
  label:
    type: string
    description: "Human-readable label."
  description:
    type: string
    description: "Optional description."
  type:
    type: string
    enum: [ string, number, boolean, duration, temperature, volume, select ]
    description: "Data type of the setting."
  defaultValue:
    description: "Default value if not overridden."
  isControlled:
    type: boolean
    default: false
    description: "If true, requires approval to change (controlled protocols)."
  isVariable:
    type: boolean
    default: true
    description: "If true, can be edited during execution."
  options:
    type: array
    description: "For type=select, list of allowed values."
    items:
      type: string
  unit:
    type: string
    description: "Unit hint (e.g., 'min', 'C', 'uL')."
  constraints:
    type: object
    description: "Numeric constraints."
    additionalProperties: false
    properties:
      minimum: { type: number }
      maximum: { type: number }
```

**Verification:**
```bash
# Test schema loads correctly
cd ~/git/computable-lab/server
node -e "
import { SchemaRegistry } from './src/schema/SchemaRegistry.js';
const reg = new SchemaRegistry();
await reg.loadAll();
console.log('Setting schema loaded:', reg.has('https://computable-lab.com/schema/computable-lab/setting.schema.yaml'));
"
```

**Commit:**
```bash
git add schema/workflow/setting.schema.yaml
git commit -m "feat: add Setting schema for step-level editable parameters"
```

---

#### Task 1.2: Extend Protocol Schema with Steps → Sub-Graphs Mapping
**Objective:** Add explicit steps array with mapping to sub-event-graphs

**Files:**
- Modify: `schema/workflow/protocol.schema.yaml`

**Changes:**
Add to Protocol properties:
```yaml
  steps:
    type: array
    description: "Ordered protocol steps. Each step can map to a sub-event-graph."
    minItems: 1
    items:
      $ref: "#/$defs/ProtocolStep"

$defs:
  ProtocolStep:
    type: object
    additionalProperties: false
    required: [ stepId, label, ordinal ]
    properties:
      stepId:
        type: string
        pattern: "^[a-z][a-z0-9-]*$"
        description: "Unique step identifier within protocol."
      label:
        type: string
        description: "Human-readable step label (e.g., 'Incubate on shaker')."
      description:
        type: string
        description: "Optional step description."
      ordinal:
        type: integer
        minimum: 1
        description: "Display order (1-based)."
      phaseId:
        type: string
        description: "Reference to parent phase (if protocol has phases)."
      subGraphRef:
        $ref: "./datatypes/ref.schema.yaml"
        description: "Optional reference to a graph-component-instance or event-graph that represents this step's sub-graph."
      settings:
        type: array
        description: "Settings (editable parameters) for this step."
        items:
          $ref: "./setting.schema.yaml"
      executionMeta:
        type: object
        description: "Execution metadata for this step."
        additionalProperties: false
        properties:
          startedAt:
            type: string
            format: date-time
          completedAt:
            type: string
            format: date-time
          executedBy:
            type: string
            description: "Operator identifier."
          deviations:
            type: array
            items:
              $ref: "../workflow/execution-deviation.schema.yaml"
      isOptional:
        type: boolean
        default: false
        description: "If true, step can be skipped during execution."
```

**Verification:**
```bash
cd ~/git/computable-lab/app
pnpm run typecheck
# Should pass with no errors in protocol.schema.yaml
```

**Commit:**
```bash
git add schema/workflow/protocol.schema.yaml
git commit -m "feat: add ProtocolStep with subGraphRef and settings"
```

---

#### Task 1.3: Extend Run Schema with Planned/Executed Event Graphs
**Objective:** Add explicit plannedEventGraphId and executedEventGraphId fields

**Files:**
- Modify: `schema/studies/run.schema.yaml`

**Changes:**
Add to Run properties:
```yaml
  plannedEventGraphId:
    type: string
    description: "Event graph representing the planned execution (before execution starts)."
  executedEventGraphId:
    type: string
    description: "Event graph representing the actual execution (after completion or during execution)."
  protocolVersion:
    type: string
    description: "Version of the protocol used for this run (if protocol is versioned)."
  isControlled:
    type: boolean
    default: false
    description: "If true, run is based on a controlled protocol (limited editing)."
  executedBy:
    type: string
    description: "Operator who executed this run."
```

**Verification:**
```bash
# Test schema loads and validates
cd ~/git/computable-lab/server
node -e "
import { SchemaRegistry } from './src/schema/SchemaRegistry.js';
const reg = new SchemaRegistry();
await reg.loadAll();
const schema = reg.get('https://computable-lab.com/schema/computable-lab/run.schema.yaml');
console.log('Run schema has plannedEventGraphId:', !!schema.schema.properties.plannedEventGraphId);
console.log('Run schema has executedEventGraphId:', !!schema.schema.properties.executedEventGraphId);
"
```

**Commit:**
```bash
git add schema/studies/run.schema.yaml
git commit -m "feat: add plannedEventGraphId and executedEventGraphId to Run"
```

---

### Phase 2: Backend API Extensions

#### Task 2.1: Create Protocol Steps API
**Objective:** Add endpoints to manage protocol steps and their sub-graphs

**Files:**
- Create: `server/src/api/routes/protocol-steps.ts`

**Implementation:**
```typescript
import { FastifyInstance } from 'fastify';
import { z } from 'zod';

export async function protocolStepsRoutes(server: FastifyInstance) {
  // Get protocol steps
  server.get('/protocols/:protocolId/steps', {
    schema: {
      params: z.object({ protocolId: z.string() }),
    },
  }, async (request, reply) => {
    const { protocolId } = request.params;
    // TODO: Fetch protocol, return steps array with subGraphRefs
    return { steps: [] }; // Placeholder
  });

  // Update step sub-graph
  server.patch('/protocols/:protocolId/steps/:stepId/subgraph', {
    schema: {
      params: z.object({ 
        protocolId: z.string(),
        stepId: z.string() 
      }),
      body: z.object({
        subGraphRef: z.string().optional(),
        settings: z.record(z.any()).optional(),
      }),
    },
  }, async (request, reply) => {
    const { protocolId, stepId } = request.params;
    const { subGraphRef, settings } = request.body;
    // TODO: Update protocol step with subGraphRef and settings
    return { success: true };
  });

  // Get step sub-graph
  server.get('/protocols/:protocolId/steps/:stepId/subgraph', {
    schema: {
      params: z.object({ 
        protocolId: z.string(),
        stepId: z.string() 
      }),
    },
  }, async (request, reply) => {
    const { protocolId, stepId } = request.params;
    // TODO: Fetch sub-graph for this step
    return { events: [], labwares: [] }; // Placeholder
  });
}
```

**Verification:**
```bash
cd ~/git/computable-lab/server
pnpm run typecheck
# Should pass with no errors
```

**Commit:**
```bash
git add server/src/api/routes/protocol-steps.ts
git commit -m "feat: add protocol steps API endpoints"
```

---

#### Task 2.2: Create Run Execution API
**Objective:** Add endpoints to manage run lifecycle (planned → executing → completed)

**Files:**
- Modify: `server/src/api/routes/runs.ts`

**Implementation:**
```typescript
import { FastifyInstance } from 'fastify';
import { z } from 'zod';

export async function runExecutionRoutes(server: FastifyInstance) {
  // Start run execution
  server.post('/runs/:runId/start', {
    schema: {
      params: z.object({ runId: z.string() }),
      body: z.object({
        executedBy: z.string(),
        startedAt: z.string().datetime().optional(),
      }),
    },
  }, async (request, reply) => {
    const { runId } = request.params;
    const { executedBy, startedAt } = request.body;
    // TODO: Update run status to 'in_progress', set executedBy, startedAt
    return { success: true };
  });

  // Update step execution
  server.patch('/runs/:runId/steps/:stepId/execute', {
    schema: {
      params: z.object({ 
        runId: z.string(),
        stepId: z.string() 
      }),
      body: z.object({
        startedAt: z.string().datetime(),
        completedAt: z.string().datetime().optional(),
        deviations: z.array(z.object({
          code: z.string(),
          message: z.string(),
          severity: z.enum(['info', 'warning', 'error']),
        })).optional(),
        settings: z.record(z.any()).optional(),
      }),
    },
  }, async (request, reply) => {
    const { runId, stepId } = request.params;
    const { startedAt, completedAt, deviations, settings } = request.body;
    // TODO: Update step execution metadata in executed event graph
    return { success: true };
  });

  // Complete run execution
  server.post('/runs/:runId/complete', {
    schema: {
      params: z.object({ runId: z.string() }),
      body: z.object({
        completedAt: z.string().datetime(),
        executedEventGraphId: z.string(),
      }),
    },
  }, async (request, reply) => {
    const { runId } = request.params;
    const { completedAt, executedEventGraphId } = request.body;
    // TODO: Update run status to 'completed', set executedEventGraphId
    return { success: true };
  });
}
```

**Verification:**
```bash
cd ~/git/computable-lab/server
pnpm run typecheck
# Should pass with no errors
```

**Commit:**
```bash
git add server/src/api/routes/runs.ts
git commit -m "feat: add run execution lifecycle API endpoints"
```

---

### Phase 3: Frontend - Protocol Tab

#### Task 3.1: Add Protocol Tab to Right Pane
**Objective:** Add "Protocol" tab to right pane that shows when viewing a run

**Files:**
- Modify: `app/src/event-editor/workspace/types.ts`
- Modify: `app/src/event-editor/workspace/reducer.ts`
- Create: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`
- Modify: `app/src/event-editor/right-pane/RightPane.tsx`

**Changes:**

**types.ts:**
```typescript
export type WorkspaceRightPaneMode = 
  | 'ai' 
  | 'search' 
  | 'find' 
  | 'details' 
  | 'protocol'  // NEW
  | 'execution' // Already exists from Task 1
```

**ProtocolTabPanel.tsx:**
```typescript
import { useState, useEffect } from 'react';
import { useWorkspace } from '../../workspace/WorkspaceContext';
import { useExecution } from '../../execution/ExecutionContext';
import { apiClient } from '../../../shared/api/client';

interface ProtocolStep {
  stepId: string;
  label: string;
  description?: string;
  ordinal: number;
  subGraphRef?: string;
  settings?: Array<{
    settingId: string;
    label: string;
    type: string;
    defaultValue?: any;
    isControlled: boolean;
    isVariable: boolean;
  }>;
  executionMeta?: {
    startedAt?: string;
    completedAt?: string;
    executedBy?: string;
    deviations?: any[];
  };
  isOptional?: boolean;
}

export function ProtocolTabPanel({ runId }: { runId: string }) {
  const [steps, setSteps] = useState<ProtocolStep[]>([]);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const ws = useWorkspace();
  const { state: executionState } = useExecution();

  useEffect(() => {
    // Fetch protocol steps for this run
    async function loadSteps() {
      try {
        const response = await apiClient.get(`/api/protocols/${runId}/steps`);
        setSteps(response.steps);
      } catch (error) {
        console.error('Failed to load protocol steps:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadSteps();
  }, [runId]);

  const handleStepClick = (stepId: string) => {
    setActiveStepId(stepId);
    // TODO: Highlight this step's events in the deck
  };

  const handleToggleVisibility = (stepId: string) => {
    // TODO: Ghost/unghost this step's events on the deck
    const step = steps.find(s => s.stepId === stepId);
    if (step?.subGraphRef) {
      // Toggle visibility of events from this sub-graph
    }
  };

  const handlePlayStep = (stepId: string) => {
    // TODO: Open modal to capture execution timestamp and settings
    const step = steps.find(s => s.stepId === stepId);
    // Open execution modal for this step
  };

  const handlePlayAll = async () => {
    // TODO: Play all steps in sequence, capturing timestamps
    for (const step of steps) {
      // Simulate step execution
      await new Promise(resolve => setTimeout(resolve, 1000));
      // TODO: Update execution state for each step
    }
  };

  if (isLoading) {
    return <div style={{ padding: '16px' }}>Loading protocol steps...</div>;
  }

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '14px' }}>Protocol Steps</h3>
        <button
          onClick={handlePlayAll}
          style={{
            padding: '6px 12px',
            background: 'var(--cl-accent)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          Play All
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {steps.map((step) => (
          <div
            key={step.stepId}
            style={{
              padding: '12px',
              background: activeStepId === step.stepId ? 'var(--cl-bg-elev-2)' : 'var(--cl-bg-elev)',
              border: `1px solid ${activeStepId === step.stepId ? 'var(--cl-accent)' : 'var(--cl-border)'}`,
              borderRadius: '6px',
              cursor: 'pointer',
            }}
            onClick={() => handleStepClick(step.stepId)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: '13px' }}>
                  Step {step.ordinal}: {step.label}
                </div>
                {step.description && (
                  <div style={{ fontSize: '12px', color: 'var(--cl-text-dim)' }}>
                    {step.description}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', fontSize: '12px' }}>
                  <input
                    type="checkbox"
                    checked={true} // TODO: Track visibility state
                    onChange={() => handleToggleVisibility(step.stepId)}
                    style={{ marginRight: '4px' }}
                  />
                  View
                </label>
                <button
                  onClick={(e) => { e.stopPropagation(); handlePlayStep(step.stepId); }}
                  style={{
                    padding: '4px 8px',
                    background: 'var(--cl-primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px',
                  }}
                >
                  ▶ Play
                </button>
              </div>
            </div>

            {/* Settings section */}
            {step.settings && step.settings.length > 0 && (
              <div style={{ marginTop: '8px', padding: '8px', background: 'var(--cl-bg)', borderRadius: '4px' }}>
                <div style={{ fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>Settings:</div>
                {step.settings.map(setting => (
                  <div key={setting.settingId} style={{ fontSize: '12px', marginBottom: '2px' }}>
                    {setting.label}: {setting.defaultValue}
                    {setting.isControlled && <span style={{ color: 'var(--cl-error)' }}> 🔒</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Execution metadata */}
            {step.executionMeta && (
              <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--cl-text-dim)' }}>
                Executed: {new Date(step.executionMeta.startedAt!).toLocaleString()}
                {step.executionMeta.executedBy && ` by ${step.executionMeta.executedBy}`}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

**RightPane.tsx:**
```typescript
// Add import
import { ProtocolTabPanel } from './protocol/ProtocolTabPanel';

// Add to TABS array
const TABS: { mode: WorkspaceRightPaneMode; label: string }[] = [
  { mode: 'ai', label: 'AI' },
  { mode: 'find', label: 'Find' },
  { mode: 'search', label: 'Search' },
  { mode: 'details', label: 'Details' },
  { mode: 'protocol', label: 'Protocol' },  // NEW
];

// Add to render
{active === 'protocol' ? <ProtocolTabPanel runId={/* pass runId from props */} /> : null}
```

**Verification:**
```bash
cd ~/git/computable-lab/app
pnpm run typecheck
# Should pass with no errors
```

**Commit:**
```bash
git add app/src/event-editor/workspace/types.ts app/src/event-editor/workspace/reducer.ts app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx app/src/event-editor/right-pane/RightPane.tsx
git commit -m "feat: add Protocol tab with step chips and visibility toggles"
```

---

### Phase 4: Frontend - Step Execution & Settings

#### Task 4.1: Create Step Execution Modal
**Objective:** Modal for capturing step execution timestamp and editing settings

**Files:**
- Create: `app/src/components/StepExecutionModal.tsx`

**Implementation:**
```typescript
import { useState } from 'react';
import { createPortal } from 'react-dom';

interface StepExecutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    stepId: string;
    startedAt: string;
    completedAt?: string;
    settings?: Record<string, any>;
    deviations?: Array<{
      code: string;
      message: string;
      severity: 'info' | 'warning' | 'error';
    }>;
  }) => void;
  step: {
    stepId: string;
    label: string;
    settings?: Array<{
      settingId: string;
      label: string;
      type: string;
      defaultValue?: any;
      isControlled: boolean;
      options?: string[];
      unit?: string;
    }>;
  };
}

export function StepExecutionModal({ isOpen, onClose, onSubmit, step }: StepExecutionModalProps) {
  const [startedAt, setStartedAt] = useState(new Date().toISOString().slice(0, 16));
  const [completedAt, setCompletedAt] = useState('');
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [deviations, setDeviations] = useState<Array<{
    code: string;
    message: string;
    severity: 'info' | 'warning' | 'error';
  }>>([]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      stepId: step.stepId,
      startedAt: new Date(startedAt).toISOString(),
      completedAt: completedAt ? new Date(completedAt).toISOString() : undefined,
      settings: Object.keys(settings).length > 0 ? settings : undefined,
      deviations: deviations.length > 0 ? deviations : undefined,
    });
    onClose();
  };

  const handleSettingChange = (settingId: string, value: any) => {
    setSettings(prev => ({ ...prev, [settingId]: value }));
  };

  return createPortal(
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--cl-bg)',
        padding: '24px',
        borderRadius: '8px',
        width: '600px',
        maxWidth: '90%',
        maxHeight: '90vh',
        overflow: 'auto',
      }}>
        <h2 style={{ marginBottom: '16px' }}>Execute Step: {step.label}</h2>
        
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500, fontSize: '14px' }}>
                Start Time *
              </label>
              <input
                type="datetime-local"
                value={startedAt}
                onChange={(e) => setStartedAt(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid var(--cl-border)',
                  borderRadius: '4px',
                  background: 'var(--cl-bg-muted)',
                  color: 'var(--cl-text)',
                }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500, fontSize: '14px' }}>
                End Time (optional)
              </label>
              <input
                type="datetime-local"
                value={completedAt}
                onChange={(e) => setCompletedAt(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid var(--cl-border)',
                  borderRadius: '4px',
                  background: 'var(--cl-bg-muted)',
                  color: 'var(--cl-text)',
                }}
              />
            </div>
          </div>

          {/* Settings section */}
          {step.settings && step.settings.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ marginBottom: '12px', fontSize: '14px' }}>Settings:</h4>
              <div style={{ display: 'grid', gap: '12px' }}>
                {step.settings.map(setting => (
                  <div key={setting.settingId}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
                      {setting.label}
                      {setting.isControlled && <span style={{ color: 'var(--cl-error)' }}> 🔒</span>}
                      {setting.unit && <span style={{ marginLeft: '4px', color: 'var(--cl-text-dim)' }}>({setting.unit})</span>}
                    </label>
                    
                    {setting.type === 'select' ? (
                      <select
                        value={settings[setting.settingId] ?? setting.defaultValue}
                        onChange={(e) => handleSettingChange(setting.settingId, e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid var(--cl-border)',
                          borderRadius: '4px',
                          background: 'var(--cl-bg-muted)',
                          color: 'var(--cl-text)',
                        }}
                      >
                        <option value="">Select...</option>
                        {setting.options?.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : setting.type === 'number' || setting.type === 'temperature' || setting.type === 'volume' ? (
                      <input
                        type="number"
                        step="any"
                        value={settings[setting.settingId] ?? setting.defaultValue}
                        onChange={(e) => handleSettingChange(setting.settingId, parseFloat(e.target.value))}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid var(--cl-border)',
                          borderRadius: '4px',
                          background: 'var(--cl-bg-muted)',
                          color: 'var(--cl-text)',
                        }}
                      />
                    ) : (
                      <input
                        type="text"
                        value={settings[setting.settingId] ?? setting.defaultValue}
                        onChange={(e) => handleSettingChange(setting.settingId, e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid var(--cl-border)',
                          borderRadius: '4px',
                          background: 'var(--cl-bg-muted)',
                          color: 'var(--cl-text)',
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deviations section */}
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ marginBottom: '12px', fontSize: '14px' }}>Deviations (optional):</h4>
            {deviations.map((dev, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <select
                  value={dev.code}
                  onChange={(e) => {
                    const newDeviations = [...deviations];
                    newDeviations[idx].code = e.target.value;
                    setDeviations(newDeviations);
                  }}
                  style={{
                    padding: '6px',
                    border: '1px solid var(--cl-border)',
                    borderRadius: '4px',
                    background: 'var(--cl-bg-muted)',
                    color: 'var(--cl-text)',
                  }}
                >
                  <option value="">Select code...</option>
                  <option value="insufficient_volume">Insufficient volume</option>
                  <option value="contamination_suspected">Contamination suspected</option>
                  <option value="step_skipped">Step skipped</option>
                  <option value="manual_intervention">Manual intervention</option>
                  <option value="timing_deviation">Timing deviation</option>
                  <option value="equipment_malfunction">Equipment malfunction</option>
                  <option value="sample_lost">Sample lost</option>
                  <option value="other">Other</option>
                </select>
                <input
                  type="text"
                  value={dev.message}
                  onChange={(e) => {
                    const newDeviations = [...deviations];
                    newDeviations[idx].message = e.target.value;
                    setDeviations(newDeviations);
                  }}
                  placeholder="Description"
                  style={{
                    padding: '6px',
                    border: '1px solid var(--cl-border)',
                    borderRadius: '4px',
                    background: 'var(--cl-bg-muted)',
                    color: 'var(--cl-text)',
                  }}
                />
                <select
                  value={dev.severity}
                  onChange={(e) => {
                    const newDeviations = [...deviations];
                    newDeviations[idx].severity = e.target.value as any;
                    setDeviations(newDeviations);
                  }}
                  style={{
                    padding: '6px',
                    border: '1px solid var(--cl-border)',
                    borderRadius: '4px',
                    background: 'var(--cl-bg-muted)',
                    color: 'var(--cl-text)',
                  }}
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                </select>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setDeviations([...deviations, { code: '', message: '', severity: 'info' }])}
              style={{
                padding: '4px 8px',
                background: 'transparent',
                border: '1px dashed var(--cl-border)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              + Add Deviation
            </button>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid var(--cl-border)',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: '8px 16px',
                background: 'var(--cl-primary)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              {completedAt ? 'Complete Step' : 'Start Step'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
```

**Verification:**
```bash
cd ~/git/computable-lab/app
pnpm run typecheck
# Should pass with no errors
```

**Commit:**
```bash
git add app/src/components/StepExecutionModal.tsx
git commit -m "feat: add StepExecutionModal with settings and deviations"
```

---

### Phase 5: Integration & Testing

#### Task 5.1: Integrate Protocol Tab with Run Workspace
**Objective:** Wire up Protocol tab to show when viewing a run

**Files:**
- Modify: `app/src/run/RunWorkspacePage.tsx`
- Modify: `app/src/event-editor/projects/ProjectWorkspacePage.tsx`

**Implementation:**
```typescript
// RunWorkspacePage.tsx - Add protocol tab handling
// When a run is active, set right pane mode to 'protocol'
// Pass runId to ProtocolTabPanel
```

**Verification:**
```bash
cd ~/git/computable-lab/app
pnpm run typecheck
# Should pass with no errors
```

**Commit:**
```bash
git add app/src/run/RunWorkspacePage.tsx app/src/event-editor/projects/ProjectWorkspacePage.tsx
git commit -m "feat: integrate Protocol tab with run workspace"
```

---

## Testing Strategy

### Unit Tests
- Test schema validation for Setting, ProtocolStep, Run extensions
- Test ProtocolTabPanel renders steps correctly
- Test StepExecutionModal form validation
- Test settings editing and deviation capture

### Integration Tests
- Test full execution flow: create run → view protocol → play steps → capture execution
- Test planned vs executed event graph distinction
- Test settings editing with controlled vs variable settings
- Test deviation recording and diff between planned/executed

### Manual Testing Checklist
- [ ] Protocol tab appears when viewing a run
- [ ] Steps display with visibility toggles
- [ ] Clicking step highlights events in deck
- [ ] Play button opens execution modal
- [ ] Settings can be edited (variable) or locked (controlled)
- [ ] Deviations can be recorded
- [ ] Play all executes steps in sequence
- [ ] Planned vs executed view switching works
- [ ] User selection defaults to current user

---

## Risks and Tradeoffs

### Risks
1. **Schema complexity**: Adding steps, settings, and sub-graphs increases schema complexity
2. **Performance**: Rendering many steps with sub-graphs could impact performance
3. **Backward compatibility**: Existing runs without steps need migration path
4. **Controlled protocols**: Need approval workflow for changing controlled settings

### Mitigations
1. Start with minimal schema, add complexity incrementally
2. Virtualize step list if many steps (>50)
3. Provide migration script to create default step for existing runs
4. Implement simple approval workflow first (admin-only), expand later

### Tradeoffs
1. **Sub-graphs vs flat events**: Sub-graphs are cleaner but add complexity; start with flat events, add sub-graphs later
2. **Settings vs parameters**: Settings are step-specific, parameters are protocol-level; keep them separate but linked
3. **Deviation records vs inline**: Inline deviations are simpler, separate records are more FAIR; start inline, migrate later

---

## Open Questions

1. **How to handle step reordering?** Should ordinal be mutable, or should steps be immutable once created?
2. **What is the exact diff algorithm for planned vs executed?** Event-by-event comparison, or just metadata differences?
3. **How to handle partial execution?** If execution stops mid-way, how to mark incomplete steps?
4. **Should settings have versioning?** If a setting changes, do we track history?
5. **How to integrate with existing AI features?** Should AI suggest settings or deviations?

---

## Next Steps After Implementation

1. **Add approval workflow** for controlled settings
2. **Implement diff engine** for planned vs executed event graphs
3. **Add step reordering** and editing in protocol design mode
4. **Integrate with instrument APIs** for automated data capture
5. **Add execution analytics** (timing, deviation patterns, success rates)
6. **Implement step templates** for common operations (incubation, dilution, etc.)

---

**Plan complete and saved.** Ready to execute using subagent-driven-development — I'll dispatch a fresh subagent per task with two-stage review (spec compliance then code quality). Shall I proceed?
