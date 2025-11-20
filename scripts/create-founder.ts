#!/usr/bin/env tsx
/**
 * Create Founder Account
 * 
 * Creates a superadmin founder account directly in the database
 * Usage: tsx scripts/create-founder.ts
 */

import { db } from '../server/db';
import { users } from '../server/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const FOUNDER_EMAIL = process.env.FOUNDER_EMAIL || 'jesus.cruzado@gmail.com';
const FOUNDER_NAME = process.env.FOUNDER_NAME || 'Jesus Cruzado';

async function createFounder() {
  console.log('\n🔐 Creating Founder Account...\n');

  try {
    // Check if user already exists
    const existing = await (db.select() as any).from(users)
      .where(eq(users.email, FOUNDER_EMAIL))
      .get();

    if (existing) {
      console.log('⚠️  Founder already exists!');
      console.log(`   Email: ${existing.email}`);
      console.log(`   API Key: ${existing.apiKey}`);
      console.log(`   Role: ${existing.role}`);
      console.log('');
      return;
    }

    // Generate API key
    const apiKey = `cb_${randomUUID().replace(/-/g, '')}`;

    // Create founder
    await (db.insert(users) as any).values({
      id: randomUUID(),
      email: FOUNDER_EMAIL,
      passwordHash: null, // No password - magic link only
      role: 'superadmin',
      apiKey,
      organizationId: null,
      organizationName: 'ContinuityBridge Founders Team',
      enabled: true,
      emailConfirmed: true,
      metadata: {
        roleTitle: 'Founder',
        team: 'Founders',
        addedBy: 'system-script',
        addedAt: new Date().toISOString(),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }).run();

    console.log('✅ Founder created successfully!');
    console.log('');
    console.log('═'.repeat(80));
    console.log('📋 ACCOUNT DETAILS');
    console.log('═'.repeat(80));
    console.log('');
    console.log(`Name:     ${FOUNDER_NAME}`);
    console.log(`Email:    ${FOUNDER_EMAIL}`);
    console.log(`Role:     Superadmin (Founder)`);
    console.log(`Team:     Founders`);
    console.log('');
    console.log('🔑 API KEY (Save this securely):');
    console.log('─'.repeat(80));
    console.log(apiKey);
    console.log('─'.repeat(80));
    console.log('');
    console.log('📧 Next Steps:');
    console.log('  1. Go to: https://networkvoid.xyz/onboarding');
    console.log(`  2. Enter email: ${FOUNDER_EMAIL}`);
    console.log('  3. Click "Generate Magic Link"');
    console.log('  4. Use the magic link to login (no password needed)');
    console.log('');
    console.log('💡 Or use API Key for authentication:');
    console.log('  curl -H "X-API-Key: <api-key>" https://networkvoid.xyz/api/...');
    console.log('');

  } catch (error: any) {
    console.error('\n❌ Error creating founder:', error.message);
    console.error(error);
    process.exit(1);
  }
}

createFounder()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
