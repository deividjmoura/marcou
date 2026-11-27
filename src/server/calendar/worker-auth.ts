import { timingSafeEqual } from "node:crypto";
export function isCalendarWorkerAuthorized(header: string | null, secret = process.env.GOOGLE_CALENDAR_WORKER_SECRET): boolean {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? "");
  if (!secret || !match) return false;
  const expected = Buffer.from(secret), received = Buffer.from(match[1]);
  return expected.length > 0 && expected.length === received.length && timingSafeEqual(expected, received);
}
