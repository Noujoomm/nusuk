import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PLATFORM_NAME } from './platform';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    const port = this.config.get<number>('SMTP_PORT', 587);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
      });
      this.logger.log(`Mail transport configured: ${host}:${port}`);
    } else {
      // Development fallback: log emails to console
      this.logger.warn(
        'SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS). Emails will be logged to console.',
      );
      this.transporter = nodemailer.createTransport({
        jsonTransport: true,
      });
    }
  }

  async sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
    const fromAddress = this.config.get<string>('SMTP_FROM', `noreply@ruya.sa`);
    const subject = `إعادة تعيين كلمة المرور – منصة ${PLATFORM_NAME}`;

    const html = `
      <div dir="rtl" style="font-family: 'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #1f2937;">
        <div style="background: linear-gradient(135deg, #065f46 0%, #047857 100%); border-radius: 16px; padding: 32px; margin-bottom: 24px;">
          <h1 style="color: #ffffff; font-size: 24px; margin: 0; font-weight: 700;">منصة ${PLATFORM_NAME}</h1>
          <p style="color: #a7f3d0; font-size: 14px; margin: 8px 0 0;">نظام إدارة المشاريع</p>
        </div>

        <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 32px;">
          <h2 style="font-size: 20px; margin: 0 0 16px; color: #111827;">إعادة تعيين كلمة المرور</h2>

          <p style="font-size: 15px; line-height: 1.8; color: #374151; margin: 0 0 8px;">مرحباً،</p>

          <p style="font-size: 15px; line-height: 1.8; color: #374151; margin: 0 0 24px;">
            لقد طلبت إعادة تعيين كلمة المرور الخاصة بك في منصة ${PLATFORM_NAME}.
          </p>

          <p style="font-size: 15px; line-height: 1.8; color: #374151; margin: 0 0 16px;">
            اضغط على الزر التالي لإعادة تعيين كلمة المرور:
          </p>

          <div style="text-align: center; margin: 24px 0;">
            <a href="${resetLink}"
               style="display: inline-block; padding: 14px 40px; background: #10B981; color: #ffffff; text-decoration: none; border-radius: 12px; font-size: 16px; font-weight: 600;">
              تعيين كلمة مرور جديدة
            </a>
          </div>

          <p style="font-size: 13px; color: #6b7280; margin: 24px 0 8px; padding: 16px; background: #f9fafb; border-radius: 8px; word-break: break-all; direction: ltr; text-align: left;">
            ${resetLink}
          </p>

          <p style="font-size: 14px; color: #ef4444; margin: 16px 0 0; font-weight: 500;">
            ⏱ هذا الرابط صالح لمدة ساعة واحدة فقط. | This link expires in 1 hour.
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />

          <p style="font-size: 13px; color: #9ca3af; margin: 0;">
            إذا لم تقم بطلب هذا الإجراء، يمكنك تجاهل هذه الرسالة بأمان.
          </p>
        </div>

        <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 24px;">
          مع تحيات — منصة ${PLATFORM_NAME}
        </p>
      </div>
    `;

    const text = `
منصة ${PLATFORM_NAME} - إعادة تعيين كلمة المرور

مرحباً،

لقد طلبت إعادة تعيين كلمة المرور الخاصة بك في منصة ${PLATFORM_NAME}.

اضغط على الرابط التالي لإعادة تعيين كلمة المرور:

${resetLink}

هذا الرابط صالح لمدة ساعة واحدة. This link expires in 1 hour.

إذا لم تقم بطلب هذا الإجراء يمكنك تجاهل هذه الرسالة.

مع تحيات
منصة ${PLATFORM_NAME}
    `.trim();

    try {
      const info = await this.transporter.sendMail({
        from: `"منصة ${PLATFORM_NAME}" <${fromAddress}>`,
        to,
        subject,
        text,
        html,
      });

      // In dev mode (jsonTransport), log the email
      if (info.message) {
        const parsed = JSON.parse(info.message);
        this.logger.log(`[DEV] Password reset email for ${to}:`);
        this.logger.log(`[DEV] Reset link: ${resetLink}`);
        this.logger.debug(`[DEV] Subject: ${parsed.subject}`);
      } else {
        this.logger.log(`Password reset email sent to ${to} (messageId: ${info.messageId})`);
      }
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${to}`, error);
      // Don't throw — we never reveal email delivery status to the user
    }
  }
}
