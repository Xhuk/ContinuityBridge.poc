#!/usr/bin/env node

/**
 * Production Deployment Checklist
 * Run this script before deploying to production
 * 
 * Usage: node scripts/pre-deploy-check.js
 */

import { validateEnvironment } from '../server/src/core/env-validator.js';
import { existsSync } from 'fs';
import { join } from 'path';

const ROOT_DIR = join(import.meta.dirname, '..');

console.log('🔍 ContinuityBridge Pre-Deployment Check\n');

let hasErrors = false;
let hasWarnings = false;

// 1. Environment Variables
console.log('1️⃣  Checking environment variables...');
const envCheck = validateEnvironment();
if (!envCheck.valid) {
  console.error('   ❌ Missing required environment variables:');
  envCheck.missing.forEach(key => console.error(`      - ${key}`));
  hasErrors = true;
} else {
  console.log('   ✅ All required environment variables set');
}

if (envCheck.warnings.length > 0) {
  console.warn('   ⚠️  Optional variables missing:');
  envCheck.warnings.forEach(key => console.warn(`      - ${key}`));
  hasWarnings = true;
}

// 2. Build artifacts
console.log('\n2️⃣  Checking build artifacts...');
const distExists = existsSync(join(ROOT_DIR, 'dist'));
const publicExists = existsSync(join(ROOT_DIR, 'dist', 'public'));
const indexJsExists = existsSync(join(ROOT_DIR, 'dist', 'index.js'));

if (!distExists || !publicExists || !indexJsExists) {
  console.error('   ❌ Build artifacts missing - run `npm run build` first');
  hasErrors = true;
} else {
  console.log('   ✅ Build artifacts present');
}

// 3. Node version
console.log('\n3️⃣  Checking Node.js version...');
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

if (majorVersion < 20) {
  console.error(`   ❌ Node.js ${nodeVersion} detected - v20+ required`);
  hasErrors = true;
} else {
  console.log(`   ✅ Node.js ${nodeVersion}`);
}

// 4. Production dependencies
console.log('\n4️⃣  Checking production dependencies...');
try {
  await import('pg');
  console.log('   ✅ PostgreSQL driver installed');
} catch {
  console.error('   ❌ PostgreSQL driver (pg) not installed');
  hasErrors = true;
}

try {
  await import('jsonwebtoken');
  console.log('   ✅ JWT library installed');
} catch {
  console.error('   ❌ jsonwebtoken not installed');
  hasErrors = true;
}

// 5. Security configuration
console.log('\n5️⃣  Checking security configuration...');
if (process.env.NODE_ENV !== 'production') {
  console.warn('   ⚠️  NODE_ENV is not set to "production"');
  hasWarnings = true;
} else {
  console.log('   ✅ NODE_ENV=production');
}

if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length < 32) {
  console.error('   ❌ ENCRYPTION_KEY must be at least 32 characters');
  hasErrors = true;
} else if (process.env.ENCRYPTION_KEY) {
  console.log('   ✅ ENCRYPTION_KEY configured');
}

if (process.env.SUPERADMIN_API_KEY && !process.env.SUPERADMIN_API_KEY.startsWith('cb_')) {
  console.warn('   ⚠️  SUPERADMIN_API_KEY should start with "cb_" prefix');
  hasWarnings = true;
} else if (process.env.SUPERADMIN_API_KEY) {
  console.log('   ✅ SUPERADMIN_API_KEY configured');
}

// 6. Database connection
console.log('\n6️⃣  Checking database configuration...');
if (!process.env.DATABASE_URL) {
  console.error('   ❌ DATABASE_URL not set');
  hasErrors = true;
} else if (process.env.DATABASE_URL.includes('postgresql://')) {
  console.log('   ✅ PostgreSQL database URL configured');
} else if (process.env.DATABASE_URL.startsWith('file:')) {
  console.warn('   ⚠️  Using SQLite - recommended for development only');
  hasWarnings = true;
} else {
  console.log('   ✅ Database URL configured');
}

// Summary
console.log('\n' + '='.repeat(50));
if (hasErrors) {
  console.error('\n❌ DEPLOYMENT BLOCKED - Fix errors above before deploying\n');
  process.exit(1);
} else if (hasWarnings) {
  console.warn('\n⚠️  DEPLOYMENT READY - Review warnings above\n');
  process.exit(0);
} else {
  console.log('\n✅ ALL CHECKS PASSED - Ready for production deployment!\n');
  console.log('Next steps:');
  console.log('  1. Review environment variables in production');
  console.log('  2. Test database migrations: npm run db:push');
  console.log('  3. Deploy: npm start');
  console.log('  4. Monitor logs for startup errors\n');
  process.exit(0);
}
