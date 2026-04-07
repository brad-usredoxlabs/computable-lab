import { describe, expect, it } from 'vitest';
import { mergeConfigPatch, redactSecrets } from './configHandlers.js';

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
