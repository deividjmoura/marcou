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
