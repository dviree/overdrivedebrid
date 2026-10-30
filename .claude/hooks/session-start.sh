#!/bin/bash
# Claude Code cloud sessions: what a session needs before it starts working here.
# - Trail-Code, which CLAUDE.md asks every session to use, and its code map of this repo.
# - The framework's npm packages, which the JavaScript tests import (react).
# Runs only in a cloud session; on a laptop the owner's own setup applies (packaging/setup.sh).
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# Trail's anonymous usage stats stay off in these sessions.
export DO_NOT_TRACK=1
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export DO_NOT_TRACK=1' >> "$CLAUDE_ENV_FILE"
fi

if ! command -v trail >/dev/null 2>&1; then
  npm install -g --no-audit --no-fund @trailhq/trail-code >/dev/null
fi

# The tests import react from ps5-react/node_modules; scripts stay off, as in the CI checks.
if [ ! -d ps5-react/node_modules/react ]; then
  (cd ps5-react && npm install --ignore-scripts --no-audit --no-fund >/dev/null)
fi

# The code map: incremental after the first build, and never a reason to stop the session.
trail build . >/dev/null 2>&1 || echo "trail build failed; run 'trail build' by hand" >&2
