import { getErrorMessage } from '../errors';

import type {
  ProviderConnectionOptions,
  ProviderConnectionResult,
  ProviderId,
} from '../../types/ipc';

const PROVIDER_CONNECTION_TIMEOUT_MS = 8000;

const SUPPORTED_PROVIDER_IDS = new Set<ProviderId>([
  'openai',
  'anthropic',
  'ollama',
  'openai-compatible',
]);

const PROVIDER_DEFAULT_BASE_URLS: Record<ProviderId, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  ollama: 'http://127.0.0.1:11434',
  'openai-compatible': 'http://127.0.0.1:8080/v1',
};

export type ProviderConnectionRequest = {
  url: string;
  headers: Record<string, string>;
};

type ProviderConnectionFetchOptions = {
  method: 'GET';
  headers: Record<string, string>;
  signal: AbortSignal;
};

export type ProviderConnectionFetch = (
  url: string,
  options: ProviderConnectionFetchOptions
) => Promise<Pick<Response, 'ok' | 'status' | 'statusText'>>;

type ProviderConnectionWarningContext = {
  providerId?: unknown;
  status?: number;
  statusText?: string;
  error?: string;
};

export type ProviderConnectionDependencies = {
  fetch: ProviderConnectionFetch;
  timeoutMs?: number;
  onWarn?: (message: string, context: ProviderConnectionWarningContext) => void;
};

const trimToUndefined = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const isSupportedProviderId = (candidate: unknown): candidate is ProviderId => {
  return typeof candidate === 'string' && SUPPORTED_PROVIDER_IDS.has(candidate as ProviderId);
};

const stripTrailingSlashes = (value: string): string => {
  let endIndex = value.length;
  while (endIndex > 0 && value.codePointAt(endIndex - 1) === 47) {
    endIndex -= 1;
  }
  return value.slice(0, endIndex);
};

export const normalizeProviderBaseUrl = (providerId: ProviderId, baseUrlInput?: string): string => {
  const fallback = PROVIDER_DEFAULT_BASE_URLS[providerId];
  const effectiveBaseUrl = trimToUndefined(baseUrlInput) ?? fallback;
  return stripTrailingSlashes(effectiveBaseUrl);
};

export const getProviderValidationErrors = (options: ProviderConnectionOptions): string[] => {
  const errors: string[] = [];
  if (!isSupportedProviderId(options.providerId)) {
    errors.push('Select a supported provider.');
    return errors;
  }

  const model = trimToUndefined(options.model);
  if (!model) {
    errors.push('Model is required.');
  }

  const apiKey = trimToUndefined(options.apiKey);
  const providerRequiresApiKey = options.providerId !== 'ollama';
  if (providerRequiresApiKey && !apiKey) {
    errors.push('API key is required for this provider.');
  }

  const baseUrl = trimToUndefined(options.baseUrl);
  if (baseUrl) {
    try {
      const parsed = new URL(baseUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        errors.push('Base URL must use http or https.');
      }
    } catch {
      errors.push('Base URL must be a valid URL.');
    }
  }

  return errors;
};

export const buildProviderConnectionRequest = (
  options: ProviderConnectionOptions
): ProviderConnectionRequest | null => {
  if (!isSupportedProviderId(options.providerId)) {
    return null;
  }

  const providerId = options.providerId;
  const baseUrl = normalizeProviderBaseUrl(providerId, options.baseUrl);

  if (providerId === 'ollama') {
    return {
      url: `${baseUrl}/api/tags`,
      headers: {
        Accept: 'application/json',
      },
    };
  }

  const endpointUrl = `${baseUrl}/models`;
  const apiKey = trimToUndefined(options.apiKey);
  if (!apiKey) {
    return null;
  }

  if (providerId === 'anthropic') {
    return {
      url: endpointUrl,
      headers: {
        Accept: 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    };
  }

  return {
    url: endpointUrl,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  };
};

const isAbortError = (error: unknown): boolean => {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: string }).name === 'AbortError'
  );
};

export const testProviderConnection = async (
  options: ProviderConnectionOptions,
  dependencies: ProviderConnectionDependencies
): Promise<ProviderConnectionResult> => {
  const validationErrors = getProviderValidationErrors(options);
  if (validationErrors.length > 0) {
    return {
      ok: false,
      message: validationErrors.join(' '),
    };
  }

  const request = buildProviderConnectionRequest(options);
  if (!request) {
    return {
      ok: false,
      message: 'Unable to build provider connection test request.',
    };
  }

  const timeoutMs = dependencies.timeoutMs ?? PROVIDER_CONNECTION_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await dependencies.fetch(request.url, {
      method: 'GET',
      headers: request.headers,
      signal: controller.signal,
    });

    if (response.ok) {
      return {
        ok: true,
        status: response.status,
        message: `Connection successful (${response.status}).`,
      };
    }

    dependencies.onWarn?.('Provider connection test failed', {
      providerId: options.providerId,
      status: response.status,
      statusText: response.statusText,
    });

    const statusLabel = response.statusText
      ? `${response.status} ${response.statusText}`
      : `${response.status}`;
    return {
      ok: false,
      status: response.status,
      message: `Connection failed (${statusLabel}).`,
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    const didAbort = isAbortError(error);

    if (!didAbort) {
      dependencies.onWarn?.('Provider connection test threw an error', {
        providerId: options.providerId,
        error: errorMessage,
      });
    }

    return {
      ok: false,
      message: didAbort
        ? `Connection timed out after ${timeoutMs}ms.`
        : 'Connection test failed. Check provider settings and network connectivity.',
    };
  } finally {
    clearTimeout(timeoutId);
  }
};
