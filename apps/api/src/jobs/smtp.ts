import nodemailer from 'nodemailer';
import type { Config } from '../config.js';
import type { MailTransport } from './mailer.js';

export function createSmtpTransport(config: Config): MailTransport & { close(): void } {
  const smtp = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: false,
  });
  return {
    async send(message) {
      await smtp.sendMail(message);
    },
    close() {
      smtp.close();
    },
  };
}
