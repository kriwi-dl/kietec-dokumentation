import sharp from 'sharp';
import exifr from 'exifr';

export interface ImageMetadata {
  width: number;
  height: number;
  fileSize: number;
  takenAt?: Date;
  latitude?: number;
  longitude?: number;
}

interface ProcessOptions {
  thumbnailSize?: number;
  thumbnailQuality?: number;
  originalQuality?: number;
}

/**
 * Verarbeitet ein hochgeladenes Bild:
 * - Auto-rotiert anhand EXIF-Orientierung
 * - Speichert Original als JPEG (Qualität 95)
 * - Generiert Thumbnail (Default 600px Längskante)
 * - Liest EXIF: Aufnahmedatum, GPS-Koordinaten
 */
export async function processImage(
  inputBuffer: Buffer,
  originalPath: string,
  thumbnailPath: string,
  options: ProcessOptions = {}
): Promise<ImageMetadata> {
  const thumbSize = options.thumbnailSize ?? 600;
  const thumbQuality = options.thumbnailQuality ?? 80;
  const origQuality = options.originalQuality ?? 95;

  // Original speichern (auto-rotated)
  const originalResult = await sharp(inputBuffer)
    .rotate()
    .jpeg({ quality: origQuality, mozjpeg: true })
    .toFile(originalPath);

  // Thumbnail erzeugen
  await sharp(inputBuffer)
    .rotate()
    .resize(thumbSize, thumbSize, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: thumbQuality, mozjpeg: true })
    .toFile(thumbnailPath);

  // EXIF-Daten lesen (Best-Effort)
  let exif: Record<string, unknown> | null = null;
  try {
    exif = await exifr.parse(inputBuffer, {
      gps: true,
      pick: ['DateTimeOriginal', 'CreateDate', 'latitude', 'longitude']
    });
  } catch {
    // EXIF-Parsing fehlgeschlagen – kein Drama, gibt halt keine Metadaten
  }

  return {
    width: originalResult.width,
    height: originalResult.height,
    fileSize: originalResult.size,
    takenAt: parseExifDate(exif?.DateTimeOriginal ?? exif?.CreateDate),
    latitude: typeof exif?.latitude === 'number' ? exif.latitude : undefined,
    longitude: typeof exif?.longitude === 'number' ? exif.longitude : undefined
  };
}

function parseExifDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}