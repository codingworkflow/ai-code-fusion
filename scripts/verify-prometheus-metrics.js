#!/usr/bin/env node

const http = require('http');
const https = require('https');

const DEFAULT_METRIC_NAME = 'ai_code_fusion_stress_publish_timestamp_seconds';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;

function toFiniteNumber(value) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function trimTrailingSlashes(value) {
  let lastIndex = value.length;
  while (lastIndex > 0 && value[lastIndex - 1] === '/') {
    lastIndex -= 1;
  }

  return value.slice(0, lastIndex);
}

function normalizeBaseUrl(rawUrl) {
  const input = String(rawUrl || '').trim();
  if (!input) {
    throw new Error('PROMETHEUS_URL is required');
  }

  const normalizedInput = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const parsedUrl = new URL(normalizedInput);
  parsedUrl.pathname = '';
  parsedUrl.search = '';
  parsedUrl.hash = '';
  return trimTrailingSlashes(parsedUrl.toString());
}

function escapeLabelValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildMetricQueries(metricName, jobName, instanceName) {
  const escapedJobName = escapeLabelValue(jobName);
  const escapedInstanceName = escapeLabelValue(instanceName);

  return [
    `${metricName}{job="${escapedJobName}",instance="${escapedInstanceName}"}`,
    `${metricName}{exported_job="${escapedJobName}",exported_instance="${escapedInstanceName}"}`,
  ];
}

function requestJson(endpointUrl) {
  return new Promise((resolve, reject) => {
    const client = endpointUrl.protocol === 'https:' ? https : http;
    const request = client.request(
      endpointUrl,
      { method: 'GET' },
      (response) => {
        const responseChunks = [];
        response.on('data', (chunk) => responseChunks.push(chunk));
        response.on('end', () => {
          const responseBody = Buffer.concat(responseChunks).toString('utf8');
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(
              new Error(
                `Prometheus returned ${response.statusCode || 'unknown status'}${
                  responseBody ? `: ${responseBody}` : ''
                }`
              )
            );
            return;
          }

          try {
            resolve(JSON.parse(responseBody));
          } catch (error) {
            const safeMessage = error instanceof Error ? error.message : String(error);
            reject(new Error(`Failed to parse Prometheus response: ${safeMessage}`));
          }
        });
      }
    );

    request.on('error', (error) => reject(error));
    request.end();
  });
}

function extractNumericValues(resultSet) {
  if (!Array.isArray(resultSet)) {
    return [];
  }

  const values = [];
  for (const resultItem of resultSet) {
    if (Array.isArray(resultItem?.value) && resultItem.value.length >= 2) {
      const parsedValue = toFiniteNumber(resultItem.value[1]);
      if (parsedValue !== null) {
        values.push(parsedValue);
      }
    }
  }

  return values;
}

async function queryPrometheus(prometheusUrl, query) {
  const endpointUrl = new URL('/api/v1/query', normalizeBaseUrl(prometheusUrl));
  endpointUrl.searchParams.set('query', query);

  const payload = await requestJson(endpointUrl);
  if (!payload || payload.status !== 'success') {
    throw new Error(`Prometheus query failed for "${query}"`);
  }

  const resultSet = payload?.data?.result;
  return extractNumericValues(resultSet);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForStressMetrics(options) {
  const {
    prometheusUrl,
    jobName,
    instanceName,
    metricName = DEFAULT_METRIC_NAME,
    minPublishTimestampSeconds = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    queryFn = queryPrometheus,
    nowFn = Date.now,
    sleepFn = sleep,
  } = options || {};

  if (!jobName || String(jobName).trim().length === 0) {
    throw new Error('PUSHGATEWAY_JOB is required to verify Prometheus metrics.');
  }

  if (!instanceName || String(instanceName).trim().length === 0) {
    throw new Error('PUSHGATEWAY_INSTANCE is required to verify Prometheus metrics.');
  }

  const minimumTimestamp = toFiniteNumber(minPublishTimestampSeconds);
  const parsedTimeoutMs = toFiniteNumber(timeoutMs) || DEFAULT_TIMEOUT_MS;
  const parsedPollIntervalMs = toFiniteNumber(pollIntervalMs) || DEFAULT_POLL_INTERVAL_MS;
  const queries = buildMetricQueries(metricName, String(jobName).trim(), String(instanceName).trim());
  const deadline = nowFn() + parsedTimeoutMs;
  let lastError = null;

  while (nowFn() <= deadline) {
    for (const query of queries) {
      try {
        const values = await queryFn(prometheusUrl, query);
        const hasMatch = values.some((value) => {
          if (minimumTimestamp !== null) {
            return value >= minimumTimestamp;
          }
          return value > 0;
        });

        if (hasMatch) {
          return { query, values };
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (nowFn() > deadline) {
      break;
    }

    await sleepFn(parsedPollIntervalMs);
  }

  const errorSuffix =
    lastError instanceof Error ? ` Last error: ${lastError.message}` : ' No Prometheus samples matched.';

  throw new Error(
    `Timed out after ${parsedTimeoutMs}ms waiting for "${metricName}" in Prometheus.${errorSuffix}`
  );
}

async function main() {
  const prometheusUrl = normalizeBaseUrl(process.env.PROMETHEUS_URL || '');
  const jobName = (process.env.PUSHGATEWAY_JOB || 'ai_code_fusion_stress').trim();
  const instanceName = (process.env.PUSHGATEWAY_INSTANCE || '').trim();
  const timeoutMs = toFiniteNumber(process.env.PROMETHEUS_VERIFY_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const pollIntervalMs =
    toFiniteNumber(process.env.PROMETHEUS_VERIFY_POLL_INTERVAL_MS) || DEFAULT_POLL_INTERVAL_MS;
  const minPublishTimestampSeconds = toFiniteNumber(process.env.PROMETHEUS_MIN_PUBLISH_TS_SECONDS);

  const result = await waitForStressMetrics({
    prometheusUrl,
    jobName,
    instanceName,
    minPublishTimestampSeconds,
    timeoutMs,
    pollIntervalMs,
  });

  console.log(
    `Prometheus metrics verified with query "${result.query}" for job "${jobName}" and instance "${instanceName}".`
  );
}

module.exports = {
  main,
  waitForStressMetrics,
  __testUtils: {
    buildMetricQueries,
    extractNumericValues,
    normalizeBaseUrl,
    queryPrometheus,
    requestJson,
    toFiniteNumber,
    trimTrailingSlashes,
  },
};

if (require.main === module) {
  main().catch((error) => {
    const safeMessage = error instanceof Error ? error.message : String(error);
    console.error(`Prometheus verification failed: ${safeMessage}`);
    process.exit(1);
  });
}
