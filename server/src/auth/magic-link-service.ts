import { randomUUID } from "crypto";
import { db } from "../../db";
import { users } from "../../schema";
import { eq } from "drizzle-orm";

/**
 * Magic Link Authentication Service
 * 
 * Provides passwordless authentication via email:
 * 1. User enters email → system sends magic link
 * 2. User clicks link → auto-login with session token
 * 
 * Benefits:
 * - No password to remember
 * - Email ownership verification
 * - Secure (tokens expire in 15 minutes)
 */

export interface MagicLinkToken {
  id: string;
  userId: string;
  email: string;
  token: string;
  expiresAt: string;
  usedAt?: string;
  createdAt: string;
}

export class MagicLinkService {
  private tokens: Map<string, MagicLinkToken> = new Map();
  private tokenExpiryMinutes = 15;

  /**
   * Generate magic link for user
   */
  async generateMagicLink(
    email: string,
    baseUrl?: string
  ): Promise<{ magicLink: string; token: string; expiresAt: string }> {
    // Use configured domain or fallback to localhost
    const appUrl = baseUrl || 
                   process.env.APP_URL || 
                   `https://${process.env.APP_DOMAIN}` || 
                   "http://localhost:5000";
    // Check if user exists
    const userResult = await (db.select().from(users).where(eq(users.email, email)) as any);
    const user = Array.isArray(userResult) ? userResult[0] : userResult;

    if (!user) {
      throw new Error("User not found. Contact your administrator to create an account.");
    }

    if (!user.enabled) {
      throw new Error("Account disabled. Contact your administrator.");
    }

    // Generate secure token
    const token = randomUUID().replace(/-/g, "");
    const expiresAt = new Date(Date.now() + this.tokenExpiryMinutes * 60 * 1000).toISOString();

    // Store token
    const magicLinkToken: MagicLinkToken = {
      id: randomUUID(),
      userId: user.id,
      email: user.email,
      token,
      expiresAt,
      createdAt: new Date().toISOString(),
    };

    this.tokens.set(token, magicLinkToken);

    // Auto-cleanup expired tokens after 1 hour
    setTimeout(() => this.tokens.delete(token), 60 * 60 * 1000);

    const magicLink = `${appUrl}/auth/verify?token=${token}`;

    return { magicLink, token, expiresAt };
  }

  /**
   * Verify magic link token and create session
   */
  async verifyMagicLink(token: string): Promise<{
    valid: boolean;
    user?: any;
    sessionToken?: string;
    error?: string;
  }> {
    const magicLinkToken = this.tokens.get(token);

    if (!magicLinkToken) {
      return { valid: false, error: "Invalid or expired magic link" };
    }

    // Check if already used
    if (magicLinkToken.usedAt) {
      return { valid: false, error: "Magic link already used" };
    }

    // Check expiry
    if (new Date() > new Date(magicLinkToken.expiresAt)) {
      this.tokens.delete(token);
      return { valid: false, error: "Magic link expired (valid for 15 minutes)" };
    }

    // Mark as used
    magicLinkToken.usedAt = new Date().toISOString();

    // Get user
    const userResult = await (db.select().from(users)
      .where(eq(users.id, magicLinkToken.userId)) as any);
    const user = Array.isArray(userResult) ? userResult[0] : userResult;

    if (!user || !user.enabled) {
      return { valid: false, error: "User account not found or disabled" };
    }

    // Update last login
    await (db.update(users)
      .set({ lastLoginAt: new Date().toISOString() })
      .where(eq(users.id, user.id)) as any);

    // Generate session token (JWT-like but simplified)
    const sessionToken = this.generateSessionToken(user);

    // Cleanup used token after 5 minutes
    setTimeout(() => this.tokens.delete(token), 5 * 60 * 1000);

    return {
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      },
      sessionToken,
    };
  }

  /**
   * Generate session token (simplified JWT)
   */
  private generateSessionToken(user: any): string {
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      iat: Date.now(),
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    };

    // In production, use proper JWT library (jsonwebtoken)
    // For now, base64 encode (INSECURE - REPLACE IN PROD!)
    return Buffer.from(JSON.stringify(payload)).toString("base64");
  }

  /**
   * Get email body for magic link
   */
  getEmailTemplate(email: string, magicLink: string, expiresAt: string): {
    subject: string;
    html: string;
    text: string;
  } {
    const expiryDate = new Date(expiresAt);
    const expiryMinutes = Math.round((expiryDate.getTime() - Date.now()) / 60000);

    return {
      subject: "🔐 Your ContinuityBridge Login Link",
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">🔐 Magic Link Login</h1>
  </div>
  
  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi <strong>${email}</strong>,
    </p>
    
    <p style="font-size: 16px; margin-bottom: 25px;">
      Click the button below to securely log in to your ContinuityBridge account. No password needed!
    </p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${magicLink}" 
         style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        🚀 Log In to ContinuityBridge
      </a>
    </div>
    
    <p style="font-size: 14px; color: #6b7280; margin-top: 25px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      <strong>⏱️ This link expires in ${expiryMinutes} minutes.</strong><br>
      If you didn't request this login, you can safely ignore this email.
    </p>
    
    <p style="font-size: 12px; color: #9ca3af; margin-top: 20px;">
      If the button doesn't work, copy and paste this link:<br>
      <code style="background: #e5e7eb; padding: 8px; display: block; margin-top: 8px; border-radius: 4px; word-break: break-all;">${magicLink}</code>
    </p>
  </div>
  
  <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
    <p>ContinuityBridge - Integration Platform</p>
  </div>
</body>
</html>
      `,
      text: `
ContinuityBridge - Magic Link Login

Hi ${email},

Click this link to securely log in to your account (no password needed):

${magicLink}

⏱️ This link expires in ${expiryMinutes} minutes.

If you didn't request this login, you can safely ignore this email.

---
ContinuityBridge - Integration Platform
      `,
    };
  }

  /**
   * Revoke all tokens for a user (e.g., after password change)
   */
  revokeUserTokens(userId: string): number {
    let revokedCount = 0;
    for (const [token, data] of this.tokens.entries()) {
      if (data.userId === userId) {
        this.tokens.delete(token);
        revokedCount++;
      }
    }
    return revokedCount;
  }

  /**
   * Cleanup expired tokens (run periodically)
   */
  cleanupExpiredTokens(): number {
    let cleanedCount = 0;
    const now = new Date();
    
    for (const [token, data] of this.tokens.entries()) {
      if (now > new Date(data.expiresAt)) {
        this.tokens.delete(token);
        cleanedCount++;
      }
    }
    
    return cleanedCount;
  }
}

// Singleton instance
export const magicLinkService = new MagicLinkService();

// Cleanup expired tokens every 5 minutes
setInterval(() => {
  const cleaned = magicLinkService.cleanupExpiredTokens();
  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} expired magic link tokens`);
  }
}, 5 * 60 * 1000);
