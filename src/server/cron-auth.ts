import { timingSafeEqual } from "node:crypto";

/**
 * Validates Vercel Cron's Bearer token without leaking token comparisons.
 * A missing secret always denies access (including local/preview environments).
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!secret || !authorization) return false;

  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) return false;

  const expected = Buffer.from(secret, "utf8");
  const received = Buffer.from(match[1], "utf8");

  return (
    expected.length > 0 &&
    expected.length === received.length &&
    timingSafeEqual(expected, received)
  );
}
