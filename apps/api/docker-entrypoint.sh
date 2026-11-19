#!/bin/sh
# Applies pending migrations (non-destructive), then runs the given command.
# Set RUN_MIGRATIONS=false to skip, e.g. for one-off commands.
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  node ../../node_modules/prisma/build/index.js migrate deploy
fi

exec "$@"
