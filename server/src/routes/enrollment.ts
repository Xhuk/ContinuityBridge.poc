import { Router } from "express";
import { db } from "../../db.js";
import { users } from "../../db";
import { eq } from "drizzle-orm";
import { hashPassword } from "./auth-login.js";
import { logger } from "../core/logger.js";

const router = Router();
const log = logger.child("Enrollment");

/**
 * POST /api/enrollment/complete
 * Complete user enrollment (set password, confirm email)
 */
router.post("/complete", async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        error: "Token and password are required",
      });
    }

    // Find user by enrollment token
    const userResults = await (db.select() as any)
      .from(users)
      .where(eq(users.confirmationToken, token));

    const user = userResults[0];

    if (!user) {
      return res.status(404).json({
        error: "Invalid or expired enrollment token",
      });
    }

    // Check token expiry
    if (user.confirmationTokenExpires) {
      const expiryDate = new Date(user.confirmationTokenExpires);
      if (expiryDate < new Date()) {
        return res.status(400).json({
          error: "Enrollment token has expired. Please request a new invitation.",
        });
      }
    }

    // Validate password strength (enforce strengthened policy)
    if (password.length < 12) {
      return res.status(400).json({
        error: "Password must be at least 12 characters long",
      });
    }

    // Check for required character types
    const hasLowercase = /[a-z]/.test(password);
    const hasUppercase = /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecialChar = /[@$!%*?&#^()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    if (!hasLowercase || !hasUppercase || !hasNumber || !hasSpecialChar) {
      return res.status(400).json({
        error: "Password must contain uppercase, lowercase, number, and special character",
      });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Update user
    await (db.update(users) as any)
      .set({
        passwordHash,
        emailConfirmed: true,
        enabled: true,
        confirmationToken: null,
        confirmationTokenExpires: null,
        metadata: {
          ...user.metadata,
          enrollmentStatus: "completed",
          enrollmentCompletedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, user.id));

    log.info("User enrollment completed", {
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    res.json({
      success: true,
      message: "Enrollment completed successfully",
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        organizationName: user.organizationName,
      },
    });
  } catch (error: any) {
    log.error("Failed to complete enrollment", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/enrollment/verify/:token
 * Verify enrollment token is valid
 */
router.get("/verify/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const userResults = await (db.select() as any)
      .from(users)
      .where(eq(users.confirmationToken, token));

    const user = userResults[0];

    if (!user) {
      return res.status(404).json({
        valid: false,
        error: "Invalid enrollment token",
      });
    }

    // Check expiry
    if (user.confirmationTokenExpires) {
      const expiryDate = new Date(user.confirmationTokenExpires);
      if (expiryDate < new Date()) {
        return res.json({
          valid: false,
          error: "Enrollment token has expired",
        });
      }
    }

    res.json({
      valid: true,
      user: {
        email: user.email,
        role: user.role,
        organizationName: user.organizationName,
      },
    });
  } catch (error: any) {
    log.error("Failed to verify enrollment token", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

