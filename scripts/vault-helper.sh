#!/usr/bin/env bash

vault_helper::log_info() {
    printf '[INFO] %s\n' "$1"
}

vault_helper::log_warn() {
    printf '[WARN] %s\n' "$1"
}

vault_helper::log_error() {
    printf '[ERROR] %s\n' "$1" >&2
}

vault_helper::require_cli() {
    local bin="$1"
    if ! command -v "$bin" >/dev/null 2>&1; then
        vault_helper::log_error "Required command '$bin' not found in PATH"
        return 1
    fi
}

vault_helper::trim_token() {
    tr -d '\r\n' <<<"$1"
}

vault_helper::trim_string() {
    local str="$1"
    str="${str#"${str%%[![:space:]]*}"}"
    str="${str%"${str##*[![:space:]]}"}"
    printf '%s' "$str"
}

vault_helper::load_token_from_file() {
    local file="$1"
    [[ -r "$file" ]] || return 1
    vault_helper::trim_token "$(cat "$file")"
}

vault_helper::save_token() {
    local token="$1"
    local file="$2"
    mkdir -p "$(dirname "$file")"
    umask 077
    printf '%s\n' "$token" >"$file"
    chmod 600 "$file" 2>/dev/null || true
    vault_helper::log_info "Saved Vault token to $file"
}

vault_helper::validate_token() {
    local token="$1"
    [[ -n "$token" ]] || return 1
    if VAULT_TOKEN="$token" vault token lookup >/dev/null 2>&1; then
        return 0
    fi
    return 1
}

vault_helper::authenticate() {
    local username password login_json token
    read -r -p "Vault username: " username >&2
    read -r -s -p "Vault password: " password
    echo >&2

    if ! login_json=$(vault login -format=json -method=userpass username="$username" password="$password" 2>/dev/null); then
        vault_helper::log_error "Vault authentication failed"
        return 1
    fi

    token=$(jq -r '.auth.client_token // empty' <<<"$login_json")
    unset login_json

    if [[ -z "$token" ]]; then
        vault_helper::log_error "Vault login response did not include a token"
        return 1
    fi

    VAULT_TOKEN="$token"
    export VAULT_TOKEN
    vault_helper::save_token "$token" "$VAULT_TOKEN_FILE"

    unset username password token
    return 0
}

vault_helper::set_secret_if_empty() {
    local var="$1"
    local value="$2"
    local source="$3"

    if [[ -z "${!var:-}" && -n "$value" ]]; then
        printf -v "$var" '%s' "$value"
        export "$var"
        vault_helper::log_info "Mapped ${source} -> ${var}"
    fi
}

vault_helper::apply_mappings() {
    local json="$1"
    local path="$2"
    local mappings="$3"
    local normalized entry var key value

    [[ -z "$mappings" ]] && return 0

    normalized=$(printf '%s' "$mappings" | tr ',;' '  ')
    for entry in $normalized; do
        [[ "$entry" != *=* ]] && continue
        var="$(vault_helper::trim_string "${entry%%=*}")"
        key="$(vault_helper::trim_string "${entry#*=}")"
        [[ -z "$var" || -z "$key" ]] && continue
        value=$(jq -r --arg k "$key" '.[$k] // empty' <<<"$json")
        if [[ -n "$value" && "$value" != "null" ]]; then
            vault_helper::set_secret_if_empty "$var" "$value" "${key}@${path}"
        fi
    done
}

vault_helper::fetch_and_export() {
    local path="$1"
    local mappings="$2"
    local payload exports count data_json

    vault_helper::log_info "Fetching secrets from ${path}..."
    if ! payload=$(vault kv get -format=json "$path" 2>&1); then
        vault_helper::log_error "Failed to fetch secrets from ${path}"
        vault_helper::log_error "$payload"
        return 1
    fi

    if ! data_json=$(printf '%s' "$payload" | jq -c '.data.data // .data // {}'); then
        vault_helper::log_error "Unable to parse secrets JSON from ${path}"
        return 1
    fi

    if [[ "$data_json" == "{}" ]]; then
        vault_helper::log_warn "No secrets to export at ${path}"
        return 0
    fi

    if ! exports=$(printf '%s' "$data_json" | jq -r '
        to_entries[]? |
        "export \(.key)=\(.value | @sh)"
    '); then
        vault_helper::log_error "Unable to parse secrets from ${path}"
        return 1
    fi

    eval "$exports"
    vault_helper::apply_mappings "$data_json" "$path" "$mappings"

    count=$(printf '%s' "$data_json" | jq 'length')
    vault_helper::log_info "Loaded ${count} secret(s) from ${path}"
    return 0
}

vault_helper::validate_required_vars() {
    local missing=()
    local var
    for var in "$@"; do
        if [[ -z "${!var:-}" ]]; then
            missing+=("$var")
        fi
    done

    if [[ "${#missing[@]}" -gt 0 ]]; then
        vault_helper::log_error "Missing required secret(s): ${missing[*]}"
        return 1
    fi

    vault_helper::log_info "Validated required secret(s): ${*}"
    return 0
}

vault_helper::load_from_definitions() {
    local secret_defs_raw="$1"
    local required_vars_raw="$2"
    VAULT_TOKEN_FILE="${3:-$HOME/.vault-token}"

    local -a secret_defs required_vars
    local entry path mappings token_from_file

    if [[ -z "$(vault_helper::trim_string "$secret_defs_raw")" ]]; then
        vault_helper::log_error "No Vault secret paths configured. Set VAULT_SECRET_PATHS or provide a default."
        return 1
    fi

    mapfile -t secret_defs < <(printf '%s\n' "$secret_defs_raw" | awk 'NF')

    if [[ "${#secret_defs[@]}" -eq 0 ]]; then
        vault_helper::log_error "No Vault secret paths configured. Set VAULT_SECRET_PATHS or provide a default."
        return 1
    fi

    if [[ -n "$(vault_helper::trim_string "$required_vars_raw")" ]]; then
        mapfile -t required_vars < <(printf '%s\n' "$required_vars_raw" | tr ', \t' '\n' | awk 'NF')
    else
        required_vars=()
    fi

    if ! vault_helper::require_cli vault || ! vault_helper::require_cli jq; then
        return 1
    fi

    if [[ -z "${VAULT_TOKEN:-}" ]]; then
        if token_from_file=$(vault_helper::load_token_from_file "$VAULT_TOKEN_FILE" 2>/dev/null); then
            VAULT_TOKEN="$token_from_file"
            export VAULT_TOKEN
            vault_helper::log_info "Loaded Vault token from $VAULT_TOKEN_FILE"
        fi
    fi

    if vault_helper::validate_token "${VAULT_TOKEN:-}"; then
        vault_helper::log_info "Existing Vault token is valid."
    else
        vault_helper::log_info "Vault token missing or invalid; starting authentication."
        if ! vault_helper::authenticate; then
            return 1
        fi
    fi

    for entry in "${secret_defs[@]}"; do
        entry="$(vault_helper::trim_string "$entry")"
        path="$entry"
        mappings=""

        if [[ "$entry" == *"|"* ]]; then
            path="$(vault_helper::trim_string "${entry%%|*}")"
            mappings="$(vault_helper::trim_string "${entry#*|}")"
        fi

        if [[ -z "$path" ]]; then
            vault_helper::log_warn "Skipping empty path definition: $entry"
            continue
        fi

        if ! vault_helper::fetch_and_export "$path" "$mappings"; then
            return 1
        fi
    done

    if [[ "${#required_vars[@]}" -gt 0 ]]; then
        if ! vault_helper::validate_required_vars "${required_vars[@]}"; then
            return 1
        fi
    fi

    vault_helper::log_info "Vault secrets loaded successfully."
    return 0
}
