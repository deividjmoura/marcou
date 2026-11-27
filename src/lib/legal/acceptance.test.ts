import { describe, expect, it } from "vitest";
import {
  isExactLegalAcceptanceSelection,
  parseLegalAcceptanceValues,
  type LegalAcceptanceInput,
} from "./acceptance";

const terms: LegalAcceptanceInput = {
  documentKey: "terms",
  version: "1.0",
  contentHash: "a".repeat(64),
};
const privacy: LegalAcceptanceInput = {
  documentKey: "privacy",
  version: "1.0",
  contentHash: "b".repeat(64),
};

describe("seleção explícita de documentos", () => {
  it("lê apenas tokens JSON válidos", () => {
    expect(parseLegalAcceptanceValues([
      JSON.stringify(terms),
      "não é json",
      JSON.stringify({ ...privacy, contentHash: "curto" }),
    ])).toEqual([terms]);
  });

  it("aceita cada documento uma única vez em qualquer ordem", () => {
    expect(isExactLegalAcceptanceSelection(
      [terms, privacy],
      [privacy, terms],
    )).toBe(true);
  });

  it("recusa seleção parcial", () => {
    expect(isExactLegalAcceptanceSelection([terms, privacy], [terms])).toBe(false);
  });

  it("recusa documento extra ou forjado", () => {
    expect(isExactLegalAcceptanceSelection(
      [terms],
      [terms, privacy],
    )).toBe(false);
    expect(isExactLegalAcceptanceSelection(
      [terms],
      [{ ...terms, contentHash: "c".repeat(64) }],
    )).toBe(false);
  });

  it("recusa token duplicado para evitar confirmação ambígua", () => {
    expect(isExactLegalAcceptanceSelection([terms], [terms, terms])).toBe(false);
  });
});
