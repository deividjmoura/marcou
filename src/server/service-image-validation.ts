export const SERVICE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const SERVICE_IMAGE_MAX_DIMENSION = 4096;
export const SERVICE_IMAGE_MAX_PIXELS = 16_000_000;

export type ServiceImageMime = "image/jpeg" | "image/png" | "image/webp";
export type ServiceImageExtension = "jpg" | "png" | "webp";

export interface ServiceImageMetadata {
  mime: ServiceImageMime;
  extension: ServiceImageExtension;
  width: number;
  height: number;
}

function ascii(bytes: Uint8Array, start: number, value: string): boolean {
  return [...value].every((char, index) => bytes[start + index] === char.charCodeAt(0));
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return null;
    if (startOfFrame.has(marker)) {
      if (length < 7) return null;
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
      };
    }
    offset += length;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 25 || !ascii(bytes, 0, "RIFF") || !ascii(bytes, 8, "WEBP")) return null;
  if (ascii(bytes, 12, "VP8X") && bytes.length >= 30) {
    return {
      width: 1 + readUint24LE(bytes, 24),
      height: 1 + readUint24LE(bytes, 27),
    };
  }
  if (ascii(bytes, 12, "VP8 ") && bytes.length >= 30 &&
      bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      width: ((bytes[27] & 0x3f) << 8) | bytes[26],
      height: ((bytes[29] & 0x3f) << 8) | bytes[28],
    };
  }
  if (ascii(bytes, 12, "VP8L") && bytes.length >= 25 && bytes[20] === 0x2f) {
    return {
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height: 1 + ((bytes[22] & 0xc0) >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
    };
  }
  return null;
}

export function inspectServiceImage(
  bytes: Uint8Array,
  declaredMime = "",
): ServiceImageMetadata {
  if (bytes.length === 0) throw new Error("Selecione uma imagem.");
  if (bytes.length > SERVICE_IMAGE_MAX_BYTES) {
    throw new Error("A imagem deve ter no máximo 5 MB.");
  }

  let metadata: ServiceImageMetadata | null = null;
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    ascii(bytes, 1, "PNG\r\n\x1a\n") &&
    ascii(bytes, 12, "IHDR")
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    metadata = {
      mime: "image/png",
      extension: "png",
      width: view.getUint32(16, false),
      height: view.getUint32(20, false),
    };
  } else if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    const dimensions = jpegDimensions(bytes);
    if (dimensions) metadata = { ...dimensions, mime: "image/jpeg", extension: "jpg" };
  } else {
    const dimensions = webpDimensions(bytes);
    if (dimensions) metadata = { ...dimensions, mime: "image/webp", extension: "webp" };
  }

  if (!metadata || metadata.width < 1 || metadata.height < 1) {
    throw new Error("Envie uma imagem JPEG, PNG ou WebP válida.");
  }
  if (declaredMime && declaredMime !== metadata.mime) {
    throw new Error("O formato informado não corresponde ao conteúdo da imagem.");
  }
  if (
    metadata.width > SERVICE_IMAGE_MAX_DIMENSION ||
    metadata.height > SERVICE_IMAGE_MAX_DIMENSION ||
    metadata.width * metadata.height > SERVICE_IMAGE_MAX_PIXELS
  ) {
    throw new Error("A imagem deve ter até 4096 px por lado e no máximo 16 megapixels.");
  }
  return metadata;
}
