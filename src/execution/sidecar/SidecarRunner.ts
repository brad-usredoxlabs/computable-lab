import { spawn } from 'node:child_process';

export type SidecarTarget =
  | 'opentrons_ot2'
  | 'opentrons_flex'
  | 'integra_assist'
  | 'agilent_6890n_gc'
  | 'metrohm_761_ic'
  | 'abi_7500_qpcr'
  | 'molecular_devices_gemini';

export type SidecarInvocation = {
  target: SidecarTarget;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  timeoutMs?: number;
};

export type SidecarResult = {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
};

export class SidecarRunner {
  async run(invocation: SidecarInvocation): Promise<SidecarResult> {
    return new Promise((resolve) => {
      const child = spawn(invocation.command, invocation.args ?? [], {
        env: { ...process.env, ...(invocation.env ?? {}) },
        cwd: invocation.cwd,
      });

      let stdout = '';
      let stderr = '';
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          child.kill('SIGTERM');
        }
      }, invocation.timeoutMs ?? 120_000);

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('close', (exitCode) => {
        clearTimeout(timeout);
        if (resolved) return;
        resolved = true;
        resolve({
          ok: exitCode === 0,
          exitCode: exitCode ?? -1,
          stdout,
          stderr,
        });
      });
      child.on('error', (err) => {
        clearTimeout(timeout);
        if (resolved) return;
        resolved = true;
        resolve({
          ok: false,
          exitCode: -1,
          stdout,
          stderr: `${stderr}\n${err.message}`.trim(),
        });
      });
    });
  }
}
