#!/bin/sh
# Apply pending database migrations, then start the API.
set -e
node scripts/migrate.js
exec "$@"
