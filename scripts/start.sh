#!/usr/bin/env bash
# Start the owner console. Zero dependencies: no install step, no build.
#   PORT=3000 scripts/start.sh            (default)
#   scripts/start.sh 3000 keyless         (pretend there is no model credential,
#                                          to see exactly what a keyless host shows)
set -e
cd "$(dirname "$0")/.."
PORT="${1:-${PORT:-3000}}"
if [ "${2:-}" = "keyless" ]; then
  unset QW_API_BASE_URL QWENWORK_ROUTER_API_KEY MULEROUTER_API_KEY QW_SESSION_KEY
  export OVERSIGHT_CRED_FILE=/dev/null/nonexistent
  echo "[start] keyless mode: the app will say so instead of faking a model call"
fi
echo "[start] http://localhost:$PORT"
exec env PORT="$PORT" node server.js
