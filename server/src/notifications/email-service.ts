import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { SmtpSettings } from '../../db';
import { decryptPassword } from './crypto';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
}

export class EmailService {
  private transporter: Transporter | null = null;
  private settings: SmtpSettings | null = null;

  constructor() {}

  async configure(settings: SmtpSettings) {
    if (!settings.enabled) {
      console.log('[EmailService] SMTP is disabled');
      this.transporter = null;
      this.settings = null;
      return;
    }

    this.settings = settings;
    
    const decryptedPassword = decryptPassword(settings.password);
    
    this.transporter = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      auth: {
        user: settings.username,
        pass: decryptedPassword,
      },
      tls: {
        rejectUnauthorized: true,
      },
    });

    try {
      await this.transporter.verify();
      console.log('[EmailService] SMTP configured and verified:', {
        host: settings.host,
        port: settings.port,
        from: settings.fromAddress,
      });
    } catch (error) {
      console.error('[EmailService] SMTP verification failed:', error);
      this.transporter = null;
      this.settings = null;
      throw new Error(`SMTP verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    if (!this.transporter || !this.settings) {
      console.warn('[EmailService] Cannot send email: SMTP not configured or disabled');
      return;
    }

    const recipients = Array.isArray(options.to) ? options.to.join(', ') : options.to;

    try {
      const info = await this.transporter.sendMail({
        from: this.settings.fromName 
          ? `"${this.settings.fromName}" <${this.settings.fromAddress}>`
          : this.settings.fromAddress,
        to: recipients,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });

      console.log('[EmailService] Email sent:', {
        to: recipients,
        subject: options.subject,
        messageId: info.messageId,
      });
    } catch (error) {
      console.error('[EmailService] Failed to send email:', error);
      throw new Error(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async sendTestEmail(recipients?: string[]): Promise<void> {
    if (!this.settings) {
      throw new Error('SMTP not configured');
    }

    const to = recipients || this.settings.alertRecipients.split(',').map(e => e.trim());

    await this.sendEmail({
      to,
      subject: 'ContinuityBridge SMTP Test',
      text: 'This is a test email from ContinuityBridge. If you received this, your SMTP configuration is working correctly!',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #2563eb;">ContinuityBridge SMTP Test</h2>
          <p>This is a test email from ContinuityBridge.</p>
          <p>If you received this, your SMTP configuration is working correctly!</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 14px;">
            SMTP Server: ${this.settings.host}:${this.settings.port}<br>
            From: ${this.settings.fromAddress}
          </p>
        </div>
      `,
    });
  }

  async sendFlowErrorAlert(flowName: string, error: string, traceId: string): Promise<void> {
    if (!this.settings?.notifyOnFlowError || !this.settings.enabled) {
      return;
    }

    const recipients = this.settings.alertRecipients.split(',').map(e => e.trim());

    await this.sendEmail({
      to: recipients,
      subject: `[ContinuityBridge] Flow Error: ${flowName}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #dc2626;">Flow Execution Failed</h2>
          <p><strong>Flow:</strong> ${flowName}</p>
          <p><strong>Trace ID:</strong> ${traceId}</p>
          <p><strong>Error:</strong></p>
          <pre style="background: #f3f4f6; padding: 10px; border-radius: 4px; overflow-x: auto;">${error}</pre>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 14px;">
            This is an automated alert from ContinuityBridge
          </p>
        </div>
      `,
    });
  }

  async sendValidationErrorAlert(flowName: string, validationErrors: string[], traceId: string): Promise<void> {
    if (!this.settings?.notifyOnValidationError || !this.settings.enabled) {
      return;
    }

    const recipients = this.settings.alertRecipients.split(',').map(e => e.trim());

    await this.sendEmail({
      to: recipients,
      subject: `[ContinuityBridge] Validation Errors: ${flowName}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #ea580c;">Validation Errors Detected</h2>
          <p><strong>Flow:</strong> ${flowName}</p>
          <p><strong>Trace ID:</strong> ${traceId}</p>
          <p><strong>Errors:</strong></p>
          <ul style="background: #f3f4f6; padding: 20px; border-radius: 4px;">
            ${validationErrors.map(e => `<li>${e}</li>`).join('')}
          </ul>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 14px;">
            This is an automated alert from ContinuityBridge
          </p>
        </div>
      `,
    });
  }

  isConfigured(): boolean {
    return this.transporter !== null && this.settings !== null;
  }

  getSettings(): SmtpSettings | null {
    return this.settings;
  }
}

export const emailService = new EmailService();
