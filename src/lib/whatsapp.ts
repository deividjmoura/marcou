/**
 * Normalização de telefone BR → E.164 e link oficial wa.me (click-to-chat).
 * Sem dependências de runtime; puro e testável.
 */

/** DDI padrão quando o número não traz código de país. */
const DEFAULT_DDI = "55";

/**
 * Aceita máscaras comuns BR (`(11) 91234-5678`, `+55 11 91234-5678`, etc.).
 * Retorna apenas dígitos em E.164 **sem** o `+`, ou `null` se inválido.
 *
 * Regras:
 * - remove tudo que não for dígito;
 * - se começar com 55 e tiver 12–13 dígitos, mantém;
 * - se tiver 10–11 dígitos (DDD + local), prefixa 55;
 * - celular BR com 9 dígitos locais (após DDD) é preferido; fixo 8 dígitos ok;
 * - rejeita números curtos demais, longos demais ou só zeros.
 */
export function normalizePhoneToE164Digits(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const digits = input.replace(/\D/g, "");
  if (!digits || /^0+$/.test(digits)) return null;

  let e164: string;
  if (digits.startsWith(DEFAULT_DDI) && (digits.length === 12 || digits.length === 13)) {
    e164 = digits;
  } else if (digits.length === 10 || digits.length === 11) {
    // Evita tratar NANP (+1 …) como DDD brasileiro.
    if (digits.length === 11 && digits.startsWith("1")) return null;
    e164 = DEFAULT_DDI + digits;
  } else {
    return null;
  }

  // 55 + DDD(2) + local(8 ou 9) => 12 ou 13 dígitos
  if (e164.length !== 12 && e164.length !== 13) return null;
  const ddd = e164.slice(2, 4);
  if (ddd[0] === "0") return null;
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
