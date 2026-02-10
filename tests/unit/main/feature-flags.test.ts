import { OpenFeature } from '@openfeature/server-sdk';
import {
  fetchRemoteUpdaterFlagOverrides,
  initializeUpdaterFeatureFlags,
  mergeUpdaterFlagOverrides,
  readUpdaterFlagOverridesFromEnv,
  readUpdaterFlagOverridesFromRemotePayload,
} from '../../../src/main/feature-flags';

describe('feature-flags updater normalization', () => {
  afterEach(async () => {
    await OpenFeature.close();
  });

  test('reads updater overrides from environment', () => {
    const result = readUpdaterFlagOverridesFromEnv({
      UPDATER_ENABLED: 'true',
      UPDATER_CHECK_ON_START: '1',
      UPDATER_GH_OWNER: 'codingworkflow',
      UPDATER_GH_REPO: 'ai-code-fusion',
    });

    expect(result).toEqual({
      enabled: true,
      checkOnStart: true,
      owner: 'codingworkflow',
      repo: 'ai-code-fusion',
    });
  });

  test('reads updater overrides from flat and nested remote payloads', () => {
    const flatResult = readUpdaterFlagOverridesFromRemotePayload({
      'updater.enabled': false,
      'updater.checkOnStart': true,
      'updater.ghOwner': 'remote-owner',
      'updater.ghRepo': 'remote-repo',
    });

    expect(flatResult).toEqual({
      enabled: false,
      checkOnStart: true,
      owner: 'remote-owner',
      repo: 'remote-repo',
    });

    const nestedResult = readUpdaterFlagOverridesFromRemotePayload({
      updater: {
        enabled: true,
        checkOnStart: false,
        ghOwner: 'nested-owner',
        ghRepo: 'nested-repo',
      },
    });

    expect(nestedResult).toEqual({
      enabled: true,
      checkOnStart: false,
      owner: 'nested-owner',
      repo: 'nested-repo',
    });
  });

  test('merges remote and env flags with env taking precedence', () => {
    const result = mergeUpdaterFlagOverrides(
      {
        enabled: false,
        checkOnStart: true,
        owner: 'remote-owner',
        repo: 'remote-repo',
      },
      {
        enabled: true,
        checkOnStart: undefined,
        owner: 'env-owner',
      }
    );

    expect(result).toEqual({
      enabled: true,
      checkOnStart: true,
      owner: 'env-owner',
      repo: 'remote-repo',
    });
  });

  test('fetches and parses remote flags only from allowed URLs', async () => {
    const allowedResult = await fetchRemoteUpdaterFlagOverrides({
      url: 'https://example.com/flags.json',
      fetchFn: jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          'updater.enabled': true,
          'updater.checkOnStart': false,
        }),
      }),
    });

    expect(allowedResult).toEqual({
      enabled: true,
      checkOnStart: false,
      owner: undefined,
      repo: undefined,
    });

    const blockedResult = await fetchRemoteUpdaterFlagOverrides({
      url: 'http://example.com/flags.json',
      fetchFn: jest.fn(),
    });
    expect(blockedResult).toEqual({});
  });

  test('initializes OpenFeature client and returns normalized updater overrides', async () => {
    const result = await initializeUpdaterFeatureFlags({
      env: {
        FEATURE_FLAGS_URL: 'https://example.com/flags.json',
        UPDATER_ENABLED: 'true',
      },
      fetchFn: jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          'updater.enabled': false,
          'updater.checkOnStart': true,
          'updater.ghOwner': 'remote-owner',
          'updater.ghRepo': 'remote-repo',
        }),
      }),
    });

    expect(result).toEqual({
      enabled: true,
      checkOnStart: true,
      owner: 'remote-owner',
      repo: 'remote-repo',
    });
  });
});
