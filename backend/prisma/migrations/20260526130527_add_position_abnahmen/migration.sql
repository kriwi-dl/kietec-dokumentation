-- AlterTable
ALTER TABLE "unterschriften" ADD COLUMN     "positionId" TEXT;

-- CreateIndex
CREATE INDEX "unterschriften_positionId_idx" ON "unterschriften"("positionId");

-- AddForeignKey
ALTER TABLE "unterschriften" ADD CONSTRAINT "unterschriften_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positionen"("id") ON DELETE SET NULL ON UPDATE CASCADE;
