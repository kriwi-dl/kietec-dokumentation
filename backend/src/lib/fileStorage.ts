import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.resolve('uploads');

export function getUploadDir(): string {
  return UPLOAD_DIR;
}

export function getOriginalDir(dokuId: string): string {
  return path.join(UPLOAD_DIR, 'original', dokuId);
}

export function getThumbnailDir(dokuId: string): string {
  return path.join(UPLOAD_DIR, 'thumbnails', dokuId);
}

export async function ensureDokuDirs(dokuId: string): Promise<void> {
  await fs.mkdir(getOriginalDir(dokuId), { recursive: true });
  await fs.mkdir(getThumbnailDir(dokuId), { recursive: true });
}

/** Generiert einen zufälligen Dateinamen. Original-Endung wird .jpg, da Sharp immer JPEG schreibt. */
export function generateFilename(): string {
  const id = crypto.randomBytes(12).toString('hex');
  return `${id}.jpg`;
}

export function originalPath(dokuId: string, filename: string): string {
  return path.join(getOriginalDir(dokuId), filename);
}

export function thumbnailPath(dokuId: string, filename: string): string {
  return path.join(getThumbnailDir(dokuId), filename);
}

export async function deleteFotoFiles(dokuId: string, filename: string): Promise<void> {
  // Best-effort delete – schlägt nicht fehl, wenn Dateien schon weg sind
  await Promise.allSettled([
    fs.unlink(originalPath(dokuId, filename)),
    fs.unlink(thumbnailPath(dokuId, filename))
  ]);
}

export function getPdfDir(): string {
  return path.join(UPLOAD_DIR, 'pdfs');
}

export function pdfPath(dokuId: string): string {
  return path.join(getPdfDir(), `${dokuId}.pdf`);
}

export async function ensurePdfDir(): Promise<void> {
  await fs.mkdir(getPdfDir(), { recursive: true });
}

export async function deletePdfFile(dokuId: string): Promise<void> {
  try {
    await fs.unlink(pdfPath(dokuId));
  } catch {
    // ignore - Datei existiert nicht
  }
}