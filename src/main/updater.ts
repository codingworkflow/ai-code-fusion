import { getErrorMessage } from './errors';

import type {
  UpdateCheckResult,
  UpdaterChannel,
  UpdaterFlagOverrides,
  UpdaterStatus,
} from '../types/ipc';
import type { AppUpdater } from 'electron-updater';

export interface UpdaterRuntimeOptions extends UpdaterStatus {
  checkOnStart: boolean;
}

type UpdaterCheckEventContext = {
  channel: UpdaterChannel;
  allowPrerelease: boolean;
  owner: string;
  repo: string;
};

export type UpdaterCheckEvent = UpdaterCheckEventContext &
  (
    | {
        event: 'updater_check_configured' | 'updater_check_started';
      }
    | {
        event: 'updater_check_disabled';
        reason?: string;
      }
    | {
        event: 'updater_check_result';
        state: Exclude<UpdateCheckResult['state'], 'disabled' | 'error'>;
        updateAvailable: boolean;
        latestVersion?: string;
        releaseName?: string;
        reason?: string;
      }
    | {
        event: 'updater_check_error';
        state: 'error';
        errorMessage: string;
      }
  );

export interface UpdaterServiceObservers {
  onCheckEvent?: (event: UpdaterCheckEvent) => void;
}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const PRERELEASE_SEMVER_PATTERN = /^v?\d+\.\d+\.\d+-[0-9A-Za-z.-]+(?:\+[0-9A-Za-z.-]+)?$/;

export const parseBooleanEnv = (value: string | undefined): boolean | undefined => {
  if (!value) {
    return undefined;
  }
  return TRUE_VALUES.has(value.trim().toLowerCase());
};

export const isAlphaVersion = (version: string): boolean => {
  if (typeof version !== 'string') {
    return false;
  }
  return version.toLowerCase().includes('-alpha');
};

export const isPrereleaseVersion = (version: string | undefined): boolean => {
  if (typeof version !== 'string') {
    return false;
  }

  return PRERELEASE_SEMVER_PATTERN.test(version.trim());
};

export const resolveUpdaterChannel = (version: string): UpdaterChannel => {
  return isAlphaVersion(version) ? 'alpha' : 'stable';
};

export const isUpdaterPlatformSupported = (platform: NodeJS.Platform): boolean => {
  return platform === 'win32' || platform === 'darwin';
};

export const resolveUpdaterRuntimeOptions = ({
  currentVersion,
  platform,
  env = process.env,
  flagOverrides = {},
}: {
  currentVersion: string;
  platform: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  flagOverrides?: UpdaterFlagOverrides;
}): UpdaterRuntimeOptions => {
  const channel = resolveUpdaterChannel(currentVersion);
  const allowPrerelease = channel === 'alpha';
  const platformSupported = isUpdaterPlatformSupported(platform);

  const enabledOverride = flagOverrides.enabled ?? parseBooleanEnv(env.UPDATER_ENABLED);
  const enabledByDefault = env.NODE_ENV !== 'development';
  const enabled = platformSupported && (enabledOverride ?? enabledByDefault);

  const checkOnStart =
    flagOverrides.checkOnStart ?? parseBooleanEnv(env.UPDATER_CHECK_ON_START) ?? false;
  const owner = flagOverrides.owner || env.UPDATER_GH_OWNER || 'codingworkflow';
  const repo = flagOverrides.repo || env.UPDATER_GH_REPO || 'ai-code-fusion';

  let reason: string | undefined;
  if (!platformSupported) {
    reason = `Updater is disabled on unsupported platform: ${platform}`;
  } else if (!enabled) {
    reason = 'Updater is disabled by configuration';
  }

  return {
    enabled,
    platformSupported,
    channel,
    allowPrerelease,
    currentVersion,
    owner,
    repo,
    checkOnStart,
    reason,
  };
};

type UpdateInfoLike = {
  version?: string;
  releaseName?: string;
};

type UpdateCheckLike = {
  updateInfo?: UpdateInfoLike;
};

type UpdaterClient = Pick<
  AppUpdater,
  'checkForUpdates' | 'setFeedURL' | 'allowPrerelease' | 'autoDownload' | 'autoInstallOnAppQuit'
> & {
  channel?: string;
};

export const createUpdaterService = (
  updaterClient: UpdaterClient,
  runtimeOptions: UpdaterRuntimeOptions,
  observers: UpdaterServiceObservers = {}
) => {
  let configured = false;
  const eventContext: UpdaterCheckEventContext = {
    channel: runtimeOptions.channel,
    allowPrerelease: runtimeOptions.allowPrerelease,
    owner: runtimeOptions.owner,
    repo: runtimeOptions.repo,
  };

  const baseStatus: UpdaterStatus = {
    enabled: runtimeOptions.enabled,
    platformSupported: runtimeOptions.platformSupported,
    channel: runtimeOptions.channel,
    allowPrerelease: runtimeOptions.allowPrerelease,
    currentVersion: runtimeOptions.currentVersion,
    owner: runtimeOptions.owner,
    repo: runtimeOptions.repo,
    reason: runtimeOptions.reason,
  };

  const configure = () => {
    if (configured || !runtimeOptions.enabled) {
      return;
    }

    updaterClient.autoDownload = false;
    updaterClient.autoInstallOnAppQuit = true;
    updaterClient.allowPrerelease = runtimeOptions.allowPrerelease;
    updaterClient.channel = runtimeOptions.channel;

    updaterClient.setFeedURL({
      provider: 'github',
      owner: runtimeOptions.owner,
      repo: runtimeOptions.repo,
    });

    configured = true;
    observers.onCheckEvent?.({
      ...eventContext,
      event: 'updater_check_configured',
    });
  };

  const getStatus = (): UpdaterStatus => ({ ...baseStatus });

  const checkForUpdates = async (): Promise<UpdateCheckResult> => {
    if (!runtimeOptions.enabled) {
      observers.onCheckEvent?.({
        ...eventContext,
        event: 'updater_check_disabled',
        reason: runtimeOptions.reason,
      });

      return {
        ...baseStatus,
        state: 'disabled',
        updateAvailable: false,
      };
    }

    configure();
    observers.onCheckEvent?.({
      ...eventContext,
      event: 'updater_check_started',
    });

    try {
      const checkResult = (await updaterClient.checkForUpdates()) as UpdateCheckLike | null;
      const updateInfo = checkResult?.updateInfo || {};
      const rawLatestVersion = updateInfo.version;
      const prereleaseFiltered =
        !runtimeOptions.allowPrerelease && isPrereleaseVersion(rawLatestVersion);
      const latestVersion = prereleaseFiltered ? undefined : rawLatestVersion;
      const updateAvailable =
        typeof latestVersion === 'string' &&
        latestVersion.length > 0 &&
        latestVersion !== runtimeOptions.currentVersion;
      const state = updateAvailable ? 'update-available' : 'up-to-date';
      const releaseName = prereleaseFiltered ? undefined : updateInfo.releaseName;
      const result: UpdateCheckResult = {
        ...baseStatus,
        state,
        updateAvailable,
        latestVersion,
        releaseName,
      };

      observers.onCheckEvent?.({
        ...eventContext,
        event: 'updater_check_result',
        state,
        updateAvailable,
        latestVersion,
        releaseName,
        reason: prereleaseFiltered ? 'stable_channel_prerelease_rejected' : undefined,
      });

      return result;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      observers.onCheckEvent?.({
        ...eventContext,
        event: 'updater_check_error',
        state: 'error',
        errorMessage,
      });

      return {
        ...baseStatus,
        state: 'error',
        updateAvailable: false,
        errorMessage,
      };
    }
  };

  return {
    getStatus,
    checkForUpdates,
    shouldCheckOnStart: runtimeOptions.enabled && runtimeOptions.checkOnStart,
  };
};
