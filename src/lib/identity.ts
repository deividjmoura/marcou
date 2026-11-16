export function safeNextPath(value: string | null | undefined): string {
  if (!value) return "/painel";
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")
    ? value
    : "/painel";
}

export function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidPhone(value: string): boolean {
  const digits = normalizePhone(value);
  return digits.length >= 10 && digits.length <= 15;
}

/**
 * Mensagem amigável para falhas do provedor de OAuth. O `error_description`
 * vem do provedor e não é exposto na interface.
 */
export function oauthErrorMessage(error?: string | null): string {
  if (error === "access_denied") {
    return "O login com Google foi cancelado. Tente novamente quando quiser.";
  }
  return "Não foi possível concluir a autenticação. Tente novamente.";
}

/**
 * Monta o destino de retorno para o login preservando o caminho original.
 * Usado quando o callback OAuth falha (consentimento cancelado, link expirado
 * ou provedor indisponível) para que o usuário não perca o agendamento que
 * estava tentando fazer.
 */
export function loginRedirectUrl(
  origin: string,
  next: string,
  error?: string,
): string {
  const url = new URL("/login", origin);
  if (error) url.searchParams.set("error", error);
  url.searchParams.set("next", next);
  return url.toString();
}
