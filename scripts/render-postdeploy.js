#!/usr/bin/env node

// Render Post-Deploy Script
// This script runs automatically after each deployment on Render
// It handles database migrations and initial setup

const { execSync } = require('child_process');
const path = require('path');

console.log('🚀 Starting post-deploy setup...');

try {
  // Run database migrations
  console.log('📋 Running database migrations...');
  execSync('npm run db:push', { stdio: 'inherit' });
  console.log('✅ Database migrations completed successfully');
  
  // Check if we need to run first-time setup
  console.log('🔍 Checking first-run setup...');
  const result = execSync('node scripts/pre-deploy-check.js', { 
    stdio: 'pipe',
    encoding: 'utf-8'
  });
  
  console.log('📋 First-run check output:', result);
  
  console.log('✅ Post-deploy setup completed successfully');
  console.log('🎉 Application is ready to serve requests');
  
} catch (error) {
  console.error('❌ Post-deploy setup failed:', error.message);
  process.exit(1);
}