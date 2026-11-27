/**
 * Erro de sincronização com código estável (nunca contém token, payload ou
 * dado pessoal). `retryable=false` leva o job direto ao estado terminal `dead`.
 */
export class CalendarSyncError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, retryable = true) {
    super(code);
    this.name = "CalendarSyncError";
    this.code = code;
    this.retryable = retryable;
  }
}

export const RECONNECT_REQUIRED = "calendar_reconnect_required";

export function calendarErrorCode(error: unknown): string {
  if (error instanceof CalendarSyncError) return error.code;
  return "worker_unknown";
}

export function isRetryableCalendarError(error: unknown): boolean {
  if (error instanceof CalendarSyncError) return error.retryable;
  return true;
}
