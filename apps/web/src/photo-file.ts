export const MAX_PHOTO_BYTES = 650_000;
export const MAX_PHOTOS = 10;

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export type PhotoFileError = "photoInvalidType" | "photoTooLarge";

export function validatePhotoFile(file: { type: string; size: number }): PhotoFileError | null {
  if (!ACCEPTED_TYPES.has(file.type.toLowerCase())) return "photoInvalidType";
  if (file.size > MAX_PHOTO_BYTES) return "photoTooLarge";
  return null;
}

export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}
