import type { AppContext } from '../../server.js';
import { ExecutionTaskService } from '../ExecutionTaskService.js';
import type { ExecutionProvider, ExecuteRobotPlanResult } from './ExecutionProvider.js';
import type { ExecuteRobotPlanOptions } from './ExecutionProvider.js';

export class RemoteExecutionProvider implements ExecutionProvider {
  private readonly tasks: ExecutionTaskService;

  constructor(ctx: AppContext) {
    this.tasks = new ExecutionTaskService(ctx);
  }

  descriptor(): { kind: 'remote'; mode: 'local' | 'remote' | 'hybrid' } {
    return { kind: 'remote', mode: 'remote' };
  }

  async executeRobotPlan(robotPlanId: string, options?: ExecuteRobotPlanOptions): Promise<ExecuteRobotPlanResult> {
    const queued = await this.tasks.createQueuedTask({
      robotPlanId,
      ...(options?.parameters ? { runtimeParameters: options.parameters } : {}),
      ...(options?.parentExecutionRunId ? { parentExecutionRunId: options.parentExecutionRunId } : {}),
    });
    return {
      executionRunId: queued.executionRunId,
      taskId: queued.taskId,
      status: 'queued',
      provider: 'remote',
    };
  }
}
