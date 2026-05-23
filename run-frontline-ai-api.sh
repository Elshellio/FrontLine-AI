#!/usr/bin/env bash
set -euo pipefail
cd /opt/frontline-ai

if [ -f /opt/frontline-ai/api/.env ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|\#*) continue ;; esac
    key="${line%%=*}"
    value="${line#*=}"
    case "$key" in ''|*[!A-Za-z0-9_]*|[0-9]*) continue ;; esac
    export "$key=$value"
  done < /opt/frontline-ai/api/.env
fi

exec node /opt/frontline-ai/api/server.js
