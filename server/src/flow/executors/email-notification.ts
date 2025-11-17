import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from "./types.js";
import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * Email Notification Executor - Send email alerts/notifications
 * Supports both SMTP (customer servers) and Resend API (founder accounts)
 */
export const executeEmailNotification: NodeExecutor = async (
  node: any,
  input: unknown,
  context: ExecutionContext
): Promise<NodeExecutionResult> => {
  const config = (node as any).config || {};
  const {
    emailProvider = "smtp",
    smtpHost = "",
    smtpPort = 587,
    smtpUsername = "",
    smtpPassword = "",
    smtpSecure = true,
    to = "",
    cc = "",
    subject = "",
    body = "",
    bodyType = "text",
    from = process.env.EMAIL_FROM || "noreply@continuitybridge.com",
    replyTo = "",
    priority = "normal",
    attachData = false,
  } = config;

  // Template replacement helper
  const replaceTemplates = (str: string, data: any): string => {
    return str.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const value = path.trim().split('.').reduce((obj: any, key: string) => obj?.[key.replace('$', '')], { $: data });
      return value !== undefined ? String(value) : match;
    });
  };

  try {
    // Process email fields with template variables
    const processedTo = replaceTemplates(to, input);
    const processedSubject = replaceTemplates(subject, input);
    const processedBody = replaceTemplates(body, input);
    const processedCc = cc ? replaceTemplates(cc, input).split(',').map(e => e.trim()) : [];
    const processedReplyTo = replyTo ? replaceTemplates(replyTo, input) : undefined;

    // EMULATION MODE - Return mock email sent confirmation
    if (context.emulationMode) {
      return {
        output: {
          ...input as object,
          emailSent: true,
          emailDetails: {
            to: processedTo,
            cc: processedCc,
            subject: processedSubject,
            bodyPreview: processedBody.substring(0, 100) + '...',
            emulated: true,
          },
        },
        metadata: {
          emulated: true,
          to: processedTo,
          subject: processedSubject,
        },
      };
    }

    // PRODUCTION MODE - Send email via configured provider
    if (emailProvider === 'resend') {
      // RESEND API (Founder accounts only)
      const resendApiKey = process.env.RESEND_API_KEY;
      
      if (!resendApiKey) {
        throw new Error('RESEND_API_KEY environment variable not set');
      }

      const resend = new Resend(resendApiKey);

      // Prepare email payload
      const emailPayload: any = {
        from,
        to: processedTo,
        subject: processedSubject,
        replyTo: processedReplyTo,
      };

      // Add body based on type
      if (bodyType === 'html') {
        emailPayload.html = processedBody;
      } else {
        emailPayload.text = processedBody;
      }

      // Add CC if specified
      if (processedCc.length > 0) {
        emailPayload.cc = processedCc;
      }

      // Add priority headers
      if (priority === 'high') {
        emailPayload.headers = {
          'X-Priority': '1',
          'Importance': 'high',
        };
      } else if (priority === 'low') {
        emailPayload.headers = {
          'X-Priority': '5',
          'Importance': 'low',
        };
      }

      // Attach input data as JSON if requested
      if (attachData) {
        const dataAttachment = {
          filename: 'data.json',
          content: Buffer.from(JSON.stringify(input, null, 2)).toString('base64'),
        };
        emailPayload.attachments = [dataAttachment];
      }

      // Send email via Resend
      const result = await resend.emails.send(emailPayload);

      if (!result.data) {
        throw new Error('Email send failed - no response data');
      }

      return {
        output: {
          ...input as object,
          emailSent: true,
          emailId: result.data.id,
          provider: 'resend',
          emailDetails: {
            to: processedTo,
            cc: processedCc,
            subject: processedSubject,
          },
        },
        metadata: {
          emailId: result.data.id,
          provider: 'resend',
          to: processedTo,
          subject: processedSubject,
        },
      };
    } else {
      // SMTP (Customer servers)
      if (!smtpHost) {
        throw new Error('SMTP host is required when using SMTP provider');
      }

      // Create SMTP transporter
      const transporter: Transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure, // true for 465, false for other ports
        auth: smtpUsername && smtpPassword ? {
          user: smtpUsername,
          pass: smtpPassword,
        } : undefined,
      });

      // Prepare email options
      const mailOptions: any = {
        from,
        to: processedTo,
        subject: processedSubject,
        replyTo: processedReplyTo,
      };

      // Add body based on type
      if (bodyType === 'html') {
        mailOptions.html = processedBody;
      } else {
        mailOptions.text = processedBody;
      }

      // Add CC if specified
      if (processedCc.length > 0) {
        mailOptions.cc = processedCc.join(',');
      }

      // Add priority headers
      if (priority === 'high') {
        mailOptions.priority = 'high';
        mailOptions.headers = {
          'X-Priority': '1',
          'Importance': 'high',
        };
      } else if (priority === 'low') {
        mailOptions.priority = 'low';
        mailOptions.headers = {
          'X-Priority': '5',
          'Importance': 'low',
        };
      }

      // Attach input data as JSON if requested
      if (attachData) {
        mailOptions.attachments = [{
          filename: 'data.json',
          content: JSON.stringify(input, null, 2),
          contentType: 'application/json',
        }];
      }

      // Send email via SMTP
      const result = await transporter.sendMail(mailOptions);

      return {
        output: {
          ...input as object,
          emailSent: true,
          messageId: result.messageId,
          provider: 'smtp',
          emailDetails: {
            to: processedTo,
            cc: processedCc,
            subject: processedSubject,
          },
        },
        metadata: {
          messageId: result.messageId,
          provider: 'smtp',
          to: processedTo,
          subject: processedSubject,
        },
      };
    }
  } catch (error: any) {
    throw new Error(`Email notification failed: ${error.message}`);
  }
};
