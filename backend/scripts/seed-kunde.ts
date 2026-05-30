// Einmaliges Anlegen der Kunden-Zugänge (KDS Kienitz) in der Prod-DB.
// Passwörter kommen als Env-Variablen beim Aufruf rein – NICHT hier eintragen (Repo ist public!).
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Env-Variable ${name} fehlt`);
  return v;
}

async function main() {
  const accounts = [
    {
      email: requireEnv('ADMIN_EMAIL'),
      name: process.env.ADMIN_NAME ?? 'Administrator',
      password: requireEnv('ADMIN_PW'),
      role: UserRole.ADMIN,
    },
    {
      email: requireEnv('MONTEUR_EMAIL'),
      name: process.env.MONTEUR_NAME ?? 'Monteur',
      password: requireEnv('MONTEUR_PW'),
      role: UserRole.MONTEUR,
    },
  ];

  for (const acc of accounts) {
    const hash = await bcrypt.hash(acc.password, 12);
    const user = await prisma.user.upsert({
      where: { email: acc.email },
      update: { name: acc.name, password: hash, role: acc.role, active: true },
      create: { email: acc.email, name: acc.name, password: hash, role: acc.role, active: true },
    });
    console.log(`✓ ${user.role}: ${user.email}`);
  }
  console.log('Fertig.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());