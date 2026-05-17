#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  readFoundryLoopRuntimeStatus,
  writeFoundryLoopRuntimeStop,
  type FoundryLoopRuntimeStatus,
} from '../foundry/FoundryManifest.js';

export type FoundryLoopControlCommand = 'status' | 'start' | 'stop' | 'restart';
export type FoundryLoopProfile = 'full' | 'review';

const OPTION_ARGS = [
  '--workbench-root',
  '--worker-base-url',
  '--worker-model',
  '--architect-base-url',
  '--architect-model',
  '--api-base',
  '--app-base',
  '--max-concurrency',
  '--max-cycles',
  '--poll-ms',
  '--pdf-intake-batch-size',
] as const;

const FLAG_ARGS = [
  '--watch',
  '--skip-browser',
  '--improvement-mode',
  '--apply-patches',
  '--auto-commit-patches',
  '--auto-push-patches',
  '--no-pdf-intake',
  '--no-review-index',
  '--dry-run',
] as const;

export interface FoundryLoopStartPlan {
  artifactRoot: string;
  repoRoot: string;
  logPath: string;
  profile: FoundryLoopProfile;
  loopArgs: string[];
  command: string;
}

export interface FoundryLoopControlResult {
  success: true;
  command: FoundryLoopControlCommand;
  status: FoundryLoopRuntimeStatus;
  started?: {
    pid: number;
    logPath: string;
    command: string;
  };
  stopped?: {
    pid: number;
    signal: 'SIGTERM' | 'SIGKILL' | 'none';
  };
  message?: string;
}

function readArg(name: string, args: string[]): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

function hasFlag(name: string, args: string[]): boolean {
  return args.includes(name);
}

function usage(): string {
  return [
    'Usage: npm --prefix server run foundry:loop-control -- <status|start|stop|restart> --artifact-root <dir> [options]',
    '',
    'Commands:',
    '  status                       Print loop runtime metadata and liveness.',
    '  start                        Start a detached Foundry loop if one is not already running.',
    '  stop                         Stop the recorded loop PID with SIGTERM.',
    '  restart                      Stop the recorded loop if needed, then start a detached loop.',
    '',
    'Options:',
    '  --repo-root <dir>            computable-foundry root. Default: parent of server cwd.',
    '  --profile <full|review>      Default: full.',
    '  --log-path <path>            Default: <artifact-root>/manifests/foundry-loop.log.',
    '  --force                      Allow start despite a running PID; use SIGKILL if stop does not exit.',
    '',
    'Loop options are forwarded: endpoints/models, max-cycles, watch, skip-browser, improvement-mode, apply-patches, auto-commit, and PDF intake flags.',
  ].join('\n');
}

export function defaultFoundryLoopLogPath(artifactRoot: string): string {
  return join(artifactRoot, 'manifests', 'foundry-loop.log');
}

function addFlag(args: string[], flag: string): void {
  if (!args.includes(flag)) args.push(flag);
}

function addOption(args: string[], name: string, value: string | undefined): void {
  if (!value || args.includes(name)) return;
  args.push(name, value);
}

function profileFlags(profile: FoundryLoopProfile): string[] {
  if (profile === 'review') {
    return ['--watch', '--skip-browser'];
  }
  return ['--watch', '--skip-browser', '--improvement-mode', '--apply-patches', '--auto-commit-patches'];
}

export function buildFoundryLoopStartPlan(input: {
  artifactRoot: string;
  repoRoot?: string;
  logPath?: string;
  profile?: string;
  controlArgs?: string[];
}): FoundryLoopStartPlan {
  const controlArgs = input.controlArgs ?? [];
  const profile = input.profile === 'review' ? 'review' : 'full';
  const repoRoot = input.repoRoot ?? resolve(process.cwd(), '..');
  const logPath = input.logPath ?? defaultFoundryLoopLogPath(input.artifactRoot);
  const loopArgs = [
    '--artifact-root',
    input.artifactRoot,
    '--repo-root',
    repoRoot,
    '--log-path',
    logPath,
  ];

  for (const flag of profileFlags(profile)) addFlag(loopArgs, flag);
  for (const name of OPTION_ARGS) addOption(loopArgs, name, readArg(name, controlArgs));
  for (const flag of FLAG_ARGS) {
    if (hasFlag(flag, controlArgs)) addFlag(loopArgs, flag);
  }

  return {
    artifactRoot: input.artifactRoot,
    repoRoot,
    logPath,
    profile,
    loopArgs,
    command: ['npx', 'tsx', 'src/tools/protocolFoundryLoop.ts', ...loopArgs].join(' '),
  };
}

function isPidRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = typeof err === 'object' && err && 'code' in err ? (err as { code?: unknown }).code : undefined;
    return code === 'EPERM';
  }
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isPidRunning(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return !isPidRunning(pid);
}

export async function stopFoundryLoop(artifactRoot: string, force = false): Promise<FoundryLoopControlResult> {
  const status = await readFoundryLoopRuntimeStatus(artifactRoot);
  if (!status.running || !status.pid) {
    return {
      success: true,
      command: 'stop',
      status,
      stopped: { pid: status.pid ?? 0, signal: 'none' },
      message: 'No running Foundry loop PID recorded.',
    };
  }

  process.kill(status.pid, 'SIGTERM');
  const exitedAfterTerm = await waitForExit(status.pid, 2500);
  if (!exitedAfterTerm && force) {
    process.kill(status.pid, 'SIGKILL');
    await waitForExit(status.pid, 1000);
  }

  const stillRunning = isPidRunning(status.pid);
  if (!stillRunning) {
    await writeFoundryLoopRuntimeStop(artifactRoot, 'stopped');
  }
  const nextStatus = await readFoundryLoopRuntimeStatus(artifactRoot);
  return {
    success: true,
    command: 'stop',
    status: nextStatus,
    stopped: {
      pid: status.pid,
      signal: !exitedAfterTerm && force ? 'SIGKILL' : 'SIGTERM',
    },
    ...(stillRunning ? { message: 'Foundry loop PID is still running.' } : {}),
  };
}

export async function startFoundryLoop(plan: FoundryLoopStartPlan, force = false): Promise<FoundryLoopControlResult> {
  const current = await readFoundryLoopRuntimeStatus(plan.artifactRoot);
  if (current.running && !force) {
    return {
      success: true,
      command: 'start',
      status: current,
      message: `Foundry loop already running as PID ${current.pid}. Use --force or restart.`,
    };
  }

  mkdirSync(dirname(plan.logPath), { recursive: true });
  const logFd = openSync(plan.logPath, 'a');
  try {
    const child = spawn('npx', ['tsx', 'src/tools/protocolFoundryLoop.ts', ...plan.loopArgs], {
      cwd: process.cwd(),
      detached: true,
      env: {
        ...process.env,
        FOUNDRY_LOOP_LOG_PATH: plan.logPath,
      },
      stdio: ['ignore', logFd, logFd],
    });
    child.unref();
    return {
      success: true,
      command: 'start',
      status: await readFoundryLoopRuntimeStatus(plan.artifactRoot),
      started: {
        pid: child.pid ?? 0,
        logPath: plan.logPath,
        command: plan.command,
      },
    };
  } finally {
    closeSync(logFd);
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (hasFlag('--help', args) || hasFlag('-h', args)) {
    console.log(usage());
    return 0;
  }
  const command = args[0] as FoundryLoopControlCommand | undefined;
  const artifactRoot = readArg('--artifact-root', args);
  if (!command || !['status', 'start', 'stop', 'restart'].includes(command) || !artifactRoot) {
    console.error(usage());
    return 2;
  }
  const force = hasFlag('--force', args);
  const repoRoot = readArg('--repo-root', args);
  const logPath = readArg('--log-path', args);
  const profile = readArg('--profile', args);

  if (command === 'status') {
    console.log(JSON.stringify({
      success: true,
      command,
      status: await readFoundryLoopRuntimeStatus(artifactRoot),
    }, null, 2));
    return 0;
  }

  if (command === 'stop') {
    console.log(JSON.stringify(await stopFoundryLoop(artifactRoot, force), null, 2));
    return 0;
  }

  if (command === 'restart') {
    await stopFoundryLoop(artifactRoot, true);
  }

  const plan = buildFoundryLoopStartPlan({
    artifactRoot,
    ...(repoRoot ? { repoRoot } : {}),
    ...(logPath ? { logPath } : {}),
    ...(profile ? { profile } : {}),
    controlArgs: args,
  });
  console.log(JSON.stringify(await startFoundryLoop(plan, force), null, 2));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.stack ?? error.message : String(error));
      process.exitCode = 1;
    },
  );
}
