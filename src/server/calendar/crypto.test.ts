import { afterEach, describe, expect, it } from "vitest";
import { decryptCalendarToken, encryptCalendarToken, googleEventIdForBooking, hashCalendarState } from "./crypto";
const original = process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY;
afterEach(() => { if (original === undefined) delete process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY; else process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY = original; });
describe("calendar token encryption", () => {
 it("round trips AES-GCM tokens", () => { process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64"); const token = "secret-token"; expect(decryptCalendarToken(encryptCalendarToken(token))).toBe(token); });
 it("rejects wrong key size and tampering", () => { process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY = Buffer.alloc(16).toString("base64"); expect(() => encryptCalendarToken("x")).toThrow(); process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64"); const parts = encryptCalendarToken("x").split("."); parts[2] = Buffer.from("altered").toString("base64"); expect(() => decryptCalendarToken(parts.join("."))).toThrow(); });
});
describe("Google event IDs", () => { it("is deterministic, distinct and valid", () => { const id = googleEventIdForBooking("booking-uuid"); expect(id).toBe(googleEventIdForBooking("booking-uuid")); expect(id).not.toBe(googleEventIdForBooking("other")); expect(id).toMatch(/^[a-v0-9]+$/); expect(hashCalendarState("state")).toHaveLength(64); }); });
