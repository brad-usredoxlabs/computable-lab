export type ExecutionProviderKind = 'local' | 'remote';

export type ExecuteRobotPlanOptions = {
  parentExecutionRunId?: string;
  parameters?: Record<string, unknown>;
};

export type ExecuteRobotPlanResult = {
  executionRunId: string;
  logId?: string;
  taskId?: string;
  status: 'queued' | 'completed' | 'error';
  provider: ExecutionProviderKind;
};

export interface ExecutionProvider {
  descriptor(): { kind: ExecutionProviderKind; mode: 'local' | 'remote' | 'hybrid' };
  executeRobotPlan(robotPlanId: string, options?: ExecuteRobotPlanOptions): Promise<ExecuteRobotPlanResult>;
}
