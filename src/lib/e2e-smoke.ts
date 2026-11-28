import { DateTime } from "luxon";
import {
  aggregateBookingServices,
  type AggregatedBookingTotals,
  type BookableService,
} from "@/domain/bookings/aggregate";

/**
 * Preparação pura (sem dependências externas) para a Fase 2 de E2E (Issue #31,
 * docs/ADR-E2E.md). Fornece:
 * 1. Trava fail-closed contra execução acidental em produção;
 * 2. Cálculo determinístico de data futura no fuso do prestador;
 * 3. Massa de teste isolada por execução para as 3 jornadas de Smoke E2E.
 */

export const PRODUCTION_SUPABASE_PROJECT_REF = "peornypgltuueubmsucm";
export const PRODUCTION_SITE_HOSTS = ["marcoou.netlify.app"] as const;
export const DEFAULT_E2E_TIMEZONE = "America/Sao_Paulo";
export const DEFAULT_E2E_SITE_ORIGIN = "http://127.0.0.1:3000";

export type E2EBackendMode = "local" | "staging";

export interface SafeE2EEnvironment {
  mode: E2EBackendMode;
  supabaseOrigin: string;
  siteOrigin: string;
  healthUrl: string;
}

export interface DeterministicE2EDate {
  /** Data no formato yyyy-mm-dd no fuso do prestador. */
  dateIso: string;
  /** Convenção do Marcou: 0 = domingo, 6 = sábado. */
  dayOfWeek: number;
  timeZone: string;
}

export interface SmokeServiceSpec extends BookableService {
  description: string;
  priceInputBrl: string;
  depositInputBrl: string;
}

export interface SmokeFixture {
  runId: string;
  targetDate: DeterministicE2EDate;
  providerAccount: {
    name: string;
    email: string;
    phone: string;
  };
  customerAccount: {
    name: string;
    email: string;
    phone: string;
  };
  outsiderAccount: {
    name: string;
    email: string;
    phone: string;
  };
  business: {
    slug: string;
    displayName: string;
    description: string;
    timezone: string;
    bookingHoldMinutes: number;
    isPublished: true;
  };
  availabilityRule: {
    dayOfWeek: number;
    startsAt: string;
    endsAt: string;
  };
  services: readonly [SmokeServiceSpec, SmokeServiceSpec];
  expectedMultiServiceTotals: AggregatedBookingTotals;
}

function isLoopbackHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return lower === "127.0.0.1" || lower === "localhost" || lower === "::1" || lower === "[::1]";
}

function parseOrigin(raw: string, label: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${label} inválida para E2E.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} deve usar http ou https.`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label} não pode conter credenciais embutidas.`);
  }
  return parsed;
}

/**
 * Valida em modo fail-closed que o ambiente de E2E não aponta para produção
 * (nem para o project ref de produção no Supabase nem para o domínio publicado).
 */
export function assertSafeE2EEnvironment(env: {
  supabaseUrl?: string;
  siteUrl?: string;
}): SafeE2EEnvironment {
  const rawSupabase = env.supabaseUrl?.trim();
  if (!rawSupabase) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL ausente: configure um backend local ou de staging antes de rodar E2E.",
    );
  }

  const supabaseParsed = parseOrigin(rawSupabase, "NEXT_PUBLIC_SUPABASE_URL");
  if (
    supabaseParsed.href
      .toLowerCase()
      .includes(PRODUCTION_SUPABASE_PROJECT_REF)
  ) {
    throw new Error(
      `Bloqueado: execução E2E contra o projeto Supabase de produção (${PRODUCTION_SUPABASE_PROJECT_REF}) é proibida.`,
    );
  }

  const localSupabase = isLoopbackHost(supabaseParsed.hostname);
  if (!localSupabase && supabaseParsed.protocol !== "https:") {
    throw new Error(
      "Backend Supabase de staging remoto exige HTTPS em NEXT_PUBLIC_SUPABASE_URL.",
    );
  }

  const rawSite = env.siteUrl?.trim() || DEFAULT_E2E_SITE_ORIGIN;
  const siteParsed = parseOrigin(rawSite, "NEXT_PUBLIC_SITE_URL");
  const siteHost = siteParsed.hostname.toLowerCase();
  if (
    PRODUCTION_SITE_HOSTS.some(
      (prodHost) => siteHost === prodHost || siteHost.endsWith(`.${prodHost}`),
    )
  ) {
    throw new Error(
      `Bloqueado: execução E2E contra o host de produção (${siteHost}) é proibida.`,
    );
  }
  if (!isLoopbackHost(siteHost) && siteParsed.protocol !== "https:") {
    throw new Error("Site remoto de E2E exige HTTPS em NEXT_PUBLIC_SITE_URL.");
  }

  return {
    mode: localSupabase ? "local" : "staging",
    supabaseOrigin: supabaseParsed.origin,
    siteOrigin: siteParsed.origin,
    healthUrl: `${siteParsed.origin}/api/health`,
  };
}

/**
 * Normaliza um identificador de execução para uso seguro em slugs e endereços
 * de teste RFC 2606 (.test).
 */
export function sanitizeE2ERunId(raw: string): string {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
  if (normalized.length < 2) {
    throw new RangeError(
      "runId para E2E deve produzir ao menos 2 caracteres alfanuméricos.",
    );
  }
  return normalized;
}

/**
 * Calcula uma data futura determinística no fuso horário do prestador, evitando
 * deriva quando o runner de CI opera em UTC próximo à virada de dia.
 */
export function pickDeterministicE2EDate(options?: {
  now?: Date;
  timeZone?: string;
  offsetDays?: number;
}): DeterministicE2EDate {
  const now = options?.now ?? new Date();
  const timeZone = options?.timeZone ?? DEFAULT_E2E_TIMEZONE;
  const offsetDays = options?.offsetDays ?? 3;

  if (!Number.isInteger(offsetDays) || offsetDays < 1 || offsetDays > 90) {
    throw new RangeError("offsetDays para E2E deve ser inteiro entre 1 e 90.");
  }

  const target = DateTime.fromJSDate(now, { zone: timeZone });
  if (!target.isValid) {
    throw new RangeError(`Fuso horário inválido para E2E: ${timeZone}`);
  }

  const shifted = target.startOf("day").plus({ days: offsetDays });
  const dateIso = shifted.toISODate();
  if (!dateIso) {
    throw new Error("Não foi possível derivar data ISO determinística.");
  }

  return {
    dateIso,
    // luxon: 1 = segunda ... 7 = domingo -> Marcou: 0 = domingo ... 6 = sábado.
    dayOfWeek: shifted.weekday % 7,
    timeZone,
  };
}

/**
 * Monta a massa de dados isolada das 3 jornadas de Smoke E2E (docs/ADR-E2E.md),
 * usando apenas e-mails no TLD reservado `.test` (RFC 2606) e totais calculados
 * pelo agregador oficial de domínio.
 */
export function buildSmokeFixture(
  rawRunId: string,
  options?: {
    now?: Date;
    timeZone?: string;
    offsetDays?: number;
  },
): SmokeFixture {
  const runId = sanitizeE2ERunId(rawRunId);
  const targetDate = pickDeterministicE2EDate(options);

  const services: readonly [SmokeServiceSpec, SmokeServiceSpec] = [
    {
      name: "Serviço A",
      description: "Serviço principal da jornada E2E.",
      durationMinutes: 60,
      priceCents: 8000,
      depositCents: 2000,
      bufferMinutes: 15,
      priceInputBrl: "80,00",
      depositInputBrl: "20,00",
    },
    {
      name: "Serviço B",
      description: "Serviço complementar da jornada multi-serviço E2E.",
      durationMinutes: 30,
      priceCents: 4500,
      depositCents: 1000,
      bufferMinutes: 10,
      priceInputBrl: "45,00",
      depositInputBrl: "10,00",
    },
  ];

  return {
    runId,
    targetDate,
    providerAccount: {
      name: `Profissional E2E ${runId}`,
      email: `e2e-provider-${runId}@marcou.test`,
      phone: "(11) 99999-0001",
    },
    customerAccount: {
      name: `Cliente E2E ${runId}`,
      email: `e2e-client-${runId}@marcou.test`,
      phone: "(11) 99999-0002",
    },
    outsiderAccount: {
      name: `Terceiro E2E ${runId}`,
      email: `e2e-outsider-${runId}@marcou.test`,
      phone: "(11) 99999-0003",
    },
    business: {
      slug: `e2e-studio-${runId}`,
      displayName: `Studio E2E ${runId}`,
      description: "Atendimento de teste automatizado do Marcou.",
      timezone: targetDate.timeZone,
      bookingHoldMinutes: 30,
      isPublished: true,
    },
    availabilityRule: {
      dayOfWeek: targetDate.dayOfWeek,
      startsAt: "09:00",
      endsAt: "18:00",
    },
    services,
    expectedMultiServiceTotals: aggregateBookingServices(services),
  };
}
