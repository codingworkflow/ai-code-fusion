const {
  waitForStressMetrics,
  __testUtils,
} = require('../../../scripts/verify-prometheus-metrics');

describe('verify-prometheus-metrics helpers', () => {
  test('builds strict query set for job and instance labels', () => {
    const queries = __testUtils.buildMetricQueries(
      'ai_code_fusion_stress_publish_timestamp_seconds',
      'ai_code_fusion_stress',
      'local-dev-123'
    );

    expect(queries).toEqual([
      'ai_code_fusion_stress_publish_timestamp_seconds{job="ai_code_fusion_stress",instance="local-dev-123"}',
      'ai_code_fusion_stress_publish_timestamp_seconds{exported_job="ai_code_fusion_stress",exported_instance="local-dev-123"}',
    ]);
  });

  test('waits until Prometheus returns publish timestamp at or above the threshold', async () => {
    const queryFn = jest.fn(async (prometheusUrl, query, options) => {
      expect(options).toMatchObject({ requestTimeoutMs: 250 });
      if (query.includes('exported_job=')) {
        return [1_700_000_005];
      }

      return [];
    });

    const result = await waitForStressMetrics({
      prometheusUrl: 'https://prometheus.example.internal',
      jobName: 'ai_code_fusion_stress',
      instanceName: 'local-dev-123',
      minPublishTimestampSeconds: 1_700_000_000,
      timeoutMs: 250,
      pollIntervalMs: 50,
      queryFn,
      nowFn: () => 0,
      sleepFn: async () => {},
    });

    expect(result.query).toContain('exported_job=');
    expect(result.values).toContain(1_700_000_005);
    expect(queryFn).toHaveBeenCalled();
  });

  test('times out when Prometheus never returns matching values', async () => {
    let now = 0;
    const queryFn = jest.fn(async () => []);

    await expect(
      waitForStressMetrics({
        prometheusUrl: 'https://prometheus.example.internal',
        jobName: 'ai_code_fusion_stress',
        instanceName: 'local-dev-123',
        minPublishTimestampSeconds: 1_700_000_000,
        timeoutMs: 150,
        pollIntervalMs: 50,
        queryFn,
        nowFn: () => now,
        sleepFn: async (intervalMs) => {
          now += intervalMs;
        },
      })
    ).rejects.toThrow('Attempted queries:');
  });
});
