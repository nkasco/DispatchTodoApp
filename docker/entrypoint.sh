#!/bin/sh
set -eu

echo "[dispatch] Initializing database schema..."
npm run db:migrate

echo "[dispatch] Starting server..."
exec npm run start
