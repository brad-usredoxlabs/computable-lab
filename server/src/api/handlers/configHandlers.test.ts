import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { mergeConfigPatch, redactSecrets, ConfigHandlers } from './configHandlers.js';
import { DEFAULT_CONFIG as DEFAULT_APP_CONFIG } from '../../config/types.js';

describe('config handlers secret merging', () => {
  it('redacts Exa API keys in config responses', () => {
    const result = redactSecrets({
      integrations: {
        exa: {
          enabled: true,
          apiKey: 'secret-exa-key',
        },
      },
    });

    expect(result).toEqual({
      integrations: {
        exa: {
          enabled: true,
          apiKey: '***',
        },
      },
    });
  });

  it('drops redacted placeholders when creating a new nested config branch', () => {
    const merged = mergeConfigPatch({}, {
      integrations: {
        exa: {
          enabled: true,
          apiKey: '***',
          baseUrl: 'https://api.exa.ai',
        },
      },
    });

    expect(merged).toEqual({
      integrations: {
        exa: {
          enabled: true,
          baseUrl: 'https://api.exa.ai',
        },
      },
    });
  });
});

describe('ConfigHandlers.patchConfig policy bundle guard', () => {
  it('rejects an unknown lab.policyBundleId with 400', async () => {
    let statusCode = 0
    const reply = { status: (c: number) => { statusCode = c; return reply }, send: (b: any) => b }
    const h = new ConfigHandlers(
      '/tmp/does-not-matter.yaml',
      { ...DEFAULT_APP_CONFIG, lab: { materialTracking: { mode: 'relaxed', allowAdHocEventInstances: true }, policyBundleId: 'POL-SANDBOX' } },
      undefined,
      undefined,
      () => ['POL-SANDBOX', 'POL-NOTEBOOK', 'POL-TRACKED', 'POL-REGULATED'],
    )
    const out = await h.patchConfig({ body: { lab: { policyBundleId: 'POL-TYPO' } } } as any, reply as any)
    expect(statusCode).toBe(400)
    expect((out as any).details?.[0]?.path).toContain('policyBundleId')
  })
})

describe('ConfigHandlers.patchConfig policy bundle change guard', () => {
  const KNOWN = ['POL-SANDBOX', 'POL-NOTEBOOK', 'POL-TRACKED', 'POL-REGULATED']

  function makeConfig(policyBundleId: string) {
    return {
      ...structuredClone(DEFAULT_APP_CONFIG),
      lab: {
        materialTracking: { mode: 'relaxed' as const, allowAdHocEventInstances: true },
        policyBundleId,
      },
    }
  }

  function makeReply() {
    let statusCode = 200
    const reply: any = {
      status: (c: number) => { statusCode = c; return reply },
      send: (b: any) => { reply.body = b; return b },
    }
    return { reply, getStatus: () => statusCode }
  }

  async function tempConfigPath(initialPolicyBundleId: string) {
    const dir = await mkdtemp(join(tmpdir(), 'cl-config-guard-'))
    const configPath = join(dir, 'config.yaml')
    const h0 = new ConfigHandlers(
      configPath,
      makeConfig(initialPolicyBundleId),
      undefined,
      undefined,
      () => KNOWN,
    )
    // Seed the file on disk with the initial config via a no-op-ish patch
    // (patch of an unrelated-but-identical value; guard absent here).
    const { reply } = makeReply()
    await h0.patchConfig({ body: { lab: {} } } as any, reply as any)
    return configPath
  }

  it('admin actor: writes config and records appendAudit with from/to/actor', async () => {
    const configPath = await tempConfigPath('POL-SANDBOX')
    const appendAudit = vi.fn(async () => {})
    const onConfigUpdate = vi.fn(async () => {})
    const h = new ConfigHandlers(
      configPath,
      makeConfig('POL-SANDBOX'),
      onConfigUpdate,
      undefined,
      () => KNOWN,
      {
        resolveActor: async () => ({ userId: 'alice', isSystem: false }),
        isAdmin: async () => true,
        appendAudit,
      },
    )
    const { reply, getStatus } = makeReply()
    const out = await h.patchConfig(
      { body: { lab: { policyBundleId: 'POL-TRACKED' } } } as any,
      reply as any,
    )
    expect(getStatus()).toBe(200)
    expect((out as any).success).toBe(true)
    expect(onConfigUpdate).toHaveBeenCalled()
    expect(appendAudit).toHaveBeenCalledWith({
      from: 'POL-SANDBOX',
      to: 'POL-TRACKED',
      actor: 'alice',
    })
    // Config actually on disk
    const onDisk = parseYaml(await readFile(configPath, 'utf-8'))
    expect(onDisk.lab.policyBundleId).toBe('POL-TRACKED')
  })

  it('audits even when the value equals the current one', async () => {
    const configPath = await tempConfigPath('POL-SANDBOX')
    const appendAudit = vi.fn()
    const h = new ConfigHandlers(
      configPath,
      makeConfig('POL-SANDBOX'),
      undefined,
      undefined,
      () => KNOWN,
      {
        resolveActor: async () => ({ userId: 'alice', isSystem: false }),
        isAdmin: () => true,
        appendAudit,
      },
    )
    const { reply, getStatus } = makeReply()
    await h.patchConfig(
      { body: { lab: { policyBundleId: 'POL-SANDBOX' } } } as any,
      reply as any,
    )
    expect(getStatus()).toBe(200)
    expect(appendAudit).toHaveBeenCalledWith({
      from: 'POL-SANDBOX',
      to: 'POL-SANDBOX',
      actor: 'alice',
    })
  })

  it('non-admin actor: 403 POLICY_BUNDLE_CHANGE_FORBIDDEN and config not written', async () => {
    const configPath = await tempConfigPath('POL-SANDBOX')
    const before = await readFile(configPath, 'utf-8')
    const appendAudit = vi.fn()
    const onConfigUpdate = vi.fn()
    const h = new ConfigHandlers(
      configPath,
      makeConfig('POL-SANDBOX'),
      onConfigUpdate,
      undefined,
      () => KNOWN,
      {
        resolveActor: async () => ({ userId: 'mallory', isSystem: false }),
        isAdmin: async () => false,
        appendAudit,
      },
    )
    const { reply, getStatus } = makeReply()
    const out = await h.patchConfig(
      { body: { lab: { policyBundleId: 'POL-REGULATED' } } } as any,
      reply as any,
    )
    expect(getStatus()).toBe(403)
    expect((out as any).error).toBe('POLICY_BUNDLE_CHANGE_FORBIDDEN')
    expect(await readFile(configPath, 'utf-8')).toBe(before)
    expect(onConfigUpdate).not.toHaveBeenCalled()
    expect(appendAudit).not.toHaveBeenCalled()
  })

  it('anonymous actor (userId null, not system): 403 uniformly, not 401', async () => {
    const configPath = await tempConfigPath('POL-SANDBOX')
    const before = await readFile(configPath, 'utf-8')
    const h = new ConfigHandlers(
      configPath,
      makeConfig('POL-SANDBOX'),
      undefined,
      undefined,
      () => KNOWN,
      {
        resolveActor: async () => ({ userId: null, isSystem: false }),
        isAdmin: async () => true, // never reached
        appendAudit: vi.fn(),
      },
    )
    const { reply, getStatus } = makeReply()
    const out = await h.patchConfig(
      { body: { lab: { policyBundleId: 'POL-REGULATED' } } } as any,
      reply as any,
    )
    expect(getStatus()).toBe(403)
    expect((out as any).error).toBe('POLICY_BUNDLE_CHANGE_FORBIDDEN')
    expect(String((out as any).message)).toMatch(/identity required/i)
    expect(await readFile(configPath, 'utf-8')).toBe(before)
  })

  it('resolveActor throwing fails closed with 403', async () => {
    const configPath = await tempConfigPath('POL-SANDBOX')
    const h = new ConfigHandlers(
      configPath,
      makeConfig('POL-SANDBOX'),
      undefined,
      undefined,
      () => KNOWN,
      {
        resolveActor: async () => { throw new Error('auth backend down') },
        isAdmin: async () => true,
        appendAudit: vi.fn(),
      },
    )
    const { reply, getStatus } = makeReply()
    const out = await h.patchConfig(
      { body: { lab: { policyBundleId: 'POL-REGULATED' } } } as any,
      reply as any,
    )
    expect(getStatus()).toBe(403)
    expect((out as any).error).toBe('POLICY_BUNDLE_CHANGE_FORBIDDEN')
  })

  it('system actor: allowed, audit actor recorded as system', async () => {
    const configPath = await tempConfigPath('POL-SANDBOX')
    const appendAudit = vi.fn()
    const h = new ConfigHandlers(
      configPath,
      makeConfig('POL-SANDBOX'),
      undefined,
      undefined,
      () => KNOWN,
      {
        resolveActor: async () => ({ userId: null, isSystem: true }),
        isAdmin: async () => true,
        appendAudit,
      },
    )
    const { reply, getStatus } = makeReply()
    const out = await h.patchConfig(
      { body: { lab: { policyBundleId: 'POL-NOTEBOOK' } } } as any,
      reply as any,
    )
    expect(getStatus()).toBe(200)
    expect((out as any).success).toBe(true)
    expect(appendAudit).toHaveBeenCalledWith({
      from: 'POL-SANDBOX',
      to: 'POL-NOTEBOOK',
      actor: 'system',
    })
  })

  it('appendAudit failure never fails the write (best-effort)', async () => {
    const configPath = await tempConfigPath('POL-SANDBOX')
    const h = new ConfigHandlers(
      configPath,
      makeConfig('POL-SANDBOX'),
      undefined,
      undefined,
      () => KNOWN,
      {
        resolveActor: async () => ({ userId: 'alice', isSystem: false }),
        isAdmin: () => true,
        appendAudit: async () => { throw new Error('audit store down') },
      },
    )
    const { reply, getStatus } = makeReply()
    const out = await h.patchConfig(
      { body: { lab: { policyBundleId: 'POL-TRACKED' } } } as any,
      reply as any,
    )
    expect(getStatus()).toBe(200)
    expect((out as any).success).toBe(true)
    const onDisk = parseYaml(await readFile(configPath, 'utf-8'))
    expect(onDisk.lab.policyBundleId).toBe('POL-TRACKED')
  })

  it('patch without lab.policyBundleId never consults the guard', async () => {
    const configPath = await tempConfigPath('POL-SANDBOX')
    const resolveActor = vi.fn(async () => ({ userId: 'alice', isSystem: false }))
    const appendAudit = vi.fn()
    const h = new ConfigHandlers(
      configPath,
      makeConfig('POL-SANDBOX'),
      undefined,
      undefined,
      () => KNOWN,
      {
        resolveActor,
        isAdmin: async () => false, // would 403 if wrongly consulted
        appendAudit,
      },
    )
    const { reply, getStatus } = makeReply()
    const out = await h.patchConfig(
      { body: { ai: { inference: { baseUrl: 'http://localhost:1234/v1', model: 'm' } } } } as any,
      reply as any,
    )
    expect(getStatus()).toBe(200)
    expect((out as any).success).toBe(true)
    expect(resolveActor).not.toHaveBeenCalled()
    expect(appendAudit).not.toHaveBeenCalled()
  })

  it('without a policyChangeGuard the switch works as before (no hard-wired authz)', async () => {
    const configPath = await tempConfigPath('POL-SANDBOX')
    const h = new ConfigHandlers(
      configPath,
      makeConfig('POL-SANDBOX'),
      undefined,
      undefined,
      () => KNOWN,
    )
    const { reply, getStatus } = makeReply()
    const out = await h.patchConfig(
      { body: { lab: { policyBundleId: 'POL-NOTEBOOK' } } } as any,
      reply as any,
    )
    expect(getStatus()).toBe(200)
    expect((out as any).success).toBe(true)
  })

  it('unknown policy bundle id is rejected with 400 before the guard is consulted', async () => {
    const configPath = await tempConfigPath('POL-SANDBOX')
    const resolveActor = vi.fn(async () => ({ userId: 'alice', isSystem: false }))
    const appendAudit = vi.fn()
    const h = new ConfigHandlers(
      configPath,
      makeConfig('POL-SANDBOX'),
      undefined,
      undefined,
      () => KNOWN,
      {
        resolveActor,
        isAdmin: () => true,
        appendAudit,
      },
    )
    const { reply, getStatus } = makeReply()
    await h.patchConfig(
      { body: { lab: { policyBundleId: 'POL-TYPO' } } } as any,
      reply as any,
    )
    expect(getStatus()).toBe(400)
    expect(resolveActor).not.toHaveBeenCalled()
    expect(appendAudit).not.toHaveBeenCalled()
  })
})

describe('ConfigHandlers.listAiProfiles', () => {
  it('returns the redacted inference block and whether a key is stored', async () => {
    const sent: { status?: number; body?: any } = {}
    const reply = {
      status: (c: number) => { sent.status = c; return reply },
      send: (b: any) => { sent.body = b; return b },
    }
    const config = {
      ...structuredClone(DEFAULT_APP_CONFIG),
      ai: {
        activeProfile: 'local-box',
        profiles: {
          'local-box': {
            inference: {
              provider: 'openai-compatible',
              baseUrl: 'http://thunderbeast:8080/v1',
              model: 'qwen3.8-flash-next',
              // A real key is stored; the response must never echo it back.
              apiKey: 'sk-live-secret',
              timeoutMs: 60000,
            },
            agent: {},
          },
          openrouter: {
            inference: {
              provider: 'openai-compatible',
              baseUrl: 'https://openrouter.ai/api/v1',
              model: 'anthropic/claude-sonnet-4.5',
            },
            agent: {},
          },
        },
      },
    } as any

    const h = new ConfigHandlers('/tmp/does-not-matter.yaml', config)
    await h.listAiProfiles({} as any, reply as any)

    const byName = Object.fromEntries((sent.body.profiles as any[]).map((p) => [p.name, p]))
    expect(sent.body.activeProfile).toBe('local-box')
    // The key is stored…
    expect(byName['local-box'].hasApiKey).toBe(true)
    // …but only ever appears redacted.
    expect(byName['local-box'].inference.apiKey).toBe('***')
    // Fields the editor does not expose still round-trip, so saving cannot
    // silently drop them (PUT replaces the whole inference object).
    expect(byName['local-box'].inference.timeoutMs).toBe(60000)
    expect(byName['openrouter'].hasApiKey).toBe(false)
    expect(byName['openrouter'].inference.apiKey).toBeUndefined()
  })
})
