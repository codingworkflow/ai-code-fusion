import {
  createUpdaterService,
  isAlphaVersion,
  isUpdaterPlatformSupported,
  resolveUpdaterChannel,
  resolveUpdaterRuntimeOptions,
} from '../../../src/main/updater';

describe('updater utilities', () => {
  test('detects alpha version and channel', () => {
    expect(isAlphaVersion('0.3.0-alpha.1')).toBe(true);
    expect(resolveUpdaterChannel('0.3.0-alpha.1')).toBe('alpha');
    expect(resolveUpdaterChannel('0.3.0')).toBe('stable');
  });

  test('detects platform support for updater', () => {
    expect(isUpdaterPlatformSupported('win32')).toBe(true);
    expect(isUpdaterPlatformSupported('darwin')).toBe(true);
    expect(isUpdaterPlatformSupported('linux')).toBe(false);
  });

  test('builds runtime options from version and environment', () => {
    const alphaOptions = resolveUpdaterRuntimeOptions({
      currentVersion: '0.3.0-alpha.2',
      platform: 'win32',
      env: {
        NODE_ENV: 'production',
        UPDATER_CHECK_ON_START: 'true',
        UPDATER_GH_OWNER: 'acme',
        UPDATER_GH_REPO: 'desktop-app',
      },
    });

    expect(alphaOptions.enabled).toBe(true);
    expect(alphaOptions.channel).toBe('alpha');
    expect(alphaOptions.allowPrerelease).toBe(true);
    expect(alphaOptions.checkOnStart).toBe(true);
    expect(alphaOptions.owner).toBe('acme');
    expect(alphaOptions.repo).toBe('desktop-app');

    const stableLinuxOptions = resolveUpdaterRuntimeOptions({
      currentVersion: '0.3.0',
      platform: 'linux',
      env: {
        NODE_ENV: 'production',
      },
    });

    expect(stableLinuxOptions.channel).toBe('stable');
    expect(stableLinuxOptions.allowPrerelease).toBe(false);
    expect(stableLinuxOptions.platformSupported).toBe(false);
    expect(stableLinuxOptions.enabled).toBe(false);
    expect(stableLinuxOptions.reason).toContain('unsupported platform');
  });
});

describe('createUpdaterService', () => {
  const createMockUpdater = () => {
    return {
      checkForUpdates: jest.fn(),
      setFeedURL: jest.fn(),
      allowPrerelease: false,
      autoDownload: true,
      autoInstallOnAppQuit: false,
      channel: undefined as string | undefined,
    };
  };

  test('configures alpha prerelease checks and returns update available result', async () => {
    const updaterClient = createMockUpdater();
    updaterClient.checkForUpdates.mockResolvedValue({
      updateInfo: { version: '0.3.0-alpha.3', releaseName: 'Alpha 3' },
    });

    const runtimeOptions = resolveUpdaterRuntimeOptions({
      currentVersion: '0.3.0-alpha.2',
      platform: 'win32',
      env: {
        NODE_ENV: 'production',
      },
    });

    const service = createUpdaterService(updaterClient, runtimeOptions);
    const result = await service.checkForUpdates();

    expect(updaterClient.autoDownload).toBe(false);
    expect(updaterClient.autoInstallOnAppQuit).toBe(true);
    expect(updaterClient.allowPrerelease).toBe(true);
    expect(updaterClient.channel).toBe('alpha');
    expect(updaterClient.setFeedURL).toHaveBeenCalledWith({
      provider: 'github',
      owner: 'codingworkflow',
      repo: 'ai-code-fusion',
    });
    expect(result).toEqual(
      expect.objectContaining({
        state: 'update-available',
        updateAvailable: true,
        latestVersion: '0.3.0-alpha.3',
        channel: 'alpha',
      })
    );
  });

  test('returns up-to-date when latest equals current version', async () => {
    const updaterClient = createMockUpdater();
    updaterClient.checkForUpdates.mockResolvedValue({
      updateInfo: { version: '0.3.0', releaseName: 'Stable' },
    });

    const runtimeOptions = resolveUpdaterRuntimeOptions({
      currentVersion: '0.3.0',
      platform: 'darwin',
      env: {
        NODE_ENV: 'production',
      },
    });

    const service = createUpdaterService(updaterClient, runtimeOptions);
    const result = await service.checkForUpdates();

    expect(updaterClient.allowPrerelease).toBe(false);
    expect(updaterClient.channel).toBe('stable');
    expect(result.state).toBe('up-to-date');
    expect(result.updateAvailable).toBe(false);
  });

  test('returns disabled without calling updater client when disabled by env', async () => {
    const updaterClient = createMockUpdater();
    const runtimeOptions = resolveUpdaterRuntimeOptions({
      currentVersion: '0.3.0-alpha.1',
      platform: 'win32',
      env: {
        NODE_ENV: 'production',
        UPDATER_ENABLED: 'false',
      },
    });

    const service = createUpdaterService(updaterClient, runtimeOptions);
    const result = await service.checkForUpdates();

    expect(updaterClient.checkForUpdates).not.toHaveBeenCalled();
    expect(result.state).toBe('disabled');
    expect(result.updateAvailable).toBe(false);
  });

  test('returns error details when updater check throws', async () => {
    const updaterClient = createMockUpdater();
    updaterClient.checkForUpdates.mockRejectedValue(new Error('network failed'));

    const runtimeOptions = resolveUpdaterRuntimeOptions({
      currentVersion: '0.3.0',
      platform: 'win32',
      env: {
        NODE_ENV: 'production',
      },
    });

    const service = createUpdaterService(updaterClient, runtimeOptions);
    const result = await service.checkForUpdates();

    expect(result.state).toBe('error');
    expect(result.errorMessage).toContain('network failed');
  });
});
