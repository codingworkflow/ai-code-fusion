#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const BENCHMARK_DIR = path.join(ROOT_DIR, 'dist', 'benchmarks');
const SUMMARY_FILE = path.join(BENCHMARK_DIR, 'summary.json');
const PROMETHEUS_FILE = path.join(BENCHMARK_DIR, 'stress-metrics.prom');
const METRIC_PREFIX = 'ai_code_fusion_stress';

function toFiniteNumber(value) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function pickFirstNumber(candidate, keys) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(candidate, key)) {
      continue;
    }

    const numericValue = toFiniteNumber(candidate[key]);
    if (numericValue !== null) {
      return numericValue;
    }
  }

  return null;
}

function sanitizeLabelValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function toMetricLine(metricName, value, labels = {}) {
  const numericValue = toFiniteNumber(value);
  if (numericValue === null) {
    return null;
  }

  const labelEntries = Object.entries(labels)
    .filter(([, labelValue]) => typeof labelValue === 'string' && labelValue.length > 0)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, labelValue]) => `${key}="${sanitizeLabelValue(labelValue)}"`);

  const formattedLabels = labelEntries.length > 0 ? `{${labelEntries.join(',')}}` : '';
  return `${metricName}${formattedLabels} ${numericValue}`;
}

function readBenchmarkFiles() {
  if (!fs.existsSync(BENCHMARK_DIR)) {
    throw new Error(`Benchmark directory not found: ${BENCHMARK_DIR}`);
  }

  const filePaths = fs
    .readdirSync(BENCHMARK_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => fileName.endsWith('.json'))
    .filter((fileName) => fileName !== path.basename(SUMMARY_FILE))
    .map((fileName) => path.join(BENCHMARK_DIR, fileName));

  if (filePaths.length === 0) {
    throw new Error(`No stress benchmark JSON files found in ${BENCHMARK_DIR}`);
  }

  return filePaths;
}

function normalizeBenchmarkRecord(filePath) {
  const rawContent = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(rawContent);
  const sourceStats = fs.statSync(filePath);

  const scenario =
    typeof parsed.scenario === 'string' && parsed.scenario.trim().length > 0
      ? parsed.scenario.trim()
      : path.basename(filePath, '.json');

  const runs = Array.isArray(parsed.runs)
    ? parsed.runs.map((value) => toFiniteNumber(value)).filter((value) => value !== null)
    : [];
  const lagSamplesMs = Array.isArray(parsed.lagSamplesMs)
    ? parsed.lagSamplesMs.map((value) => toFiniteNumber(value)).filter((value) => value !== null)
    : [];

  const p50Ms = pickFirstNumber(parsed, ['p50Ms', 'p50LagMs']);
  const p95Ms = pickFirstNumber(parsed, ['p95Ms', 'p95LagMs']);
  const p99Ms = pickFirstNumber(parsed, ['p99Ms', 'p99LagMs']);
  const sampleCount = runs.length > 0 ? runs.length : lagSamplesMs.length;

  return {
    scenario,
    sourceFile: path.basename(filePath),
    capturedAt: sourceStats.mtime.toISOString(),
    p50Ms,
    p95Ms,
    p99Ms,
    sampleCount,
    fileCount: toFiniteNumber(parsed.fileCount),
    iterations: toFiniteNumber(parsed.iterations),
  };
}

function buildPrometheusPayload(records) {
  const lines = [
    `# HELP ${METRIC_PREFIX}_latency_ms Stress benchmark latency in milliseconds.`,
    `# TYPE ${METRIC_PREFIX}_latency_ms gauge`,
  ];

  for (const record of records) {
    const p50Line = toMetricLine(`${METRIC_PREFIX}_latency_ms`, record.p50Ms, {
      percentile: 'p50',
      scenario: record.scenario,
    });
    const p95Line = toMetricLine(`${METRIC_PREFIX}_latency_ms`, record.p95Ms, {
      percentile: 'p95',
      scenario: record.scenario,
    });
    const p99Line = toMetricLine(`${METRIC_PREFIX}_latency_ms`, record.p99Ms, {
      percentile: 'p99',
      scenario: record.scenario,
    });

    for (const line of [p50Line, p95Line, p99Line]) {
      if (line) {
        lines.push(line);
      }
    }
  }

  lines.push(`# HELP ${METRIC_PREFIX}_sample_count Number of sampled points for each scenario.`);
  lines.push(`# TYPE ${METRIC_PREFIX}_sample_count gauge`);

  for (const record of records) {
    const line = toMetricLine(`${METRIC_PREFIX}_sample_count`, record.sampleCount, {
      scenario: record.scenario,
    });
    if (line) {
      lines.push(line);
    }
  }

  lines.push(`# HELP ${METRIC_PREFIX}_file_count Number of files exercised by the stress scenario.`);
  lines.push(`# TYPE ${METRIC_PREFIX}_file_count gauge`);

  for (const record of records) {
    const line = toMetricLine(`${METRIC_PREFIX}_file_count`, record.fileCount, {
      scenario: record.scenario,
    });
    if (line) {
      lines.push(line);
    }
  }

  lines.push(`# HELP ${METRIC_PREFIX}_iterations Number of iterations executed by the scenario.`);
  lines.push(`# TYPE ${METRIC_PREFIX}_iterations gauge`);

  for (const record of records) {
    const line = toMetricLine(`${METRIC_PREFIX}_iterations`, record.iterations, {
      scenario: record.scenario,
    });
    if (line) {
      lines.push(line);
    }
  }

  return `${lines.join('\n')}\n`;
}

function buildPushgatewayUrl(baseUrl, jobName, instanceName) {
  const parsedBaseUrl = new URL(baseUrl);
  const basePath = parsedBaseUrl.pathname.replace(/\/+$/, '');
  parsedBaseUrl.pathname = `${basePath}/metrics/job/${encodeURIComponent(jobName)}/instance/${encodeURIComponent(instanceName)}`;
  return parsedBaseUrl;
}

function pushToPushgateway(endpointUrl, payload) {
  return new Promise((resolve, reject) => {
    const client = endpointUrl.protocol === 'https:' ? https : http;

    const request = client.request(
      endpointUrl,
      {
        method: 'PUT',
        headers: {
          'Content-Length': Buffer.byteLength(payload),
          'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        },
      },
      (response) => {
        const responseChunks = [];

        response.on('data', (chunk) => responseChunks.push(chunk));
        response.on('end', () => {
          const responseBody = Buffer.concat(responseChunks).toString('utf8').trim();
          if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
            resolve();
            return;
          }

          reject(
            new Error(
              `Pushgateway returned ${response.statusCode || 'unknown status'}${
                responseBody ? `: ${responseBody}` : ''
              }`
            )
          );
        });
      }
    );

    request.on('error', (error) => reject(error));
    request.write(payload);
    request.end();
  });
}

async function main() {
  const benchmarkFiles = readBenchmarkFiles();
  const records = benchmarkFiles.map((filePath) => normalizeBenchmarkRecord(filePath));

  const sortedRecords = records.sort((leftRecord, rightRecord) =>
    leftRecord.scenario.localeCompare(rightRecord.scenario)
  );

  const summaryPayload = {
    generatedAt: new Date().toISOString(),
    benchmarkDirectory: path.relative(ROOT_DIR, BENCHMARK_DIR),
    benchmarkFiles: benchmarkFiles.map((filePath) => path.basename(filePath)).sort(),
    scenarios: sortedRecords,
  };

  fs.mkdirSync(BENCHMARK_DIR, { recursive: true });
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summaryPayload, null, 2), 'utf8');

  const prometheusPayload = buildPrometheusPayload(sortedRecords);
  fs.writeFileSync(PROMETHEUS_FILE, prometheusPayload, 'utf8');

  console.log(`Stress summary written: ${path.relative(ROOT_DIR, SUMMARY_FILE)}`);
  console.log(`Prometheus metrics written: ${path.relative(ROOT_DIR, PROMETHEUS_FILE)}`);

  const pushgatewayUrl = (process.env.PUSHGATEWAY_URL || '').trim();
  if (!pushgatewayUrl) {
    console.log('PUSHGATEWAY_URL not set; skipping pushgateway publish.');
    return;
  }

  const defaultInstance =
    [process.env.GITHUB_RUN_ID, process.env.GITHUB_RUN_ATTEMPT, process.env.RUNNER_OS]
      .filter((segment) => typeof segment === 'string' && segment.length > 0)
      .join('-') || os.hostname();

  const jobName = (process.env.PUSHGATEWAY_JOB || 'ai_code_fusion_stress').trim();
  const instanceName = (process.env.PUSHGATEWAY_INSTANCE || defaultInstance).trim();
  const strictMode = process.env.PUSHGATEWAY_STRICT === 'true';

  const pushEndpoint = buildPushgatewayUrl(pushgatewayUrl, jobName, instanceName);
  try {
    await pushToPushgateway(pushEndpoint, prometheusPayload);
    console.log(`Stress metrics pushed to Pushgateway: ${pushEndpoint.toString()}`);
  } catch (error) {
    if (strictMode) {
      throw error;
    }

    const safeMessage = error instanceof Error ? error.message : String(error);
    console.warn(`Pushgateway publish failed (non-strict mode): ${safeMessage}`);
  }
}

main().catch((error) => {
  const safeMessage = error instanceof Error ? error.message : String(error);
  console.error(`Failed to publish stress metrics: ${safeMessage}`);
  process.exit(1);
});
