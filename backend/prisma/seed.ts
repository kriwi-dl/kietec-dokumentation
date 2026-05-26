import { PrismaClient, UserRole, AuftragStatus, FotoKategorie } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // --- USER ---
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
      name: 'Markus Schmidt',
      password: vorarbeiterPassword,
      role: UserRole.VORARBEITER
    }
  });
  console.log(`✓ Vorarbeiter: ${vorarbeiter.email}`);

  const monteurPassword = await bcrypt.hash('changeme123', 12);
  const monteur = await prisma.user.upsert({
    where: { email: 'monteur@kietec.test' },
    update: {},
    create: {
      email: 'monteur@kietec.test',
      name: 'Stefan Müller',
      password: monteurPassword,
      role: UserRole.MONTEUR
    }
  });
  console.log(`✓ Monteur: ${monteur.email}`);

  // --- AUFTRAG 1: Privatkunde, Aufdach-PV ---
  const auftrag1 = await prisma.auftrag.upsert({
    where: { id: 'demo-auftrag-1' },
    update: {},
    create: {
      id: 'demo-auftrag-1',
      sevdeskOrderNumber: 'LI-2026-0042',
      sevdeskOrderType: 'LI',
      customerName: 'Familie Bauer',
      customerNumber: '10042',
      customerAddress: 'Familie Bauer\nHauptstraße 24\n74246 Eberstadt',
      orderDate: new Date('2026-05-20'),
      status: AuftragStatus.ZUGEWIESEN,
      notiz: 'Aufdach-PV 9,84 kWp + Speicher 10 kWh. Aufstieg über Garagendach.',
      positions: {
        create: [
          {
            sevdeskPosNumber: '1',
            bezeichnung: 'PV-Modul JinkoSolar 410W Tiger Neo',
            beschreibung: 'Monokristallines Modul, schwarzer Rahmen',
            menge: 24,
            einheit: 'Stk'
          },
          {
            sevdeskPosNumber: '2',
            bezeichnung: 'Wechselrichter SMA Sunny Tripower 10.0',
            beschreibung: '3-phasig, mit SunSpec Modbus',
            menge: 1,
            einheit: 'Stk'
          },
          {
            sevdeskPosNumber: '3',
            bezeichnung: 'Batteriespeicher BYD Battery-Box Premium HVS 10.2',
            beschreibung: '10,24 kWh nutzbar, Hochvolt',
            menge: 1,
            einheit: 'Stk'
          },
          {
            sevdeskPosNumber: '4',
            bezeichnung: 'Montagesystem K2 SpeedRail Aufdach',
            beschreibung: 'Aluminium, schwarz eloxiert, für Ziegeldach',
            menge: 1,
            einheit: 'Set'
          },
          {
            sevdeskPosNumber: '5',
            bezeichnung: 'DC-Solarkabel 6mm²',
            beschreibung: 'Helukabel Solarflex',
            menge: 50,
            einheit: 'm'
          },
          {
            sevdeskPosNumber: '6',
            bezeichnung: 'MC4-Stecker Paar',
            beschreibung: 'Original Stäubli',
            menge: 24,
            einheit: 'Paar'
          }
        ]
      }
    }
  });
  console.log(`✓ Auftrag 1: ${auftrag1.sevdeskOrderNumber} (${auftrag1.customerName})`);

  // --- AUFTRAG 2: Gewerbe, Flachdach ---
  const auftrag2 = await prisma.auftrag.upsert({
    where: { id: 'demo-auftrag-2' },
    update: {},
    create: {
      id: 'demo-auftrag-2',
      sevdeskOrderNumber: 'LI-2026-0043',
      sevdeskOrderType: 'LI',
      customerName: 'Müller Metallbau GmbH',
      customerNumber: '20015',
      customerAddress: 'Müller Metallbau GmbH\nGewerbestraße 8\n74232 Abstatt',
      orderDate: new Date('2026-05-22'),
      status: AuftragStatus.OFFEN,
      notiz: 'Flachdach-PV 29,52 kWp. Kran-Einsatz erforderlich.',
      positions: {
        create: [
          {
            sevdeskPosNumber: '1',
            bezeichnung: 'PV-Modul JA Solar 415W',
            beschreibung: 'Bifacial',
            menge: 72,
            einheit: 'Stk'
          },
          {
            sevdeskPosNumber: '2',
            bezeichnung: 'Wechselrichter Fronius Symo 25.0-3-M',
            menge: 1,
            einheit: 'Stk'
          },
          {
            sevdeskPosNumber: '3',
            bezeichnung: 'Montagesystem K2 D-Dome 5.0',
            beschreibung: 'Ost-West-Ausrichtung, ballastiert',
            menge: 1,
            einheit: 'Set'
          }
        ]
      }
    }
  });
  console.log(`✓ Auftrag 2: ${auftrag2.sevdeskOrderNumber} (${auftrag2.customerName})`);

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