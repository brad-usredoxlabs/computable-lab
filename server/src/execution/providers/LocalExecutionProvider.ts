import type { AppContext } from '../../server.js';
import { ExecutionRunner } from '../ExecutionRunner.js';
import type { ExecutionProvider, ExecuteRobotPlanOptions, ExecuteRobotPlanResult } from './ExecutionProvider.js';

export class LocalExecutionProvider implements ExecutionProvider {
  private readonly runner: ExecutionRunner;

  constructor(ctx: AppContext, runner?: ExecutionRunner) {
    this.runner = runner ?? new ExecutionRunner(ctx);
  }

  descriptor(): { kind: 'local'; mode: 'local' | 'remote' | 'hybrid' } {
    return { kind: 'local', mode: 'local' };
  }

  async executeRobotPlan(robotPlanId: string, options?: ExecuteRobotPlanOptions): Promise<ExecuteRobotPlanResult> {
    const result = await this.runner.executeRobotPlan(robotPlanId, options);
    return {
      ...result,
      provider: 'local',
    };
  }
}
