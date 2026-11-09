/**
 * D3 (CARD1-D3 ruling l2t1430 §7 — SCOPE LOCK): `canonicalLabelKey` may be
 * called ONLY in termId.ts (its definition + the `labelHash`/`labelSlug`/
 * `localMaterialIdForLabel` derivation built off it), the THREE
 * shorthandChat sites the ruling names (identity / drop / render), the
 * canonical-label POLICY loader (which documents it), and TESTS. ZERO
 * occurrences anywhere under `app/` (the client is the D3 §3(iii) consumer —
 * it renders ONE label via the server's canonical string, never re-derives it).
 *
 * This is a SOURCE-GREP pin, not a behavioural test: it walks the repo's code
 * files and asserts the CLOSED SET of files that mention the token. If a new
 * file (especially under `app/`) starts importing/calling the key, the set
 * stops matching the allow-list and this fails — forcing a deliberate
 * re-decision instead of a silent spread. The ruling's hard line (zero in
 * app/src) is asserted on its own so it fails with the loudest signal.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// The test file is server/src/materials/termId.scopeLock.test.ts — the repo
// root is three levels up. Deriving from the file (not process.cwd()) keeps
// the scan correct no matter which directory vitest was launched from.
const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');

const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
// 'wt' = in-repo legacy coder-worktree debris dirs (pre cl-wt policy, 2026-11-05): untracked
// nested clones whose duplicate sources are NOT repo sources; the pin must scan repo files only.
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'wt']);

const TOKEN = 'canonicalLabelKey';

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i);
}

/** Recursively collect code-file paths under `dir`, skipping VCS/build dirs.
 *  (Plain string readdir + statSync — no Dirent generics to fight.) */
function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // unreadable / not a dir (e.g. a broken symlink) — skip
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, out);
    } else if (st.isFile() && CODE_EXTS.has(extOf(name))) {
      out.push(full);
    }
  }
  return out;
}

/** The closed, ruling-allowed set of repo-relative files that may mention the
 *  token (definition home + its derivation + the three named shorthandChat
 *  sites + the policy loader that documents it + the tests that pin it +
 *  server-side tests added after l2t1430 that import the key). */
const ALLOWED = new Set([
  'server/src/materials/termId.ts',
  'server/src/materials/termId.test.ts',
  'server/src/ai/shorthandChat.ts',
  'server/src/ai/shorthandChat.readingCard.test.ts',
  'server/src/ai/shorthandChat.nounShape.test.ts',
  'server/src/ai/shorthandChat.sameNounDedupe.uifix3.test.ts',
  'server/src/ai/shorthandChat.e2eStubHonesty.test.ts',
  'server/src/compiler/resolution/canonicalLabelPolicy.ts',
  // The scope-lock pin itself — it names the token to scan for, so it is a
  // legitimate (self-referential) mentioner.
  'server/src/materials/termId.scopeLock.test.ts',
  // D5 mint pin: a server-side TEST asserting the identity rule (case/space
  // variant labels mint the SAME id) — the allow-list covers exactly such
  // server-side tests; app/ stays excluded and the set stays closed.
  'server/src/api/handlers/VocabHandlers.mint.test.ts',
  // Server-side TESTS added after l2t1430 that import the key — allowed category (server-side tests).
  'server/src/ai/shorthandChat.canonicalLabelFallback.test.ts',
  'server/src/ai/shorthandChat.mintBlobLabel.test.ts',
]);

function filesMentioningToken(): string[] {
  return walk(REPO_ROOT)
    .filter((f) => readFileSync(f, 'utf8').includes(TOKEN))
    .map((f) => relative(REPO_ROOT, f).replace(/\\/g, '/')) // stable posix rel
    .sort();
}

describe('D3 scope lock: canonicalLabelKey is server-side only (ruling l2t1430 §7)', () => {
  const mentioners = filesMentioningToken();

  it('ZERO occurrences anywhere under app/ (the client never re-derives the key)', () => {
    const inApp = mentioners.filter((f) => f.startsWith('app/'));
    expect(
      inApp,
      `app/ files may not reference canonicalLabelKey — the client renders the ONE label the server canonicalizes: ${inApp.join(', ')}`,
    ).toEqual([]);
  });

  it('ZERO occurrences under app/src (the ruling hard line, asserted on its own)', () => {
    const inAppSrc = mentioners.filter((f) => f.startsWith('app/src/'));
    expect(inAppSrc).toEqual([]);
  });

  it('the closed set of mentioners is exactly the ruling allow-list (no silent spread)', () => {
    // Every mentioner is allowed, AND every allowed file still mentions it
    // (a rename/extract that drops the token from an allowed file — or adds a
    // new one — is a deliberate re-decision this pin blocks).
    const unexpected = mentioners.filter((f) => !ALLOWED.has(f));
    expect(
      unexpected,
      `unexpected canonicalLabelKey mentioners (scope creep): ${unexpected.join(', ')}`,
    ).toEqual([]);
    const missing = [...ALLOWED].filter((f) => !mentioners.includes(f));
    expect(
      missing,
      `allow-list files no longer mention canonicalLabelKey (token moved/renamed?): ${missing.join(', ')}`,
    ).toEqual([]);
  });
});
