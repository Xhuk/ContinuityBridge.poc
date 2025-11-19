#!/usr/bin/env tsx
/**
 * Generate Magic Link for Testing
 * 
 * Creates a magic link for any user email
 * Usage: tsx scripts/generate-magic-link.ts [email]
 */

import { magicLinkService } from '../server/src/auth/magic-link-service.js';

const email = process.argv[2] || process.env.SUPERADMIN_EMAIL || 'admin@continuitybridge.local';
const baseUrl = process.env.APP_URL || process.env.APP_DOMAIN ? `https://${process.env.APP_DOMAIN}` : 'https://networkvoid.xyz';

console.log('\n🔐 Generating Magic Link...\n');
console.log('Email:', email);
console.log('Base URL:', baseUrl);
console.log('');

magicLinkService.generateMagicLink(email, baseUrl)
  .then(({ magicLink, token, expiresAt }) => {
    console.log('✅ Magic Link Generated!');
    console.log('=' .repeat(80));
    console.log('\n🔗 MAGIC LINK:');
    console.log(magicLink);
    console.log('\n🎫 TOKEN:');
    console.log(token);
    console.log('\n⏰ EXPIRES:');
    console.log(new Date(expiresAt).toLocaleString());
    console.log('\n📋 VALID FOR: 15 minutes');
    console.log('');
    console.log('=' .repeat(80));
    console.log('\n💡 Usage:');
    console.log('1. Copy the magic link above');
    console.log('2. Open it in your browser');
    console.log('3. You will be automatically logged in');
    console.log('');
  })
  .catch((error) => {
    console.error('\n❌ Error:', error.message);
    console.error('');
    console.error('💡 Make sure:');
    console.error('  - The user exists in the database');
    console.error('  - The email is correct');
    console.error('  - The server is running');
    console.error('');
    process.exit(1);
  });
