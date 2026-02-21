import type { AppContext } from '../../server.js';
import { LABOS_BRIDGE_CONTRACT_VERSION } from './BridgeContracts.js';

type SimulatorMetadata = Record<string, unknown>;

async function upsertFile(ctx: AppContext, path: string, content: string, message: string): Promise<void> {
  const existing = await ctx.repoAdapter.getFile(path);
  if (!existing) {
    await ctx.repoAdapter.createFile({ path, content, message });
    return;
  }
  await ctx.repoAdapter.updateFile({
    path,
    content,
    sha: existing.sha,
    message,
  });
}

export async function generateAssistPlusExecutionFixture(
  ctx: AppContext,
  input: { robotPlanId: string; artifactUri: string; parameters?: Record<string, unknown> }
): Promise<{ fixturePath: string; metadata: SimulatorMetadata; stdout: string }> {
  const fixturePath = `records/simulator/assist-plus/${input.robotPlanId}.json`;
  const metadata: SimulatorMetadata = {
    simulator: 'assist_plus',
    robotPlanId: input.robotPlanId,
    artifactUri: input.artifactUri,
    generatedAt: new Date().toISOString(),
    ...(input.parameters ? { parameters: input.parameters } : {}),
    executionId: `sim-assist-${input.robotPlanId.toLowerCase()}`,
  };
  await upsertFile(ctx, fixturePath, `${JSON.stringify(metadata, null, 2)}\n`, `Write Assist Plus simulator fixture ${input.robotPlanId}`);
  return {
    fixturePath,
    metadata,
    stdout: `${JSON.stringify({
      contractVersion: LABOS_BRIDGE_CONTRACT_VERSION,
      adapterId: 'integra_assist',
      operation: 'submit',
      result: {
        runId: String(metadata['executionId']),
        status: 'completed',
      },
      fixturePath,
      metadata,
    })}\n`,
  };
}

function buildGeminiCsv(seed: number): string {
  const a1 = 1000 + (seed % 47);
  const a2 = 900 + (seed % 31);
  return [
    'well,channelId,metric,value,unit',
    `A1,FITC,RFU,${a1.toFixed(1)},RFU`,
    `A2,FITC,RFU,${a2.toFixed(1)},RFU`,
    '',
  ].join('\n');
}

export async function generateGeminiMeasurementFixture(
  ctx: AppContext,
  input: { outputPath: string; parameters?: Record<string, unknown> }
): Promise<{ rawDataPath: string; metadata: SimulatorMetadata; stdout: string }> {
  const mode = typeof input.parameters?.['mode'] === 'string' ? input.parameters['mode'] : 'fluorescence';
  const seed = Number.isFinite(Number(input.parameters?.['wavelengthNm'])) ? Number(input.parameters?.['wavelengthNm']) : 485;
  const content = buildGeminiCsv(seed);
  await upsertFile(ctx, input.outputPath, content, `Write Gemini simulator measurement fixture ${input.outputPath}`);
  const metadata: SimulatorMetadata = {
    simulator: 'gemini',
    rawDataPath: input.outputPath,
    generatedAt: new Date().toISOString(),
    mode,
    wavelengthNm: seed,
  };
  return {
    rawDataPath: input.outputPath,
    metadata,
    stdout: `${JSON.stringify({
      contractVersion: LABOS_BRIDGE_CONTRACT_VERSION,
      adapterId: 'molecular_devices_gemini',
      operation: 'active_read',
      result: {
        rawDataPath: input.outputPath,
        status: 'completed',
        parserId: 'gemini_csv',
      },
      metadata,
    })}\n`,
  };
}
