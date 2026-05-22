#!/usr/bin/env bash
set -euo pipefail
export OPENAI_API_KEY=$(base64 -d /root/frontline-openai-key.b64)
export OPENAI_MODEL=${OPENAI_MODEL:-gpt-4o-mini}
export PORT=3401
export NODE_ENV=production
cd /opt/frontline-ai
exec node api/server.js
