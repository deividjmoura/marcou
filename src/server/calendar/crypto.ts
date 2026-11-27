import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
function key(): Buffer {
  const raw = process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("calendar_encryption_not_configured");
  const value = Buffer.from(raw, "base64");
  if (value.length !== 32) throw new Error("calendar_encryption_key_invalid");
  return value;
}
export function encryptCalendarToken(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}
export function decryptCalendarToken(value: string): string {
  const [iv, tag, data] = value.split(".");
  if (!iv || !tag || !data) throw new Error("calendar_ciphertext_invalid");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
export const hashCalendarState = (state: string) => createHash("sha256").update(state).digest("hex");
export const googleEventIdForBooking = (bookingId: string) => "marcou" + createHash("sha256").update(bookingId).digest("hex").slice(0, 40);
export const isCalendarFeatureEnabled = () => process.env.GOOGLE_CALENDAR_ENABLED === "true";
