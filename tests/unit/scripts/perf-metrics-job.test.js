const { runPerfMetricsJob, __testUtils } = require('../../../scripts/run-perf-metrics-job');

describe('run-perf-metrics-job helpers', () => {
  test('normalizes TOOLS_DOMAIN values with prefixes and leading dots', () => {
    expect(__testUtils.normalizeToolsDomain('.114.be.tn')).toBe('114.be.tn');
    expect(__testUtils.normalizeToolsDomain('https://example.internal/path')).toBe(
      'example.internal'
    );
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
      pushgatewayUrl: 'https://pushgateway.114.be.tn',
      prometheusUrl: 'https://prometheus.114.be.tn',
    });
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
    expect(stressMetricsEnvironment.PUSHGATEWAY_URL).toBe('https://pushgateway.114.be.tn');
    expect(stressMetricsEnvironment.PROMETHEUS_URL).toBe('https://prometheus.114.be.tn');
    expect(stressMetricsEnvironment.STRESS_METRICS_PUBLISH_TS_SECONDS).toBe('1700000000');

    expect(verifyCalls).toHaveLength(1);
    expect(verifyCalls[0]).toMatchObject({
      prometheusUrl: 'https://prometheus.114.be.tn',
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
});
