#!/bin/bash

# ContinuityBridge Production Deployment Script
# Self-hosted PostgreSQL + Docker

set -e

echo "🚀 ContinuityBridge Production Deployment"
echo "=========================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed"
    echo "Please install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Error: Docker Compose is not installed"
    echo "Please install Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
echo ""

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo "⚠️  .env.production not found"
    echo "Creating from template..."
    cp .env.production.example .env.production
    echo ""
    echo "❗ IMPORTANT: Edit .env.production with your actual values"
    echo "   - Set POSTGRES_PASSWORD"
    echo "   - Set APP_DOMAIN and APP_URL"
    echo "   - Set RESEND_API_KEY"
    echo "   - Set SUPERADMIN_API_KEY"
    echo ""
    read -p "Press Enter after you've updated .env.production..."
fi

# Load environment variables
export $(cat .env.production | grep -v '^#' | xargs)

echo "📦 Building Docker images..."
docker-compose -f docker-compose.prod.yml build

echo ""
echo "🗄️  Starting PostgreSQL database..."
docker-compose -f docker-compose.prod.yml up -d postgres

echo "⏳ Waiting for database to be ready..."
sleep 10

# Check if database is healthy
until docker-compose -f docker-compose.prod.yml exec -T postgres pg_isready -U cbuser -d continuitybridge; do
    echo "Waiting for PostgreSQL..."
    sleep 2
done

echo "✅ Database is ready"
echo ""

echo "🏗️  Running database migrations..."
# Migrations run automatically on app startup via drizzle-kit push

echo "🚀 Starting ContinuityBridge application..."
docker-compose -f docker-compose.prod.yml up -d app

echo ""
echo "⏳ Waiting for application to start..."
sleep 5

# Check if app is running
if docker-compose -f docker-compose.prod.yml ps | grep -q "continuitybridge-app"; then
    echo "✅ Application started successfully"
    echo ""
    echo "📊 Status:"
    docker-compose -f docker-compose.prod.yml ps
    echo ""
    echo "🌐 Application URL: ${APP_URL:-http://localhost:5000}"
    echo "🗄️  PostgreSQL: localhost:5432"
    echo ""
    echo "📝 Useful commands:"
    echo "   View logs:        docker-compose -f docker-compose.prod.yml logs -f"
    echo "   Stop services:    docker-compose -f docker-compose.prod.yml down"
    echo "   Restart services: docker-compose -f docker-compose.prod.yml restart"
    echo "   DB backup:        docker-compose -f docker-compose.prod.yml exec postgres pg_dump -U cbuser continuitybridge > backup.sql"
    echo ""
else
    echo "❌ Failed to start application"
    echo "Check logs with: docker-compose -f docker-compose.prod.yml logs"
    exit 1
fi
