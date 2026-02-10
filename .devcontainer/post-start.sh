#!/usr/bin/env bash
set -euo pipefail

HOST_HOME="/host-home"
CONTAINER_HOME="/home/vscode"

if [ -f "${HOST_HOME}/.gitconfig" ]; then
  ln -sfn "${HOST_HOME}/.gitconfig" "${CONTAINER_HOME}/.gitconfig"
fi

if [ -d "${HOST_HOME}/.ssh" ]; then
  rm -rf "${CONTAINER_HOME}/.ssh"
  ln -sfn "${HOST_HOME}/.ssh" "${CONTAINER_HOME}/.ssh"
fi
