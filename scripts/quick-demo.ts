#!/usr/bin/env tsx
/**
 * Quick Demo Runner
 * One-command demo execution for presentations
 * 
 * Usage: npm run demo:quick
 */

import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

async function runCommand(command: string, args: string[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
    });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with code ${code}`));
    });

    proc.on('error', reject);
  });
}

async function quickDemo() {
  console.log('🎬 ContinuityBridge Quick Demo');
  console.log('='.repeat(80));
  console.log('This will:');
  console.log('  1. Setup demo environment (org, users, flows, mock systems)');
  console.log('  2. Run all demo tests automatically');
  console.log('  3. Display results summary');
  console.log('');

  try {
    // Step 1: Setup demo
    console.log('📋 Step 1/2: Setting up demo environment...\n');
    await runCommand('npm', ['run', 'setup:demo']);
    
    console.log('\n✅ Demo setup complete!\n');
    console.log('⏳ Waiting 3 seconds for database sync...');
    await setTimeout(3000);

    // Step 2: Run tests
    console.log('\n🧪 Step 2/2: Running demo tests...\n');
    await runCommand('npm', ['run', 'test:demo']);

    console.log('\n' + '='.repeat(80));
    console.log('🎉 DEMO COMPLETE!');
    console.log('='.repeat(80));
    console.log('\n📚 Next steps:');
    console.log('  • Login with: admin@demo-logistics.com');
    console.log('  • View flows at: http://localhost:5000/flows');
    console.log('  • Check execution history: http://localhost:5000/events');
    console.log('  • Explore mock systems: http://localhost:5000/api/mock/demo/health');
    console.log('\n💡 See DEMO-GUIDE.md for detailed walkthrough');
    console.log('');

  } catch (error: any) {
    console.error('\n❌ Demo failed:', error.message);
    console.error('\n🔧 Troubleshooting:');
    console.error('  • Ensure server is running: npm run dev:server');
    console.error('  • Check database connection');
    console.error('  • Review logs above for errors');
    process.exit(1);
  }
}

quickDemo();
