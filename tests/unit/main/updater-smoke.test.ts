import { createUpdaterService, resolveUpdaterRuntimeOptions } from '../../../src/main/updater';

import type { UpdaterCheckEvent } from '../../../src/main/updater';

describe('updater smoke validation', () => {
  const createRuntimeOptions = (currentVersion: string, platform: NodeJS.Platform) =>
    resolveUpdaterRuntimeOptions({
      currentVersion,
      platform,
      env: {
        NODE_ENV: 'production',
      },
    });

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

  const createEventContext = (
    runtimeOptions: ReturnType<typeof resolveUpdaterRuntimeOptions>
  ): Pick<UpdaterCheckEvent, 'channel' | 'allowPrerelease' | 'owner' | 'repo'> => ({
    channel: runtimeOptions.channel,
    allowPrerelease: runtimeOptions.allowPrerelease,
    owner: runtimeOptions.owner,
    repo: runtimeOptions.repo,
  });

  const createConfiguredAndStartedEvents = (
    eventContext: Pick<UpdaterCheckEvent, 'channel' | 'allowPrerelease' | 'owner' | 'repo'>
  ) => [
    {
      ...eventContext,
      event: 'updater_check_configured' as const,
    },
    {
      ...eventContext,
      event: 'updater_check_started' as const,
    },
  ];

  test('manual alpha updater check accepts prerelease updates and emits observability events', async () => {
    const updaterClient = createMockUpdater();
    updaterClient.checkForUpdates.mockResolvedValue({
      updateInfo: {
        releaseName: 'Alpha 3',
        version: '0.3.0-alpha.3',
      },
    });
    const eventCollector = createEventCollector();
    const runtimeOptions = createRuntimeOptions('0.3.0-alpha.2', 'win32');
    const eventContext = createEventContext(runtimeOptions);

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
      ...createConfiguredAndStartedEvents(eventContext),
      {
        ...eventContext,
        event: 'updater_check_result',
        latestVersion: '0.3.0-alpha.3',
        releaseName: 'Alpha 3',
        reason: undefined,
        state: 'update-available',
        updateAvailable: true,
      },
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
    const runtimeOptions = createRuntimeOptions('0.3.0', 'darwin');
    const eventContext = createEventContext(runtimeOptions);

    const service = createUpdaterService(updaterClient, runtimeOptions, {
      onCheckEvent: eventCollector.onCheckEvent,
    });
    const result = await service.checkForUpdates();

    expect(result.channel).toBe('stable');
    expect(result.allowPrerelease).toBe(false);
    expect(result.state).toBe('up-to-date');
    expect(result.updateAvailable).toBe(false);
    expect(result.latestVersion).toBeUndefined();
    expect(eventCollector.events).toEqual([
      ...createConfiguredAndStartedEvents(eventContext),
      {
        ...eventContext,
        event: 'updater_check_result',
        latestVersion: undefined,
        releaseName: undefined,
        reason: 'stable_channel_prerelease_rejected',
        state: 'up-to-date',
        updateAvailable: false,
      },
    ]);
  });

  test('linux updater disabled path stays explicit and emits disabled observability event', async () => {
    const updaterClient = createMockUpdater();
    const eventCollector = createEventCollector();
    const runtimeOptions = createRuntimeOptions('0.3.0', 'linux');
    const eventContext = createEventContext(runtimeOptions);

    const service = createUpdaterService(updaterClient, runtimeOptions, {
      onCheckEvent: eventCollector.onCheckEvent,
    });
    const result = await service.checkForUpdates();

    expect(result.state).toBe('disabled');
    expect(result.updateAvailable).toBe(false);
    expect(result.reason).toContain('unsupported platform');
    expect(updaterClient.checkForUpdates).not.toHaveBeenCalled();
    expect(eventCollector.events).toEqual([
      {
        ...eventContext,
        event: 'updater_check_disabled',
        reason: 'Updater is disabled on unsupported platform: linux',
      },
    ]);
  });
});
