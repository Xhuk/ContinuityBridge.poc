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
