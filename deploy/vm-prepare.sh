#!/usr/bin/env sh
set -eu

# Prepare persistent directories on a Linux VM for GoToMock.
# - Uploads are mounted into the backend container at /app/uploads.
# - The backend image runs as uid 1000, so we chown accordingly.

UPLOADS_DIR="/var/lib/gotomock/uploads"

echo "Creating $UPLOADS_DIR ..."
sudo mkdir -p "$UPLOADS_DIR"

echo "Setting ownership to uid:gid 1000:1000 ..."
sudo chown -R 1000:1000 "$UPLOADS_DIR"

echo "Done. You can now deploy with:"
echo "  docker compose -f docker-compose.prod.yml up -d --build"
