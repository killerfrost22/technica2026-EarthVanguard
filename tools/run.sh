#!/usr/bin/env bash
# Drive the built game in headless Chrome (Windows Chrome + Windows Node, called from WSL).
# Example:
#   bash tools/run.sh --page "dist/starlance.html?mission=m1&autopilot=1&god=1" \
#        --steps '[{"wait":2000},{"eval":"JSON.stringify(SL.debug.state())"},{"shot":"shots/m1.png"}]'
# Extra Chrome switches: CHROME_ARGS="--some-switch" bash tools/run.sh ... (forwarded to Windows via WSLENV).
cd "$(dirname "$0")/.." || exit 1
export WSLENV="${WSLENV:+$WSLENV:}CHROME_ARGS"
exec "/mnt/c/Program Files/nodejs/node.exe" tools/run.mjs "$@"
