#!/usr/bin/env bash
set -euo pipefail

# Ensure the data directory is writable and run migrations on start.
mkdir -p /app/data

# Apply pending Prisma migrations against the SQLite file.
node ./node_modules/prisma/build/index.js migrate deploy

exec "$@"
