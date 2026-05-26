import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from '../config';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  const smtp = config.email.smtp;
  if (!smtp.host || !smtp.user || !smtp.pass) {
    throw new Error(
      'SMTP-Konfiguration unvollständig. Bitte SMTP_HOST, SMTP_USER, SMTP_PASS in .env setzen.'
    );
  }

 transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.user,
      pass: smtp.pass
    },
    requireTLS: !smtp.secure
  });

  return transporter;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    path: string;
    contentType?: string;
  }>;
}

export interface SendEmailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const transport = getTransporter();
  const fromName = config.email.fromName;
  const fromEmail = config.email.from ?? config.email.smtp.user;

  const info = await transport.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    attachments: options.attachments
  });

  return {
    messageId: info.messageId,
    accepted: info.accepted.map(String),
    rejected: info.rejected.map(String)
  };
}

/** Verifiziert SMTP-Verbindung (für Health-Checks oder Test-Endpoints). */
export async function verifyEmail(): Promise<boolean> {
  const transport = getTransporter();
  return transport.verify();
}