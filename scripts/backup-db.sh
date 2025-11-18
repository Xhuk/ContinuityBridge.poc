#!/bin/bash
# Automated Database Backup Script
# Run via cron: 0 2 * * * /path/to/backup-db.sh

set -e

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/continuitybridge_$TIMESTAMP.sql"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting database backup..."

# Detect database type
DB_TYPE="${DB_TYPE:-postgres}"

if [ "$DB_TYPE" = "postgres" ]; then
  # PostgreSQL backup
  if [ -n "$DATABASE_URL" ]; then
    # Direct connection string backup
    pg_dump "$DATABASE_URL" > "$BACKUP_FILE"
  elif command -v docker-compose &> /dev/null; then
    # Docker Compose backup
    docker-compose -f docker-compose.prod.yml exec -T postgres \
      pg_dump -U "${POSTGRES_USER:-cbadmin}" "${POSTGRES_DB:-continuitybridge_main}" > "$BACKUP_FILE"
  else
    echo "Error: No PostgreSQL connection method available"
    exit 1
  fi
elif [ "$DB_TYPE" = "sqlite" ]; then
  # SQLite backup
  DB_PATH="${DB_PATH:-./data/production.db}"
  if [ -f "$DB_PATH" ]; then
    cp "$DB_PATH" "$BACKUP_FILE"
  else
    echo "Error: SQLite database not found at $DB_PATH"
    exit 1
  fi
else
  echo "Error: Unknown DB_TYPE: $DB_TYPE"
  exit 1
fi

# Compress backup
gzip "$BACKUP_FILE"
echo "[$(date)] Backup created: ${BACKUP_FILE}.gz"

# Calculate backup size
BACKUP_SIZE=$(du -h "${BACKUP_FILE}.gz" | cut -f1)
echo "[$(date)] Backup size: $BACKUP_SIZE"

# Delete old backups (keep last N days)
find "$BACKUP_DIR" -name "continuitybridge_*.sql.gz" -mtime +$RETENTION_DAYS -delete
echo "[$(date)] Deleted backups older than $RETENTION_DAYS days"

# Verify backup integrity
if gzip -t "${BACKUP_FILE}.gz"; then
  echo "[$(date)] Backup integrity verified ✓"
else
  echo "[$(date)] ERROR: Backup integrity check failed!"
  exit 1
fi

echo "[$(date)] Backup completed successfully"
