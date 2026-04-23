import { describe, it, expect } from "vitest";
import { sniffImageMimeFromBuffer } from "./image-ownership";

describe("sniffImageMimeFromBuffer", () => {
  it("detects JPEG", () => {
    const buf = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    expect(sniffImageMimeFromBuffer(buf)).toBe("image/jpeg");
  });

  it("detects PNG", () => {
    const buf = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(sniffImageMimeFromBuffer(buf)).toBe("image/png");
  });

  it("detects WebP", () => {
    const buf = new Uint8Array(12);
    buf.set([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
    expect(sniffImageMimeFromBuffer(buf)).toBe("image/webp");
  });

  it("returns null for unknown", () => {
    expect(sniffImageMimeFromBuffer(new Uint8Array([0, 1, 2]))).toBeNull();
    expect(sniffImageMimeFromBuffer(new Uint8Array(0))).toBeNull();
  });
});
