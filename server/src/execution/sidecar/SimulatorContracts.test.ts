import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp } from '../../server.js';
import type { AppContext } from '../../server.js';
import { generateAssistPlusExecutionFixture, generateGeminiMeasurementFixture } from './SimulatorContracts.js';

describe('SimulatorContracts', () => {
  const testDir = resolve(process.cwd(), 'tmp/simulator-contracts-test');
  let ctx: AppContext;

  beforeAll(async () => {
    await mkdir(resolve(testDir, 'schema'), { recursive: true });
    await mkdir(resolve(testDir, 'records'), { recursive: true });
    ctx = await initializeApp(testDir, {
      schemaDir: 'schema',
      recordsDir: 'records',
      logLevel: 'silent',
    });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('writes deterministic assist-plus fixture file', async () => {
    const result = await generateAssistPlusExecutionFixture(ctx, {
      robotPlanId: 'RP-000001',
      artifactUri: 'records/robot-artifact/integra_assist/RP-000001.xml',
      parameters: { simulate: true, vialLayout: '3x5' },
    });
    expect(result.fixturePath).toBe('records/simulator/assist-plus/RP-000001.json');
    const file = await ctx.repoAdapter.getFile(result.fixturePath);
    expect(file?.content).toContain('"simulator": "assist_plus"');
    expect(file?.content).toContain('"robotPlanId": "RP-000001"');
  });

  it('writes deterministic gemini CSV fixture file', async () => {
    const result = await generateGeminiMeasurementFixture(ctx, {
      outputPath: 'records/inbox/gemini_simulated.csv',
      parameters: { mode: 'fluorescence', wavelengthNm: 520 },
    });
    expect(result.rawDataPath).toBe('records/inbox/gemini_simulated.csv');
    const file = await ctx.repoAdapter.getFile(result.rawDataPath);
    expect(file?.content).toContain('well,channelId,metric,value,unit');
    expect(file?.content).toContain('A1,FITC,RFU');
  });
});

