/**
 * W2-7 T7 NO-BYPASS (spec §6, AC5): family -> run graph has exactly one
 * down-route — realization -> lowerer -> the frozen 31-verb contract -> the
 * frozen pipeline. Structural arms: grep + import-set + pipeline-sha closure.
 * A future bypass is a test failure.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const SERVER_SRC = join(process.cwd(), 'src');
const REPO_ROOT = join(process.cwd(), '..');

function grepRn(pattern: string, dir: string, include?: string): string[] {
  // grep is the structural probe here (test-local; not a shell pipeline).
  try {
    const args = ['-rn', pattern, dir];
    if (include) args.splice(1, 0, `--include=${include}`);
    const out = execFileSync('grep', args, { encoding: 'utf-8' });
    return out.split('\n').filter((line) => line.trim().length > 0);
  } catch (err) {
    // grep exits 1 when nothing matches — that IS the empty result.
    const message = (err as { stdout?: string }).stdout ?? '';
    return message.split('\n').filter((line) => line.trim().length > 0);
  }
}

function collectTs(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collectTs(path, out);
    else if (entry.name.endsWith('.ts')) out.push(path);
  }
  return out;
}

describe('W2-7 T7 no-bypass closure (AC5, §6)', () => {

  it('(a) the literal protocol compiler consumes NO intent steps (trunk fact §0.10 stays true)', () => {
    const hits = grepRn('\\.intent', join(SERVER_SRC, 'compiler', 'protocol'));
    expect(hits).toEqual([]);
  });

  it('(b) compileScientistIntent import-set closure: only the known production files + W2-7 realization files', () => {
    const files = collectTs(SERVER_SRC)
      .filter((f) => !f.endsWith('.test.ts'))
      .filter((f) => readFileSync(f, 'utf-8').includes('compileScientistIntent'));
    const rel = files.map((f) => f.slice(SERVER_SRC.length + 1)).sort();
    const known = new Set([
      join('compiler', 'scientistIntent', 'compileScientistIntent.ts'),
      join('compiler', 'scientistIntent', 'intentCompile.ts'),
      join('compiler', 'scientistIntent', 'realizeScientistIntent.ts'),
      join('api', 'handlers', 'IntentCompileHandlers.ts'),
      join('api', 'handlers', 'IntentCompileFromPromptHandlers.ts'),
      // SHORTHAND-CHAT (spec §Design 2, sanctioned): the chat-side seam is the
      // run chat's single declared consumer of THIS frozen pipeline — the
      // orchestrator branch reaches the compiler ONLY through it
      // (compileShorthandDeterministically). The guard's purpose (no
      // unauthorized bypass) is preserved: a declared consumer, not a second
      // compiler. Pipeline modules themselves stay untouched.
      join('ai', 'shorthandChat.ts'),
      // WELLSET-RESOLVER-1 (spec Deliverables, sanctioned): the resolve_wellsets
      // pass module — a pipeline module registered IN the frozen pipeline's
      // buildRegistry (the resolve_roles registration precedent), not a second
      // compiler or a bypass. It imports no compileScientistIntent symbol; it
      // matches this grep on the doc-comment naming its registration seam.
      join('compiler', 'scientistIntent', 'resolveWellsetsPass.ts'),
      // L2-CLARIFY-CARD-1 A2 (sanctioned): the slot-coverage gate predicate.
      // A PURE helper the compiler's non-bar path CALLS (compileScientistIntent
      // imports it); it imports no compileScientistIntent symbol and adds no
      // down-route — it reads the parsed intent + the pass's own output and
      // returns the unbound declared slots. Matches this grep on the doc-comment
      // naming its call seam (compileScientistIntent.ts), same as the
      // resolveWellsetsPass.ts precedent above.
      join('compiler', 'resolution', 'nounCoverage.ts'),
    ]);
    const unexpected = rel.filter((f) => !known.has(f));
    expect(unexpected).toEqual([]);
    // W2-7's lowerer IS in the set (the only deterministic family->contract emitter).
    expect(rel).toContain(join('compiler', 'scientistIntent', 'realizeScientistIntent.ts'));
  });

  it('(c) this item adds ZERO routes: no new handler file, no new instance.post outside the known set', () => {
    const handlersDir = join(SERVER_SRC, 'api', 'handlers');
    const newFiles = readdirSync(handlersDir).filter((f) => f.toLowerCase().includes('realiz'));
    expect(newFiles).toEqual([]);
    // The realization module registers no route: it contains no fastify import.
    const source = readFileSync(join(SERVER_SRC, 'compiler', 'scientistIntent', 'realizeScientistIntent.ts'), 'utf-8');
    expect(source).not.toContain('fastify');
    expect(source).not.toMatch(/instance\.(post|get|put)\(/);
  });

  it('(d) the MANIFEST-pinned scientist-intent pipeline YAML is sha256-unchanged (frozen pass-list)', () => {
    const pipelinePath = join(REPO_ROOT, 'schema', 'registry', 'compile-pipelines', 'scientist-intent-compile.yaml');
    const sha = createHash('sha256').update(readFileSync(pipelinePath)).digest('hex');
    // Pinned at claim base f19cfa95 (measured in this worktree before any edit).
    // WELLSET-RESOLVER-1 RE-PIN (l2t0310): the spec DELIBERATELY extends the
    // pass-list by declaring the resolve_wellsets pass (family expand, after
    // resolve_roles) — the frozen-list guard exists against UNDECLARED drift;
    // an item whose whole deliverable is one declared pass advances the pin.
    // WELLSET-RESOLVER-1 FIX RUN 1 RE-PIN (advc D3): the DECLARED EDGES now
    // cover the pass's reads (resolve_wellsets depends_on resolve_roles/
    // resolve_nouns/resolve_labware) and its republished-slot consumers
    // (compute_volumes / lab_state / emit_instrument_run_files gained the
    // resolve_wellsets edge). The pass-LIST is unchanged — this pin guards
    // undeclared drift, not this item's declared edge corrections.
    expect(sha).toBe('b91ef3b4e5e30e619e5fa7b44daa5d2be1f45c8b7bfaad0a4c169f2ad1bd8536');
  });

  it('(e) derive_execution_scale_plan is NOT bolted onto the scientist-intent pipeline (bait #9 refusal)', () => {
    const pipelineText = readFileSync(join(REPO_ROOT, 'schema', 'registry', 'compile-pipelines', 'scientist-intent-compile.yaml'), 'utf-8');
    expect(pipelineText).not.toContain('derive_execution_scale_plan');
    // It stays where it was: the chatbot pipeline only.
    const chatbot = readFileSync(join(REPO_ROOT, 'schema', 'registry', 'compile-pipelines', 'chatbot-compile.yaml'), 'utf-8');
    expect(chatbot).toContain('derive_execution_scale_plan');
  });

  it('(f) the lowerer consumes the frozen contract via parseScientistIntent only — no private schema, no second validator of the intent doc', () => {
    const source = readFileSync(join(SERVER_SRC, 'compiler', 'scientistIntent', 'realizeScientistIntent.ts'), 'utf-8');
    expect(source).toContain('parseScientistIntent');
    // The only Ajv validator the module builds is the shipped QUANTITY datatype
    // (the count/volume conflation gate) — never a scientist-intent validator.
    const ajvUses = source.match(/createValidator\(/g) ?? [];
    expect(ajvUses.length).toBe(1);
    expect(source).toContain('QUANTITY_ID');
  });

  it('(g) no new lint rule ids: the realization policy file is NOT a *.lint.yaml and adds none', () => {
    const policyDir = join(REPO_ROOT, 'schema', 'registry', 'realization');
    expect(existsSync(join(policyDir, 'robot-realization.policy.yaml'))).toBe(true);
    const lintFiles = readdirSync(policyDir).filter((f) => f.endsWith('.lint.yaml'));
    expect(lintFiles).toEqual([]);
  });
});
