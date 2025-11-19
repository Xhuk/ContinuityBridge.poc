#!/bin/bash

# ==============================================================================
# ContinuityBridge - CLUSTER DEPLOYMENT SCRIPT (Perfil C)
# Automated deployment for distributed architecture
# ==============================================================================

set -e

echo "🚀 ContinuityBridge - Cluster Deployment (Perfil C)"
echo "===================================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# ==============================================================================
# Step 1: Check Prerequisites
# ==============================================================================

echo -e "${YELLOW}[1/6] Checking prerequisites...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker not found. Please install Docker first.${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}✗ Docker Compose not found. Please install Docker Compose.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker $(docker --version | cut -d' ' -f3 | tr -d ',')${NC}"
echo -e "${GREEN}✓ Docker Compose $(docker-compose --version | cut -d' ' -f3 | tr -d ',')${NC}"
echo ""

# ==============================================================================
# Step 2: Detect Server Role
# ==============================================================================

echo -e "${YELLOW}[2/6] Select server role:${NC}"
echo "  1) App Server (Stateless)"
echo "  2) DB Server (Stateful)"
echo "  3) Both (Single machine for testing)"
echo ""
read -p "Enter choice [1-3]: " ROLE_CHOICE

case $ROLE_CHOICE in
    1)
        SERVER_ROLE="app"
        echo -e "${GREEN}✓ Deploying as App Server${NC}"
        ;;
    2)
        SERVER_ROLE="db"
        echo -e "${GREEN}✓ Deploying as DB Server${NC}"
        ;;
    3)
        SERVER_ROLE="both"
        echo -e "${GREEN}✓ Deploying both services (testing mode)${NC}"
        ;;
    *)
        echo -e "${RED}✗ Invalid choice${NC}"
        exit 1
        ;;
esac
echo ""

# ==============================================================================
# Step 3: Load Configuration
# ==============================================================================

echo -e "${YELLOW}[3/6] Loading configuration...${NC}"

if [ ! -f .env.cluster ]; then
    echo -e "${YELLOW}⚠️  .env.cluster not found${NC}"
    echo "Creating from example..."
    cp .env.cluster.example .env.cluster
    echo ""
    echo -e "${RED}❗ IMPORTANT: Edit .env.cluster with your actual values${NC}"
    echo "   - Set APP_SERVER_HOST and DB_SERVER_HOST"
    echo "   - Set POSTGRES_PASSWORD and VALKEY_PASSWORD"
    echo "   - Set ENCRYPTION_KEY and SUPERADMIN_API_KEY"
    echo ""
    read -p "Press Enter after you've updated .env.cluster..."
fi

# Load environment variables
export $(cat .env.cluster | grep -v '^#' | xargs)

echo -e "${GREEN}✓ Configuration loaded${NC}"
echo "   App Server: ${APP_SERVER_HOST}"
echo "   DB Server: ${DB_SERVER_HOST}"
echo ""

# ==============================================================================
# Step 4: Build Docker Image (if deploying app)
# ==============================================================================

if [ "$SERVER_ROLE" = "app" ] || [ "$SERVER_ROLE" = "both" ]; then
    echo -e "${YELLOW}[4/6] Building Docker image...${NC}"
    docker-compose -f docker-compose.cluster.yml build app
    echo -e "${GREEN}✓ Docker image built${NC}"
    echo ""
else
    echo -e "${YELLOW}[4/6] Skipping image build (DB server only)${NC}"
    echo ""
fi

# ==============================================================================
# Step 5: Start Services
# ==============================================================================

echo -e "${YELLOW}[5/6] Starting services...${NC}"

if [ "$SERVER_ROLE" = "app" ]; then
    echo "Starting App Server..."
    docker-compose -f docker-compose.cluster.yml up -d app
    
elif [ "$SERVER_ROLE" = "db" ]; then
    echo "Starting DB Server (PostgreSQL + Valkey)..."
    
    # Create data directories
    mkdir -p ${POSTGRES_DATA_PATH:-./data/postgres}
    mkdir -p ${VALKEY_DATA_PATH:-./data/valkey}
    
    docker-compose -f docker-compose.cluster.yml up -d postgres valkey
    
elif [ "$SERVER_ROLE" = "both" ]; then
    echo "Starting all services..."
    
    # Create data directories
    mkdir -p ${POSTGRES_DATA_PATH:-./data/postgres}
    mkdir -p ${VALKEY_DATA_PATH:-./data/valkey}
    
    docker-compose -f docker-compose.cluster.yml up -d
fi

echo -e "${GREEN}✓ Services started${NC}"
echo ""

# ==============================================================================
# Step 6: Verify Deployment
# ==============================================================================

echo -e "${YELLOW}[6/6] Verifying deployment...${NC}"

sleep 5

echo ""
echo "📊 Service Status:"
docker-compose -f docker-compose.cluster.yml ps
echo ""

if [ "$SERVER_ROLE" = "app" ] || [ "$SERVER_ROLE" = "both" ]; then
    echo "🌐 Application URL: http://${APP_SERVER_HOST}:${APP_PORT:-5000}"
    echo ""
fi

if [ "$SERVER_ROLE" = "db" ] || [ "$SERVER_ROLE" = "both" ]; then
    echo "🗄️  Database: ${DB_SERVER_HOST}:${DB_SERVER_PORT:-5432}"
    echo "🔴 Valkey: ${DB_SERVER_HOST}:${VALKEY_SERVER_PORT:-6379}"
    echo ""
fi

# ==============================================================================
# Deployment Complete
# ==============================================================================

echo -e "${GREEN}✅ Cluster deployment completed successfully!${NC}"
echo ""
echo "📝 Useful commands:"
echo "   View logs:        docker-compose -f docker-compose.cluster.yml logs -f"
echo "   Stop services:    docker-compose -f docker-compose.cluster.yml down"
echo "   Restart services: docker-compose -f docker-compose.cluster.yml restart"
echo ""

if [ "$SERVER_ROLE" = "db" ] || [ "$SERVER_ROLE" = "both" ]; then
    echo "🔐 Database backup:"
    echo "   docker-compose -f docker-compose.cluster.yml exec postgres \\"
    echo "     pg_dump -U cbadmin continuitybridge_main > backup.sql"
    echo ""
fi

echo -e "${YELLOW}⚠️  Next Steps:${NC}"
if [ "$SERVER_ROLE" = "app" ]; then
    echo "   1. Ensure DB Server is accessible from this machine"
    echo "   2. Check firewall rules allow connections to DB ports"
    echo "   3. Test connectivity: telnet ${DB_SERVER_HOST} ${DB_SERVER_PORT:-5432}"
elif [ "$SERVER_ROLE" = "db" ]; then
    echo "   1. Configure firewall to allow connections from App Server"
    echo "   2. Deploy App Server on ${APP_SERVER_HOST}"
    echo "   3. Test database connectivity from App Server"
else
    echo "   1. This is a testing deployment on a single machine"
    echo "   2. For production, deploy App and DB on separate servers"
    echo "   3. Configure network security and SSL/TLS"
fi

echo ""
echo "📚 Documentation: See CLUSTER_DEPLOYMENT.md for detailed guide"
echo ""
