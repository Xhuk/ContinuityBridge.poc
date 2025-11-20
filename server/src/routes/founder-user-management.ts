import { Router } from "express";
import { db } from "../../db.js";
import { users } from "../../db";
import { eq, or, and, inArray } from "drizzle-orm";
import { requireSuperAdmin } from "../auth/rbac-middleware.js";
import { randomUUID } from "crypto";
import { emailService } from "../notifications/index.js";
import { logger } from "../core/logger.js";

const router = Router();
const log = logger.child("FounderUserManagement");

/**
 * GET /api/founder/users
 * List all users with API keys visible (founders only)
 */
router.get("/users", requireSuperAdmin, async (req, res) => {
  try {
    const allUsers = await (db.select() as any).from(users);

    // Group users by role
    const founders = allUsers.filter((u: any) => u.role === "superadmin");
    const consultants = allUsers.filter((u: any) => u.role === "consultant");
    const customerAdmins = allUsers.filter((u: any) => u.role === "customer_admin");
    const customerUsers = allUsers.filter((u: any) => u.role === "customer_user");

    res.json({
      founders: founders.map((u: any) => ({
        id: u.id,
        email: u.email,
        apiKey: u.apiKey, // Visible to founders
        role: u.role,
        enabled: u.enabled,
        organizationId: u.organizationId,
        organizationName: u.organizationName,
        emailConfirmed: u.emailConfirmed,
        createdAt: u.createdAt,
      })),
      consultants: consultants.map((u: any) => ({
        id: u.id,
        email: u.email,
        apiKey: u.apiKey, // Visible to founders
        role: u.role,
        enabled: u.enabled,
        organizationId: u.organizationId,
        organizationName: u.organizationName,
        emailConfirmed: u.emailConfirmed,
        enrollmentStatus: u.metadata?.enrollmentStatus || "pending",
        createdAt: u.createdAt,
      })),
      customerAdmins: customerAdmins.map((u: any) => ({
        id: u.id,
        email: u.email,
        apiKey: u.apiKey, // Visible to founders
        role: u.role,
        enabled: u.enabled,
        organizationId: u.organizationId,
        organizationName: u.organizationName,
        emailConfirmed: u.emailConfirmed,
        enrollmentStatus: u.metadata?.enrollmentStatus || "pending",
        createdAt: u.createdAt,
      })),
      customerUsers: customerUsers.map((u: any) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        enabled: u.enabled,
        organizationId: u.organizationId,
        organizationName: u.organizationName,
        emailConfirmed: u.emailConfirmed,
        createdAt: u.createdAt,
      })),
      total: allUsers.length,
    });
  } catch (error: any) {
    log.error("Failed to list users", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/founder/users/enroll
 * Create new user and send enrollment email with API key
 */
router.post("/users/enroll", requireSuperAdmin, async (req, res) => {
  try {
    const {
      email,
      role, // "consultant" or "customer_admin"
      organizationId,
      organizationName,
      sendEmail = true,
    } = req.body;

    // Validate role
    if (!["consultant", "customer_admin"].includes(role)) {
      return res.status(400).json({
        error: "Only consultants and customer admins can be enrolled via this endpoint",
      });
    }

    // Check if user exists
    const existingUsers = await (db.select() as any)
      .from(users)
      .where(eq(users.email, email));

    if (existingUsers.length > 0) {
      return res.status(400).json({
        error: "User with this email already exists",
      });
    }

    // Generate API key
    const apiKey = `cb_${randomUUID().replace(/-/g, "")}`;

    // Generate enrollment token (for email confirmation link)
    const enrollmentToken = randomUUID();
    const enrollmentExpires = new Date();
    enrollmentExpires.setHours(enrollmentExpires.getHours() + 48); // 48 hour expiry

    // Create user
    const userId = randomUUID();
    await (db.insert(users) as any).values({
      id: userId,
      email,
      passwordHash: null, // No password until they set it
      role,
      apiKey,
      organizationId: organizationId || null,
      organizationName: organizationName || null,
      enabled: false, // Disabled until enrollment complete
      emailConfirmed: false,
      confirmationToken: enrollmentToken,
      confirmationTokenExpires: enrollmentExpires.toISOString(),
      metadata: {
        enrollmentStatus: "invited",
        invitedBy: req.user?.email,
        invitedAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    log.info("User enrolled", {
      userId,
      email,
      role,
      organizationId,
    });

    // Send enrollment email
    if (sendEmail) {
      const enrollmentUrl = `${process.env.APP_URL || "https://networkvoid.xyz"}/enroll?token=${enrollmentToken}`;
      const loginUrl = `${process.env.APP_URL || "https://networkvoid.xyz"}/sys/auth/bridge`;
      const qaTrackingUrl = `${process.env.APP_URL || "https://networkvoid.xyz"}/admin/qa-tracking`;
      const wikiUrl = `${process.env.APP_URL || "https://networkvoid.xyz"}/wiki`;
      
      // Special handling for QA Manager (consultant role)
      const isQAManager = role === "consultant";

      try {
        await emailService.sendEmail({
          to: email,
          subject: isQAManager 
            ? `Welcome to ContinuityBridge - QA Manager Onboarding`
            : `Welcome to ContinuityBridge - Complete Your Enrollment`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #0066cc;">Welcome to ContinuityBridge!</h2>
              <p>You've been invited to join as a <strong>${isQAManager ? "QA Manager" : "Customer Admin"}</strong>.</p>
              
              ${isQAManager ? `
              <div style="background: #f0f7ff; padding: 15px; border-left: 4px solid #0066cc; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #0066cc;">🧪 Your Role: QA Manager</h3>
                <p>As a QA Manager, you'll have access to:</p>
                <ul>
                  <li><strong>QA Tracking Interface</strong> - Log test results and manage test sessions</li>
                  <li><strong>Testing Documentation</strong> - Complete QA testing guide with scenarios</li>
                  <li><strong>Full Platform Access</strong> - Test all features and integrations</li>
                  <li><strong>Founder Collaboration</strong> - Flag issues for founder review</li>
                </ul>
              </div>
              ` : ''}
              
              <h3>🔑 Your API Key</h3>
              <p><code style="background: #f4f4f4; padding: 10px; display: block; font-family: monospace; border: 1px solid #ddd; border-radius: 4px;">${apiKey}</code></p>
              <p style="font-size: 14px; color: #666;"><strong>Keep this secure!</strong> This key provides API access to the platform.</p>
              
              <h3>✅ Step 1: Complete Your Enrollment</h3>
              <p>Click the button below to set your password and activate your account:</p>
              <p><a href="${enrollmentUrl}" style="background: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Complete Enrollment</a></p>
              <p style="font-size: 12px; color: #999;">Link expires in 48 hours</p>
              
              ${isQAManager ? `
              <h3>📚 Step 2: Review the QA Testing Guide</h3>
              <p>Once logged in, navigate to the Wiki to access the comprehensive QA Testing Guide:</p>
              <ul style="list-style: none; padding-left: 0;">
                <li style="margin: 8px 0;">📖 <strong>Wiki URL:</strong> <a href="${wikiUrl}">${wikiUrl}</a></li>
                <li style="margin: 8px 0;">📋 <strong>Guide:</strong> QA-Testing-Guide.md</li>
              </ul>
              <p>The guide includes:</p>
              <ul>
                <li>Test categories and scenarios</li>
                <li>Validation checklists</li>
                <li>Expected behaviors</li>
                <li>Known issues and workarounds</li>
              </ul>
              
              <h3>🧪 Step 3: Access the QA Tracking Interface</h3>
              <p>Log your test results using the QA Tracking dashboard:</p>
              <ul style="list-style: none; padding-left: 0;">
                <li style="margin: 8px 0;">🔗 <strong>QA Tracking URL:</strong> <a href="${qaTrackingUrl}">${qaTrackingUrl}</a></li>
              </ul>
              <p><strong>Features:</strong></p>
              <ul>
                <li><strong>Log Test Results</strong> - Record pass/fail/blocked/skipped tests</li>
                <li><strong>Create Test Sessions</strong> - Group tests (smoke, regression, exploratory)</li>
                <li><strong>Flag for Review</strong> - Mark tests requiring founder attention</li>
                <li><strong>Detailed Reporting</strong> - Add steps to reproduce, error logs, screenshots</li>
              </ul>
              
              <h3>🚀 Quick Start Checklist</h3>
              <ol>
                <li>✅ Complete enrollment (set password)</li>
                <li>✅ Login at: <a href="${loginUrl}">${loginUrl}</a></li>
                <li>✅ Read the QA Testing Guide in Wiki</li>
                <li>✅ Explore the QA Tracking interface</li>
                <li>✅ Create your first test session</li>
                <li>✅ Start logging test results</li>
              </ol>
              ` : `
              <h3>🔐 Login Information</h3>
              <p>After completing enrollment, login at:</p>
              <p><a href="${loginUrl}" style="color: #0066cc;">${loginUrl}</a></p>
              `}
              
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              
              <h3>📞 Need Help?</h3>
              <p>If you have questions or encounter issues:</p>
              <ul>
                <li>Contact the founder team</li>
                <li>Check the Wiki for documentation</li>
                ${isQAManager ? '<li>Use the QA Tracking interface to flag blockers</li>' : ''}
              </ul>
              
              <p style="font-size: 12px; color: #999; margin-top: 30px;">If you didn't expect this invitation, please ignore this email.</p>
            </div>
          `,
          text: `
Welcome to ContinuityBridge!

You've been invited to join as a ${isQAManager ? "QA Manager" : "Customer Admin"}.

${isQAManager ? `
=== YOUR ROLE: QA MANAGER ===

As a QA Manager, you'll have access to:
- QA Tracking Interface - Log test results and manage test sessions
- Testing Documentation - Complete QA testing guide with scenarios
- Full Platform Access - Test all features and integrations
- Founder Collaboration - Flag issues for founder review

` : ''}
=== YOUR API KEY ===
${apiKey}

Keep this secure! This key provides API access to the platform.

=== STEP 1: COMPLETE ENROLLMENT ===
Set your password: ${enrollmentUrl}
(Link expires in 48 hours)

${isQAManager ? `
=== STEP 2: REVIEW QA TESTING GUIDE ===
Wiki URL: ${wikiUrl}
Guide: QA-Testing-Guide.md

The guide includes:
- Test categories and scenarios
- Validation checklists
- Expected behaviors
- Known issues and workarounds

=== STEP 3: ACCESS QA TRACKING INTERFACE ===
QA Tracking URL: ${qaTrackingUrl}

Features:
- Log Test Results (pass/fail/blocked/skipped)
- Create Test Sessions (smoke, regression, exploratory)
- Flag for Review (mark tests requiring founder attention)
- Detailed Reporting (steps to reproduce, error logs, screenshots)

=== QUICK START CHECKLIST ===
1. Complete enrollment (set password)
2. Login at: ${loginUrl}
3. Read the QA Testing Guide in Wiki
4. Explore the QA Tracking interface
5. Create your first test session
6. Start logging test results
` : `
=== LOGIN INFORMATION ===
After completing enrollment, login at: ${loginUrl}
`}

=== NEED HELP? ===
If you have questions or encounter issues:
- Contact the founder team
- Check the Wiki for documentation
${isQAManager ? '- Use the QA Tracking interface to flag blockers' : ''}
          `,
        });

        log.info("Enrollment email sent", { email, userId });
      } catch (emailError: any) {
        log.error("Failed to send enrollment email", emailError);
        // Don't fail the request if email fails
      }
    }

    res.status(201).json({
      success: true,
      user: {
        id: userId,
        email,
        role,
        apiKey,
        enrollmentToken,
        enrollmentUrl: `${process.env.APP_URL || "https://networkvoid.xyz"}/enroll?token=${enrollmentToken}`,
        organizationId,
        organizationName,
      },
      message: sendEmail
        ? "User enrolled and invitation email sent"
        : "User enrolled (no email sent)",
    });
  } catch (error: any) {
    log.error("Failed to enroll user", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/founder/users/:userId/resend-enrollment
 * Resend enrollment email with API key
 */
router.post("/users/:userId/resend-enrollment", requireSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const userResults = await (db.select() as any)
      .from(users)
      .where(eq(users.id, userId));

    const user = userResults[0];

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.enabled && user.emailConfirmed) {
      return res.status(400).json({
        error: "User has already completed enrollment",
      });
    }

    // Generate new token
    const enrollmentToken = randomUUID();
    const enrollmentExpires = new Date();
    enrollmentExpires.setHours(enrollmentExpires.getHours() + 48);

    await (db.update(users) as any)
      .set({
        confirmationToken: enrollmentToken,
        confirmationTokenExpires: enrollmentExpires.toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId));

    const enrollmentUrl = `${process.env.APP_URL || "https://networkvoid.xyz"}/enroll?token=${enrollmentToken}`;
    const loginUrl = `${process.env.APP_URL || "https://networkvoid.xyz"}/sys/auth/bridge`;
    const qaTrackingUrl = `${process.env.APP_URL || "https://networkvoid.xyz"}/admin/qa-tracking`;
    const wikiUrl = `${process.env.APP_URL || "https://networkvoid.xyz"}/wiki`;
    const isQAManager = user.role === "consultant";

    await emailService.sendEmail({
      to: user.email,
      subject: isQAManager
        ? `ContinuityBridge - QA Manager Enrollment Reminder`
        : `ContinuityBridge - Enrollment Reminder`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0066cc;">Complete Your ContinuityBridge Enrollment</h2>
          <p>This is a reminder to complete your enrollment as a <strong>${isQAManager ? "QA Manager" : "Customer Admin"}</strong>.</p>
          
          <h3>🔑 Your API Key</h3>
          <p><code style="background: #f4f4f4; padding: 10px; display: block; font-family: monospace; border: 1px solid #ddd; border-radius: 4px;">${user.apiKey}</code></p>
          
          <h3>✅ Complete Your Enrollment</h3>
          <p><a href="${enrollmentUrl}" style="background: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Set Password & Activate Account</a></p>
          <p style="font-size: 12px; color: #999;">Link expires in 48 hours</p>
          
          ${isQAManager ? `
          <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
          <h3>🧪 QA Manager Resources</h3>
          
          <p><strong>1. QA Testing Guide</strong></p>
          <p>📖 Wiki: <a href="${wikiUrl}">${wikiUrl}</a></p>
          <p style="font-size: 14px; color: #666;">Complete testing scenarios, validation checklists, and expected behaviors</p>
          
          <p><strong>2. QA Tracking Interface</strong></p>
          <p>🧪 Dashboard: <a href="${qaTrackingUrl}">${qaTrackingUrl}</a></p>
          <p style="font-size: 14px; color: #666;">Log test results, create sessions, flag issues for founder review</p>
          
          <p><strong>3. Login Portal</strong></p>
          <p>🔐 Login: <a href="${loginUrl}">${loginUrl}</a></p>
          ` : ''}
          
          <p style="font-size: 12px; color: #999; margin-top: 30px;">Need help? Contact the founder team.</p>
        </div>
      `,
      text: `
Complete Your ContinuityBridge Enrollment

Role: ${isQAManager ? "QA Manager" : "Customer Admin"}

Your API Key: ${user.apiKey}

Complete your enrollment: ${enrollmentUrl}
(Link expires in 48 hours)

${isQAManager ? `
=== QA MANAGER RESOURCES ===

1. QA Testing Guide
Wiki: ${wikiUrl}
Complete testing scenarios, validation checklists, and expected behaviors

2. QA Tracking Interface
Dashboard: ${qaTrackingUrl}
Log test results, create sessions, flag issues for founder review

3. Login Portal
Login: ${loginUrl}
` : `
Login at: ${loginUrl}
`}
      `,
    });

    res.json({
      success: true,
      message: "Enrollment email resent",
      enrollmentUrl,
    });
  } catch (error: any) {
    log.error("Failed to resend enrollment", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/founder/users/:userId/api-key
 * View specific user's API key
 */
router.get("/users/:userId/api-key", requireSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const userResults = await (db.select() as any)
      .from(users)
      .where(eq(users.id, userId));

    const user = userResults[0];

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      userId: user.id,
      email: user.email,
      apiKey: user.apiKey,
      role: user.role,
    });
  } catch (error: any) {
    log.error("Failed to get API key", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/founder/users/:userId/regenerate-api-key
 * Regenerate user's API key and send notification
 */
router.post("/users/:userId/regenerate-api-key", requireSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { sendEmail = true } = req.body;

    const userResults = await (db.select() as any)
      .from(users)
      .where(eq(users.id, userId));

    const user = userResults[0];

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Generate new API key
    const newApiKey = `cb_${randomUUID().replace(/-/g, "")}`;

    await (db.update(users) as any)
      .set({
        apiKey: newApiKey,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId));

    log.info("API key regenerated", {
      userId,
      email: user.email,
      regeneratedBy: req.user?.email,
    });

    // Send notification
    if (sendEmail) {
      try {
        await emailService.sendEmail({
          to: user.email,
          subject: `ContinuityBridge - New API Key Generated`,
          html: `
            <h2>Your API Key Has Been Regenerated</h2>
            <p>A new API key has been generated for your account.</p>
            
            <h3>New API Key</h3>
            <p><code style="background: #f4f4f4; padding: 10px; display: block; font-family: monospace;">${newApiKey}</code></p>
            
            <p><strong>Important:</strong> Your old API key has been revoked and will no longer work.</p>
            
            <p>If you didn't request this change, please contact your administrator immediately.</p>
          `,
          text: `
Your API Key Has Been Regenerated

New API Key: ${newApiKey}

Your old API key has been revoked and will no longer work.
          `,
        });
      } catch (emailError: any) {
        log.error("Failed to send API key email", emailError);
      }
    }

    res.json({
      success: true,
      apiKey: newApiKey,
      message: sendEmail ? "API key regenerated and email sent" : "API key regenerated",
    });
  } catch (error: any) {
    log.error("Failed to regenerate API key", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
