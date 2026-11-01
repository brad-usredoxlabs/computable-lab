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
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium, type Browser } from 'playwright';
import { loadJourneyFile, runStep, journeyOutcome, type RunnerCtx, type Journey, type JourneyFile } from './lib/journey.js';
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

/**
 * D3: the run stamp. The RECEIPT DIR is second-precision + a CRYPTO-random
 * hex suffix; the SEED ID suffix (rand) is pure crypto-random. The old
 * minute-precision stamp + rand-derived-from-the-same-stamp meant two runs
 * in the same minute shared the receipt dir AND the seed-id suffix — a
 * same-minute green re-run could clobber a red receipt, or the seed-id
 * collision 409'd the seed. Record identity is NEVER derived from a clock
 * alone; the clock is only a sort-friendly prefix.
 */
function runStamp(): { ts: string; rand: string } {
  const sec = new Date().toISOString().replace(/[:.]/g, '').slice(0, 19); // 20261031T120000Z000 (ms)
  const rand = randomBytes(4).toString('hex'); // 8 hex chars; never clock-derived
  return { ts: `${sec}-${rand}`, rand };
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

  // ---- receipt dir (D3: ms-precision stamp + crypto suffix; never shared) ----
  const { ts, rand } = runStamp();
  const runRoot = join(args.receiptsHome, ts);
  await mkdir(runRoot, { recursive: true });
  const screenshotsDir = join(runRoot, 'screenshots');
  await mkdir(screenshotsDir, { recursive: true });
  const logsDir = join(runRoot, 'logs');
  await mkdir(logsDir, { recursive: true });
  console.log(`[receipts] ${runRoot}`);

  // D13: the isolation proof covers BOTH forbidden roots — the live dir
  // (~/.computable-lab) AND the shared lane store (/home/brad/
  // .computable-lab-lane1). AC2 forbids writes to both; the machine proof
  // must cover both.
  const liveDir = process.env.HOME ? `${process.env.HOME}/.computable-lab` : '/home/brad/.computable-lab';
  const laneStoreDir = process.env.HOME
    ? `${process.env.HOME}/.computable-lab-lane1`
    : '/home/brad/.computable-lab-lane1';
  const [liveBefore, laneStoreBefore] = await Promise.all([dirDigest(liveDir), dirDigest(laneStoreDir)]);

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
  // D7: the DECLARED journey scope = every journey the YAML declares. The
  // verdict records it; check-green requires the full declared set (a
  // `--only J1` run is a scoped run that gates only its own scope).
  const declaredJourneys = journeyFile.journeys.map((j) => j.id);
  const toRun = args.only.length > 0 ? journeyFile.journeys.filter((j) => args.only.includes(j.id)) : journeyFile.journeys;
  if (args.only.length > 0 && toRun.length === 0) {
    throw new Error(`--only ${args.only.join(',')} matched no journey in ${args.journeys}`);
  }
  console.log(`[journeys] running ${toRun.map((j) => j.id).join(', ')} (declared scope: ${declaredJourneys.join(', ')})`);

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

  // D3: `rand` comes from runStamp() (crypto-random, above) — never derived
  // from the clock. It must be in vars (not just ctx.rand): the DATA
  // interpreter's interpolate() reads vars, and the journeys reference
  // {{rand}} in the browser step values (title/sample). Exposing it here
  // keeps the journeys as pure data (the driver supplies the run identity).
  const ctx: RunnerCtx = {
    backend,
    worktree: WORKTREE,
    mountDir: dirs.mountDir,
    screenshotsDir,
    rand,
    vars: { __frontendBase: frontendBase, rand },
    page,
    log,
    // D4: the current step/action tag (attribution on a thrown step). The
    // startup leg (stack spawn + wait) has no journey step yet — a throw
    // there keeps this tag.
    current: '(pre-run)',
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
      ctx.current = journey.id; // attribution: set before the first step (D4)
      try {
        for (const step of journey.steps) {
          await runStep(step, ctx, journey.id);
        }
      } catch (err) {
        // D4: the failing step/action is the interpreter's CURRENT tag —
        // captured at throw time — not the last LOGGED line (entry-logging
        // actions like screenshot masked the real failing assert).
        const outcome = journeyOutcome(journey.id, ctx, err instanceof Error ? err : new Error(String(err)));
        jr.result = 'red';
        jr.failed_step = outcome.failed_step;
        jr.error = outcome.error;
        const msg = outcome.error ?? String(err);
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

  // ---- isolation proof (D2: computed BEFORE any verdict is written; the
  // verdict's `result` is FORCED red and `isolation` recorded 'violated'
  // when the proof fails — a green verdict is never written before the
  // proof passes) ----
  const liveAfter = await dirDigest(liveDir);
  const laneStoreAfter = await dirDigest(laneStoreDir);
  const liveUnchanged = liveBefore.digest === liveAfter.digest && liveBefore.identity === liveAfter.identity;
  const laneStoreUnchanged = laneStoreBefore.digest === laneStoreAfter.digest && laneStoreBefore.identity === laneStoreAfter.identity;
  const isolationOk = liveUnchanged && laneStoreUnchanged;
  const isolation: 'ok' | 'violated' = isolationOk ? 'ok' : 'violated';
  const journeysGreen = results.length > 0 && results.every((r) => r.result === 'green');
  // D2: green is written IFF the journeys are green AND the isolation proof
  // passed. An isolation breach forces red (the machine signal contradicts
  // nothing — it is the hard rule itself).
  const overallGreen = journeysGreen && isolationOk;

  // ---- receipts ----
  const head = execFileSync('git', ['-c', 'core.fileMode=false', 'rev-parse', 'HEAD'], { cwd: WORKTREE }).toString().trim();
  const verdict = {
    result: overallGreen ? 'green' : 'red',
    journeys: results,
    declaredJourneys,
    isolation,
    generatedAt: new Date().toISOString(),
    worktree: WORKTREE,
    head,
  };
  await writeFile(join(runRoot, 'journeys-verdict.json'), JSON.stringify(verdict, null, 2), 'utf8');
  await writeFile(join(runRoot, 'step.log'), stepLogLines.join('\n') + '\n', 'utf8');
  const runMeta = {
    ts,
    rand,
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
    // D13: the shared lane store is a second forbidden root — proven the
    // same way (digest + identity before/after).
    laneStoreProof: {
      path: laneStoreDir,
      before: laneStoreBefore,
      after: laneStoreAfter,
      unchanged: laneStoreUnchanged,
    },
    isolation,
    journeys: results,
    declaredJourneys,
    overallGreen,
  };
  await writeFile(join(runRoot, 'run-meta.json'), JSON.stringify(runMeta, null, 2), 'utf8');

  console.log(`\n[result] ${verdict.result} — ${results.map((r) => `${r.id}=${r.result}${r.failed_step ? ` (failed step ${r.failed_step})` : ''}`).join(', ')}`);
  console.log(`[isolation] ${isolationOk ? 'PROOF HOLDS (live dir + lane store: digest + identity unchanged)' : 'VIOLATED (digest mismatch)'}`);
  console.log(`[receipts] ${runRoot}/journeys-verdict.json`);

  if (!isolationOk) {
    console.error('[FATAL] live-dir and/or lane-store digest CHANGED — the harness must never write there; verdict forced red + isolation:violated');
    return 3;
  }
  return journeysGreen ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error('[driver error]', err instanceof Error ? err.stack : err);
    process.exit(2);
  },
);
