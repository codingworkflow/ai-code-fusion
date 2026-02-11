#!/usr/bin/env node

const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { waitForStressMetrics } = require('./verify-prometheus-metrics');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_PUSHGATEWAY_JOB = 'ai_code_fusion_stress';

function toFiniteNumber(value) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function normalizeToolsDomain(rawValue) {
  const input = String(rawValue || '').trim();
  if (!input) {
    return '';
  }

  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  let parsed;
  try {
    parsed = new URL(withProtocol);
  } catch (error) {
    throw new Error(`Invalid TOOLS_DOMAIN value: ${input}`);
  }
  const normalizedHost = parsed.host.replace(/^\.+/, '').replace(/\.+$/, '').trim().toLowerCase();
  return normalizedHost;
}

function resolveMonitoringEndpoints(environment) {
  const env = environment || process.env;
  const toolsDomain = normalizeToolsDomain(env.TOOLS_DOMAIN || '');
  const pushgatewayUrl = (env.PUSHGATEWAY_URL || '').trim() || (toolsDomain ? `https://pushgateway.${toolsDomain}` : '');
  const prometheusUrl = (env.PROMETHEUS_URL || '').trim() || (toolsDomain ? `https://prometheus.${toolsDomain}` : '');

  return {
    toolsDomain,
    pushgatewayUrl,
    prometheusUrl,
  };
}

function buildDefaultInstanceName(nowMs, hostName) {
  const safeHost = String(hostName || os.hostname()).replace(/[^a-zA-Z0-9_.-]/g, '-');
  return `local-${safeHost}-${Math.floor(nowMs)}`;
}

function runCommand(command, options = {}) {
  const { env = process.env, execFn = execSync } = options;
  console.log(`Running: ${command}`);
  execFn(command, {
    cwd: ROOT_DIR,
    env,
    stdio: 'inherit',
  });
}

async function runPerfMetricsJob(options = {}) {
  const env = options.env || process.env;
  const nowFn = options.nowFn || Date.now;
  const hostName = options.hostName || os.hostname();
  const verifyFn = options.verifyFn || waitForStressMetrics;
  const execFn = options.execFn || execSync;
  const logger = options.logger || console;

  const { toolsDomain, pushgatewayUrl, prometheusUrl } = resolveMonitoringEndpoints(env);
  if (!pushgatewayUrl || !prometheusUrl) {
    throw new Error(
      'Unable to resolve monitoring endpoints. Set TOOLS_DOMAIN or provide PUSHGATEWAY_URL and PROMETHEUS_URL.'
    );
  }

  const jobName = (env.PUSHGATEWAY_JOB || DEFAULT_PUSHGATEWAY_JOB).trim() || DEFAULT_PUSHGATEWAY_JOB;
  const instanceName =
    (env.PUSHGATEWAY_INSTANCE || '').trim() || buildDefaultInstanceName(nowFn(), hostName);
  const strictMode = (env.PUSHGATEWAY_STRICT || 'true').trim().toLowerCase() === 'false' ? 'false' : 'true';
  const timeoutMs = toFiniteNumber(env.PROMETHEUS_VERIFY_TIMEOUT_MS) || 60_000;
  const pollIntervalMs = toFiniteNumber(env.PROMETHEUS_VERIFY_POLL_INTERVAL_MS) || 5_000;
  const minPublishTimestampSeconds = Math.floor(nowFn() / 1000);

  const commandEnvironment = {
    ...env,
    PUSHGATEWAY_JOB: jobName,
    PUSHGATEWAY_INSTANCE: instanceName,
    PUSHGATEWAY_STRICT: strictMode,
    PUSHGATEWAY_URL: pushgatewayUrl,
    PROMETHEUS_URL: prometheusUrl,
    STRESS_METRICS_PUBLISH_TS_SECONDS: String(minPublishTimestampSeconds),
    PROMETHEUS_MIN_PUBLISH_TS_SECONDS: String(minPublishTimestampSeconds),
  };

  if (toolsDomain) {
    logger.log(`Resolved monitoring endpoints from TOOLS_DOMAIN=${toolsDomain}`);
  }
  logger.log(`Pushgateway endpoint: ${pushgatewayUrl}`);
  logger.log(`Prometheus endpoint: ${prometheusUrl}`);
  logger.log(`Pushgateway job="${jobName}" instance="${instanceName}"`);

  runCommand('npm run test:stress', { env: commandEnvironment, execFn });
  runCommand('npm run stress:metrics', { env: commandEnvironment, execFn });

  await verifyFn({
    prometheusUrl,
    jobName,
    instanceName,
    minPublishTimestampSeconds,
    timeoutMs,
    pollIntervalMs,
  });

  logger.log('Performance metrics published and verified in Prometheus.');

  return {
    toolsDomain,
    pushgatewayUrl,
    prometheusUrl,
    jobName,
    instanceName,
    minPublishTimestampSeconds,
  };
}

module.exports = {
  runPerfMetricsJob,
  __testUtils: {
    buildDefaultInstanceName,
    normalizeToolsDomain,
    resolveMonitoringEndpoints,
    runCommand,
    toFiniteNumber,
  },
};

if (require.main === module) {
  runPerfMetricsJob().catch((error) => {
    const safeMessage = error instanceof Error ? error.message : String(error);
    console.error(`Performance metrics job failed: ${safeMessage}`);
    process.exit(1);
  });
}
