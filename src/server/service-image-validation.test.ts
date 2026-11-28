import { describe, expect, it } from "vitest";
import {
  inspectServiceImage,
  SERVICE_IMAGE_MAX_BYTES,
} from "./service-image-validation";

function png(width = 20, height = 10): Uint8Array {
  const bytes = new Uint8Array(45);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  new DataView(bytes.buffer).setUint32(8, 13, false);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(bytes.buffer).setUint32(16, width, false);
  new DataView(bytes.buffer).setUint32(20, height, false);
  bytes.set([8, 6, 0, 0, 0], 24);
  bytes.set([0x49, 0x45, 0x4e, 0x44], 37);
  return bytes;
}

function jpeg(width = 20, height = 10): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

function webpVp8x(width = 20, height = 10): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([...new TextEncoder().encode("RIFF")], 0);
  bytes.set([...new TextEncoder().encode("WEBP")], 8);
  bytes.set([...new TextEncoder().encode("VP8X")], 12);
  new DataView(bytes.buffer).setUint32(4, 22, true);
  new DataView(bytes.buffer).setUint32(16, 10, true);
  const write24 = (offset: number, value: number) => {
    bytes[offset] = (value - 1) & 0xff;
    bytes[offset + 1] = ((value - 1) >> 8) & 0xff;
    bytes[offset + 2] = ((value - 1) >> 16) & 0xff;
  };
  write24(24, width);
  write24(27, height);
  return bytes;
}

describe("inspectServiceImage", () => {
  it("detecta PNG por magic bytes e dimensões", () => {
    expect(inspectServiceImage(png(), "image/png")).toMatchObject({
      mime: "image/png", extension: "png", width: 20, height: 10,
    });
  });

  it("detecta JPEG por SOF e dimensões", () => {
    expect(inspectServiceImage(jpeg(), "image/jpeg")).toMatchObject({
      mime: "image/jpeg", extension: "jpg", width: 20, height: 10,
    });
  });

  it("detecta WebP VP8X por RIFF/WEBP e dimensões", () => {
    expect(inspectServiceImage(webpVp8x(), "image/webp")).toMatchObject({
      mime: "image/webp", extension: "webp", width: 20, height: 10,
    });
  });

  it("rejeita SVG, texto e assinatura desconhecida", () => {
    expect(() => inspectServiceImage(new TextEncoder().encode("<svg/>"), "image/svg+xml"))
      .toThrow("JPEG, PNG ou WebP");
  });

  it("rejeita MIME declarado diferente do conteúdo real", () => {
    expect(() => inspectServiceImage(png(), "image/jpeg"))
      .toThrow("não corresponde");
  });

  it("rejeita imagem acima do limite de bytes", () => {
    expect(() => inspectServiceImage(new Uint8Array(SERVICE_IMAGE_MAX_BYTES + 1)))
      .toThrow("5 MB");
  });

  it("rejeita dimensões acima do limite", () => {
    expect(() => inspectServiceImage(png(4097, 1), "image/png"))
      .toThrow("4096 px");
  });
});
