#!/bin/sh
# Run the canvas inspector against the local dev server (software GL in containers).
# usage: tests/qa/run-inspect.sh artifacts/evidence.json [extra args]
SP=${SCRATCH_NODE:-}
export INSPECT_NODE_PATHS="/opt/node-tools${SP:+:$SP}"
export INSPECT_SWIFTSHADER=${INSPECT_SWIFTSHADER:-1}
export INSPECT_PREP_TIMEOUT_MS=${INSPECT_PREP_TIMEOUT_MS:-240000}
exec node "$(dirname "$0")/inspect-threejs-canvas.mjs" --manifest "$1" --url "${QA_URL:-http://127.0.0.1:8123/index.html?skipintro}" --seed 42
