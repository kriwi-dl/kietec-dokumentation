-- CreateEnum
CREATE TYPE "AuftragStatus" AS ENUM ('OFFEN', 'ZUGEWIESEN', 'IN_BEARBEITUNG', 'DOKUMENTIERT', 'ABGESCHLOSSEN', 'STORNIERT');

-- CreateEnum
CREATE TYPE "DokuStatus" AS ENUM ('ENTWURF', 'IN_ARBEIT', 'ZUR_UNTERSCHRIFT', 'UNTERSCHRIEBEN', 'VERSENDET', 'SEVDESK_HOCHGELADEN');

-- CreateEnum
CREATE TYPE "FotoKategorie" AS ENUM ('VOR_BEGINN', 'FORTSCHRITT', 'VERKABELUNG', 'TYPENSCHILD', 'MAENGEL', 'ENDABNAHME', 'SONSTIGES');

-- CreateEnum
CREATE TYPE "UnterschriftTyp" AS ENUM ('MONTEUR', 'KUNDE', 'VORARBEITER');

-- CreateTable
CREATE TABLE "auftraege" (
    "id" TEXT NOT NULL,
    "sevdeskId" TEXT,
    "sevdeskOrderNumber" TEXT,
    "sevdeskOrderType" TEXT,
    "sevdeskStatus" TEXT,
    "customerSevdeskId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerNumber" TEXT,
    "customerAddress" TEXT,
    "orderDate" TIMESTAMP(3),
    "status" "AuftragStatus" NOT NULL DEFAULT 'OFFEN',
    "notiz" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auftraege_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positionen" (
    "id" TEXT NOT NULL,
    "auftragId" TEXT NOT NULL,
    "sevdeskPosId" TEXT,
    "sevdeskPosNumber" TEXT,
    "bezeichnung" TEXT NOT NULL,
    "beschreibung" TEXT,
    "menge" DECIMAL(10,3) NOT NULL,
    "einheit" TEXT,
    "serialNumber" TEXT,
    "verbaut" BOOLEAN NOT NULL DEFAULT false,
    "verbautAm" TIMESTAMP(3),
    "verbautVonId" TEXT,
    "bemerkung" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "positionen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dokumentationen" (
    "id" TEXT NOT NULL,
    "auftragId" TEXT NOT NULL,
    "vorarbeiterId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" "DokuStatus" NOT NULL DEFAULT 'ENTWURF',
    "wetter" TEXT,
    "bemerkung" TEXT,
    "arbeitsstunden" DECIMAL(5,2),
    "pdfPath" TEXT,
    "pdfErzeugtAm" TIMESTAMP(3),
    "versendetAn" TEXT,
    "versendetAm" TIMESTAMP(3),
    "sevdeskVoucherId" TEXT,
    "sevdeskUploadedAm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dokumentationen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fotos" (
    "id" TEXT NOT NULL,
    "dokumentationId" TEXT NOT NULL,
    "positionId" TEXT,
    "filename" TEXT NOT NULL,
    "originalFilename" TEXT,
    "mimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "fileSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "kategorie" "FotoKategorie" NOT NULL DEFAULT 'FORTSCHRITT',
    "beschreibung" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "takenAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fotos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unterschriften" (
    "id" TEXT NOT NULL,
    "dokumentationId" TEXT NOT NULL,
    "typ" "UnterschriftTyp" NOT NULL,
    "signerName" TEXT NOT NULL,
    "signatureData" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "unterschriften_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auftraege_sevdeskId_key" ON "auftraege"("sevdeskId");

-- CreateIndex
CREATE INDEX "auftraege_sevdeskId_idx" ON "auftraege"("sevdeskId");

-- CreateIndex
CREATE INDEX "auftraege_status_idx" ON "auftraege"("status");

-- CreateIndex
CREATE UNIQUE INDEX "positionen_sevdeskPosId_key" ON "positionen"("sevdeskPosId");

-- CreateIndex
CREATE INDEX "positionen_auftragId_idx" ON "positionen"("auftragId");

-- CreateIndex
CREATE INDEX "dokumentationen_auftragId_idx" ON "dokumentationen"("auftragId");

-- CreateIndex
CREATE INDEX "dokumentationen_vorarbeiterId_idx" ON "dokumentationen"("vorarbeiterId");

-- CreateIndex
CREATE INDEX "dokumentationen_status_idx" ON "dokumentationen"("status");

-- CreateIndex
CREATE INDEX "fotos_dokumentationId_idx" ON "fotos"("dokumentationId");

-- CreateIndex
CREATE INDEX "fotos_positionId_idx" ON "fotos"("positionId");

-- CreateIndex
CREATE INDEX "unterschriften_dokumentationId_idx" ON "unterschriften"("dokumentationId");

-- CreateIndex
CREATE UNIQUE INDEX "system_config_key_key" ON "system_config"("key");

-- AddForeignKey
ALTER TABLE "positionen" ADD CONSTRAINT "positionen_auftragId_fkey" FOREIGN KEY ("auftragId") REFERENCES "auftraege"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positionen" ADD CONSTRAINT "positionen_verbautVonId_fkey" FOREIGN KEY ("verbautVonId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dokumentationen" ADD CONSTRAINT "dokumentationen_auftragId_fkey" FOREIGN KEY ("auftragId") REFERENCES "auftraege"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dokumentationen" ADD CONSTRAINT "dokumentationen_vorarbeiterId_fkey" FOREIGN KEY ("vorarbeiterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fotos" ADD CONSTRAINT "fotos_dokumentationId_fkey" FOREIGN KEY ("dokumentationId") REFERENCES "dokumentationen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fotos" ADD CONSTRAINT "fotos_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positionen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unterschriften" ADD CONSTRAINT "unterschriften_dokumentationId_fkey" FOREIGN KEY ("dokumentationId") REFERENCES "dokumentationen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
