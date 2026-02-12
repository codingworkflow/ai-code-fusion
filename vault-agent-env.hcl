auto_auth {
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
  contents             = "{{ with secret \"kv/data/Sonarqube/sonarqube\" }}{{ or .Data.data.SONAR_TOKEN .Data.data.sonar_token .Data.data.token }}{{ end }}"
  error_on_missing_key = false
}

env_template "DTRACK_API_KEY" {
  contents             = "{{ with secret \"kv/data/dependencytrack\" }}{{ or .Data.data.DTRACK_API_KEY .Data.data.api_key .Data.data.token }}{{ end }}"
  error_on_missing_key = false
}

exec {
  command                   = ["sh", "-lc", "echo \"SONAR_TOKEN=$SONAR_TOKEN\"; echo \"DTRACK_API_KEY=$DTRACK_API_KEY\""]
  restart_on_secret_changes = "never"
}
