/**
 * trunk-journeys — STACK (own-process lifecycle).
 *
 * The harness spawns its OWN backend + frontend on FREE dedicated ports,
 * pointed at a SEEDED THROWAWAY data dir, and tears down by RECORDED PID only
 * (process-group kill on the pid we spawned — never a pattern, never a port
 * sweep, never a process we did not spawn). The six reserved lane ports are
 * hard-refused as spawn targets. run-meta carries the port probe + PID record.
 *
 * Also owns the run-meta digest proof: a canonical content digest of
 * ~/.computable-lab BEFORE and AFTER the run (must be unchanged — the harness
 * never writes there).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { existsSync, statSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';

const pExecFile = promisify(execFile);

/** The reserved lane/Brad ports the harness must NEVER bind or disturb. */
export const RESERVED_PORTS: number[] = [3001, 5174, 3092, 5192, 3093, 5193];

export interface RunDirs {
  /** Per-run throwaway root (under the receipts home): <ts>/ */
  runRoot: string;
  /** CL data dir (server dataDir) — the ONLY place product writes land. */
  dataDir: string;
  /** workspaceDir */
  workspacesDir: string;
  /** throwaway storage-device mount (the synthetic .D root) */
  mountDir: string;
  /** the harness config file (CONFIG_PATH) */
  configPath: string;
}

export interface Ports {
  backend: number;
  frontend: number;
  /** probe evidence recorded in run-meta */
  probe: Array<{ port: number; free: boolean; note: string }>;
}

/** Is `port` bindable on 127.0.0.1 right now? (bind = authoritative "free"). */
export function probePortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => {
      srv.close(() => resolve(true));
    });
    srv.listen(port, '127.0.0.1');
  });
}

/**
 * Choose FREE ports for backend then frontend, refusing reserved ports.
 * Returns the chosen ports + the probe evidence. Throws when a required port
 * is not free (fail closed — never bind a busy or reserved port). The frontend
 * must be a DIFFERENT free port from the backend.
 */
export async function pickFreePorts(
  backendCandidates: number[],
  frontendCandidates: number[],
): Promise<Ports> {
  const probe: Ports['probe'] = [];
  const assertNotReserved = (p: number, role: string) => {
    if (RESERVED_PORTS.includes(p)) {
      throw new Error(`refusing reserved port ${p} as a ${role} spawn target (hard rule)`);
    }
  };

  let backend: number | undefined;
  for (const p of backendCandidates) {
    assertNotReserved(p, 'backend');
    const isFree = await probePortFree(p);
    probe.push({ port: p, free: isFree, note: 'backend candidate' });
    if (isFree) {
      backend = p;
      break;
    }
  }
  if (backend === undefined) {
    throw new Error(`no free backend port among candidates ${backendCandidates.join(',')} (all busy — record + re-run later)`);
  }

  let frontend: number | undefined;
  for (const p of frontendCandidates) {
    assertNotReserved(p, 'frontend');
    const isFree = await probePortFree(p);
    probe.push({ port: p, free: isFree, note: 'frontend candidate' });
    if (isFree && p !== backend) {
      frontend = p;
      break;
    }
  }
  if (frontend === undefined) {
    throw new Error(
      `no free frontend port distinct from backend ${backend} among candidates ${frontendCandidates.join(',')} (record + re-run later)`,
    );
  }
  return { backend, frontend, probe };
}

/** The throwaway config (no secrets, no AI section — /api/ai stays unconfigured). */
export function renderThrowawayConfig(d: RunDirs, ports: Ports): string {
  return [
    '# trunk-journeys throwaway config — generated per run; NEVER a product file.',
    '# dataDir/workspaceDir point at the per-run throwaway dirs; the storage',
    '# device is the throwaway mount that carries the synthetic .D tree.',
    'server:',
    `  port: ${ports.backend}`,
    '  host: 0.0.0.0',
    '  logLevel: info',
    `  dataDir: ${d.dataDir}`,
    `  workspaceDir: ${d.workspacesDir}`,
    '  cors:',
    '    enabled: true',
    '    origins:',
    '      - "*"',
    'schemas:',
    "  source: 'bundled'",
    '  bundledDir: ./schema',
    'execution:',
    '  mode: local',
    'repositories:',
    '  - id: main',
    '    default: true',
    "    mode: 'embedded-git'",
    '    git:',
    "      url: ''",
    "      branch: 'main'",
    '      auth:',
    "        type: none",
    '    namespace:',
    `      baseUri: 'http://localhost:${ports.backend}/records/'`,
    "      prefix: 'journeys'",
    '    jsonld:',
    '      context: default',
    '    sync:',
    "      mode: manual",
    '      autoCommit: true',
    '      autoPush: false',
    '    records:',
    "      directory: 'records'",
    'storageDevices:',
    '  - id: journeys-mnt',
    "    label: 'trunk-journeys throwaway mount'",
    "    kind: 'local-mount'",
    '    default: true',
    `    mountPath: ${d.mountDir}`,
    'lab:',
    '  materialTracking:',
    '    mode: relaxed',
    '    allowAdHocEventInstances: true',
    '',
  ].join('\n');
}

/** Create the throwaway dirs + write the config. */
export async function materializeRunDirs(d: RunDirs, ports: Ports): Promise<void> {
  for (const p of [d.runRoot, d.dataDir, d.workspacesDir, d.mountDir]) {
    await mkdir(p, { recursive: true });
  }
  await writeFile(d.configPath, renderThrowawayConfig(d, ports), 'utf8');
}

export interface SpawnedProcess {
  name: 'backend' | 'frontend';
  pid: number;
  logPath: string;
  port: number;
  child: ChildProcess;
}

/** Spawn a harness-owned process in its own group; record the pid.
 *  stdout+stderr are appended to logPath so a dead spawn is diagnosable. */
function spawnGroup(opts: {
  cwd: string;
  file: string;
  args: string[];
  env: Record<string, string>;
  name: 'backend' | 'frontend';
  port: number;
  logPath: string;
}): SpawnedProcess {
  const out = createWriteStream(opts.logPath, { flags: 'a' });
  const child = spawn(opts.file, opts.args, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    detached: true, // own process group -> kill(-pid) reaps the whole tree
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (child.pid === undefined) throw new Error(`spawn of ${opts.name} returned no pid`);
  child.stdout?.pipe(out);
  child.stderr?.pipe(out);
  out.on('error', () => {});
  return { name: opts.name, pid: child.pid, logPath: opts.logPath, port: opts.port, child };
}

export interface SpawnedStack {
  backend: SpawnedProcess;
  frontend: SpawnedProcess;
}

/** Spawn backend + frontend (recorded pids). Caller owns teardown. */
export function spawnStack(opts: {
  worktree: string;
  ports: Ports;
  dirs: RunDirs;
  logsDir: string;
}): SpawnedStack {
  const npx = process.env.npx ?? 'npx';
  const backend = spawnGroup({
    cwd: join(opts.worktree, 'server'),
    file: npx,
    args: ['tsx', 'src/server.ts'],
    env: {
      APP_BASE_PATH: '..',
      PORT: String(opts.ports.backend),
      HOST: '0.0.0.0',
      CONFIG_PATH: opts.dirs.configPath,
    },
    name: 'backend',
    port: opts.ports.backend,
    logPath: join(opts.logsDir, 'backend.log'),
  });
  const frontend = spawnGroup({
    cwd: join(opts.worktree, 'app'),
    file: npx,
    args: ['vite', '--host', '0.0.0.0', '--port', String(opts.ports.frontend), '--strictPort'],
    env: {
      VITE_API_PROXY: `http://localhost:${opts.ports.backend}`,
      VITE_CACHE_DIR: join(opts.logsDir, 'vite-cache'),
    },
    name: 'frontend',
    port: opts.ports.frontend,
    logPath: join(opts.logsDir, 'frontend.log'),
  });
  return { backend, frontend };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function httpStatus(url: string): Promise<number> {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'manual' });
    return res.status;
  } catch {
    return 0;
  }
}

/** Wait until the backend answers /api/schemas 200 (tsx compile takes a while). */
export async function waitForBackend(port: number, timeoutMs = 150_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = 0;
  while (Date.now() < deadline) {
    last = await httpStatus(`http://127.0.0.1:${port}/api/schemas`);
    if (last === 200) return;
    await sleep(1000);
  }
  throw new Error(`backend :${port} not ready in ${timeoutMs}ms (last http ${last})`);
}

/** Wait until the frontend answers / 200. */
export async function waitForFrontend(port: number, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = 0;
  while (Date.now() < deadline) {
    last = await httpStatus(`http://127.0.0.1:${port}/`);
    if (last === 200) return;
    await sleep(1000);
  }
  throw new Error(`frontend :${port} not ready in ${timeoutMs}ms (last http ${last})`);
}

/** Kill a harness-owned process group by the RECORDED pid only. */
export async function killSpawned(p: SpawnedProcess, tag: string): Promise<void> {
  try {
    process.kill(-p.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
  for (let i = 0; i < 10; i++) {
    let alive = true;
    try {
      process.kill(-p.pid, 0);
    } catch {
      alive = false;
    }
    if (!alive) break;
    await sleep(500);
  }
  try {
    process.kill(-p.pid, 'SIGKILL');
  } catch {
    /* already gone */
  }
  console.log(`[stack] killed ${p.name} (pid ${p.pid}) by recorded pid — ${tag}`);
}

/** Teardown the whole stack by recorded pids (trap-safe order: front then back). */
export async function killStack(s: SpawnedStack, tag: string): Promise<void> {
  await killSpawned(s.frontend, tag);
  await killSpawned(s.backend, tag);
}

/**
 * The run-meta digest proof for a live dir the harness must NOT touch:
 * a canonical content digest (sorted per-file sha256s) + the dir identity
 * (device:inode when it exists). Before and after the run, these must match.
 */
export async function dirDigest(dir: string): Promise<{ path: string; exists: boolean; digest: string; identity: string | null }> {
  if (!existsSync(dir)) {
    return { path: dir, exists: false, digest: sha256('ABSENT'), identity: null };
  }
  const identity = await (async () => {
    try {
      const st = statSync(dir);
      return `${st.dev}:${st.ino}`;
    } catch {
      return null;
    }
  })();
  const { stdout } = await pExecFile('sh', ['-c', `find '${dir}' -type f -print0 2>/dev/null | sort -z | xargs -0 sha256sum 2>/dev/null`], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return { path: dir, exists: true, digest: sha256(stdout), identity };
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
