const PROVIDER_OPTIONS_INTERNAL = [
  {
    id: 'openai',
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresApiKey: true,
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    requiresApiKey: true,
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    defaultBaseUrl: 'http://127.0.0.1:11434',
    requiresApiKey: false,
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI-compatible',
    defaultBaseUrl: 'http://127.0.0.1:8080/v1',
    requiresApiKey: true,
  },
] as const;

export type ProviderId = (typeof PROVIDER_OPTIONS_INTERNAL)[number]['id'];

export type ProviderOption = {
  id: ProviderId;
  label: string;
  defaultBaseUrl: string;
  requiresApiKey: boolean;
};

export const PROVIDER_OPTIONS: readonly ProviderOption[] = PROVIDER_OPTIONS_INTERNAL;

const SUPPORTED_PROVIDER_IDS = new Set<ProviderId>();
const providerDefaultBaseUrls = {} as Record<ProviderId, string>;
const providerApiKeyRequirements = {} as Record<ProviderId, boolean>;

for (const providerOption of PROVIDER_OPTIONS) {
  SUPPORTED_PROVIDER_IDS.add(providerOption.id);
  providerDefaultBaseUrls[providerOption.id] = providerOption.defaultBaseUrl;
  providerApiKeyRequirements[providerOption.id] = providerOption.requiresApiKey;
}

export const PROVIDER_DEFAULT_BASE_URLS: Readonly<Record<ProviderId, string>> =
  providerDefaultBaseUrls;

export const PROVIDER_API_KEY_REQUIREMENTS: Readonly<Record<ProviderId, boolean>> =
  providerApiKeyRequirements;

export const isSupportedProviderId = (candidate: unknown): candidate is ProviderId => {
  return typeof candidate === 'string' && SUPPORTED_PROVIDER_IDS.has(candidate as ProviderId);
};

export const providerRequiresApiKey = (providerId: ProviderId): boolean => {
  return PROVIDER_API_KEY_REQUIREMENTS[providerId];
};
