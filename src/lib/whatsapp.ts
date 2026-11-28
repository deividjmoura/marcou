/**
 * Normalização de telefone BR → E.164 e link oficial wa.me (click-to-chat).
 * Sem dependências de runtime; puro e testável.
 */

/** DDI padrão quando o número não traz código de país. */
const DEFAULT_DDI = "55";

/**
 * DDDs brasileiros válidos (Anatel). Usado só como guarda opcional após
 * normalizar; não substitui a regra de "sem '+' = Brasil".
 */
const BR_AREA_CODES = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99",
]);

/**
 * Aceita máscaras comuns BR (`(11) 91234-5678`, `+55 11 91234-5678`, etc.).
 * Retorna apenas dígitos em E.164 **sem** o `+`, ou `null` se inválido.
 *
 * Regras:
 * - Internacional **somente** com `+` explícito no início.
 *   - `+55…` → Brasil; outros DDIs → recusados nesta etapa.
 * - Sem `+`, assume Brasil (DDI 55): 10–11 dígitos (DDD + local) ou
 *   12–13 já com 55.
 * - Celular BR com 9 dígitos locais; fixo com 8.
 * - DDD deve ser um código Anatel válido.
 * - Rejeita curtos, longos, só zeros, letras.
 */
export function normalizePhoneToE164Digits(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed === "") return null;

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits || /^0+$/.test(digits)) return null;

  let e164: string;

  if (hasPlus) {
    // Internacional explícito: só aceitamos +55 nesta etapa.
    if (!digits.startsWith(DEFAULT_DDI)) return null;
    if (digits.length !== 12 && digits.length !== 13) return null;
    e164 = digits;
  } else if (digits.startsWith(DEFAULT_DDI) && (digits.length === 12 || digits.length === 13)) {
    e164 = digits;
  } else if (digits.length === 10 || digits.length === 11) {
    e164 = DEFAULT_DDI + digits;
  } else {
    return null;
  }

  if (e164.length !== 12 && e164.length !== 13) return null;
  const ddd = e164.slice(2, 4);
  if (!BR_AREA_CODES.has(ddd)) return null;
  return e164;
}

/**
 * Monta `https://wa.me/<E164>` com texto opcional.
 * Retorna `null` se o telefone for inválido (ação deve ser ocultada).
 */
export function buildWhatsAppLink(
  phone: unknown,
  message?: string | null,
): string | null {
  const e164 = normalizePhoneToE164Digits(phone);
  if (!e164) return null;
  const base = `https://wa.me/${e164}`;
  if (message == null || String(message).trim() === "") return base;
  return `${base}?text=${encodeURIComponent(String(message).trim())}`;
}
