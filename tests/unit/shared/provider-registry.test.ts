import {
  isSupportedProviderId,
  PROVIDER_API_KEY_REQUIREMENTS,
  PROVIDER_DEFAULT_BASE_URLS,
  PROVIDER_OPTIONS,
  providerRequiresApiKey,
} from '../../../src/shared/provider-registry';

describe('shared provider registry', () => {
  test('exposes provider options in stable order with expected ids', () => {
    const providerIds = PROVIDER_OPTIONS.map((providerOption) => providerOption.id);
    const expectedIds = ['openai', 'anthropic', 'ollama', 'openai-compatible'];

    expect(providerIds.length).toBeGreaterThanOrEqual(expectedIds.length);
    expect(providerIds.slice(0, expectedIds.length)).toEqual(expectedIds);
  });


  test('keeps default base URLs aligned with provider options', () => {
    for (const providerOption of PROVIDER_OPTIONS) {
      expect(PROVIDER_DEFAULT_BASE_URLS[providerOption.id]).toBe(providerOption.defaultBaseUrl);
    }
  });

  test('keeps API-key requirements aligned with provider options', () => {
    for (const providerOption of PROVIDER_OPTIONS) {
      expect(PROVIDER_API_KEY_REQUIREMENTS[providerOption.id]).toBe(
        providerOption.requiresApiKey
      );
      expect(providerRequiresApiKey(providerOption.id)).toBe(providerOption.requiresApiKey);
    }
  });

  test('validates supported provider ids', () => {
    expect(isSupportedProviderId('openai')).toBe(true);
    expect(isSupportedProviderId('openai-compatible')).toBe(true);
    expect(isSupportedProviderId('unsupported')).toBe(false);
    expect(isSupportedProviderId('')).toBe(false);
    expect(isSupportedProviderId(null)).toBe(false);
    expect(isSupportedProviderId(undefined)).toBe(false);
  });
});
