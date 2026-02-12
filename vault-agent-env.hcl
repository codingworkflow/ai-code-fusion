auto_auth {
  method "token_file" {
    config = {
      token_file_path = "{{ env \"VAULT_TOKEN_FILE\" }}"
    }
  }

  sink "file" {
    config = {
      path = "{{ env \"VAULT_AGENT_TOKEN_SINK_FILE\" }}"
    }
  }
}

template_config {
  static_secret_render_interval = "10s"
  exit_on_retry_failure         = true
}

env_template "SONAR_TOKEN" {
  contents             = "{{ with secret \"kv/data/Sonarqube/sonarqube\" }}{{ or .Data.data.SONAR_TOKEN .Data.data.sonar_token }}{{ end }}"
  error_on_missing_key = false
}

env_template "DTRACK_API_KEY" {
  contents             = "{{ with secret \"kv/data/dependencytrack\" }}{{ or .Data.data.DTRACK_API_KEY .Data.data.api_key }}{{ end }}"
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
