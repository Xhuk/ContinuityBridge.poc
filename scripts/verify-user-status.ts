import { neon } from "@neondatabase/serverless";

/**
 * Verify specific user status and activation
 * Run with: USER_EMAIL=jesus.cruzado@gmail.com npx tsx scripts/verify-user-status.ts
 */

async function verifyUser() {
  const userEmail = process.env.USER_EMAIL;

  if (!userEmail) {
    console.error("❌ USER_EMAIL environment variable is required.");
    console.error("\nUsage:");
    console.error("  USER_EMAIL=jesus.cruzado@gmail.com npx tsx scripts/verify-user-status.ts\n");
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("❌ DATABASE_URL not set.");
    process.exit(1);
  }

  console.log(`\n🔍 Checking user: ${userEmail}\n`);
  console.log("═".repeat(60));

  const sql = neon(databaseUrl);

  try {
    const userResult = await sql`
      SELECT 
        id,
        email,
        role,
        enabled,
        email_confirmed,
        organization_id,
        organization_name,
        password_hash,
        last_login_at,
        created_at,
        updated_at
      FROM users
      WHERE email = ${userEmail}
    `;

    if (userResult.length === 0) {
      console.log(`❌ User NOT found: ${userEmail}\n`);
      console.log("Available users:");
      
      const allUsers = await sql`
        SELECT email, role, enabled FROM users ORDER BY created_at
      `;
      
      allUsers.forEach((u, i) => {
        console.log(`   ${i + 1}. ${u.email} (${u.role}) - ${u.enabled ? 'enabled' : 'disabled'}`);
      });
      
      console.log("");
      process.exit(1);
    }

    const user = userResult[0];

    console.log("\n✅ User Found\n");
    console.log(`   ID:              ${user.id}`);
    console.log(`   Email:           ${user.email}`);
    console.log(`   Role:            ${user.role}`);
    console.log(`   Enabled:         ${user.enabled ? '✅ YES' : '❌ NO'}`);
    console.log(`   Email Confirmed: ${user.email_confirmed ? '✅ YES' : '❌ NO'}`);
    console.log(`   Organization:    ${user.organization_name || 'N/A'}`);
    console.log(`   Password Set:    ${user.password_hash ? 'Yes (can use password login)' : 'No (magic link only)'}`);
    console.log(`   Last Login:      ${user.last_login_at || 'Never'}`);
    console.log(`   Created:         ${new Date(user.created_at).toLocaleString()}`);
    console.log(`   Updated:         ${new Date(user.updated_at).toLocaleString()}`);

    // Check for issues
    console.log("\n📋 Status Check\n");

    const issues: string[] = [];
    const fixes: string[] = [];

    if (!user.enabled) {
      issues.push("❌ User is DISABLED");
      fixes.push("UPDATE users SET enabled = true WHERE email = ?");
    }

    if (!user.email_confirmed) {
      issues.push("❌ Email NOT confirmed");
      fixes.push("UPDATE users SET email_confirmed = true WHERE email = ?");
    }

    if (issues.length > 0) {
      console.log("⚠️  Issues Found:\n");
      issues.forEach(issue => console.log(`   ${issue}`));
      
      console.log("\n🔧 Attempting to fix...\n");

      await sql`
        UPDATE users
        SET enabled = true,
            email_confirmed = true,
            updated_at = NOW()
        WHERE email = ${userEmail}
      `;

      console.log("✅ User activated successfully!\n");
    } else {
      console.log("✅ User is fully activated and ready to use\n");
    }

    // Check environment for email sending
    console.log("📧 Email Configuration Check\n");

    const resendKey = process.env.RESEND_API_KEY;
    const appUrl = process.env.APP_URL || process.env.APP_DOMAIN;

    if (!resendKey) {
      console.log("❌ RESEND_API_KEY: NOT SET");
      console.log("   Magic link emails WILL NOT be sent!");
      console.log("   Set this in Render Dashboard → Environment\n");
    } else {
      console.log(`✅ RESEND_API_KEY: ${resendKey.substring(0, 10)}...`);
    }

    if (!appUrl) {
      console.log("⚠️  APP_URL/APP_DOMAIN: NOT SET");
      console.log("   Magic links may have incorrect domain\n");
    } else {
      console.log(`✅ APP_URL: ${appUrl}\n`);
    }

    console.log("═".repeat(60));
    console.log("\n🎯 Next Steps:\n");
    console.log(`1. Ensure RESEND_API_KEY is set in Render`);
    console.log(`2. Go to: ${appUrl || 'https://networkvoid.xyz'}/sys/auth/bridge`);
    console.log(`3. Enter: ${userEmail}`);
    console.log(`4. Click 'Send Magic Link'`);
    console.log(`5. Check email (including spam folder)\n`);

  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error("\nFull error:", error);
    process.exit(1);
  }
}

verifyUser();
