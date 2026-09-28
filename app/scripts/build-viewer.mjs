#!/usr/bin/env node
/**
 * Builds the standalone evidence viewer and stamps dist-viewer/PROVENANCE.json.
 * Run from app/:  node scripts/build-viewer.mjs
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(here, '..')

const result = spawnSync('npx', ['vite', 'build', '--config', 'vite.viewer.config.ts'], {
  cwd: appDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
if (result.status !== 0) {
  console.error('viewer build failed')
  process.exit(result.status ?? 1)
}

let gitSha = 'unknown'
try {
  gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: appDir, encoding: 'utf8' }).trim()
} catch {
  console.warn('warning: could not resolve git SHA (not a git checkout?)')
}

const provenance = {
  viewer_version: 1,
  built_at: new Date().toISOString(),
  git_sha: gitSha,
  build_command: 'node scripts/build-viewer.mjs',
}

writeFileSync(
  resolve(appDir, 'dist-viewer', 'PROVENANCE.json'),
  JSON.stringify(provenance, null, 2) + '\n',
)
console.log('wrote dist-viewer/PROVENANCE.json', provenance)
