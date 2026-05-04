import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { asRecord, readYamlFile, writeYamlFile } from './FoundryArtifacts.js';
import type { FoundryVariant } from './ProtocolFoundryCompileRunner.js';

export interface BrowserReviewOptions {
  artifactRoot: string;
  repoRoot: string;
  workbenchRoot?: string;
  protocolId: string;
  variant: FoundryVariant;
  proposalPath: string;
  apiBase?: string;
  appBase?: string;
  headed?: boolean;
  dryRun?: boolean;
}

export interface BrowserReviewResult {
  status: 'pass' | 'fail' | 'blocked' | 'skipped';
  reportPath: string;
  message?: string;
}

function reviewScript(workbenchRoot?: string): string {
  return join(workbenchRoot ?? resolve(process.cwd(), '..'), 'scripts', 'protocol_foundry_browser_review.cjs');
}

function runNodeScript(script: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('close', (code) => resolvePromise({ stdout, stderr, code }));
  });
}

export async function runFoundryBrowserReview(options: BrowserReviewOptions): Promise<BrowserReviewResult> {
  const reportDir = join(options.artifactRoot, 'browser-review', options.protocolId, options.variant);
  const reportPath = join(reportDir, 'report.yaml');

  if (options.dryRun) {
    await writeYamlFile(reportPath, {
      kind: 'protocol-browser-review-report',
      protocolId: options.protocolId,
      variant: options.variant,
      status: 'skipped',
      route: '',
      played_events: false,
      commands: ['dry-run'],
      screenshots: [],
      console_errors: [],
      visual_failures: ['browser review skipped by dry-run'],
      labware_checks: [],
    });
    return { status: 'skipped', reportPath, message: 'dry-run' };
  }

  const script = reviewScript(options.workbenchRoot);
  if (!existsSync(script)) {
    await writeYamlFile(reportPath, {
      kind: 'protocol-browser-review-report',
      protocolId: options.protocolId,
      variant: options.variant,
      status: 'blocked',
      visual_failures: [`browser review script not found: ${script}`],
    });
    return { status: 'blocked', reportPath, message: `missing script ${script}` };
  }

  const args = [
    '--proposal', options.proposalPath,
    '--repo-root', options.repoRoot,
    '--out', reportDir,
    ...(options.apiBase ? ['--api-base', options.apiBase] : []),
    ...(options.appBase ? ['--app-base', options.appBase] : []),
    ...(options.headed ? ['--headed'] : []),
  ];
  const result = await runNodeScript(script, args, options.repoRoot);
  let status: BrowserReviewResult['status'] = result.code === 0 ? 'pass' : 'fail';
  if (existsSync(reportPath)) {
    const report = asRecord(await readYamlFile(reportPath));
    const reportStatus = report['status'];
    if (reportStatus === 'pass' || reportStatus === 'fail' || reportStatus === 'blocked') {
      status = reportStatus;
    }
  }
  return {
    status,
    reportPath,
    ...(result.code === 0 ? {} : { message: result.stderr || result.stdout || `browser review exited ${result.code}` }),
  };
}
