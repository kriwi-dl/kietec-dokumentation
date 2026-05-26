import 'dotenv/config';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value;
}

export const config = {
  jwtSecret: requireEnv('JWT_SECRET'),
  databaseUrl: requireEnv('DATABASE_URL'),
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  corsOrigin: process.env.CORS_ORIGIN?.split(',') ?? true,
  sevdesk: {
    token: process.env.SEVDESK_API_TOKEN,
    url: process.env.SEVDESK_API_URL
  },
  upload: {
    maxFileSize: 25 * 1024 * 1024,
    bodyLimit: 30 * 1024 * 1024,
    maxSignatureBytes: 500 * 1024
  },
  jwt: {
    expiresIn: '8h'
  },
  email: {
    smtp: {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 465,
      secure: process.env.SMTP_SECURE !== 'false',
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    from: process.env.EMAIL_FROM,
    fromName: process.env.EMAIL_FROM_NAME ?? 'KieTec-Dokumentation'
  }
} as const;