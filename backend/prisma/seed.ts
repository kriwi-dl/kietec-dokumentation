import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const adminPassword = await bcrypt.hash('changeme123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'felix@kriwi-dl.de' },
    update: {},
    create: {
      email: 'felix@kriwi-dl.de',
      name: 'Felix Krichenbauer',
      password: adminPassword,
      role: UserRole.ADMIN
    }
  });
  console.log(`✓ Admin user: ${admin.email}`);

  const vorarbeiterPassword = await bcrypt.hash('changeme123', 12);
  const vorarbeiter = await prisma.user.upsert({
    where: { email: 'vorarbeiter@kietec.test' },
    update: {},
    create: {
      email: 'vorarbeiter@kietec.test',
      name: 'Test Vorarbeiter',
      password: vorarbeiterPassword,
      role: UserRole.VORARBEITER
    }
  });
  console.log(`✓ Vorarbeiter user: ${vorarbeiter.email}`);

  console.log('🌱 Seed complete.');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });