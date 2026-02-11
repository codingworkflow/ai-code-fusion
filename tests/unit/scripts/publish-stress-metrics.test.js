const { __testUtils } = require('../../../scripts/publish-stress-metrics');

describe('publish-stress-metrics helpers', () => {
  test('keeps only the latest record per scenario for metric publishing', () => {
    const records = [
      {
        scenario: 'fs:getDirectoryTree-large-flat',
        sourceFile: 'ipc-latency-1000.json',
        capturedAt: '2026-02-10T10:00:00.000Z',
        capturedAtMs: 1000,
        p50Ms: 40,
        p95Ms: 60,
        p99Ms: 75,
        sampleCount: 5,
        fileCount: 5000,
        iterations: null,
      },
      {
        scenario: 'fs:getDirectoryTree-large-flat',
        sourceFile: 'ipc-latency-2000.json',
        capturedAt: '2026-02-10T10:01:00.000Z',
        capturedAtMs: 2000,
        p50Ms: 42,
        p95Ms: 65,
        p99Ms: 76,
        sampleCount: 5,
        fileCount: 5000,
        iterations: null,
      },
      {
        scenario: 'fs:getDirectoryTree-event-loop-lag',
        sourceFile: 'event-loop-lag-1500.json',
        capturedAt: '2026-02-10T10:00:30.000Z',
        capturedAtMs: 1500,
        p50Ms: 1,
        p95Ms: 4,
        p99Ms: 7,
        sampleCount: 20,
        fileCount: null,
        iterations: 20,
      },
    ];

    const latestRecords = __testUtils.selectLatestRecordPerScenario(records);
    expect(latestRecords).toHaveLength(2);

    const latestLatencyRecord = latestRecords.find(
      (record) => record.scenario === 'fs:getDirectoryTree-large-flat'
    );
    expect(latestLatencyRecord).toBeDefined();
    expect(latestLatencyRecord.sourceFile).toBe('ipc-latency-2000.json');
  });

  test('includes publish timestamp metric in Prometheus payload', () => {
    const payload = __testUtils.buildPrometheusPayload(
      [
        {
          scenario: 'fs:getDirectoryTree-event-loop-lag',
          p50Ms: 1,
          p95Ms: 4,
          p99Ms: 7,
          sampleCount: 20,
          fileCount: null,
          iterations: 20,
        },
      ],
      { publishTimestampSeconds: 1_700_000_000 }
    );

    expect(payload).toContain(
      'ai_code_fusion_stress_publish_timestamp_seconds 1700000000'
    );
    expect(payload).toContain('percentile="p95",scenario="fs:getDirectoryTree-event-loop-lag"');
  });
});
