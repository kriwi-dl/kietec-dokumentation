/*
  Warnings:

  - You are about to drop the column `serialNumber` on the `positionen` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "positionen" DROP COLUMN "serialNumber",
ADD COLUMN     "serialNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[];
