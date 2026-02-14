import {
  buildProviderConnectionRequest,
  getProviderValidationErrors,
  normalizeProviderBaseUrl,
  testProviderConnection,
} from '../../../src/main/services/provider-connection';

import type { ProviderConnectionOptions, ProviderId } from '../../../src/types/ipc';

const asProviderId = (value: string): ProviderId => {
  return value as ProviderId;
};

type MockFetchResponse = {
  ok: boolean;
  status: number;
  statusText: string;
};

const createFetchResponse = (overrides: Partial<MockFetchResponse> = {}): MockFetchResponse => {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    ...overrides,
  };
};

describe('provider-connection service', () => {
  test('returns required-field validation errors for provider test options', () => {
    const errors = getProviderValidationErrors({
      providerId: asProviderId('openai'),
      model: '   ',
      apiKey: '',
    });

    expect(errors).toContain('Model is required.');
    expect(errors).toContain('API key is required for this provider.');
  });

  test('rejects unsupported provider IDs before other validation', () => {
    const errors = getProviderValidationErrors({
      providerId: 'unsupported-provider' as ProviderId,
      model: 'gpt-4.1-mini',
      apiKey: 'test-key',
    });

    expect(errors).toEqual(['Select a supported provider.']);
  });

  test('validates custom base URL format and protocol', () => {
    const invalidUrlErrors = getProviderValidationErrors({
      providerId: asProviderId('openai'),
      model: 'gpt-4.1-mini',
      apiKey: 'test-key',
      baseUrl: 'not-a-url',
    });
    expect(invalidUrlErrors).toContain('Base URL must be a valid URL.');

    const invalidProtocolErrors = getProviderValidationErrors({
      providerId: asProviderId('openai'),
      model: 'gpt-4.1-mini',
      apiKey: 'test-key',
      baseUrl: 'ftp://example.com/v1',
    });
    expect(invalidProtocolErrors).toContain('Base URL must use http or https.');
  });

  test('normalizes base URL values and falls back to provider defaults', () => {
    expect(normalizeProviderBaseUrl(asProviderId('openai'), 'https://example.com/v1///')).toBe(
      'https://example.com/v1'
    );
    expect(normalizeProviderBaseUrl(asProviderId('openai'), '    ')).toBe(
      'https://api.openai.com/v1'
    );
    expect(normalizeProviderBaseUrl(asProviderId('ollama'))).toBe('http://127.0.0.1:11434');
  });

  test('builds provider request payloads with provider-specific endpoints and headers', () => {
    const openAiRequest = buildProviderConnectionRequest({
      providerId: asProviderId('openai'),
      model: 'gpt-4.1-mini',
      apiKey: 'openai-key',
      baseUrl: 'https://api.openai.com/v1/',
    });
    expect(openAiRequest).toEqual({
      url: 'https://api.openai.com/v1/models',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer openai-key',
      },
    });

    const anthropicRequest = buildProviderConnectionRequest({
      providerId: asProviderId('anthropic'),
      model: 'claude-3-7-sonnet-latest',
      apiKey: 'anthropic-key',
    });
    expect(anthropicRequest).toEqual({
      url: 'https://api.anthropic.com/v1/models',
      headers: {
        Accept: 'application/json',
        'x-api-key': 'anthropic-key',
        'anthropic-version': '2023-06-01',
      },
    });

    const ollamaRequest = buildProviderConnectionRequest({
      providerId: asProviderId('ollama'),
      model: 'llama3.2',
    });
    expect(ollamaRequest).toEqual({
      url: 'http://127.0.0.1:11434/api/tags',
      headers: {
        Accept: 'application/json',
      },
    });
  });

  test('returns null request when provider requires API key but key is missing', () => {
    expect(
      buildProviderConnectionRequest({
        providerId: asProviderId('openai'),
        model: 'gpt-4.1-mini',
        apiKey: '  ',
      })
    ).toBeNull();
  });

  test('tests provider connection and returns success payload when fetch succeeds', async () => {
    const fetchMock = jest.fn().mockResolvedValue(createFetchResponse());

    const result = await testProviderConnection(
      {
        providerId: asProviderId('openai'),
        model: 'gpt-4.1-mini',
        apiKey: 'openai-key',
      },
      {
        fetch: fetchMock,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer openai-key',
        },
      })
    );
    expect(result).toEqual({
      ok: true,
      status: 200,
      message: 'Connection successful (200).',
    });
  });

  test('returns status-based failure and warning metadata when fetch responds non-ok', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createFetchResponse({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      })
    );
    const warnMock = jest.fn();

    const result = await testProviderConnection(
      {
        providerId: asProviderId('openai'),
        model: 'gpt-4.1-mini',
        apiKey: 'openai-key',
      },
      {
        fetch: fetchMock,
        onWarn: warnMock,
      }
    );

    expect(warnMock).toHaveBeenCalledWith('Provider connection test failed', {
      providerId: 'openai',
      status: 401,
      statusText: 'Unauthorized',
    });
    expect(result).toEqual({
      ok: false,
      status: 401,
      message: 'Connection failed (401 Unauthorized).',
    });
  });

  test('returns timeout and generic network failure messages without leaking secrets', async () => {
    const abortError = new Error('aborted');
    (abortError as Error & { name?: string }).name = 'AbortError';
    const timeoutFetchMock = jest.fn().mockRejectedValue(abortError);
    const timeoutResult = await testProviderConnection(
      {
        providerId: asProviderId('openai'),
        model: 'gpt-4.1-mini',
        apiKey: 'openai-key',
      },
      {
        fetch: timeoutFetchMock,
        timeoutMs: 3210,
      }
    );

    expect(timeoutResult).toEqual({
      ok: false,
      message: 'Connection timed out after 3210ms.',
    });

    const genericFetchMock = jest.fn().mockRejectedValue(new Error('network down'));
    const warnMock = jest.fn();
    const genericResult = await testProviderConnection(
      {
        providerId: asProviderId('openai'),
        model: 'gpt-4.1-mini',
        apiKey: 'openai-key',
      },
      {
        fetch: genericFetchMock,
        onWarn: warnMock,
      }
    );

    expect(warnMock).toHaveBeenCalledWith(
      'Provider connection test threw an error',
      expect.objectContaining({
        providerId: 'openai',
      })
    );
    expect(genericResult).toEqual({
      ok: false,
      message: 'Connection test failed. Check provider settings and network connectivity.',
    });
  });

  test('returns validation errors without performing network fetch', async () => {
    const fetchMock = jest.fn();
    const invalidOptions: ProviderConnectionOptions = {
      providerId: asProviderId('openai'),
      model: '',
      apiKey: '',
    };

    const result = await testProviderConnection(invalidOptions, {
      fetch: fetchMock,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Model is required.');
    expect(result.message).toContain('API key is required for this provider.');
  });
});
