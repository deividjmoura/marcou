import { afterEach, describe, expect, it } from "vitest";
import { isCalendarWorkerAuthorized } from "./worker-auth";
const original = process.env.GOOGLE_CALENDAR_WORKER_SECRET;
afterEach(() => { if (original === undefined) delete process.env.GOOGLE_CALENDAR_WORKER_SECRET; else process.env.GOOGLE_CALENDAR_WORKER_SECRET = original; });
describe("calendar worker authorization", () => {
 it("allows exact bearer secret", () => { process.env.GOOGLE_CALENDAR_WORKER_SECRET = "test-secret"; expect(isCalendarWorkerAuthorized("Bearer test-secret")).toBe(true); });
 it("rejects missing, malformed and wrong tokens", () => { process.env.GOOGLE_CALENDAR_WORKER_SECRET = "test-secret"; expect(isCalendarWorkerAuthorized(null)).toBe(false); expect(isCalendarWorkerAuthorized("Basic test-secret")).toBe(false); expect(isCalendarWorkerAuthorized("Bearer other")).toBe(false); });
 it("fails closed without configured secret", () => { delete process.env.GOOGLE_CALENDAR_WORKER_SECRET; expect(isCalendarWorkerAuthorized("Bearer test-secret")).toBe(false); });
});
