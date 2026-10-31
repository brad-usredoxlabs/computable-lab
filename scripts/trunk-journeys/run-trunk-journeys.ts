#!/usr/bin/env tsx
/**
 * trunk-journeys — DRIVER (the single executable).
 *
 * Executes the journey YAML DATA against the lane-1 TRUNK stack that this
 * process spawns itself, over REAL transport. Hard rules baked in:
 *   - SELF-CHECK first (fail closed): scan the harness's own files for any
 *     banned /api/ai/** interception before ANYTHING runs.
 *   - Own-process lifecycle: spawn backend+frontend on FREE dedicated ports,
 *     tear down by RECORDED PID only (trap). Never touch the six reserved ports.
 *   - Writes land ONLY in the per-run throwaway dir (CL_DATA_DIR). The digest
 *     proof that ~/.computable-lab is unchanged rides run-meta.
 *   - Receipts under /home/brad/.hermes/cl/receipts/L1-TRUNK-JOURNEYS/<ts>/:
 *     journeys-verdict.json (machine-readable {result, journeys[]}), per-step
 *     log, screenshots, run-meta.json. Exit non-zero iff any journey is red.
 *
 * Journeys are DATA (journeys.l1.yaml); the driver is a dumb interpreter
 * (lib/journey.ts) — no per-step product policy here.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { loadJourneyFile, runStep, type RunnerCtx, type Journey, type JourneyFile } from './lib/journey.js';
import {
  pickFreePorts,
  materializeRunDirs,
  spawnStack,
  waitForBackend,
  waitForFrontend,
  killStack,
  dirDigest,
  RESERVED_PORTS,
  type RunDirs,
  type Ports,
  type SpawnedStack,
} from './lib/stack.js';
import { scanForBannedInterception, assertNoBannedInterception, type ScanFile } from './lib/selfcheck.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKTREE = resolve(HERE, '..', '..');

export interface CliArgs {
  help: boolean;
  journeys: string;
  receiptsHome: string;
  backendCandidates: number[];
  frontendCandidates: number[];
  selfCheckOnly: boolean;
  only: string[]; // run only these journey ids (default: all)
}

export const DEFAULT_ARGS: CliArgs = {
  help: false,
  journeys: join(HERE, 'journeys.l1.yaml'),
  receiptsHome: '/home/brad/.hermes/cl/receipts/L1-TRUNK-JOURNEYS',
  backendCandidates: [3094, 3095, 3096],
  frontendCandidates: [5194, 5195, 5196],
  selfCheckOnly: false,
  only: [],
};

export function parseArgs(argv: string[]): CliArgs {
  const a: CliArgs = { ...DEFAULT_ARGS, only: [], backendCandidates: [...DEFAULT_ARGS.backendCandidates], frontendCandidates: [...DEFAULT_ARGS.frontendCandidates] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--help':
      case '-h':
        a.help = true;
        break;
      case '--journeys':
        a.journeys = argv[++i] ?? a.journeys;
        break;
      case '--receipts':
        a.receiptsHome = argv[++i] ?? a.receiptsHome;
        break;
      case '--backend-port':
        a.backendCandidates = [parseInt(argv[++i] ?? '3094', 10)];
        break;
      case '--frontend-port':
        a.frontendCandidates = [parseInt(argv[++i] ?? '5194', 10)];
        break;
      case '--self-check-only':
        a.selfCheckOnly = true;
        break;
      case '--only':
        a.only = argv[++i]?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
        break;
      default:
        throw new Error(`unknown arg: ${arg} (run with --help)`);
    }
  }
  return a;
}

export function helpText(): string {
  return [
    'trunk-journeys driver — run the lane-1 GC journeys over REAL transport.',
    '',
    'usage: npx tsx run-trunk-journeys.ts [options]',
    '',
    'options:',
    '  --journeys <path>          journey YAML (default: journeys.l1.yaml beside this file)',
    '  --receipts <dir>           receipts home (default: /home/brad/.hermes/cl/receipts/L1-TRUNK-JOURNEYS)',
    '  --backend-port <n>         preferred backend port (default 3094; probes free, else +1..)',
    '  --frontend-port <n>        preferred frontend port (default 5194; probes free, else +1..)',
    '  --only <J1,J2>             run only these journey ids (default: all)',
    '  --self-check-only          run the banned-/api/ai self-check and exit (no stack)',
    '  --help, -h                 this help',
    '',
    'exit code: 0 iff every journey is green (and the self-check passed); non-zero otherwise.',
    'The receipt set\'s journeys-verdict.json is the machine-readable RED-BLOCKS-CLAIMS signal.',
  ].join('\n');
}

/** Scan the whole harness dir (this dir, recursively) for banned interception. */
async function collectHarnessFiles(root: string): Promise<ScanFile[]> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const pExecFile = promisify(execFile);
  const { stdout } = await pExecFile('sh', ['-c', `find '${root}' -type f \\( -name '*.ts' -o -name '*.yaml' -o -name '*.mjs' -o -name '*.js' \\) -not -path '*/node_modules/*' -print`]);
  const files: ScanFile[] = [];
  for (const line of stdout.split('\n').map((l) => l.trim()).filter(Boolean)) {
    if (!existsSync(line)) continue;
    files.push({ path: line, content: await readFile(line, 'utf8') });
  }
  return files;
}

function tsStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '').slice(0, 15); // 20261031T120000Z-ish
}

interface JourneyResult {
  id: string;
  result: 'green' | 'red';
  failed_step: string | null;
  error?: string;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  if (args.help) {
    console.log(helpText());
    return 0;
  }

  // ---- SELF-CHECK (fail closed, before ANYTHING else) ----
  const harnessFiles = await collectHarnessFiles(HERE);
  const violations = scanForBannedInterception(harnessFiles);
  assertNoBannedInterception(violations); // throws (non-zero) on any banned interception
  console.log(`[self-check] OK — ${harnessFiles.length} harness files scanned, 0 banned /api/ai/** interceptions`);
  if (args.selfCheckOnly) {
    console.log('[self-check] --self-check-only: passing (no stack spawned)');
    return 0;
  }

  // ---- receipt dir ----
  const ts = tsStamp();
  const runRoot = join(args.receiptsHome, ts);
  await mkdir(runRoot, { recursive: true });
  const screenshotsDir = join(runRoot, 'screenshots');
  await mkdir(screenshotsDir, { recursive: true });
  const logsDir = join(runRoot, 'logs');
  await mkdir(logsDir, { recursive: true });
  console.log(`[receipts] ${runRoot}`);

  const liveDir = process.env.HOME ? `${process.env.HOME}/.computable-lab` : '/home/brad/.computable-lab';
  const liveBefore = await dirDigest(liveDir);

  // ---- ports + throwaway dirs ----
  const ports: Ports = await pickFreePorts(args.backendCandidates, args.frontendCandidates);
  console.log(`[ports] backend :${ports.backend} frontend :${ports.frontend}`);
  const dirs: RunDirs = {
    runRoot: join(runRoot, 'data'),
    dataDir: join(runRoot, 'data'),
    workspacesDir: join(runRoot, 'workspaces'),
    mountDir: join(runRoot, 'mount'),
    configPath: join(runRoot, 'config.yaml'),
  };
  await materializeRunDirs(dirs, ports);
  console.log(`[throwaway] data=${dirs.dataDir} mount=${dirs.mountDir} config=${dirs.configPath}`);

  const backend = `http://127.0.0.1:${ports.backend}`;
  const frontendBase = `http://127.0.0.1:${ports.frontend}`;

  // ---- journeys ----
  const journeyFile: JourneyFile = loadJourneyFile(resolve(args.journeys));
  const toRun = args.only.length > 0 ? journeyFile.journeys.filter((j) => args.only.includes(j.id)) : journeyFile.journeys;
  if (args.only.length > 0 && toRun.length === 0) {
    throw new Error(`--only ${args.only.join(',')} matched no journey in ${args.journeys}`);
  }
  console.log(`[journeys] running ${toRun.map((j) => j.id).join(', ')}`);

  // ---- step log ----
  const stepLogLines: string[] = [];
  const log: RunnerCtx['log'] = (journeyId, stepName, line) => {
    stepLogLines.push(`[${journeyId}] ${stepName}: ${line}`);
    console.log(`  ${line}`);
  };

  // ---- browser (one context; identity = bootstrap system admin) ----
  const browser: Browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // Act as the bootstrap system admin (the fresh throwaway dir's only active
  // user while no credential exists). Set BEFORE any app load so API calls
  // carry x-user-id: USR-LOCAL-ADMIN.
  await context.addInitScript(() => {
    try {
      localStorage.setItem('cl.currentUserId', 'USR-LOCAL-ADMIN');
    } catch {
      /* non-browser contexts: ignore */
    }
  });
  const page = await context.newPage();

  const ctx: RunnerCtx = {
    backend,
    worktree: WORKTREE,
    mountDir: dirs.mountDir,
    screenshotsDir,
    rand: ts.replace(/[^a-z0-9]/gi, '').slice(-8) || 'run',
    vars: { __frontendBase: frontendBase },
    page,
    log,
  };

  // ---- spawn the stack (recorded PIDs) + wait ready ----
  let stack: SpawnedStack | null = null;
  const results: JourneyResult[] = [];
  let startupOk = false;
  try {
    stack = spawnStack({ worktree: WORKTREE, ports, dirs, logsDir });
    console.log(`[stack] backend pid ${stack.backend.pid} (:${ports.backend}), frontend pid ${stack.frontend.pid} (:${ports.frontend})`);
    await waitForBackend(ports.backend, 180_000);
    await waitForFrontend(ports.frontend, 120_000);
    startupOk = true;
    console.log('[stack] backend + frontend READY');

    // ---- run each journey ----
    for (const journey of toRun) {
      const jr: JourneyResult = { id: journey.id, result: 'green', failed_step: null };
      console.log(`\n=== journey ${journey.id} (${journey.name ?? journey.id}) ===`);
      try {
        for (const step of journey.steps) {
          const stepName = 'name' in step && typeof step.name === 'string' ? step.name : step.kind;
          await runStep(step, ctx, journey.id);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        jr.result = 'red';
        // best-effort: name the failing step from the log's last line for this journey
        const last = stepLogLines.filter((l) => l.startsWith(`[${journey.id}]`)).pop();
        jr.failed_step = last ? last.split(': ')[1]?.split(':')[0] ?? null : null;
        jr.error = msg;
        log(journey.id, 'FAILED', msg);
        console.log(`  RED: ${msg}`);
      }
      results.push(jr);
    }
  } finally {
    // ---- teardown by recorded PIDs (trap-safe) ----
    if (stack) {
      await killStack(stack, 'teardown');
    }
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  const liveAfter = await dirDigest(liveDir);
  const liveUnchanged = liveBefore.digest === liveAfter.digest && liveBefore.identity === liveAfter.identity;
  const overallGreen = results.length > 0 && results.every((r) => r.result === 'green');

  // ---- receipts ----
  const verdict = {
    result: overallGreen ? 'green' : 'red',
    journeys: results,
    generatedAt: new Date().toISOString(),
    worktree: WORKTREE,
    head: (await import('node:child_process')).execSync('git -c core.fileMode=false rev-parse HEAD', { cwd: WORKTREE }).toString().trim(),
  };
  await writeFile(join(runRoot, 'journeys-verdict.json'), JSON.stringify(verdict, null, 2), 'utf8');
  await writeFile(join(runRoot, 'step.log'), stepLogLines.join('\n') + '\n', 'utf8');
  const runMeta = {
    ts,
    runRoot,
    worktree: WORKTREE,
    head: verdict.head,
    ports: { backend: ports.backend, frontend: ports.frontend, probe: ports.probe },
    reservedPorts: RESERVED_PORTS,
    dataDir: dirs.dataDir,
    mountDir: dirs.mountDir,
    configPath: dirs.configPath,
    stack: { backendPid: stack?.backend.pid ?? null, frontendPid: stack?.frontend.pid ?? null, startupOk },
    liveDirProof: {
      path: liveDir,
      before: liveBefore,
      after: liveAfter,
      unchanged: liveUnchanged,
    },
    journeys: results,
    overallGreen,
  };
  await writeFile(join(runRoot, 'run-meta.json'), JSON.stringify(runMeta, null, 2), 'utf8');

  console.log(`\n[result] ${verdict.result} — ${results.map((r) => `${r.id}=${r.result}${r.failed_step ? ` (failed step ${r.failed_step})` : ''}`).join(', ')}`);
  console.log(`[live-dir] ${liveUnchanged ? 'UNCHANGED (digest proof holds)' : 'CHANGED — VIOLATION (digest mismatch)'}`);
  console.log(`[receipts] ${runRoot}/journeys-verdict.json`);

  if (!liveUnchanged) {
    console.error('[FATAL] ~/.computable-lab digest CHANGED — the harness must never write there');
    return 3;
  }
  return overallGreen ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error('[driver error]', err instanceof Error ? err.stack : err);
    process.exit(2);
  },
);
