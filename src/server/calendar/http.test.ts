import { describe, expect, it } from "vitest";
import { calendarNoticeRedirect, calendarSiteOrigin, isTrustedCalendarOrigin } from "./http";

const SITE = "https://marcou.example";
const post = (origin?: string) =>
  new Request(`${SITE}/api/calendar/connect`, { method: "POST", headers: origin ? { origin } : {} });

describe("Calendar HTTP helpers", () => {
  it("aceita somente POST da própria origem", () => {
    expect(isTrustedCalendarOrigin(post(SITE), SITE)).toBe(true);
    expect(isTrustedCalendarOrigin(post("https://evil.example"), SITE)).toBe(false);
    expect(isTrustedCalendarOrigin(post(), SITE)).toBe(false);
    expect(isTrustedCalendarOrigin(post("null"), SITE)).toBe(false);
  });

  it("falha fechada sem NEXT_PUBLIC_SITE_URL válida", () => {
    expect(isTrustedCalendarOrigin(post(SITE), undefined)).toBe(false);
    expect(calendarSiteOrigin("not a url")).toBeNull();
    expect(calendarSiteOrigin("javascript:alert(1)")).toBeNull();
    expect(calendarSiteOrigin("ftp://marcou.example")).toBeNull();
    expect(calendarSiteOrigin(`${SITE}/path`)).toBe(SITE);
  });

  it("redirect pós-POST usa 303 e aponta para a página da integração", () => {
    const response = calendarNoticeRedirect("connected", SITE);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${SITE}/painel/integracoes/calendario?calendar=connected`);
  });
});
