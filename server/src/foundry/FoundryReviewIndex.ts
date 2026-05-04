import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { asRecord, nowIso, readYamlFile, type FoundryLedger, writeYamlFile } from './FoundryArtifacts.js';
import { FOUNDRY_VARIANTS } from './ProtocolFoundryCompileRunner.js';

function rel(root: string, path: string | undefined): string | undefined {
  return path ? relative(root, path) : undefined;
}

function artifactHref(artifactRoot: string, path: string | undefined): string {
  return path ? `../${relative(join(artifactRoot, 'review-index'), path)}` : '';
}

async function readStatus(path: string | undefined): Promise<string> {
  if (!path || !existsSync(path)) return 'missing';
  const data = asRecord(await readYamlFile(path));
  const status = data['status'];
  if (typeof status === 'string') return status;
  const accepted = data['accepted'];
  if (typeof accepted === 'boolean') return accepted ? 'accepted' : 'rejected';
  return 'present';
}

export async function writeFoundryReviewIndex(ledger: FoundryLedger): Promise<string> {
  const root = ledger.artifact_root;
  const indexDir = join(root, 'review-index');
  const protocols = [];
  const htmlRows: string[] = [];

  for (const protocol of Object.values(ledger.protocol_status)) {
    const variants = [];
    for (const variantName of FOUNDRY_VARIANTS) {
      const variant = protocol.variants[variantName];
      const screenshot = join(root, 'browser-review', protocol.protocolId, variantName, 'screenshot-1.png');
      const item = {
        variant: variantName,
        status: variant.status,
        eventCount: variant.metrics.eventCount ?? 0,
        blockerCount: variant.metrics.blockerCount ?? 0,
        qualityScore: variant.metrics.qualityScore ?? null,
        coverageEstimate: variant.metrics.coverageEstimate ?? null,
        artifacts: {
          protocolText: rel(root, join(root, 'text', `${protocol.protocolId}.txt`)),
          segment: rel(root, protocol.segmentPath),
          materialContext: rel(root, protocol.materialContextPath),
          compiler: rel(root, variant.artifacts.compiler),
          eventGraph: rel(root, variant.artifacts.eventGraph),
          executionScale: rel(root, variant.artifacts.executionScale),
          browserReport: rel(root, variant.artifacts.browserReport),
          screenshot: existsSync(screenshot) ? rel(root, screenshot) : undefined,
          architectVerdict: rel(root, variant.artifacts.architectVerdict),
          patchSpecs: variant.artifacts.patchSpecs?.map((path) => rel(root, path)).filter((path): path is string => Boolean(path)) ?? [],
        },
        browserStatus: await readStatus(variant.artifacts.browserReport),
        architectStatus: await readStatus(variant.artifacts.architectVerdict),
      };
      variants.push(item);
      htmlRows.push([
        '<tr>',
        `<td>${protocol.protocolId}</td>`,
        `<td>${variantName}</td>`,
        `<td>${variant.status}</td>`,
        `<td>${item.eventCount}</td>`,
        `<td>${item.blockerCount}</td>`,
        `<td>${item.browserStatus}</td>`,
        `<td>${item.architectStatus}</td>`,
        `<td>${item.qualityScore ?? ''}</td>`,
        `<td><a href="${artifactHref(root, join(root, 'text', `${protocol.protocolId}.txt`))}">text</a></td>`,
        `<td>${variant.artifacts.eventGraph ? `<a href="${artifactHref(root, variant.artifacts.eventGraph)}">graph</a>` : '<span class="missing">missing</span>'}</td>`,
        `<td>${variant.artifacts.browserReport ? `<a href="${artifactHref(root, variant.artifacts.browserReport)}">browser</a>` : '<span class="missing">missing</span>'}</td>`,
        `<td>${existsSync(screenshot) ? `<a href="${artifactHref(root, screenshot)}">screenshot</a>` : '<span class="missing">missing</span>'}</td>`,
        `<td>${variant.artifacts.architectVerdict ? `<a href="${artifactHref(root, variant.artifacts.architectVerdict)}">verdict</a>` : '<span class="missing">missing</span>'}</td>`,
        '</tr>',
      ].join(''));
    }
    protocols.push({
      protocolId: protocol.protocolId,
      status: protocol.status,
      variants,
    });
  }

  const yamlPath = join(indexDir, 'review-index.yaml');
  const htmlPath = join(indexDir, 'index.html');
  await writeYamlFile(yamlPath, {
    kind: 'protocol-foundry-review-index',
    generated_at: nowIso(),
    artifactRoot: root,
    protocols,
  });
  await writeFile(htmlPath, [
    '<!doctype html>',
    '<meta charset="utf-8">',
    '<title>Protocol Foundry Review Index</title>',
    '<style>',
    'body{font-family:system-ui,sans-serif;margin:24px;color:#1f2937} table{border-collapse:collapse;width:100%;font-size:13px} th,td{border:1px solid #d1d5db;padding:6px;text-align:left;vertical-align:top} th{background:#f3f4f6}.missing{color:#9ca3af}',
    '</style>',
    '<h1>Protocol Foundry Review Index</h1>',
    `<p>Generated ${nowIso()}</p>`,
    '<table>',
    '<thead><tr><th>Protocol</th><th>Variant</th><th>Status</th><th>Events</th><th>Blockers</th><th>Browser</th><th>Architect</th><th>Quality</th><th>Text</th><th>Graph</th><th>Browser Report</th><th>Screenshot</th><th>Verdict</th></tr></thead>',
    `<tbody>${htmlRows.join('\n')}</tbody>`,
    '</table>',
  ].join('\n'), 'utf-8');
  return htmlPath;
}
