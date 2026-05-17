import { runFixture } from './src/compiler/pipeline/fixtures/FixtureRunner.js';
import { parseFixture } from './src/compiler/pipeline/fixtures/FixtureTypes.js';
import { readFileSync } from 'node:fs';

const yamlText = readFileSync('./src/compiler/pipeline/fixtures/spec-fix-2026-05-17-iusqo.yaml', 'utf-8');
const fixture = parseFixture(yamlText);
const result = await runFixture(fixture);
console.log('Outcome:', result.outcome);
console.log('DeckLayoutPlan:', JSON.stringify(result.terminalArtifacts.deckLayoutPlan, null, 2));
console.log('Events:', JSON.stringify(result.terminalArtifacts.events, null, 2));
