/**
 * inspectRegistry — worktree harness for the Fix-it coder's `inspect_registry`
 * tool. One uniform inspector across every loadable registry, so the coder
 * can see what records EXIST (and drill into any one of them) for any noun
 * class — labware, ontology terms, compound classes, execution-scale
 * profiles, assays, etc. — without grepping seed files by hand.
 *
 *   npx tsx server/src/compiler/pipeline/fixtures/inspectRegistry.ts --name labware-definitions
 *   npx tsx ... --name labware-definitions --key lbw-def-generic-96-well-plate
 */
import { getAssayDefinitionRegistry } from '../../../registry/AssayDefinitionRegistry.js';
import { getAssaySpecRegistry } from '../../../registry/AssaySpecRegistry.js';
import { getCompoundClassRegistry } from '../../../registry/CompoundClassRegistry.js';
import { getCuratedVendorRegistry } from '../../../registry/CuratedVendorRegistry.js';
import { getExecutionScaleProfileRegistry } from '../../../registry/ExecutionScaleProfileRegistry.js';
import { getInstrumentRegistry } from '../../../registry/InstrumentRegistry.js';
import { getIssueCardTemplateRegistry } from '../../../registry/IssueCardTemplateRegistry.js';
import { getLabwareDefinitionRegistry } from '../../../registry/LabwareDefinitionRegistry.js';
import { getMeasurementPanelRegistry } from '../../../registry/MeasurementPanelRegistry.js';
import { getOntologyTermRegistry } from '../../../registry/OntologyTermRegistry.js';
import { getPipetteCapabilityRegistry } from '../../../registry/PipetteCapabilityRegistry.js';
import { getPromptTemplateRegistry } from '../../../registry/PromptTemplateRegistry.js';
import { getProtocolSpecRegistry } from '../../../registry/ProtocolSpecRegistry.js';
import { getReadoutDefinitionRegistry } from '../../../registry/ReadoutDefinitionRegistry.js';
import { getStampPatternRegistry } from '../../../registry/StampPatternRegistry.js';

// Registry name -> loader factory. Kebab-case names mirror the
// schema/registry/<name> directory structure.
const REGISTRIES: Record<string, () => { list(): Array<Record<string, unknown>> }> = {
  'assay-definitions': () => getAssayDefinitionRegistry() as never,
  'assay-specs': () => getAssaySpecRegistry() as never,
  'compound-classes': () => getCompoundClassRegistry() as never,
  'curated-vendors': () => getCuratedVendorRegistry() as never,
  'execution-scale-profiles': () => getExecutionScaleProfileRegistry() as never,
  'instruments': () => getInstrumentRegistry() as never,
  'issue-card-templates': () => getIssueCardTemplateRegistry() as never,
  'labware-definitions': () => getLabwareDefinitionRegistry() as never,
  'measurement-panels': () => getMeasurementPanelRegistry() as never,
  'ontology-terms': () => getOntologyTermRegistry() as never,
  'pipette-capabilities': () => getPipetteCapabilityRegistry() as never,
  'prompt-templates': () => getPromptTemplateRegistry() as never,
  'protocol-specs': () => getProtocolSpecRegistry() as never,
  'readout-definitions': () => getReadoutDefinitionRegistry() as never,
  'stamp-patterns': () => getStampPatternRegistry() as never,
};

function argOf(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

// Records use either `recordId` or `id`; the label may live under a few names.
function idOf(rec: Record<string, unknown>): string {
  const r = rec['recordId'] ?? rec['id'];
  return typeof r === 'string' ? r : '';
}
function labelOf(rec: Record<string, unknown>): string {
  for (const k of ['name', 'title', 'display_name', 'displayName', 'label']) {
    const v = rec[k];
    if (typeof v === 'string' && v) return v;
  }
  return '';
}

async function main(): Promise<void> {
  const name = argOf('--name') ?? '';
  if (!name) {
    process.stderr.write('inspectRegistry: --name is required\n');
    process.exit(2);
  }
  const factory = REGISTRIES[name];
  if (!factory) {
    const available = Object.keys(REGISTRIES).sort();
    process.stdout.write(JSON.stringify({ error: `unknown registry: ${name}`, available }) + '\n');
    return;
  }
  const registry = factory();
  const entries = registry.list();
  const key = argOf('--key');
  if (key) {
    const hit = entries.find((e) => idOf(e) === key);
    if (!hit) {
      const sample = entries.slice(0, 8).map(idOf).filter(Boolean);
      process.stdout.write(JSON.stringify({ registry: name, key, found: false, sampleIds: sample, totalEntries: entries.length }) + '\n');
      return;
    }
    process.stdout.write(JSON.stringify({ registry: name, key, found: true, record: hit }) + '\n');
    return;
  }
  const summary = entries.map((e) => ({ id: idOf(e), label: labelOf(e) }));
  process.stdout.write(JSON.stringify({ registry: name, totalEntries: entries.length, entries: summary }) + '\n');
}

main().catch((err) => {
  process.stderr.write(`inspectRegistry failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
