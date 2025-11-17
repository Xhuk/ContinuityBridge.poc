import { Resend } from 'resend';

/**
 * Resend Email Service for Superadmin Tasks
 * 
 * Purpose: Send transactional emails for system operations:
 * - Magic link authentication
 * - Contractor invitations
 * - License notifications
 * - System alerts to admins
 * 
 * Separate from customer SMTP (which handles flow notifications)
 */

export interface ResendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export class ResendService {
  private resend: Resend | null = null;
  private fromEmail: string;
  private enabled: boolean;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    const domain = process.env.APP_DOMAIN || process.env.EXPORT_DOMAIN || 'networkvoid.xyz';
    
    this.fromEmail = process.env.RESEND_FROM_EMAIL || `noreply@${domain}`;
    this.enabled = !!apiKey;

    if (apiKey) {
      this.resend = new Resend(apiKey);
      console.log(`[ResendService] Initialized with from: ${this.fromEmail}`);
    } else {
      console.warn('[ResendService] RESEND_API_KEY not set - superadmin emails disabled');
    }
  }

  /**
   * Send email via Resend (for superadmin tasks)
   */
  async sendEmail(options: ResendEmailOptions): Promise<{ id: string; success: boolean }> {
    if (!this.resend || !this.enabled) {
      console.warn('[ResendService] Resend not configured - email not sent');
      console.log('[ResendService] Would send email:', {
        to: options.to,
        subject: options.subject,
      });
      
      // In development, return mock success
      if (process.env.NODE_ENV === 'development') {
        return { id: 'dev-mock-' + Date.now(), success: true };
      }
      
      throw new Error('Resend API not configured. Set RESEND_API_KEY environment variable.');
    }

    try {
      const recipients = Array.isArray(options.to) ? options.to : [options.to];
      
      const result = await this.resend.emails.send({
        from: options.from || this.fromEmail,
        to: recipients,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      console.log('[ResendService] Email sent successfully:', {
        id: result.data?.id,
        to: recipients,
        subject: options.subject,
      });

      return {
        id: result.data?.id || 'unknown',
        success: true,
      };
    } catch (error: any) {
      console.error('[ResendService] Failed to send email:', error);
      throw new Error(`Resend email failed: ${error.message}`);
    }
  }

  /**
   * Send magic link email
   */
  async sendMagicLinkEmail(
    email: string,
    magicLink: string,
    expiresAt: string
  ): Promise<void> {
    const domain = process.env.APP_DOMAIN || 'networkvoid.xyz';
    const expiryDate = new Date(expiresAt);
    const expiryMinutes = Math.round((expiryDate.getTime() - Date.now()) / 60000);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">🔐 Magic Link Login</h1>
  </div>
  
  <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
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
    <p>${domain}</p>
  </div>
</body>
</html>
    `;

    const text = `
ContinuityBridge - Magic Link Login

Hi ${email},

Click this link to securely log in to your account (no password needed):

${magicLink}

⏱️ This link expires in ${expiryMinutes} minutes.

If you didn't request this login, you can safely ignore this email.

---
ContinuityBridge - Integration Platform
${domain}
    `;

    await this.sendEmail({
      to: email,
      subject: '🔐 Your ContinuityBridge Login Link',
      html,
      text,
    });
  }

  /**
   * Send contractor invitation email
   */
  async sendContractorInvitation(
    email: string,
    organizationName: string,
    temporaryPassword?: string
  ): Promise<void> {
    const domain = process.env.APP_DOMAIN || 'networkvoid.xyz';
    const loginUrl = process.env.APP_URL || `https://${domain}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">🎉 Welcome to ContinuityBridge</h1>
  </div>
  
  <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi <strong>${email}</strong>,
    </p>
    
    <p style="font-size: 16px; margin-bottom: 25px;">
      You've been invited to join <strong>${organizationName}</strong> as a contractor on ContinuityBridge!
    </p>
    
    <div style="background: #f3f4f6; padding: 20px; border-radius: 6px; margin: 25px 0;">
      <p style="margin: 0 0 10px 0;"><strong>Your Login Details:</strong></p>
      <p style="margin: 5px 0;">📧 Email: <code style="background: white; padding: 2px 6px; border-radius: 3px;">${email}</code></p>
      ${temporaryPassword ? `<p style="margin: 5px 0;">🔑 Password: <code style="background: white; padding: 2px 6px; border-radius: 3px;">${temporaryPassword}</code></p>` : ''}
    </div>
    
    ${temporaryPassword ? `
    <p style="font-size: 14px; color: #dc2626; margin-bottom: 20px;">
      ⚠️ Please change your password after first login for security.
    </p>
    ` : ''}
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${loginUrl}" 
         style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        🚀 Access ContinuityBridge
      </a>
    </div>
    
    <p style="font-size: 14px; color: #6b7280; margin-top: 25px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      <strong>What you can do:</strong><br>
      • Build integration flows<br>
      • Configure data mappings<br>
      • Test integrations<br>
      • Mark flows as production-ready
    </p>
  </div>
  
  <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
    <p>ContinuityBridge - Integration Platform</p>
    <p>${domain}</p>
  </div>
</body>
</html>
    `;

    const text = `
ContinuityBridge - Contractor Invitation

Hi ${email},

You've been invited to join ${organizationName} as a contractor!

Login URL: ${loginUrl}
Email: ${email}
${temporaryPassword ? `Password: ${temporaryPassword}\n\n⚠️ Please change your password after first login.` : ''}

---
ContinuityBridge - Integration Platform
${domain}
    `;

    await this.sendEmail({
      to: email,
      subject: `🎉 Welcome to ContinuityBridge - ${organizationName}`,
      html,
      text,
    });
  }

  /**
   * Send account confirmation email (step 1 of user creation)
   */
  async sendAccountConfirmationEmail(
    email: string,
    organizationName: string,
    role: "superadmin" | "consultant" | "customer_admin" | "customer_user",
    confirmationToken: string
  ): Promise<void> {
    const domain = process.env.APP_DOMAIN || 'networkvoid.xyz';
    const appUrl = process.env.APP_URL || `https://${domain}`;
    const confirmUrl = `${appUrl}/confirm-account/${confirmationToken}`;

    const roleLabels = {
      superadmin: 'Founder / Superadmin',
      consultant: 'Consultant',
      customer_admin: 'Customer Admin',
      customer_user: 'Customer User',
    };

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">✉️ Confirm Your Account</h1>
  </div>
  
  <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi <strong>${email}</strong>,
    </p>
    
    <p style="font-size: 16px; margin-bottom: 25px;">
      An account has been created for you on <strong>ContinuityBridge</strong> with the following details:
    </p>
    
    <div style="background: #f3f4f6; padding: 20px; border-radius: 6px; margin: 25px 0; border-left: 4px solid #10b981;">
      <p style="margin: 0 0 10px 0;"><strong>📋 Account Details:</strong></p>
      <p style="margin: 5px 0;">📧 Email: <code style="background: white; padding: 4px 8px; border-radius: 3px; font-size: 14px;">${email}</code></p>
      <p style="margin: 5px 0;">🎯 Role: <code style="background: white; padding: 4px 8px; border-radius: 3px; font-size: 14px;">${roleLabels[role]}</code></p>
      <p style="margin: 5px 0;">🏢 Organization: <code style="background: white; padding: 4px 8px; border-radius: 3px; font-size: 14px;">${organizationName}</code></p>
    </div>
    
    <div style="background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0; font-size: 14px; color: #92400e;">
        ⚠️ <strong>Action Required:</strong> Please confirm your email address to receive your login credentials.
      </p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${confirmUrl}" 
         style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        ✅ Confirm Email Address
      </a>
    </div>
    
    <p style="font-size: 14px; color: #6b7280; margin-top: 25px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      <strong>What happens next:</strong><br>
      • Click the button above to confirm your email<br>
      • You'll receive another email with your API key and magic link<br>
      • Use these credentials to log in to ContinuityBridge
    </p>
    
    <p style="font-size: 12px; color: #9ca3af; margin-top: 20px;">
      If the button doesn't work, copy and paste this link:<br>
      <code style="background: #e5e7eb; padding: 8px; display: block; margin-top: 8px; border-radius: 4px; word-break: break-all;">${confirmUrl}</code>
    </p>
  </div>
  
  <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
    <p>ContinuityBridge - Integration Platform</p>
    <p>${domain}</p>
  </div>
</body>
</html>
    `;

    const text = `
ContinuityBridge - Confirm Your Account

Hi ${email},

An account has been created for you on ContinuityBridge with the following details:

📋 Account Details:
📧 Email: ${email}
🎯 Role: ${roleLabels[role]}
🏢 Organization: ${organizationName}

⚠️ Action Required: Please confirm your email address to receive your login credentials.

Confirm your email: ${confirmUrl}

What happens next:
• Click the link above to confirm your email
• You'll receive another email with your API key and magic link
• Use these credentials to log in to ContinuityBridge

---
ContinuityBridge - Integration Platform
${domain}
    `;

    await this.sendEmail({
      to: email,
      subject: `✉️ Confirm Your ContinuityBridge Account`,
      html,
      text,
    });
  }

  /**
   * Send account details email with API key and magic link (step 2 after confirmation)
   */
  async sendAccountDetailsEmail(
    email: string,
    apiKey: string,
    magicLink: string,
    organizationName: string,
    environment: string,
    role: "superadmin" | "consultant" | "customer_admin" | "customer_user"
  ): Promise<void> {
    const domain = process.env.APP_DOMAIN || 'networkvoid.xyz';
    const loginUrl = process.env.APP_URL || `https://${domain}`;

    const roleLabel = {
      superadmin: 'Superadmin',
      consultant: 'Consultant',
      customer_admin: 'Customer Admin',
      customer_user: 'Customer User',
    }[role];

    const envLabel = {
      dev: 'Development',
      test: 'Testing',
      staging: 'Staging',
      prod: 'Production',
    }[environment] || environment;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">🎉 Welcome to ContinuityBridge!</h1>
  </div>
  
  <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi <strong>${email}</strong>,
    </p>
    
    <p style="font-size: 16px; margin-bottom: 25px;">
      Your email has been confirmed! Here are your login credentials for <strong>${organizationName}</strong> (${envLabel} environment).
    </p>
    
    <div style="background: #f3f4f6; padding: 20px; border-radius: 6px; margin: 25px 0; border-left: 4px solid #667eea;">
      <p style="margin: 0 0 15px 0;"><strong>🔑 Your Login Credentials:</strong></p>
      
      <p style="margin: 10px 0 5px 0; font-weight: 600;">Option 1: API Key Login</p>
      <code style="display: block; background: #1e293b; color: #10b981; padding: 12px; border-radius: 4px; font-size: 13px; word-break: break-all; font-family: 'Courier New', monospace; margin-bottom: 15px;">${apiKey}</code>
      
      <p style="margin: 10px 0 5px 0; font-weight: 600;">Option 2: Magic Link (One-Click Login)</p>
      <a href="${magicLink}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; margin-top: 5px;">
        🚀 Login with Magic Link
      </a>
      
      <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
        <p style="margin: 5px 0; font-size: 14px;">📧 Email: <code style="background: white; padding: 2px 6px; border-radius: 3px;">${email}</code></p>
        <p style="margin: 5px 0; font-size: 14px;">🎯 Role: <code style="background: white; padding: 2px 6px; border-radius: 3px;">${roleLabel}</code></p>
        <p style="margin: 5px 0; font-size: 14px;">🌐 Environment: <code style="background: white; padding: 2px 6px; border-radius: 3px;">${envLabel}</code></p>
      </div>
    </div>
    
    <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0; font-size: 14px; color: #856404;">
        ⚠️ <strong>Security Notice:</strong> Keep your API key secure. Do not share it publicly or commit it to version control.
      </p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${loginUrl}/sys/auth/bridge" 
         style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        🚀 Go to Login Page
      </a>
    </div>
    
    <p style="font-size: 14px; color: #6b7280; margin-top: 25px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      <strong>How to use your credentials:</strong><br>
      • <strong>API Key:</strong> Include in the <code>X-API-Key</code> header for all API requests<br>
      • <strong>Magic Link:</strong> Click to log in automatically (valid for 7 days)<br>
      • Store your API key securely in your environment variables
    </p>
  </div>
  
  <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
    <p>ContinuityBridge - Integration Platform</p>
    <p>${domain}</p>
  </div>
</body>
</html>
    `;

    const text = `
ContinuityBridge - Your Login Credentials

Hi ${email},

Your email has been confirmed! Here are your login credentials for ${organizationName} (${envLabel} environment).

🔑 Your Login Credentials:

Option 1: API Key Login
${apiKey}

Option 2: Magic Link (One-Click Login)
${magicLink}

📧 Email: ${email}
🎯 Role: ${roleLabel}
🌐 Environment: ${envLabel}

⚠️ Security Notice: Keep your API key secure. Do not share it publicly or commit it to version control.

How to use your credentials:
• API Key: Include in the X-API-Key header for all API requests
• Magic Link: Click to log in automatically (valid for 7 days)
• Store your API key securely in your environment variables

Login Page: ${loginUrl}/sys/auth/bridge

---
ContinuityBridge - Integration Platform
${domain}
    `;

    await this.sendEmail({
      to: email,
      subject: `🎉 Your ContinuityBridge Login Credentials - ${envLabel}`,
      html,
      text,
    });
  }

  /**
   * Send API key email to user
   */
  async sendAPIKeyEmail(
    email: string,
    apiKey: string,
    organizationName: string,
    environment: string,
    role: "superadmin" | "consultant" | "customer_admin" | "customer_user"
  ): Promise<void> {
    const domain = process.env.APP_DOMAIN || 'networkvoid.xyz';
    const loginUrl = process.env.APP_URL || `https://${domain}`;

    const roleLabel = {
      superadmin: 'Superadmin',
      consultant: 'Consultant',
      customer_admin: 'Customer Admin',
      customer_user: 'Customer User',
    }[role];

    const envLabel = {
      dev: 'Development',
      test: 'Testing',
      staging: 'Staging',
      prod: 'Production',
    }[environment] || environment;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">🔑 Your API Key for ${envLabel}</h1>
  </div>
  
  <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi <strong>${email}</strong>,
    </p>
    
    <p style="font-size: 16px; margin-bottom: 25px;">
      Your API key for <strong>${organizationName}</strong> (${envLabel} environment) is ready!
    </p>
    
    <div style="background: #f3f4f6; padding: 20px; border-radius: 6px; margin: 25px 0; border-left: 4px solid #667eea;">
      <p style="margin: 0 0 10px 0;"><strong>🔑 Your Access Details:</strong></p>
      <p style="margin: 5px 0;">📧 Email: <code style="background: white; padding: 4px 8px; border-radius: 3px; font-size: 14px;">${email}</code></p>
      <p style="margin: 5px 0;">🎯 Role: <code style="background: white; padding: 4px 8px; border-radius: 3px; font-size: 14px;">${roleLabel}</code></p>
      <p style="margin: 5px 0;">🌐 Environment: <code style="background: white; padding: 4px 8px; border-radius: 3px; font-size: 14px;">${envLabel}</code></p>
      <p style="margin: 15px 0 5px 0;"><strong>API Key:</strong></p>
      <code style="display: block; background: #1e293b; color: #10b981; padding: 12px; border-radius: 4px; font-size: 13px; word-break: break-all; font-family: 'Courier New', monospace;">${apiKey}</code>
    </div>
    
    <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0; font-size: 14px; color: #856404;">
        ⚠️ <strong>Security Notice:</strong> Keep this API key secure. Do not share it publicly or commit it to version control.
      </p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${loginUrl}" 
         style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        🚀 Access ContinuityBridge
      </a>
    </div>
    
    <p style="font-size: 14px; color: #6b7280; margin-top: 25px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      <strong>How to use your API key:</strong><br>
      • Include it in the <code>X-API-Key</code> header for all API requests<br>
      • Store it securely in your environment variables<br>
      • Contact your admin if you need a new key
    </p>
  </div>
  
  <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
    <p>ContinuityBridge - Integration Platform</p>
    <p>${domain}</p>
  </div>
</body>
</html>
    `;

    const text = `
ContinuityBridge - API Key for ${envLabel}

Hi ${email},

Your API key for ${organizationName} (${envLabel} environment) is ready!

🔑 API Key:
${apiKey}

📧 Email: ${email}
🎯 Role: ${roleLabel}
🌐 Environment: ${envLabel}

⚠️ Security Notice: Keep this API key secure. Do not share it publicly or commit it to version control.

How to use:
- Include it in the X-API-Key header for all API requests
- Store it securely in your environment variables
- Contact your admin if you need a new key

Login: ${loginUrl}

---
ContinuityBridge - Integration Platform
${domain}
    `;

    await this.sendEmail({
      to: email,
      subject: `🔑 Your ContinuityBridge API Key - ${envLabel}`,
      html,
      text,
    });
  }

  /**
   * Send role promotion notification email
   */
  async sendRolePromotionEmail(
    email: string,
    organizationName: string,
    newRole: "customer_admin" | "consultant" | "superadmin"
  ): Promise<void> {
    const domain = process.env.APP_DOMAIN || 'networkvoid.xyz';
    const loginUrl = process.env.APP_URL || `https://${domain}`;

    const roleLabels = {
      customer_admin: 'Customer Admin',
      consultant: 'Consultant',
      superadmin: 'Superadmin',
    };

    const roleLabel = roleLabels[newRole];

    const permissions = {
      customer_admin: [
        'Manage users in your organization',
        'Resend API keys to your teammates',
        'Configure organization settings',
        'View and manage all organization data',
      ],
      consultant: [
        'Manage multiple customer organizations',
        'Build and configure integration flows',
        'Access error triage dashboard',
        'Provide customer support',
      ],
      superadmin: [
        'Full system access',
        'Manage all users and organizations',
        'Access all features and data',
        'System configuration and monitoring',
      ],
    };

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">🎉 Role Promotion!</h1>
  </div>
  
  <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">
      Hi <strong>${email}</strong>,
    </p>
    
    <p style="font-size: 16px; margin-bottom: 25px;">
      Congratulations! You've been promoted to <strong>${roleLabel}</strong> for <strong>${organizationName}</strong>.
    </p>
    
    <div style="background: #f3f4f6; padding: 20px; border-radius: 6px; margin: 25px 0; border-left: 4px solid #10b981;">
      <p style="margin: 0 0 10px 0;"><strong>🎯 Your New Role:</strong></p>
      <p style="margin: 5px 0; font-size: 18px; color: #059669; font-weight: 600;">${roleLabel}</p>
    </div>
    
    <div style="background: #ecfdf5; border: 1px solid #10b981; padding: 20px; border-radius: 6px; margin: 25px 0;">
      <p style="margin: 0 0 15px 0; font-weight: 600; color: #065f46;">✨ Your New Permissions:</p>
      <ul style="margin: 0; padding-left: 20px; color: #065f46;">
        ${permissions[newRole].map(p => `<li style="margin: 8px 0;">${p}</li>`).join('')}
      </ul>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${loginUrl}" 
         style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 14px 40px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        🚀 Access Your Dashboard
      </a>
    </div>
    
    <p style="font-size: 14px; color: #6b7280; margin-top: 25px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      <strong>Next Steps:</strong><br>
      • Log in to explore your new capabilities<br>
      • Review your organization settings<br>
      • Start managing your team members
    </p>
  </div>
  
  <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
    <p>ContinuityBridge - Integration Platform</p>
    <p>${domain}</p>
  </div>
</body>
</html>
    `;

    const text = `
ContinuityBridge - Role Promotion

Hi ${email},

Congratulations! You've been promoted to ${roleLabel} for ${organizationName}.

🎯 Your New Role: ${roleLabel}

✨ Your New Permissions:
${permissions[newRole].map(p => `- ${p}`).join('\n')}

Next Steps:
- Log in to explore your new capabilities
- Review your organization settings
- Start managing your team members

Login: ${loginUrl}

---
ContinuityBridge - Integration Platform
${domain}
    `;

    await this.sendEmail({
      to: email,
      subject: `🎉 You've Been Promoted to ${roleLabel}!`,
      html,
      text,
    });
  }

  /**
   * Send license expiry warning
   */
  async sendLicenseExpiryWarning(
    adminEmail: string,
    organizationName: string,
    daysRemaining: number
  ): Promise<void> {
    const domain = process.env.APP_DOMAIN || 'networkvoid.xyz';
    const contactEmail = process.env.EXPORT_CONTACT_EMAIL || `support@${domain}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #ea580c; padding: 20px; border-radius: 6px 6px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0;">⚠️ License Expiry Warning</h1>
  </div>
  
  <div style="background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 6px 6px;">
    <p>Hi ${organizationName} Admin,</p>
    
    <p style="font-size: 16px; color: #ea580c; font-weight: 600;">
      Your ContinuityBridge license expires in ${daysRemaining} days!
    </p>
    
    <p>To avoid service interruption, please contact your consultant to renew your license.</p>
    
    <p style="margin-top: 20px;">
      <strong>Support Contact:</strong><br>
      📧 ${contactEmail}<br>
      🌐 ${domain}
    </p>
  </div>
</body>
</html>
    `;

    await this.sendEmail({
      to: adminEmail,
      subject: `⚠️ License Expiring Soon - ${daysRemaining} Days Remaining`,
      html,
      text: `Your ContinuityBridge license expires in ${daysRemaining} days. Contact ${contactEmail} to renew.`,
    });
  }

  /**
   * Send error escalation ticket email
   * Called when an error is escalated from Error Triage Dashboard
   */
  async sendErrorEscalationEmail(
    recipients: string | string[],
    ticket: {
      id: string;
      errorReportId: string;
      title: string;
      description: string;
      priority: string;
      organizationName: string;
      flowName: string;
      environment: string;
      errorMessageSimple: string;
      createdBy: string;
    }
  ): Promise<void> {
    const domain = process.env.APP_DOMAIN || 'networkvoid.xyz';
    const appUrl = process.env.APP_URL || `https://${domain}`;
    const viewUrl = `${appUrl}/error-triage/${ticket.errorReportId}`;

    // Priority colors
    const priorityColors: Record<string, string> = {
      low: '#10b981',
      medium: '#f59e0b',
      high: '#ef4444',
      urgent: '#dc2626',
    };

    const priorityColor = priorityColors[ticket.priority] || '#6b7280';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 700px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background: ${priorityColor}; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">🚨 Error Escalation Ticket #${ticket.id.substring(0, 8)}</h1>
  </div>
  
  <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <h2 style="margin-top: 0; color: #111827; font-size: 20px;">${ticket.title}</h2>
    
    <div style="background: #fef2f2; border-left: 4px solid ${priorityColor}; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; font-weight: 600; color: #7f1d1d;">🔥 ${ticket.errorMessageSimple}</p>
    </div>
    
    <table style="width: 100%; border-collapse: collapse; margin: 25px 0;">
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; width: 150px;">Organization:</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${ticket.organizationName}</td>
      </tr>
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Flow:</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${ticket.flowName}</td>
      </tr>
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Environment:</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">
          <span style="background: ${ticket.environment === 'prod' ? '#dc2626' : '#10b981'}; color: white; padding: 3px 10px; border-radius: 4px; font-size: 12px; font-weight: 600;">
            ${ticket.environment.toUpperCase()}
          </span>
        </td>
      </tr>
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Priority:</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">
          <span style="background: ${priorityColor}; color: white; padding: 3px 10px; border-radius: 4px; font-size: 12px; font-weight: 600;">
            ${ticket.priority.toUpperCase()}
          </span>
        </td>
      </tr>
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Escalated By:</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${ticket.createdBy}</td>
      </tr>
    </table>
    
    <div style="background: #f9fafb; padding: 20px; border-radius: 6px; margin: 25px 0;">
      <h3 style="margin-top: 0; font-size: 16px; color: #374151;">Error Details:</h3>
      <div style="background: white; padding: 15px; border-radius: 4px; border: 1px solid #e5e7eb;">
        <pre style="margin: 0; white-space: pre-wrap; word-wrap: break-word; font-family: 'Courier New', monospace; font-size: 13px; color: #111827;">${ticket.description}</pre>
      </div>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${viewUrl}" 
         style="display: inline-block; background: ${priorityColor}; color: white; padding: 14px 40px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        🔍 View Full Error Report
      </a>
    </div>
    
    <p style="font-size: 14px; color: #6b7280; margin-top: 25px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      <strong>🛠️ Next Steps:</strong><br>
      1. Review the full error context in the dashboard<br>
      2. Investigate the root cause<br>
      3. Add comments with findings<br>
      4. Mark as resolved once fixed
    </p>
  </div>
  
  <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
    <p>ContinuityBridge - Error Triage System</p>
    <p>${domain}</p>
  </div>
</body>
</html>
    `;

    const text = `
ContinuityBridge - Error Escalation Ticket #${ticket.id.substring(0, 8)}

${ticket.title}

ERROR: ${ticket.errorMessageSimple}

Organization: ${ticket.organizationName}
Flow: ${ticket.flowName}
Environment: ${ticket.environment.toUpperCase()}
Priority: ${ticket.priority.toUpperCase()}
Escalated By: ${ticket.createdBy}

Error Details:
${ticket.description}

View Full Report: ${viewUrl}

Next Steps:
1. Review the full error context in the dashboard
2. Investigate the root cause
3. Add comments with findings
4. Mark as resolved once fixed

---
ContinuityBridge - Error Triage System
${domain}
    `;

    await this.sendEmail({
      to: recipients,
      subject: `🚨 [${ticket.priority.toUpperCase()}] ${ticket.title}`,
      html,
      text,
    });
  }

  /**
   * Check if Resend is configured
   */
  isConfigured(): boolean {
    return this.enabled && this.resend !== null;
  }

  /**
   * Get configured from email
   */
  getFromEmail(): string {
    return this.fromEmail;
  }
}

// Singleton instance
export const resendService = new ResendService();
