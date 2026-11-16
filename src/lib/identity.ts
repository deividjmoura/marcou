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

/** Mensagem segura para falhas conhecidas de login por senha. */
export function passwordLoginErrorMessage(code?: string | null): string {
  if (code === "email_not_confirmed") {
    return "Seu e-mail ainda não foi confirmado. Abra o link enviado para concluir o cadastro.";
  }
  if (code === "over_request_rate_limit") {
    return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";
  }
  return "E-mail ou senha incorretos.";
}

/** Mensagem segura para falhas conhecidas ao criar conta. */
export function signupErrorMessage(code?: string | null): string {
  if (code === "email_address_not_authorized") {
    return "O envio de confirmação ainda não está habilitado para esse endereço. A equipe precisa configurar o serviço de e-mail do Marcou.";
  }
  if (code === "over_email_send_rate_limit") {
    return "O limite de e-mails de confirmação foi atingido. Aguarde antes de tentar novamente.";
  }
  return "Não foi possível criar a conta com esses dados.";
}
