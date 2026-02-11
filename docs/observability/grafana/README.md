# Grafana Dashboards

- `dashboards/ai-code-fusion-stress.json`: stress/performance dashboard for AI Code Fusion metrics.
- Datasource binding uses Grafana datasource name `prometheus` (no hardcoded UID), so imports stay portable across environments.

## Metrics expected

- `ai_code_fusion_stress_latency_ms`
- `ai_code_fusion_stress_sample_count`
- `ai_code_fusion_stress_file_count`
- `ai_code_fusion_stress_iterations`
- `ai_code_fusion_stress_publish_timestamp_seconds`
