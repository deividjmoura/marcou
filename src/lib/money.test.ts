import { describe, expect, it } from "vitest";
import { parseBrlToCents, parseOptionalBrlToCents } from "./money";

describe("parseBrlToCents", () => {
  it.each([
    // inteiros
    ["0", 0],
    ["50", 5000],
    // vírgula decimal
    ["0,5", 50],
    ["50,5", 5050],
    ["50,50", 5050],
    ["1234,56", 123456],
    // ponto de milhar + vírgula decimal
    ["1.234,56", 123456],
    ["1.234.567,89", 123456789],
    // ponto sem vírgula: 3 dígitos = milhar; 1–2 dígitos = decimal
    ["1.234", 123400],
    ["1.234.567", 123456700],
    ["12.5", 1250],
    ["12.50", 1250],
    ["1234.56", 123456], // formato do formulário de edição (toFixed(2))
    // prefixo e espaços
    ["R$ 50", 5000],
    ["  R$1.234,56 ", 123456],
    // aritmética inteira (0,29 * 100 em float = 28.999...)
    ["0,29", 29],
  ])("%j → %i centavos", (input, expected) => {
    expect(parseBrlToCents(input)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "R$",
    "abc",
    "-5",
    "-50,00",
    "50,",
    ",50",
    "50,555",
    "1e3",
    "Infinity",
    // ambíguos: recusados em vez de adivinhar
    "0.500",
    "0.123,45",
    "1,234.56",
    "1,234,56",
    "12.34.56",
    "1.23,45",
    "1.2345,67",
    "99999999999999999999",
  ])("recusa %j (NaN)", (input) => {
    expect(parseBrlToCents(input)).toBeNaN();
  });

  it("recusa valores que não são texto", () => {
    expect(parseBrlToCents(null)).toBeNaN();
    expect(parseBrlToCents(50)).toBeNaN();
  });
});

describe("parseOptionalBrlToCents", () => {
  it("vazio ou ausente vira 0", () => {
    expect(parseOptionalBrlToCents("")).toBe(0);
    expect(parseOptionalBrlToCents("  ")).toBe(0);
    expect(parseOptionalBrlToCents(null)).toBe(0);
  });

  it("valores preenchidos seguem a mesma regra, inclusive a recusa", () => {
    expect(parseOptionalBrlToCents("1.234,56")).toBe(123456);
    expect(parseOptionalBrlToCents("0")).toBe(0);
    expect(parseOptionalBrlToCents("-5")).toBeNaN();
    expect(parseOptionalBrlToCents("0.500")).toBeNaN();
  });
});
