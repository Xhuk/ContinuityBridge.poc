# ContinuityBridge Production Deployment Guide

## Self-Hosted PostgreSQL (No External Dependencies)

### Prerequisites
- Docker & Docker Compose installed
- Linux server (Ubuntu/Debian/CentOS) or Windows Server
- 2GB+ RAM, 20GB+ disk space
- Domain name (optional but recommended)

---

## Quick Start

### 1. Clone Repository
```bash
git clone https://github.com/Xhuk/ContinuityBridge.poc.git
cd ContinuityBridge.poc
git checkout render-poc-deployment
```

### 2. Configure Environment
```bash
# Copy example to production config
cp .env.production.example .env.production

# Edit with your values
nano .env.production
```

**Required values:**
```env
POSTGRES_PASSWORD=your_secure_password_here
APP_DOMAIN=yourdomain.com
APP_URL=https://yourdomain.com
RESEND_API_KEY=re_your_key
SUPERADMIN_API_KEY=cb_prod_your_founder_key
```

### 3. Deploy
```bash
chmod +x deploy-production.sh
./deploy-production.sh
```

**That's it!** Application will be running on `http://localhost:5000`

---

## Architecture

```
┌─────────────────────────────────────┐
│   ContinuityBridge Application      │
│   (Docker Container)                 │
│   Port: 5000                         │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   PostgreSQL 16                      │
│   (Docker Container)                 │
│   Port: 5432 (localhost only)        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Host Machine                       │
│   ./postgres-data/ (persistent)      │
└─────────────────────────────────────┘
```

---

## Database Backups

### Automated Backup Script
A production-ready backup script is included at `scripts/backup-db.sh`

```bash
# Make executable
chmod +x scripts/backup-db.sh

# Run manually
./scripts/backup-db.sh

# Schedule via cron (daily at 2 AM)
crontab -e
# Add this line:
0 2 * * * /path/to/ContinuityBridge/scripts/backup-db.sh
```

**Configuration (environment variables)**:
```bash
export BACKUP_DIR="./backups"           # Backup directory
export RETENTION_DAYS="30"              # Keep backups for 30 days
export DB_TYPE="postgres"               # postgres or sqlite
```

**Features**:
- ✅ Automatic compression (gzip)
- ✅ Integrity verification
- ✅ Retention policy (auto-delete old backups)
- ✅ Works with Docker Compose or direct connections
- ✅ Supports both PostgreSQL and SQLite

### Restore from Backup
```bash
gunzip backups/continuitybridge_20240315_120000.sql.gz

docker-compose -f docker-compose.prod.yml exec -T postgres \
  psql -U cbuser continuitybridge < backups/continuitybridge_20240315_120000.sql
```

---

## Customer-Specific Deployment

### Option 1: Each Customer Has Own Instance
```bash
# Customer A
cd /opt/continuitybridge-customer-a
cp .env.production.example .env.production
# Configure customer A settings
./deploy-production.sh

# Customer B (different server or different ports)
cd /opt/continuitybridge-customer-b
cp .env.production.example .env.production
# Configure customer B settings
# Change PORT=5001 in .env.production
./deploy-production.sh
```

### Option 2: Multi-Tenant (Shared Database)
Use `organizationId` field to isolate customer data:
- Single PostgreSQL instance
- Single application instance
- Data isolation via `organizationId` in all tables
- WAF configured per organization

---

## Production Hardening

### 1. Add Nginx Reverse Proxy
```nginx
# /etc/nginx/sites-available/continuitybridge
server {
    listen 80;
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 2. Enable SSL with Let's Encrypt
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

### 3. PostgreSQL Tuning
Create `postgresql.conf`:
```ini
# Memory settings
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
work_mem = 4MB

# Connection settings
max_connections = 100

# Logging
log_destination = 'stderr'
logging_collector = on
log_directory = 'pg_log'
log_filename = 'postgresql-%Y-%m-%d.log'
log_rotation_age = 1d
```

Mount in `docker-compose.prod.yml`:
```yaml
volumes:
  - ./postgresql.conf:/etc/postgresql/postgresql.conf
command: postgres -c config_file=/etc/postgresql/postgresql.conf
```

---

## Monitoring

### Health Check
```bash
# Check if services are running
docker-compose -f docker-compose.prod.yml ps

# Check logs
docker-compose -f docker-compose.prod.yml logs -f app
docker-compose -f docker-compose.prod.yml logs -f postgres

# Check database connection
docker-compose -f docker-compose.prod.yml exec postgres \
  psql -U cbuser -d continuitybridge -c "SELECT version();"
```

### Resource Usage
```bash
# Container stats
docker stats

# PostgreSQL queries
docker-compose -f docker-compose.prod.yml exec postgres \
  psql -U cbuser -d continuitybridge -c "SELECT * FROM pg_stat_activity;"
```

---

## Troubleshooting

### Database Connection Failed
```bash
# Check if PostgreSQL is running
docker-compose -f docker-compose.prod.yml ps postgres

# Check logs
docker-compose -f docker-compose.prod.yml logs postgres

# Restart database
docker-compose -f docker-compose.prod.yml restart postgres
```

### Application Won't Start
```bash
# Check environment variables
docker-compose -f docker-compose.prod.yml exec app env | grep DATABASE_URL

# Check migrations
docker-compose -f docker-compose.prod.yml logs app | grep migration

# Restart app
docker-compose -f docker-compose.prod.yml restart app
```

### Disk Space Full
```bash
# Check Docker disk usage
docker system df

# Clean old images/containers
docker system prune -a

# Database size
docker-compose -f docker-compose.prod.yml exec postgres \
  psql -U cbuser -d continuitybridge -c "SELECT pg_size_pretty(pg_database_size('continuitybridge'));"
```

---

## Migration from Neon/External DB

### Export from Neon
```bash
# Get your Neon connection string
NEON_URL="postgresql://user:pass@ep-xxx.neon.tech/db"

# Export data
pg_dump $NEON_URL > neon-export.sql
```

### Import to Self-Hosted
```bash
# Start your self-hosted PostgreSQL
./deploy-production.sh

# Import data
docker-compose -f docker-compose.prod.yml exec -T postgres \
  psql -U cbuser continuitybridge < neon-export.sql
```

---

## Support

For issues or questions:
- Check logs: `docker-compose -f docker-compose.prod.yml logs`
- Database console: `docker-compose -f docker-compose.prod.yml exec postgres psql -U cbuser continuitybridge`
- Restart: `docker-compose -f docker-compose.prod.yml restart`
