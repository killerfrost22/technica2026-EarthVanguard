#!/usr/bin/env bash
# Build, then run the smoke suite (tools/smoke.mjs) in headless Chrome. Every argument is passed to smoke.mjs.
#   bash tools/smoke.sh                            every mission, solo and co-op, plus the in-page suite
#   bash tools/smoke.sh --only m1 --modes solo     one mission, solo only
#   bash tools/smoke.sh --page dist/dev-me.html    build to your own file (no publish) and test that
#   bash tools/smoke.sh --no-build                 test the current build as is
cd "$(dirname "$0")/.." || exit 1
page="dist/starlance.html"
build=1
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  case "${args[i]}" in
    --page) page="${args[i+1]%%\?*}" ;;
    --no-build) build=0 ;;
  esac
done
if [ "$build" = 1 ]; then
  if [ "$page" = "dist/starlance.html" ]; then
    python3 tools/build.py || exit 1
  else
    python3 tools/build.py --out "$page" --no-publish || exit 1
  fi
fi
export WSLENV="${WSLENV:+$WSLENV:}CHROME_ARGS"
exec "/mnt/c/Program Files/nodejs/node.exe" tools/smoke.mjs "$@"
