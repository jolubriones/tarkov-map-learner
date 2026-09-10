/**
 * Client-side photo preparation, shared by both backends.
 *
 * Whatever the user picks or pastes (4K PNG, phone photo, GIF) is decoded
 * and re-encoded to a max-1600px JPEG. Both adapters upload the result —
 * local stores it as a data URL, hosted puts it in the Storage bucket —
 * so the bank gets consistent pixels either way and the user never thinks
 * about resolution. Canvas redraw also strips EXIF metadata (no GPS from
 * phone photos of monitors).
 */

const PHOTO_MAX_DIMENSION = 1600;
const PHOTO_JPEG_QUALITY = 0.82;
/** Refuse absurd files before decoding (25MB of anything image-ish). */
const PHOTO_MAX_INPUT_BYTES = 25 * 1024 * 1024;

/**
 * Decode + resize + re-encode an image file. Never upscales; portraits are
 * capped on their long side. Browser-only (canvas) — throws anywhere else.
 */
export async function preparePhoto(input: Blob): Promise<Blob> {
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') {
    throw new Error('Photo uploads need a browser.');
  }
  if (!input.type.startsWith('image/')) {
    throw new Error('That file is not an image — pick a screenshot or photo.');
  }
  if (input.size > PHOTO_MAX_INPUT_BYTES) {
    throw new Error('That image is over 25MB — screenshots are rarely that big.');
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(input);
  } catch {
    throw new Error('Could not read that image — try a PNG or JPEG screenshot.');
  }
  try {
    const scale = Math.min(
      1,
      PHOTO_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height)
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Photo processing is unavailable in this browser.');
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', PHOTO_JPEG_QUALITY)
    );
    if (!blob) throw new Error('Photo processing is unavailable in this browser.');
    return blob;
  } finally {
    bitmap.close();
  }
}

/** Blob → data URL (local adapter persistence). Browser-only. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.readAsDataURL(blob);
  });
}
