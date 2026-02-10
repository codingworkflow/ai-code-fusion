import type { AppUpdater } from 'electron-updater';
import type {
  UpdateCheckResult,
  UpdaterChannel,
  UpdaterFlagOverrides,
  UpdaterStatus,
} from '../types/ipc';
import { getErrorMessage } from './errors';

export interface UpdaterRuntimeOptions extends UpdaterStatus {
  checkOnStart: boolean;
}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

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
  runtimeOptions: UpdaterRuntimeOptions
) => {
  let configured = false;

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
  };

  const getStatus = (): UpdaterStatus => ({ ...baseStatus });

  const checkForUpdates = async (): Promise<UpdateCheckResult> => {
    if (!runtimeOptions.enabled) {
      return {
        ...baseStatus,
        state: 'disabled',
        updateAvailable: false,
      };
    }

    configure();

    try {
      const checkResult = (await updaterClient.checkForUpdates()) as UpdateCheckLike | null;
      const updateInfo = checkResult?.updateInfo || {};
      const latestVersion = updateInfo.version;
      const updateAvailable =
        typeof latestVersion === 'string' &&
        latestVersion.length > 0 &&
        latestVersion !== runtimeOptions.currentVersion;

      return {
        ...baseStatus,
        state: updateAvailable ? 'update-available' : 'up-to-date',
        updateAvailable,
        latestVersion,
        releaseName: updateInfo.releaseName,
      };
    } catch (error) {
      return {
        ...baseStatus,
        state: 'error',
        updateAvailable: false,
        errorMessage: getErrorMessage(error),
      };
    }
  };

  return {
    getStatus,
    checkForUpdates,
    shouldCheckOnStart: runtimeOptions.enabled && runtimeOptions.checkOnStart,
  };
};
