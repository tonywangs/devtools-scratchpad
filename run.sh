#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ -x .venv/bin/python ] && .venv/bin/python -c 'import yaml' 2>/dev/null; then
  exec .venv/bin/python -m atlas.server "$@"
fi
if python3 -c 'import yaml' 2>/dev/null; then
  exec python3 -m atlas.server "$@"
fi
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
exec .venv/bin/python -m atlas.server "$@"
