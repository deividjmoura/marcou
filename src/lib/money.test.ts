import { describe, expect, it } from "vitest";
import { parseBrlToCents } from "./money";

describe("parseBrlToCents", () => {
  it.each([
    ["50", 5000],
    ["50,5", 5050],
    ["50,50", 5050],
    ["1.234,56", 123456],
    ["1234,56", 123456],
    ["0", 0],
    ["0,00", 0],
    ["0,05", 5],
    ["1.234", 123400],
    ["1.234.567,89", 123456789],
    ["R$ 1.234,56", 123456],
    ["  50,00  ", 5000],
    ["1 234,56", 123456],
  ])("converte %j em %i centavos", (input, expected) => {
    expect(parseBrlToCents(input)).toBe(expected);
  });

  it.each([
    // Formato gerado pelo defaultValue do formulário de edição (toFixed(2)).
    ["0.00", 0],
    ["50.5", 5050],
    ["50.50", 5050],
    ["1234.56", 123456],
  ])("mantém compatibilidade com ponto decimal: %j", (input, expected) => {
    expect(parseBrlToCents(input)).toBe(expected);
  });

  it("não sofre erro de arredondamento de ponto flutuante", () => {
    expect(parseBrlToCents("1,10")).toBe(110);
    expect(parseBrlToCents("0,29")).toBe(29);
    expect(parseBrlToCents("4,35")).toBe(435);
  });

  it.each([
    [""],
    ["   "],
    ["abc"],
    ["-50"],
    ["-50,00"],
    ["50,"],
    [",50"],
    ["50,555"],
    ["1.23,45"],
    ["1.2345,67"],
    ["12.34.56"],
    ["1,234.56"],
    ["1,234,56"],
    ["50,5a"],
    ["1e3"],
    ["Infinity"],
    ["NaN"],
    ["R$"],
    ["99999999999999999999"],
  ])("rejeita %j como inválido (NaN)", (input) => {
    expect(parseBrlToCents(input)).toBeNaN();
  });

  it("rejeita valores que não são texto", () => {
    expect(parseBrlToCents(null)).toBeNaN();
    expect(parseBrlToCents(undefined)).toBeNaN();
    expect(parseBrlToCents(50)).toBeNaN();
  });
});
