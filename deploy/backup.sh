#!/bin/sh
# Daily database backup. Keeps the last 7 days.
# Install on the server with:  crontab -e
#   15 2 * * * /opt/datascout/deploy/backup.sh >> /var/log/datascout-backup.log 2>&1
set -eu
cd "$(dirname "$0")/.."
mkdir -p backups
file="backups/datascout-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose exec -T db pg_dump -U datascout datascout | gzip > "$file.tmp"
mv "$file.tmp" "$file"
find backups -name 'datascout-*.sql.gz' -mtime +7 -delete
echo "Backup written: $file"
