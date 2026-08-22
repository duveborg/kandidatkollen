#!/bin/sh
# Hämtar rådata, bygger site/data/ och startar utvecklingsservern.
set -e
cd "$(dirname "$0")"
python3 build/fetch.py
python3 build/build.py
[ -d node_modules ] || npm install
exec npm run dev -- --port "${PORT:-8765}"
