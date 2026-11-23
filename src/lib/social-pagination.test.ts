import { describe, expect, it } from "vitest";
import {
  SOCIAL_QUERY_BUDGETS,
  socialPageLimit,
} from "./social-pagination";

describe("budgets de paginação social", () => {
  it("usa defaults positivos e limites máximos finitos", () => {
    for (const budget of Object.values(SOCIAL_QUERY_BUDGETS)) {
      expect(budget.defaultLimit).toBeGreaterThan(0);
      expect(budget.maxLimit).toBeGreaterThanOrEqual(budget.defaultLimit);
      expect(budget.maxLimit).toBeLessThanOrEqual(100);
      expect(budget.cursor.at(-1)).toBe("id");
    }
  });

  it("normaliza valores ausentes, fracionários, negativos e excessivos", () => {
    expect(socialPageLimit("feed", undefined)).toBe(20);
    expect(socialPageLimit("feed", null)).toBe(20);
    expect(socialPageLimit("feed", -1)).toBe(20);
    expect(socialPageLimit("feed", 1.5)).toBe(20);
    expect(socialPageLimit("feed", 25)).toBe(25);
    expect(socialPageLimit("feed", 10_000)).toBe(40);
  });
});
