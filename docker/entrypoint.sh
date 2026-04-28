#!/usr/bin/env bash
set -euo pipefail

# Apply pending Prisma migrations (requires DATABASE_URL to be set).
node ./node_modules/prisma/build/index.js migrate deploy

exec "$@"
