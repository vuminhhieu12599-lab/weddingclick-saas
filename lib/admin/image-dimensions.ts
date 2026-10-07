/**
 * Natural pixel dimensions of a selected image file, decoded locally in the
 * staff browser before upload (adaptive Photo Story task). Uses
 * `createImageBitmap` with EXIF orientation applied, so the result matches how
 * the browser displays the photo. Read-only: it is called on the file actually
 * uploaded (the optimized WebP or the original, see image-upload-optimizer.ts),
 * never resizes or re-encodes anything itself. Returns `null` when the browser
 * cannot decode it: the upload still proceeds and the server stores null dimensions.
 */
export interface ImageDimensions {
  width: number;
  height: number;
}

export async function readImageDimensions(file: Blob): Promise<ImageDimensions | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions.width > 0 && dimensions.height > 0 ? dimensions : null;
  } catch {
    return null;
  }
}
