import sharp from "sharp";

export const THUMBNAIL_WIDTH = 400;

export async function assertImageProcessingConfigured() {
  await import("sharp");
}

export function isPdf(buffer: Buffer) {
  return buffer.subarray(0, 4).toString("latin1") === "%PDF";
}

export async function processProofImage(buffer: Buffer) {
  // sharp strips all metadata (EXIF, GPS, ICC) by default when withMetadata()
  // is not called. rotate() bakes the EXIF orientation into the pixels first
  // so stripping the metadata cannot mis-orient the image.
  const original = await sharp(buffer).rotate().toBuffer();
  const thumb = await sharp(buffer)
    .rotate()
    .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  return { original, thumb };
}
