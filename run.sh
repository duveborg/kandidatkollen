#!/bin/sh
# Hämtar data, bygger sajten och startar en lokal server.
set -e
cd "$(dirname "$0")"
python3 build/fetch.py
python3 build/build.py
echo
echo "Sajten körs på http://localhost:${PORT:-8765}"
cd site && exec python3 -m http.server "${PORT:-8765}"
