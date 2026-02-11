const { runPerfMetricsJob, __testUtils } = require('../../../scripts/run-perf-metrics-job');

describe('run-perf-metrics-job helpers', () => {
  test('normalizes TOOLS_DOMAIN values with prefixes and leading dots', () => {
    expect(__testUtils.normalizeToolsDomain('.114.be.tn')).toBe('114.be.tn');
    expect(__testUtils.normalizeToolsDomain('https://example.internal/path')).toBe(
      'example.internal'
    );
    expect(__testUtils.normalizeToolsDomain('example.internal:8443')).toBe('example.internal');
  });

  test('trims only boundary dots from host values', () => {
    expect(__testUtils.trimBoundaryDots('.example.internal.')).toBe('example.internal');
    expect(__testUtils.trimBoundaryDots('...a.b.c...')).toBe('a.b.c');
  });

  test('rejects invalid TOOLS_DOMAIN values', () => {
    expect(() => __testUtils.normalizeToolsDomain('http://')).toThrow(
      'Invalid TOOLS_DOMAIN value'
    );
  });

  test('resolves monitoring endpoints from TOOLS_DOMAIN', () => {
    const endpoints = __testUtils.resolveMonitoringEndpoints({
      TOOLS_DOMAIN: '.114.be.tn',
      PUSHGATEWAY_URL: '',
      PROMETHEUS_URL: '',
    });

    expect(endpoints).toEqual({
      toolsDomain: '114.be.tn',
      pushgatewayUrl: 'https://pushgateway.114.be.tn/',
      prometheusUrl: 'https://prometheus.114.be.tn/',
    });
  });

  test('normalizes explicit endpoint URLs without schemes', () => {
    const endpoints = __testUtils.resolveMonitoringEndpoints({
      PUSHGATEWAY_URL: 'pushgateway.internal',
      PROMETHEUS_URL: 'prometheus.internal',
    });

    expect(endpoints.pushgatewayUrl).toBe('https://pushgateway.internal/');
    expect(endpoints.prometheusUrl).toBe('https://prometheus.internal/');
  });

  test('redacts credentials and query parameters in endpoint logs', async () => {
    const executedCommands = [];
    const log = jest.fn();

    await runPerfMetricsJob({
      env: {
        PUSHGATEWAY_URL: 'https://user:secret@pushgateway.example.com/base?token=abc',
        PROMETHEUS_URL: 'https://prometheus.example.com/api?token=xyz',
        PUSHGATEWAY_JOB: 'ai_code_fusion_stress',
      },
      nowFn: () => 1_700_000_000_000,
      hostName: 'dev-host',
      execFn: (command, options) => {
        executedCommands.push({ command, env: options.env });
      },
      verifyFn: async () => {},
      logger: { log },
    });

    expect(executedCommands).toHaveLength(2);
    const logOutput = log.mock.calls.map((call) => call[0]).join('\n');
    expect(logOutput).toContain('Pushgateway endpoint: https://pushgateway.example.com');
    expect(logOutput).toContain('Prometheus endpoint: https://prometheus.example.com');
    expect(logOutput).not.toContain('secret');
    expect(logOutput).not.toContain('token=');
  });

  test('runs stress publish flow and validates Prometheus', async () => {
    const executedCommands = [];
    const verifyCalls = [];
    const log = jest.fn();

    await runPerfMetricsJob({
      env: {
        TOOLS_DOMAIN: '.114.be.tn',
        PUSHGATEWAY_JOB: 'ai_code_fusion_stress',
      },
      nowFn: () => 1_700_000_000_000,
      hostName: 'dev-host',
      execFn: (command, options) => {
        executedCommands.push({ command, env: options.env });
      },
      verifyFn: async (options) => {
        verifyCalls.push(options);
      },
      logger: { log },
    });

    expect(executedCommands.map((entry) => entry.command)).toEqual([
      'npm run test:stress',
      'npm run stress:metrics',
    ]);

    const stressMetricsEnvironment = executedCommands[1].env;
    expect(stressMetricsEnvironment.PUSHGATEWAY_URL).toBe('https://pushgateway.114.be.tn/');
    expect(stressMetricsEnvironment.PROMETHEUS_URL).toBe('https://prometheus.114.be.tn/');
    expect(stressMetricsEnvironment.STRESS_METRICS_PUBLISH_TS_SECONDS).toBe('1700000000');

    expect(verifyCalls).toHaveLength(1);
    expect(verifyCalls[0]).toMatchObject({
      prometheusUrl: 'https://prometheus.114.be.tn/',
      jobName: 'ai_code_fusion_stress',
      instanceName: 'local-dev-host-1700000000000',
      minPublishTimestampSeconds: 1_700_000_000,
    });
  });

  test('fails fast when monitoring endpoints cannot be resolved', async () => {
    await expect(runPerfMetricsJob({ env: {} })).rejects.toThrow(
      'Unable to resolve monitoring endpoints'
    );
  });

  test('fails fast when TOOLS_DOMAIN cannot be normalized', async () => {
    await expect(runPerfMetricsJob({ env: { TOOLS_DOMAIN: 'http://' } })).rejects.toThrow(
      'Invalid TOOLS_DOMAIN value'
    );
  });
});
