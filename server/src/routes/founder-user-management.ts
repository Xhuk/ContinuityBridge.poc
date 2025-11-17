import { Router } from "express";
import { db } from "../../db.js";
import { users } from "../../schema.js";
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

      try {
        await emailService.sendEmail({
          to: email,
          subject: `Welcome to ContinuityBridge - Complete Your Enrollment`,
          html: `
            <h2>Welcome to ContinuityBridge!</h2>
            <p>You've been invited to join as a <strong>${role === "consultant" ? "Consultant" : "Customer Admin"}</strong>.</p>
            
            <h3>Your API Key</h3>
            <p><code style="background: #f4f4f4; padding: 10px; display: block; font-family: monospace;">${apiKey}</code></p>
            
            <h3>Complete Your Enrollment</h3>
            <p>Click the link below to set your password and activate your account:</p>
            <p><a href="${enrollmentUrl}" style="background: #0066cc; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Complete Enrollment</a></p>
            
            <p><small>This link expires in 48 hours.</small></p>
            
            <hr>
            <p><small>If you didn't expect this invitation, please ignore this email.</small></p>
          `,
          text: `
Welcome to ContinuityBridge!

You've been invited to join as a ${role === "consultant" ? "Consultant" : "Customer Admin"}.

Your API Key: ${apiKey}

Complete your enrollment by visiting: ${enrollmentUrl}

This link expires in 48 hours.
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

    await emailService.sendEmail({
      to: user.email,
      subject: `ContinuityBridge - Enrollment Reminder`,
      html: `
        <h2>Complete Your ContinuityBridge Enrollment</h2>
        <p>This is a reminder to complete your enrollment as a <strong>${user.role === "consultant" ? "Consultant" : "Customer Admin"}</strong>.</p>
        
        <h3>Your API Key</h3>
        <p><code style="background: #f4f4f4; padding: 10px; display: block; font-family: monospace;">${user.apiKey}</code></p>
        
        <h3>Complete Your Enrollment</h3>
        <p><a href="${enrollmentUrl}" style="background: #0066cc; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Complete Enrollment</a></p>
        
        <p><small>This link expires in 48 hours.</small></p>
      `,
      text: `
Complete Your ContinuityBridge Enrollment

Your API Key: ${user.apiKey}

Complete your enrollment: ${enrollmentUrl}

This link expires in 48 hours.
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
