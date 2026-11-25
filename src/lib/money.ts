/**
 * Conversão de valores em reais digitados pelo prestador para centavos.
 *
 * Regra (espaços e o prefixo opcional "R$" são ignorados antes de aplicar):
 *
 * | Entrada              | Leitura                          | Centavos  |
 * | -------------------- | -------------------------------- | --------- |
 * | "50", "0"            | inteiro em reais                 | 5000, 0   |
 * | "50,5", "0,5"        | vírgula = decimal (1–2 casas)    | 5050, 50  |
 * | "1.234,56"           | ponto = milhar, vírgula = decimal| 123456    |
 * | "1.234.567,89"       | idem, vários grupos              | 123456789 |
 * | "1.234"              | ponto SEM vírgula + 3 dígitos    | 123400    |
 * |                      | = milhar                         |           |
 * | "12.5", "12.50"      | ponto SEM vírgula + 1–2 dígitos  | 1250      |
 * |                      | = decimal                        |           |
 *
 * Ponto sem vírgula: o número de dígitos depois do ÚLTIMO ponto decide.
 * Exatamente 3 dígitos em todos os grupos significa milhar; 1 ou 2 dígitos
 * depois de um único ponto significa decimal. Não há sobreposição, porque
 * centavos têm no máximo 2 casas e grupos de milhar têm sempre 3. O formato
 * decimal com ponto precisa continuar aceito, já que o formulário de edição
 * preenche o campo com `toFixed(2)` ("1234.56").
 *
 * Ambiguidade real é RECUSADA (retorna `NaN`) em vez de adivinhar, para não
 * gravar silenciosamente um valor diferente do pretendido:
 * - grupo de milhar começando com zero ("0.500", "0.123,45"): poderia ser
 *   "50 centavos com 3 casas" ou "500 reais";
 * - separadores trocados ou misturados ("1,234.56", "1,234,56", "12.34.56");
 * - grupos de tamanho errado ("1.23,45", "1.2345,67");
 * - mais de 2 casas decimais ("50,555"), sinal negativo, notação científica,
 *   letras, "Infinity"/"NaN", vírgula sem dígitos ("50,", ",50").
 *
 * O cálculo usa apenas inteiros, sem arredondamento de ponto flutuante.
 */
export function parseBrlToCents(value: unknown): number {
  if (typeof value !== "string") return Number.NaN;

  const compact = value.replace(/\s/g, "").replace(/^R\$/i, "");
  if (compact === "") return Number.NaN;

  // Primeiro grupo de milhar sem zero à esquerda: "0.500" é ambíguo.
  const thousands = "[1-9]\\d{0,2}(?:\\.\\d{3})+";
  const commaDecimal = new RegExp(`^(${thousands}|\\d+),(\\d{1,2})$`).exec(compact);
  const dotDecimal = /^(\d+)\.(\d{1,2})$/.exec(compact);

  let integerPart: string;
  let decimalPart = "";

  if (commaDecimal) {
    integerPart = commaDecimal[1];
    decimalPart = commaDecimal[2];
  } else if (new RegExp(`^${thousands}$`).test(compact)) {
    integerPart = compact;
  } else if (dotDecimal) {
    integerPart = dotDecimal[1];
    decimalPart = dotDecimal[2];
  } else if (/^\d+$/.test(compact)) {
    integerPart = compact;
  } else {
    return Number.NaN;
  }

  const reais = Number(integerPart.replace(/\./g, ""));
  const cents = reais * 100 + Number(decimalPart.padEnd(2, "0"));

  return Number.isSafeInteger(cents) ? cents : Number.NaN;
}

/**
 * Para campos monetários opcionais em que vazio tem significado de negócio
 * zero (ex.: "sem sinal"). Ausente ou só espaços vira 0; qualquer outra
 * entrada segue a regra de `parseBrlToCents`, incluindo a recusa de
 * ambiguidades.
 */
export function parseOptionalBrlToCents(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "string" && value.trim() === "") return 0;
  return parseBrlToCents(value);
}
