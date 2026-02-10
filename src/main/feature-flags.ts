import { InMemoryProvider, OpenFeature } from '@openfeature/server-sdk';
import type { UpdaterFlagOverrides } from './updater';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

const DEFAULT_FETCH_TIMEOUT_MS = 3000;

export const UPDATER_FLAG_KEYS = {
  enabled: 'updater.enabled',
  checkOnStart: 'updater.checkOnStart',
  owner: 'updater.ghOwner',
  repo: 'updater.ghRepo',
} as const;

type UpdaterFlagKey = (typeof UPDATER_FLAG_KEYS)[keyof typeof UPDATER_FLAG_KEYS];

type FlagConfiguration = Record<
  string,
  {
    variants: Record<string, boolean | string>;
    defaultVariant: string;
    disabled: boolean;
  }
>;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type RemoteFlagRecord = Record<string, unknown>;

const parseBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return TRUE_VALUES.has(value.trim().toLowerCase());
  }

  return undefined;
};

const parseNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

export const readUpdaterFlagOverridesFromEnv = (
  env: NodeJS.ProcessEnv = process.env
): UpdaterFlagOverrides => {
  return {
    enabled: parseBoolean(env.UPDATER_ENABLED),
    checkOnStart: parseBoolean(env.UPDATER_CHECK_ON_START),
    owner: parseNonEmptyString(env.UPDATER_GH_OWNER),
    repo: parseNonEmptyString(env.UPDATER_GH_REPO),
  };
};

const mapFlatRemoteFlags = (payload: RemoteFlagRecord): UpdaterFlagOverrides => {
  return {
    enabled: parseBoolean(payload[UPDATER_FLAG_KEYS.enabled]),
    checkOnStart: parseBoolean(payload[UPDATER_FLAG_KEYS.checkOnStart]),
    owner: parseNonEmptyString(payload[UPDATER_FLAG_KEYS.owner]),
    repo: parseNonEmptyString(payload[UPDATER_FLAG_KEYS.repo]),
  };
};

const mapNestedRemoteFlags = (payload: RemoteFlagRecord): UpdaterFlagOverrides => {
  const updaterSection = payload.updater;
  if (!updaterSection || typeof updaterSection !== 'object') {
    return {};
  }

  const updaterObject = updaterSection as RemoteFlagRecord;
  return {
    enabled: parseBoolean(updaterObject.enabled),
    checkOnStart: parseBoolean(updaterObject.checkOnStart),
    owner: parseNonEmptyString(updaterObject.ghOwner),
    repo: parseNonEmptyString(updaterObject.ghRepo),
  };
};

export const readUpdaterFlagOverridesFromRemotePayload = (
  payload: unknown
): UpdaterFlagOverrides => {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  const recordPayload = payload as RemoteFlagRecord;
  const flat = mapFlatRemoteFlags(recordPayload);
  const nested = mapNestedRemoteFlags(recordPayload);

  return {
    enabled: flat.enabled ?? nested.enabled,
    checkOnStart: flat.checkOnStart ?? nested.checkOnStart,
    owner: flat.owner ?? nested.owner,
    repo: flat.repo ?? nested.repo,
  };
};

export const mergeUpdaterFlagOverrides = (
  remoteFlags: UpdaterFlagOverrides,
  envFlags: UpdaterFlagOverrides
): UpdaterFlagOverrides => {
  return {
    enabled: envFlags.enabled ?? remoteFlags.enabled,
    checkOnStart: envFlags.checkOnStart ?? remoteFlags.checkOnStart,
    owner: envFlags.owner ?? remoteFlags.owner,
    repo: envFlags.repo ?? remoteFlags.repo,
  };
};

const isRemoteFlagsUrlAllowed = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') {
      return true;
    }
    return parsed.protocol === 'http:' && parsed.hostname === 'localhost';
  } catch {
    return false;
  }
};

export const fetchRemoteUpdaterFlagOverrides = async ({
  url,
  fetchFn = globalThis.fetch as FetchLike | undefined,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
}: {
  url: string;
  fetchFn?: FetchLike;
  timeoutMs?: number;
}): Promise<UpdaterFlagOverrides> => {
  if (!url || !isRemoteFlagsUrlAllowed(url) || !fetchFn) {
    return {};
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchFn(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      return {};
    }

    const payload = await response.json();
    return readUpdaterFlagOverridesFromRemotePayload(payload);
  } catch {
    return {};
  } finally {
    clearTimeout(timeoutId);
  }
};

const addBooleanFlag = (
  flags: FlagConfiguration,
  key: UpdaterFlagKey,
  value: boolean | undefined
) => {
  if (typeof value !== 'boolean') {
    return;
  }

  flags[key] = {
    variants: {
      enabled: true,
      disabled: false,
    },
    defaultVariant: value ? 'enabled' : 'disabled',
    disabled: false,
  };
};

const addStringFlag = (flags: FlagConfiguration, key: UpdaterFlagKey, value: string | undefined) => {
  if (!value) {
    return;
  }

  flags[key] = {
    variants: {
      value,
    },
    defaultVariant: 'value',
    disabled: false,
  };
};

const getValueOrUndefined = <T>(details: { value: T; reason?: string }): T | undefined => {
  return details.reason === 'ERROR' ? undefined : details.value;
};

export const initializeUpdaterFeatureFlags = async ({
  env = process.env,
  fetchFn = globalThis.fetch as FetchLike | undefined,
}: {
  env?: NodeJS.ProcessEnv;
  fetchFn?: FetchLike;
} = {}): Promise<UpdaterFlagOverrides> => {
  const envFlags = readUpdaterFlagOverridesFromEnv(env);
  const remoteUrl = parseNonEmptyString(env.FEATURE_FLAGS_URL);
  const remoteFlags = remoteUrl
    ? await fetchRemoteUpdaterFlagOverrides({ url: remoteUrl, fetchFn })
    : {};
  const mergedFlags = mergeUpdaterFlagOverrides(remoteFlags, envFlags);

  const configuration: FlagConfiguration = {};
  addBooleanFlag(configuration, UPDATER_FLAG_KEYS.enabled, mergedFlags.enabled);
  addBooleanFlag(configuration, UPDATER_FLAG_KEYS.checkOnStart, mergedFlags.checkOnStart);
  addStringFlag(configuration, UPDATER_FLAG_KEYS.owner, mergedFlags.owner);
  addStringFlag(configuration, UPDATER_FLAG_KEYS.repo, mergedFlags.repo);

  await OpenFeature.setProviderAndWait(new InMemoryProvider(configuration));

  const client = OpenFeature.getClient('desktop-main');
  const enabledDetails = await client.getBooleanDetails(UPDATER_FLAG_KEYS.enabled, false);
  const checkOnStartDetails = await client.getBooleanDetails(UPDATER_FLAG_KEYS.checkOnStart, false);
  const ownerDetails = await client.getStringDetails(UPDATER_FLAG_KEYS.owner, '');
  const repoDetails = await client.getStringDetails(UPDATER_FLAG_KEYS.repo, '');

  return {
    enabled: getValueOrUndefined(enabledDetails),
    checkOnStart: getValueOrUndefined(checkOnStartDetails),
    owner: getValueOrUndefined(ownerDetails),
    repo: getValueOrUndefined(repoDetails),
  };
};
