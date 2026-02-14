auto_auth {
  # IMPORTANT: These local file paths are intentionally hardcoded for the devcontainer/runtime.
  # Do not replace them with env interpolation based on generic bot suggestions.
  # Local Sonar bootstrap depends on these exact paths.
  method "token_file" {
    config = {
      token_file_path = "/home/vscode/.vault-token"
    }
  }

  sink "file" {
    config = {
      path = "/tmp/ai-code-fusion-vault-agent-token"
    }
  }
}

template_config {
  static_secret_render_interval = "10s"
  exit_on_retry_failure         = true
}

env_template "SONAR_TOKEN" {
  # Key precedence: SONAR_TOKEN -> sonar_token -> token (legacy fallback).
  # The generic "token" fallback is retained for compatibility with legacy Vault layouts.
  contents             = "{{ with secret \"kv/data/Sonarqube/sonarqube\" }}{{ or .Data.data.SONAR_TOKEN .Data.data.sonar_token .Data.data.token }}{{ end }}"
  error_on_missing_key = false
}

env_template "DTRACK_API_KEY" {
  # Key precedence: DTRACK_API_KEY -> api_key -> token (legacy fallback).
  # The generic "token" fallback is retained for compatibility with legacy Vault layouts.
  contents             = "{{ with secret \"kv/data/dependencytrack\" }}{{ or .Data.data.DTRACK_API_KEY .Data.data.api_key .Data.data.token }}{{ end }}"
  error_on_missing_key = false
}

exec {
  command = [
    "bash",
    "-lc",
    "umask 077; env_file=\"${VAULT_AGENT_ENV_FILE:-/tmp/ai-code-fusion-vault.env}\"; printf 'export SONAR_TOKEN=%q\\n' \"$SONAR_TOKEN\" > \"$env_file\"; printf 'export DTRACK_API_KEY=%q\\n' \"$DTRACK_API_KEY\" >> \"$env_file\"",
  ]
  restart_on_secret_changes = "never"
}
