import 'dotenv/config';
import { DokuStatus } from '@prisma/client';

// ============================================================
// Environment Variables (mit Validierung beim Start)
// ============================================================

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
    maxFileSize: 25 * 1024 * 1024,    // 25 MB pro Bild
    bodyLimit: 30 * 1024 * 1024,       // 30 MB Body-Limit
    maxSignatureBytes: 500 * 1024      // 500 KB pro Signature
  },
  jwt: {
    expiresIn: '8h'
  }
} as const;

// ============================================================
// Doku-Status-Konstanten (zentral, nicht in jeder Route definieren)
// ============================================================

export const FINAL_DOKU_STATUSES: DokuStatus[] = [
  DokuStatus.UNTERSCHRIEBEN,
  DokuStatus.VERSENDET,
  DokuStatus.SEVDESK_HOCHGELADEN
];

export function isValidDokuStatusTransition(from: DokuStatus, to: DokuStatus): boolean {
  const transitions: Record<DokuStatus, DokuStatus[]> = {
    ENTWURF:             [DokuStatus.IN_ARBEIT],
    IN_ARBEIT:           [DokuStatus.ZUR_UNTERSCHRIFT],
    ZUR_UNTERSCHRIFT:    [DokuStatus.IN_ARBEIT, DokuStatus.UNTERSCHRIEBEN],
    UNTERSCHRIEBEN:      [DokuStatus.VERSENDET],
    VERSENDET:           [DokuStatus.SEVDESK_HOCHGELADEN],
    SEVDESK_HOCHGELADEN: []
  };
  return transitions[from]?.includes(to) ?? false;
}