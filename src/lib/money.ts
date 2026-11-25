/**
 * Converte um valor monetário digitado em reais para centavos inteiros.
 *
 * Formatos aceitos (espaços e o prefixo opcional "R$" são ignorados):
 * - inteiro: "50", "1234";
 * - vírgula decimal (padrão pt-BR), com ou sem ponto de milhar:
 *   "50,5", "50,50", "1234,56", "1.234,56", "1.234.567,89";
 * - ponto de milhar sem casas decimais: "1.234", "1.234.567";
 * - ponto decimal com até 2 casas: "50.5", "1234.56". Esse é o formato do
 *   `defaultValue` do formulário de edição (`toFixed(2)`), então precisa
 *   continuar aceito.
 *
 * Não há ambiguidade: grupos de milhar têm sempre 3 dígitos e casas decimais
 * têm no máximo 2. "1.234" é mil duzentos e trinta e quatro reais; "12.34" é
 * doze reais e trinta e quatro centavos.
 *
 * Retorna `NaN` para entradas vazias ou inválidas (negativos, letras, grupos de
 * milhar malformados, mais de 2 casas decimais, separadores misturados no lugar
 * errado). O cálculo usa apenas inteiros, sem arredondamento de ponto flutuante.
 */
export function parseBrlToCents(value: unknown): number {
  if (typeof value !== "string") return Number.NaN;

  const compact = value.replace(/\s/g, "").replace(/^R\$/i, "");
  if (compact === "") return Number.NaN;

  let integerPart: string;
  let decimalPart = "";

  const commaDecimal = /^(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})$/.exec(compact);
  const dotDecimal = /^(\d+)\.(\d{1,2})$/.exec(compact);

  if (commaDecimal) {
    integerPart = commaDecimal[1];
    decimalPart = commaDecimal[2];
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(compact)) {
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
