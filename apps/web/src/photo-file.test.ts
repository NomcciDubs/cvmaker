import { describe, expect, it } from "vitest";
import { MAX_PHOTO_BYTES, validatePhotoFile } from "./photo-file";

describe("validatePhotoFile", () => {
  it("accepts PNG, JPEG and WebP within the 650KB client limit", () => {
    expect(validatePhotoFile({ type: "image/png", size: MAX_PHOTO_BYTES })).toBeNull();
    expect(validatePhotoFile({ type: "image/jpeg", size: 1_000 })).toBeNull();
    expect(validatePhotoFile({ type: "image/webp", size: 1_000 })).toBeNull();
  });

  it("rejects other types and oversized files", () => {
    expect(validatePhotoFile({ type: "image/gif", size: 1_000 })).toBe("photoInvalidType");
    expect(validatePhotoFile({ type: "image/png", size: MAX_PHOTO_BYTES + 1 })).toBe("photoTooLarge");
  });
});
