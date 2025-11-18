#!/bin/bash
#
# ContinuityBridge - Customer Installation Script (Unix/Linux/macOS)
#
# Usage:
#   ./install.sh [environment]
#
# Examples:
#   ./install.sh dev
#   ./install.sh test
#   ./install.sh prod
#

set -e  # Exit on error

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
VERSION="1.0.0"
ENVIRONMENT="${1:-dev}"
INSTALL_DIR="$(pwd)"

echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ContinuityBridge - Customer Installer v${VERSION}      ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Check prerequisites
echo -e "${YELLOW}[1/7] Checking prerequisites...${NC}"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker not found. Please install Docker first.${NC}"
    echo "  Download: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}✗ Docker Compose not found. Please install Docker Compose.${NC}"
    echo "  Download: https://docs.docker.com/compose/install/"
    exit 1
fi

echo -e "${GREEN}✓ Docker $(docker --version | cut -d' ' -f3 | tr -d ',')${NC}"
echo -e "${GREEN}✓ Docker Compose $(docker-compose --version | cut -d' ' -f3 | tr -d ',')${NC}"

# Step 2: Check if Docker daemon is running
echo ""
echo -e "${YELLOW}[2/7] Checking Docker daemon...${NC}"
if ! docker info &> /dev/null; then
    echo -e "${RED}✗ Docker daemon is not running. Please start Docker.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker daemon is running${NC}"

# Step 3: Load Docker images (offline support)
echo ""
echo -e "${YELLOW}[3/7] Loading Docker images...${NC}"

if [ -f "docker-images/continuitybridge.tar" ]; then
    echo "  Loading ContinuityBridge image from archive..."
    docker load -i docker-images/continuitybridge.tar
    echo -e "${GREEN}✓ ContinuityBridge image loaded${NC}"
else
    echo -e "${YELLOW}⚠ No offline image found, will pull from registry${NC}"
fi

if [ -f "docker-images/postgres.tar" ]; then
    echo "  Loading PostgreSQL image from archive..."
    docker load -i docker-images/postgres.tar
    echo -e "${GREEN}✓ PostgreSQL image loaded${NC}"
fi

if [ -f "docker-images/valkey.tar" ]; then
    echo "  Loading Valkey image from archive..."
    docker load -i docker-images/valkey.tar
    echo -e "${GREEN}✓ Valkey image loaded${NC}"
fi

# Step 4: Configure environment
echo ""
echo -e "${YELLOW}[4/7] Configuring environment: ${ENVIRONMENT}${NC}"

# Copy environment template if not exists
if [ ! -f ".env" ]; then
    if [ -f ".env.docker.example" ]; then
        cp .env.docker.example .env
        echo -e "${GREEN}✓ Created .env from template${NC}"
    else
        echo -e "${RED}✗ .env.docker.example not found${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠ .env already exists, skipping copy${NC}"
fi

# Update ENVIRONMENT variable
sed -i.bak "s/^ENVIRONMENT=.*/ENVIRONMENT=${ENVIRONMENT}/" .env
echo -e "${GREEN}✓ Set environment to: ${ENVIRONMENT}${NC}"

# Step 5: Generate secure passwords (if not set)
echo ""
echo -e "${YELLOW}[5/7] Generating secure credentials...${NC}"

generate_password() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-32
}

# PostgreSQL password
if grep -q "^POSTGRES_PASSWORD=your_secure_postgres_password_here" .env; then
    POSTGRES_PASS=$(generate_password)
    sed -i.bak "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASS}|" .env
    echo -e "${GREEN}✓ Generated PostgreSQL password${NC}"
fi

# Valkey password
if grep -q "^VALKEY_PASSWORD=your_secure_valkey_password_here" .env; then
    VALKEY_PASS=$(generate_password)
    sed -i.bak "s|^VALKEY_PASSWORD=.*|VALKEY_PASSWORD=${VALKEY_PASS}|" .env
    echo -e "${GREEN}✓ Generated Valkey password${NC}"
fi

# Superadmin API key
if grep -q "^SUPERADMIN_API_KEY=cb_YOUR_SECURE_SUPERADMIN_KEY_HERE" .env; then
    ADMIN_KEY="cb_$(generate_password)"
    sed -i.bak "s|^SUPERADMIN_API_KEY=.*|SUPERADMIN_API_KEY=${ADMIN_KEY}|" .env
    echo -e "${GREEN}✓ Generated Superadmin API key${NC}"
fi

# Encryption key
if grep -q "^ENCRYPTION_KEY=YOUR_ENCRYPTION_KEY_HERE" .env; then
    ENC_KEY=$(openssl rand -base64 32 | cut -c1-32)
    sed -i.bak "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=${ENC_KEY}|" .env
    echo -e "${GREEN}✓ Generated encryption key${NC}"
fi

# Step 6: Install offline license (if present)
echo ""
echo -e "${YELLOW}[6/7] Installing license...${NC}"

if [ -f "license/license.key" ]; then
    echo "  Installing offline license..."
    mkdir -p ./data/licenses
    cp license/license.key ./data/licenses/
    echo -e "${GREEN}✓ Offline license installed${NC}"
else
    echo -e "${YELLOW}⚠ No offline license found (will use trial mode)${NC}"
fi

# Step 7: Start services
echo ""
echo -e "${YELLOW}[7/7] Starting services...${NC}"

# Stop any running instances
docker-compose down 2>/dev/null || true

# Start services
docker-compose -f docker-compose.yml up -d

# Wait for services to be healthy
echo "  Waiting for services to start..."
sleep 5

# Check service health
if docker-compose ps | grep -q "Up"; then
    echo -e "${GREEN}✓ Services started successfully${NC}"
else
    echo -e "${RED}✗ Failed to start services${NC}"
    docker-compose logs --tail=50
    exit 1
fi

# Installation complete
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Installation Complete!                          ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Environment:   ${GREEN}${ENVIRONMENT}${NC}"
echo -e "Access URL:    ${GREEN}http://localhost:5000${NC}"
echo ""
echo "Credentials saved in: .env"
echo ""
echo "Next steps:"
echo "  1. Access the application at http://localhost:5000"
echo "  2. Log in with your credentials"
echo "  3. Configure your first integration"
echo ""
echo "Useful commands:"
echo "  docker-compose logs -f       # View logs"
echo "  docker-compose ps            # Check status"
echo "  docker-compose down          # Stop services"
echo "  docker-compose restart       # Restart services"
echo ""
echo -e "${YELLOW}For support, contact: support@continuitybridge.com${NC}"
echo ""
