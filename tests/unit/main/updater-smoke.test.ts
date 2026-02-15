import { createUpdaterService, resolveUpdaterRuntimeOptions } from '../../../src/main/updater';

import type { UpdaterCheckEvent } from '../../../src/main/updater';

describe('updater smoke validation', () => {
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

  const createEventCollector = () => {
    const events: UpdaterCheckEvent[] = [];
    return {
      events,
      onCheckEvent: (event: UpdaterCheckEvent) => {
        events.push(event);
      },
    };
  };

  test('manual alpha updater check accepts prerelease updates and emits observability events', async () => {
    const updaterClient = createMockUpdater();
    updaterClient.checkForUpdates.mockResolvedValue({
      updateInfo: {
        releaseName: 'Alpha 3',
        version: '0.3.0-alpha.3',
      },
    });
    const eventCollector = createEventCollector();
    const runtimeOptions = resolveUpdaterRuntimeOptions({
      currentVersion: '0.3.0-alpha.2',
      platform: 'win32',
      env: {
        NODE_ENV: 'production',
      },
    });

    const service = createUpdaterService(updaterClient, runtimeOptions, {
      onCheckEvent: eventCollector.onCheckEvent,
    });
    const result = await service.checkForUpdates();

    expect(result).toEqual(
      expect.objectContaining({
        channel: 'alpha',
        latestVersion: '0.3.0-alpha.3',
        state: 'update-available',
        updateAvailable: true,
      })
    );
    expect(eventCollector.events).toEqual([
      expect.objectContaining({
        event: 'updater_check_configured',
      }),
      expect.objectContaining({
        event: 'updater_check_started',
      }),
      expect.objectContaining({
        event: 'updater_check_result',
        latestVersion: '0.3.0-alpha.3',
        state: 'update-available',
        updateAvailable: true,
      }),
    ]);
  });

  test('manual stable updater check rejects prerelease discovery and records rejection reason', async () => {
    const updaterClient = createMockUpdater();
    updaterClient.checkForUpdates.mockResolvedValue({
      updateInfo: {
        releaseName: 'Alpha candidate',
        version: '0.3.1-alpha.1',
      },
    });
    const eventCollector = createEventCollector();
    const runtimeOptions = resolveUpdaterRuntimeOptions({
      currentVersion: '0.3.0',
      platform: 'darwin',
      env: {
        NODE_ENV: 'production',
      },
    });

    const service = createUpdaterService(updaterClient, runtimeOptions, {
      onCheckEvent: eventCollector.onCheckEvent,
    });
    const result = await service.checkForUpdates();

    expect(result.channel).toBe('stable');
    expect(result.allowPrerelease).toBe(false);
    expect(result.state).toBe('up-to-date');
    expect(result.updateAvailable).toBe(false);
    expect(result.latestVersion).toBeUndefined();
    expect(eventCollector.events).toContainEqual(
      expect.objectContaining({
        event: 'updater_check_result',
        reason: 'stable_channel_prerelease_rejected',
        state: 'up-to-date',
        updateAvailable: false,
      })
    );
  });

  test('linux updater disabled path stays explicit and emits disabled observability event', async () => {
    const updaterClient = createMockUpdater();
    const eventCollector = createEventCollector();
    const runtimeOptions = resolveUpdaterRuntimeOptions({
      currentVersion: '0.3.0',
      platform: 'linux',
      env: {
        NODE_ENV: 'production',
      },
    });

    const service = createUpdaterService(updaterClient, runtimeOptions, {
      onCheckEvent: eventCollector.onCheckEvent,
    });
    const result = await service.checkForUpdates();

    expect(result.state).toBe('disabled');
    expect(result.updateAvailable).toBe(false);
    expect(result.reason).toContain('unsupported platform');
    expect(updaterClient.checkForUpdates).not.toHaveBeenCalled();
    expect(eventCollector.events).toEqual([
      expect.objectContaining({
        event: 'updater_check_disabled',
      }),
    ]);
  });
});
