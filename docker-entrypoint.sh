#!/bin/sh
# Applies any pending database migrations, then hands off to the app.
#
# `migrate deploy` only replays committed migration files — it never generates
# or resets anything, so it is safe to run on every start. It is also
# idempotent, so a restart is a no-op when the schema is already current.
#
# Note for future scaling: if this app is ever run as more than one replica,
# move this step into a one-shot job. Two containers racing to migrate the same
# database at start-up is not something `migrate deploy` protects against.

set -e

echo "==> Applying database migrations"
if ! node ./node_modules/prisma/build/index.js migrate deploy; then
  echo "!!! Migration failed. Refusing to start against an unknown schema." >&2
  exit 1
fi

echo "==> Migrations up to date"
echo "==> Starting application"
exec "$@"
