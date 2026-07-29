import { useState, useCallback } from 'react';
import { useWorkspace } from '../../workspace/WorkspaceContext';
import { useExecution, ExecutionProvider } from '../../execution/ExecutionContext';
import { ExecutionModal } from '../../../components/ExecutionModal';

export interface ProtocolStep {
  id: string;
  number: number;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'error';
}

export interface ExecutionTabPanelProps {
  studyId: string;
}

const MOCK_STEPS: ProtocolStep[] = [
  { id: 'step-1', number: 1, description: 'Prepare cell culture plates', status: 'completed' },
  { id: 'step-2', number: 2, description: 'Apply treatment conditions', status: 'completed' },
  { id: 'step-3', number: 3, description: 'Incubate for specified duration', status: 'pending' },
  { id: 'step-4', number: 4, description: 'Perform imaging acquisition', status: 'pending' },
  { id: 'step-5', number: 5, description: 'Extract and analyze features', status: 'pending' },
];

const statusColors: Record<ProtocolStep['status'], string> = {
  pending: 'var(--cl-text-dim)',
  running: 'var(--cl-accent)',
  completed: '#4ade80',
  error: '#f87171',
};

/**
 * Inner panel that uses both workspace and execution context.
 */
function ExecutionTabPanelInner({ studyId }: ExecutionTabPanelProps) {
  const [steps, setSteps] = useState<ProtocolStep[]>(MOCK_STEPS);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingStep, setPendingStep] = useState<ProtocolStep | null>(null);
  const ws = useWorkspace();
  const { state: execState, startExecution } = useExecution();

  const handleExecuteClick = useCallback((stepId: string) => {
    const step = MOCK_STEPS.find(s => s.id === stepId) ?? steps.find(s => s.id === stepId);
    if (step) {
      setPendingStep(step);
      setModalOpen(true);
    }
  }, [steps]);

  const handleModalSubmit = useCallback((data: {
    executionName: string;
    operatorName: string;
    notes: string;
    timestamp: string;
  }) => {
    setModalOpen(false);

    // Determine the active deck tab's eventGraphId, if any
    const activeTab = ws.state.tabs.find((t: any) => t.id === ws.state.activeTabId);
    const eventGraphId = activeTab?.kind === 'deck' ? activeTab.eventGraphId : `eg-${studyId}`;

    startExecution(
      { executionName: data.executionName, operatorName: data.operatorName, notes: data.notes },
      studyId,
      eventGraphId,
    );

    // Open execution tab in workspace
    const tabId = `execution:${eventGraphId}`;
    ws.openTab({
      id: tabId,
      kind: 'execution',
      eventGraphId: eventGraphId || `eg-${studyId}`,
      runId: studyId,
      title: data.executionName,
    });

    // Simulate step status update for the pending step
    if (pendingStep) {
      setSteps(prev =>
        prev.map(s =>
          s.id === pendingStep.id ? { ...s, status: 'running' as const } : s
        )
      );
      setTimeout(() => {
        setSteps(prev =>
          prev.map(s =>
            s.id === pendingStep.id ? { ...s, status: 'completed' as const } : s
          )
        );
      }, 1500);
    }
    setPendingStep(null);
  }, [studyId, ws, startExecution, pendingStep]);

  return (
    <>
      <div style={{ padding: '16px' }}>
        <h3 style={{ fontSize: '14px', marginBottom: '4px' }}>Protocol Execution</h3>
        <p style={{ fontSize: '12px', color: 'var(--cl-text-dim)', marginBottom: '16px' }}>
          Study: {studyId}
        </p>

        {execState.isActive && execState.metadata && (
          <div style={{ marginBottom: '12px', padding: '8px 12px', background: 'var(--cl-bg-elev-2)', borderRadius: '6px', fontSize: '12px', color: 'var(--cl-text-dim)' }}>
            <span style={{ fontWeight: 600, color: 'var(--cl-text)' }}>{execState.metadata.executionName}</span>
            {' '}· Operator: {execState.metadata.operatorName}
            {execState.executionId && (
              <span style={{ marginLeft: '8px', fontFamily: 'monospace', fontSize: '10px' }}>
                {execState.executionId}
              </span>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {steps.map((step) => (
            <div
              key={step.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 12px',
                borderRadius: '6px',
                border: `1px solid var(--cl-border)`,
                background: step.status === 'running' ? 'var(--cl-bg-elev-2)' : 'var(--cl-bg-elev)',
                opacity: step.status === 'completed' ? 0.7 : 1,
              }}
            >
              {/* Step number with status indicator */}
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  color: '#fff',
                  background: statusColors[step.status],
                  flexShrink: 0,
                }}
              >
                {step.status === 'completed' ? '✓' : step.number}
              </div>

              {/* Step description */}
              <span style={{ fontSize: '13px', flex: 1 }}>{step.description}</span>

              {/* Execute button */}
              {step.status !== 'completed' && (
                <button
                  className="cl-btn"
                  style={{
                    padding: '4px 12px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: 'var(--cl-accent)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: step.status === 'running' ? 'wait' : 'pointer',
                    opacity: step.status === 'running' ? 0.6 : 1,
                  }}
                  onClick={() => handleExecuteClick(step.id)}
                  disabled={step.status === 'running'}
                >
                  {step.status === 'running' ? 'Running...' : 'Execute'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Execution metadata modal */}
      <ExecutionModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setPendingStep(null); }}
        onSubmit={handleModalSubmit}
      />
    </>
  );
}

/**
 * ExecutionTabPanel — wrapped in ExecutionProvider so children can call useExecution().
 */
export function ExecutionTabPanel({ studyId }: ExecutionTabPanelProps) {
  return (
    <ExecutionProvider>
      <ExecutionTabPanelInner studyId={studyId} />
    </ExecutionProvider>
  );
}
