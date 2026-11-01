/**
 * trunk-journeys — JOURNEY (YAML DATA load/validate + step interpreter).
 *
 * Journeys are DATA (journeys.l1.yaml). This module is the dumb interpreter:
 * it validates the YAML shape (fail closed on a malformed journey) and runs
 * the declared steps against the live stack. NO per-step product policy lives
 * here — the steps are data, the interpreter only executes them.
 *
 * Step kinds:
 *   seed         — mint the journey fixtures + write the .D tree (uses vars).
 *   api          — one typed API call (method/path/body); optional expect + set.
 *   api-capture  — GET a record and extract payload fields into vars.
 *   api-expect   — GET a record and assert on its payload (read-back proof).
 *   browser      — a list of browser actions (Playwright, real transport).
 *
 * Variables: {{name}} interpolation in strings; set by seed/api-set/capture/
 * evalJs. A missing var is a fail-closed error (never silently empty).
 */
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { apiCall, ApiError, getRecord } from './api.js';
import { seedJourneyFixtures, type SeedIds } from './seed.js';
import { buildSyntheticCh, writeDotDTree } from './fixtures.js';

export class JourneyError extends Error {
  constructor(public readonly journeyId: string, public readonly stepName: string, msg: string) {
    super(`journey ${journeyId} step ${stepName}: ${msg}`);
    this.name = 'JourneyError';
  }
}

export interface ExpectClause {
  /** status must equal (default 2xx accepted) */
  status?: number;
  /** JSON pointer (dot path) that must equal `eq` */
  eq?: Array<{ path: string; eq: unknown }>;
  /** JSON pointer that must be non-empty (array length>0 or non-empty string) */
  nonEmpty?: string[];
  /** JSON pointer that must EXIST (not undefined) */
  exists?: string[];
  /** a truthy JS predicate over the response json (fn as a string) */
  js?: string;
}

interface SeedStep {
  kind: 'seed';
  /** The .CH point count the journey's synthetic signal carries (DATA — the
   * driver applies zero domain policy here). A GC scan at ~3 Hz over the
   * 5-min window (5000 points by default — the TS-side default the
   * interpreter applies when the YAML declares none) is a real, smallest
   * shape: the v181 reader decodes every point and the peak-integration
   * engine integrates over the full window, so the rendered chromatogram
   * trace is real and non-blank. (The artifact's `value` is ALWAYS a DREF
   * blob — publish_file never inlines; point count affects decode/integrate
   * time, not any inline threshold. The seed asserts the point count
   * landed fail-closed via the run's diag capture.) */
  signalPoints?: number;
}
interface ApiStep {
  kind: 'api';
  name?: string;
  method?: string;
  path: string;
  body?: unknown;
  expect?: ExpectClause;
  set?: Record<string, string>; // varName -> json pointer
}
interface ApiCaptureStep {
  kind: 'api-capture';
  name?: string;
  path: string;
  set?: Record<string, string>; // varName -> json pointer into the body
}
interface ApiExpectStep {
  kind: 'api-expect';
  name?: string;
  path: string;
  expect?: ExpectClause;
}
interface BrowserAction {
  goto?: string;
  wait?: string; // testid
  /** Raw CSS selector to wait for (for dynamic testid prefixes, e.g.
   *  `[data-testid^="gc-analyze-entry-"]`). `wait` is testid-exact; this is
   *  the selector escape hatch. Data stays declarative — the interpreter
   *  only picks the selector. */
  waitSel?: string;
  click?: string; // testid
  type?: { selector: string; value: string };
  select?: { selector: string; index?: number; value?: string };
  waitUrl?: string; // url substring
  captureUrl?: string; // varName -> current page URL
  evalJs?: { as?: string; expr: string };
  assertJs?: { name?: string; expr: string };
  screenshot?: string; // file name (under the run screenshots dir)
}
interface BrowserStep {
  kind: 'browser';
  name?: string;
  actions: BrowserAction[];
}
type Step = SeedStep | ApiStep | ApiCaptureStep | ApiExpectStep | BrowserStep;

export interface Journey {
  id: string;
  name?: string;
  steps: Step[];
}

export interface JourneyFile {
  journeys: Journey[];
}

/** Resolve a dot-pointer into a (possibly nested) object. */
export function readPointer(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/**
 * Interpolate {{var}} refs in a string; FAIL CLOSED on any unresolvable
 * placeholder (D5 — the adversarial gate: the old \w+-only regex let
 * "{{seed.gcMethod}}", "{{}}", "{{ rand }}", "{{ missing }}" pass through
 * SILENTLY into selectors/URLs/expressions).
 *
 * Grammar: a placeholder is \{\{ name \}\} where the name is the TRIMMED
 * inner text. The name is looked up EXACTLY in vars (dot-seeded names like
 * 'seed.gcMethod' are first-class var keys — that is the ONE vocabulary;
 * there is no dual dotted/flat lookup). Any placeholder whose name is not
 * a known var is a hard error, and any residual '{{' after substitution
 * (e.g. a placeholder that contains a stray '}' it cannot span) is a hard
 * error. A missing var is never silently empty.
 */
export function interpolate(s: string, vars: Record<string, unknown>): string {
  const out = s.replace(/\{\{([^}]*)\}\}/g, (whole, inner: string) => {
    const name = inner.trim();
    if (name === '' || !(name in vars) || vars[name] === undefined) {
      throw new JourneyError('*', 'interpolate', `unresolvable placeholder '{{${inner}}}' (known vars: ${Object.keys(vars).join(', ') || '(none)'})`);
    }
    return String(vars[name]);
  });
  if (out.includes('{{')) {
    throw new JourneyError('*', 'interpolate', `residual '{{' after substitution (a placeholder spans or contains '}' — not expressible in the {{name}} grammar): ${out}`);
  }
  return out;
}

/** Validate the parsed journey file shape (fail closed on malformed). */
export function validateJourneyFile(doc: unknown): JourneyFile {
  if (typeof doc !== 'object' || doc === null) throw new Error('journey file must be an object');
  const f = doc as Partial<JourneyFile>;
  if (!Array.isArray(f.journeys) || f.journeys.length === 0) {
    throw new Error('journey file must declare a non-empty `journeys` array');
  }
  for (const j of f.journeys) {
    if (typeof j?.id !== 'string' || j.id.length === 0) throw new Error('every journey needs a string `id`');
    if (!Array.isArray(j.steps) || j.steps.length === 0) {
      throw new Error(`journey ${j.id} needs a non-empty steps array`);
    }
    for (const step of j.steps) {
      if (typeof step !== 'object' || step === null || typeof (step as { kind?: unknown }).kind !== 'string') {
        throw new Error(`journey ${j.id} has a step without a string kind`);
      }
      const kind = (step as { kind: string }).kind;
      if (!['seed', 'api', 'api-capture', 'api-expect', 'browser'].includes(kind)) {
        throw new Error(`journey ${j.id} has an unknown step kind '${kind}'`);
      }
      if (kind === 'browser') {
        const b = step as BrowserStep;
        if (!Array.isArray(b.actions) || b.actions.length === 0) {
          throw new Error(`journey ${j.id} browser step needs a non-empty actions array`);
        }
      } else if (kind === 'api' || kind === 'api-capture' || kind === 'api-expect') {
        if (typeof (step as { path?: unknown }).path !== 'string') {
          throw new Error(`journey ${j.id} ${kind} step needs a string path`);
        }
      }
    }
  }
  return f as JourneyFile;
}

export function loadJourneyFile(path: string): JourneyFile {
  const raw = readFileSync(path, 'utf8');
  return validateJourneyFile(parse(raw));
}

export interface RunnerCtx {
  backend: string; // http://127.0.0.1:<backendPort>/
  worktree: string;
  mountDir: string;
  screenshotsDir: string;
  rand: string;
  vars: Record<string, unknown>;
  /** browser page (provided by the driver; the interpreter drives it) */
  page: import('playwright').Page;
  /** per-step log sink (the driver appends to the receipt step log) */
  log: (journeyId: string, stepName: string, line: string) => void;
  /**
   * D4 attribution: the step/action CURRENTLY executing. The driver sets it
   * before each step and the interpreter updates it before each browser
   * action; on a throw the driver captures this as the journey's
   * `failed_step` (the OLD rule parsed the last LOGGED line, which entry-
   * logging actions like screenshot masked — the real assert failure was
   * reported as the screenshot path).
   */
  current: string;
}

/**
 * D4: the failed-step attribution for one journey. Returns the step/action
 * tag the interpreter had marked current when the journey's throw escaped —
 * the ACTUAL failing step (or the failing ACTION inside a browser step:
 * action tags are the more precise localization, e.g. an assertJs's name),
 * not the last LOGGED line (which entry-logged actions like screenshot
 * masked). A throw before any step started (startup leg) keeps the pre-run
 * tag ('(pre-run)').
 */
export function journeyOutcome(
  journeyId: string,
  ctx: RunnerCtx,
  error: Error,
): { id: string; result: 'green' | 'red'; failed_step: string | null; error?: string } {
  let failedStep = typeof ctx.current === 'string' && ctx.current.length > 0 ? ctx.current : null;
  // Normalize action tags: a browser action's tag carries its verb
  // ("assertJs <name>", "wait <testid>", ...). The failed_step record is the
  // ACTION ITSELF — the assert's name / the selector — not the interpreter
  // verb, so strip the first token for the action-tag shapes. Step-level
  // tags (no verb prefix) and the pre-run tag pass through unchanged.
  if (failedStep && failedStep !== '(pre-run)') {
    const space = failedStep.indexOf(' ');
    if (space > 0 && ['assertJs', 'wait', 'waitSel', 'click', 'type', 'select', 'goto', 'waitUrl', 'captureUrl', 'evalJs', 'screenshot'].includes(failedStep.slice(0, space))) {
      failedStep = failedStep.slice(space + 1);
    }
  }
  return { id: journeyId, result: 'red', failed_step: failedStep, error: error.message };
}

/** Execute one browser action against the page. */
export async function runBrowserAction(
  action: BrowserAction,
  ctx: RunnerCtx,
  journeyId: string,
  stepName: string,
): Promise<void> {
  const page = ctx.page;
  if (action.goto !== undefined) {
    const raw = interpolate(action.goto, ctx.vars);
    // D4: mark this action current BEFORE it can throw (the goto URL is the
    // attribution the driver captures on failure).
    ctx.current = `goto ${raw}`;
    const gotoUrl = resolveGoto(raw, ctx);
    ctx.log(journeyId, stepName, `goto ${gotoUrl}`);
    await page.goto(gotoUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    return;
  }
  if (action.wait !== undefined) {
    ctx.current = `wait ${action.wait}`;
    const sel = `[data-testid="${interpolate(action.wait, ctx.vars)}"]`;
    ctx.log(journeyId, stepName, `wait ${action.wait}`);
    await page.waitForSelector(sel, { state: 'visible', timeout: 60_000 });
    return;
  }
  if (action.waitSel !== undefined) {
    ctx.current = `waitSel ${action.waitSel}`;
    const sel = interpolate(action.waitSel, ctx.vars);
    ctx.log(journeyId, stepName, `waitSel ${sel}`);
    await page.waitForSelector(sel, { state: 'visible', timeout: 60_000 });
    return;
  }
  if (action.click !== undefined) {
    ctx.current = `click ${action.click}`;
    const sel = `[data-testid="${interpolate(action.click, ctx.vars)}"]`;
    ctx.log(journeyId, stepName, `click ${action.click}`);
    await page.waitForSelector(sel, { state: 'visible', timeout: 60_000 });
    await page.click(sel, { timeout: 30_000 });
    return;
  }
  if (action.type !== undefined) {
    ctx.current = `type ${action.type.selector}`;
    const sel = `[data-testid="${interpolate(action.type.selector, ctx.vars)}"]`;
    const text = interpolate(action.type.value, ctx.vars);
    ctx.log(journeyId, stepName, `type ${action.type.selector} = ${JSON.stringify(text)}`);
    await page.waitForSelector(sel, { state: 'visible', timeout: 60_000 });
    await page.fill(sel, text, { timeout: 30_000 });
    return;
  }
  if (action.select !== undefined) {
    ctx.current = `select ${action.select.selector}`;
    const sel = `[data-testid="${interpolate(action.select.selector, ctx.vars)}"]`;
    ctx.log(journeyId, stepName, `select ${action.select.selector} (index ${action.select.index ?? 'value ' + action.select.value})`);
    await page.waitForSelector(sel, { state: 'visible', timeout: 60_000 });
    if (action.select.index !== undefined) {
      const options = await page.$$(`${sel} > option`);
      if (action.select.index >= options.length) {
        throw new JourneyError(journeyId, stepName, `select ${action.select.selector}: index ${action.select.index} out of range (${options.length} options)`);
      }
      const val = await options[action.select.index]!.getAttribute('value');
      await page.selectOption(sel, val ?? '', { timeout: 30_000 });
    } else if (action.select.value !== undefined) {
      await page.selectOption(sel, interpolate(action.select.value, ctx.vars), { timeout: 30_000 });
    } else {
      throw new JourneyError(journeyId, stepName, `select ${action.select.selector}: needs index or value`);
    }
    return;
  }
  if (action.waitUrl !== undefined) {
    const want = interpolate(action.waitUrl, ctx.vars);
    ctx.current = `waitUrl ${want}`;
    ctx.log(journeyId, stepName, `waitUrl ${want}`);
    await page.waitForURL((u) => u.toString().includes(want), { timeout: 90_000 });
    return;
  }
  if (action.captureUrl !== undefined) {
    ctx.current = `captureUrl ${action.captureUrl}`;
    ctx.vars[action.captureUrl] = page.url();
    ctx.log(journeyId, stepName, `captureUrl ${action.captureUrl} = ${page.url()}`);
    return;
  }
  if (action.evalJs !== undefined) {
    ctx.current = `evalJs ${action.evalJs.as ?? '(expr)'}`;
    const expr = interpolate(action.evalJs.expr, ctx.vars);
    const val = await page.evaluate((e) => (eval(e) as unknown), expr);
    if (action.evalJs.as) ctx.vars[action.evalJs.as] = val;
    ctx.log(journeyId, stepName, `evalJs ${action.evalJs.as ?? '(no var)'} = ${JSON.stringify(val)}`);
    return;
  }
  if (action.assertJs !== undefined) {
    // D4: the assert's NAME is the attribution — a failed assert must be
    // reported by its own name, never masked by an earlier entry-logged
    // action (the 2329 receipts reported the real chromatogram assert
    // failure as the screenshot path). The tag is the bare name (the
    // identifying fact), unlike other actions' "verb <arg>" tags.
    ctx.current = action.assertJs.name ?? '(unnamed assert)';
    const expr = interpolate(action.assertJs.expr, ctx.vars);
    const val = await page.evaluate((e) => (eval(e) as unknown), expr);
    if (!val) {
      throw new JourneyError(journeyId, stepName, `assertJs failed (value ${JSON.stringify(val)}): ${expr}`);
    }
    ctx.log(journeyId, stepName, `assertJs ok${action.assertJs.name ? ` (${action.assertJs.name})` : ''}`);
    return;
  }
  if (action.screenshot !== undefined) {
    ctx.current = `screenshot ${action.screenshot}`;
    const file = `${action.screenshot}.png`;
    const path = `${ctx.screenshotsDir}/${journeyId}-${file}`;
    await page.screenshot({ path, fullPage: true });
    ctx.log(journeyId, stepName, `screenshot ${path}`);
    return;
  }
  throw new JourneyError(journeyId, stepName, `unknown browser action: ${JSON.stringify(action)}`);
}

function resolveGoto(raw: string, ctx: RunnerCtx): string {
  if (raw.startsWith('http')) return raw;
  // The app UI is served by the FRONTEND (VITE) origin; /api is proxied to the
  // backend. The driver stores the frontend base on ctx.vars.__frontendBase.
  const base = typeof ctx.vars.__frontendBase === 'string' ? ctx.vars.__frontendBase : '';
  if (!base) throw new JourneyError('*', 'goto', 'frontend base not set (ctx.vars.__frontendBase)');
  return `${base}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

/** Execute one step. */
export async function runStep(step: Step, ctx: RunnerCtx, journeyId: string): Promise<void> {
  const name = 'name' in step && typeof step.name === 'string' ? step.name : step.kind;
  // D4: mark the step current BEFORE executing — the driver captures
  // ctx.current on a throw as the journey's failed_step. Browser actions
  // refine the tag to the failing action.
  ctx.current = name;
  if (step.kind === 'seed') {
    ctx.log(journeyId, name, 'seed: minting fixtures + writing .D tree');
    const pts = (step as SeedStep).signalPoints ?? 5000;
    const ch = buildSyntheticCh(pts, { escIndex: 10 });
    const dotd = `TJ-${ctx.rand}.D`;
    await writeDotDTree(ctx.mountDir, 'machine1', dotd, ch.bytes, `trunk-journeys ${ctx.rand}`);
    ctx.vars.dotdDirectoryKey = `machine1/${dotd}`;
    const seed: SeedIds = await seedJourneyFixtures(ctx.backend, ctx.worktree, ctx.rand);
    Object.assign(ctx.vars, {
      'seed.gcMethod': seed.gcMethod,
      'seed.engine': seed.engine,
      'seed.revision': seed.revision,
      'seed.claim': seed.claim,
      'seed.context': seed.context,
      'seed.assertion': seed.assertion,
    });
    // The journey references these as flat vars too.
    ctx.vars.gcMethod = seed.gcMethod;
    ctx.vars.revision = seed.revision;
    ctx.vars.claim = seed.claim;
    ctx.vars.context = seed.context;
    ctx.vars.assertion = seed.assertion;
    ctx.log(journeyId, name, `seed ids: ${JSON.stringify(seed)}`);
    return;
  }
  if (step.kind === 'api') {
    const path = interpolate(step.path, ctx.vars);
    const body = step.body !== undefined ? deepInterpolate(step.body, ctx.vars) : undefined;
    const { json } = await apiCall(ctx.backend, path, { method: step.method, body });
    await assertExpect(json, step.expect, journeyId, name, ctx.log, ctx.vars);
    if (step.set) {
      for (const [varName, pointer] of Object.entries(step.set)) {
        const v = readPointer(json, pointer);
        if (v === undefined) throw new JourneyError(journeyId, name, `api set ${varName}: pointer '${pointer}' not found`);
        ctx.vars[varName] = v;
        ctx.log(journeyId, name, `set ${varName} = ${JSON.stringify(v)}`);
      }
    }
    return;
  }
  if (step.kind === 'api-capture') {
    const path = interpolate(step.path, ctx.vars);
    const { json } = await apiCall(ctx.backend, path, { method: 'GET' });
    if (step.set) {
      for (const [varName, pointer] of Object.entries(step.set)) {
        const v = readPointer(json, pointer);
        if (v === undefined) throw new JourneyError(journeyId, name, `api-capture ${varName}: pointer '${pointer}' not found`);
        ctx.vars[varName] = v;
        ctx.log(journeyId, name, `capture ${varName} = ${JSON.stringify(v)}`);
      }
    }
    return;
  }
  if (step.kind === 'api-expect') {
    const path = interpolate(step.path, ctx.vars);
    const { json } = await apiCall(ctx.backend, path, { method: 'GET' });
    await assertExpect(json, step.expect, journeyId, name, ctx.log, ctx.vars);
    return;
  }
  if (step.kind === 'browser') {
    for (const action of step.actions) {
      await runBrowserAction(action, ctx, journeyId, name);
    }
    return;
  }
  throw new JourneyError(journeyId, name, 'unreachable step kind');
}

/** Recursively interpolate {{var}} in an arbitrary (JSON-ish) value. */
function deepInterpolate(v: unknown, vars: Record<string, unknown>): unknown {
  if (typeof v === 'string') return interpolate(v, vars);
  if (Array.isArray(v)) return v.map((x) => deepInterpolate(x, vars));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = deepInterpolate(val, vars);
    return out;
  }
  return v;
}

async function assertExpect(
  json: unknown,
  expect: ExpectClause | undefined,
  journeyId: string,
  stepName: string,
  log: RunnerCtx['log'],
  vars: Record<string, unknown>,
): Promise<void> {
  if (!expect) return;
  for (const e of expect.eq ?? []) {
    const want = deepInterpolate(e.eq, vars);
    const v = readPointer(json, interpolate(e.path, vars));
    if (v !== want) throw new JourneyError(journeyId, stepName, `expect eq '${e.path}' = ${JSON.stringify(want)}, got ${JSON.stringify(v)}`);
  }
  for (const p of expect.nonEmpty ?? []) {
    const path = interpolate(p, vars);
    const v = readPointer(json, path);
    const empty = v === undefined || v === null || (Array.isArray(v) && v.length === 0) || (typeof v === 'string' && v.length === 0);
    if (empty) throw new JourneyError(journeyId, stepName, `expect nonEmpty '${path}' (was ${JSON.stringify(v)})`);
  }
  for (const p of expect.exists ?? []) {
    const path = interpolate(p, vars);
    const v = readPointer(json, path);
    if (v === undefined) throw new JourneyError(journeyId, stepName, `expect exists '${path}' (missing)`);
  }
  if (expect.js) {
    const js = interpolate(expect.js, vars);
    let ok: unknown;
    try {
      // The YAML carries an arrow function `(json) => {...}`; wrap + call it.
      const fn = new Function(`return (${js});`)();
      ok = fn(json);
    } catch (e) {
      throw new JourneyError(journeyId, stepName, `expect js threw: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!ok) throw new JourneyError(journeyId, stepName, `expect js failed: ${js.replace(/\s+/g, ' ').slice(0, 120)}`);
  }
  void log;
}

/** Read a record's payload field (for the api-capture of an entry's pkg ref). */
export { getRecord };

/** Re-export ApiError so the driver can catch it uniformly. */
export { ApiError };
