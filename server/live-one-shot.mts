import { createInferenceClient } from './src/ai/InferenceClient.js';
import { extractBranchQuestionsFromSmallLlm, compileFromSmallLlm } from './src/compiler/scientistIntent/intentCompile.js';
import * as fs from 'node:fs';
import { parse as parseYaml } from 'yaml';

const client = createInferenceClient({
  provider: 'openai-compatible',
  baseUrl: 'http://127.0.0.1:8899/v1',
  model: 'lfm2.5-2.6b',
  enableThinking: false,
  temperature: 0,
}) as never;

const seg: any = parseYaml(fs.readFileSync('../artifacts/segments/d4302-d4306-d4308-zymobiomics-96-magbead-dna-kit.yaml', 'utf8'));
const full = String(seg.protocol_text ?? '');
const start = full.indexOf('Add sample to the BashingBead');
const end = full.indexOf('Appendices');
const RAW = full.slice(start, end > start ? end : start + 5000).trim();

console.log('=== RAW ZYMO LEN', RAW.length, '===');

// Stage 1: branch questions (real LFM)
const axes = await extractBranchQuestionsFromSmallLlm({ protocolText: RAW, llmClient: client, model: 'lfm2.5-2.6b' });
console.log('BRANCH AXES:', JSON.stringify(axes.axes.map((a) => ({ axisId: a.axisId, q: a.question }))));

// Stage 2: one-shot with a bacterial answer folded in (mimics the chat submit)
const localized = await compileFromSmallLlm({
  prompt: `Resolved branch: sample_type=bacterial; module_type=rack.\n\n${RAW}`,
  llmClient: client,
  model: 'lfm2.5-2.6b',
  deps: {
    searchLabwareByHint: async (h) => {
      const hl = h.toLowerCase();
      if (hl.includes('deepwell') || hl.includes('block') || hl.includes('sample')) return [{ recordId: 'LAB-sample', title: h }];
      if (hl.includes('reservoir')) return [{ recordId: 'LAB-reservoir', title: h }];
      if (hl.includes('pcr') || hl.includes('elution')) return [{ recordId: 'LAB-pcr', title: h }];
      return [];
    },
  },
});

console.log('OUTCOME:', localized.compile.outcome);
const byType: Record<string, number> = {};
for (const e of localized.compile.terminalArtifacts.events) byType[e.event_type] = (byType[e.event_type] ?? 0) + 1;
console.log('EVENTS:', JSON.stringify(byType));
console.log('GAPS:', localized.compile.terminalArtifacts.gaps.length);
console.log('MACRO ACTIONS:', localized.intent.actions.map((a: any) => a.action).join(', '));
const bad = localized.intent.actions.filter((a: any) => !['transfer','mix','add_material','incubate','spin','read','centrifuge'].includes(a.action));
console.log('NON-CANONICAL VERBS:', bad.length === 0 ? '(none — verb-lift clean)' : bad.map((a: any) => a.action).join(', '));
process.exit(0);