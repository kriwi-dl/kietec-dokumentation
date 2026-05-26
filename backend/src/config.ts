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
  }
} as const;