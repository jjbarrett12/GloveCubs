/**
 * Read width/height from common raster formats (no native deps).
 * Returns null if the buffer is not a supported image or dimensions cannot be read.
 */
export function readRasterDimensions(buf: Buffer, mimeType: string): { width: number; height: number } | null {
  const m = mimeType.toLowerCase();
  if (m === "image/jpeg" || m === "image/jpg") return readJpegDimensions(buf);
  if (m === "image/png") return readPngDimensions(buf);
  if (m === "image/webp") return readWebpDimensions(buf);
  return null;
}

function readPngDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  if (
    buf[0] !== 0x89 ||
    buf[1] !== 0x50 ||
    buf[2] !== 0x4e ||
    buf[3] !== 0x47 ||
    buf[4] !== 0x0d ||
    buf[5] !== 0x0a ||
    buf[6] !== 0x1a ||
    buf[7] !== 0x0a
  ) {
    return null;
  }
  if (buf.toString("ascii", 12, 16) !== "IHDR") return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (!width || !height) return null;
  return { width, height };
}

function readJpegDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      i += 2;
      continue;
    }
    if (i + 3 >= buf.length) return null;
    const segLen = buf.readUInt16BE(i + 2);
    if (segLen < 2 || i + 2 + segLen > buf.length) return null;
    // SOF0–SOF15 except DHT/DAC (not dimensions)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 9 > buf.length) return null;
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      if (!width || !height) return null;
      return { width, height };
    }
    i += 2 + segLen;
  }
  return null;
}

function readWebpDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 30) return null;
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const tag = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + size;
    if (chunkEnd > buf.length) return null;
    if (tag === "VP8 " && size >= 10) {
      // Lossy keyframe: 0x9d 0x01 0x2a then 14-bit width/height (little endian, masked)
      if (buf[chunkStart] === 0x9d && buf[chunkStart + 1] === 0x01 && buf[chunkStart + 2] === 0x2a) {
        const w = buf.readUInt16LE(chunkStart + 6) & 0x3fff;
        const h = buf.readUInt16LE(chunkStart + 8) & 0x3fff;
        if (!w || !h) return null;
        return { width: w, height: h };
      }
    }
    if (tag === "VP8X" && size >= 10) {
      const w = 1 + buf.readUIntLE(chunkStart + 4, 3);
      const h = 1 + buf.readUIntLE(chunkStart + 7, 3);
      if (!w || !h) return null;
      return { width: w, height: h };
    }
    offset = chunkStart + size + (size % 2);
  }
  return null;
}
