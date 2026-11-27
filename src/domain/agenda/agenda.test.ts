import { describe, expect, it } from "vitest";
import {
  agendaLocalDateKey,
  filterAgendaBookings,
  groupAgendaByLocalDate,
  normalizeAgendaText,
  type AgendaBooking,
} from "./agenda";

const NOW = Date.parse("2026-12-01T12:00:00Z");

function booking(overrides: Partial<AgendaBooking> = {}): AgendaBooking {
  return {
    starts_at: "2026-12-01T13:00:00Z",
    timezone: "America/Sao_Paulo",
    customer_name: "Ana Souza",
    customer_phone: "47999991234",
    service_name_snapshot: "Corte feminino",
    ...overrides,
  };
}

describe("agenda — busca", () => {
  it("ignora acentos, caixa e espaços extras", () => {
    expect(normalizeAgendaText("  José   DA Silva  ")).toBe("jose da silva");
    const bookings = [booking({ customer_name: "José da Silva" })];
    expect(
      filterAgendaBookings(bookings, { period: "all", search: "  jose ", now: NOW }),
    ).toHaveLength(1);
  });

  it("encontra por telefone digitado sem formatação", () => {
    const bookings = [booking({ customer_phone: "(47) 99999-1234" })];
    expect(
      filterAgendaBookings(bookings, { period: "all", search: "479999", now: NOW }),
    ).toHaveLength(1);
    expect(
      filterAgendaBookings(bookings, { period: "all", search: "11 98888", now: NOW }),
    ).toHaveLength(0);
  });

  it("encontra pelo nome do serviço", () => {
    const bookings = [booking({ service_name_snapshot: "Barba completa" })];
    expect(
      filterAgendaBookings(bookings, { period: "all", search: "barba", now: NOW }),
    ).toHaveLength(1);
  });

  it("busca vazia ou só com espaços devolve tudo", () => {
    const bookings = [booking(), booking({ starts_at: "2026-11-01T13:00:00Z" })];
    expect(
      filterAgendaBookings(bookings, { period: "all", search: "   ", now: NOW }),
    ).toHaveLength(2);
  });
});

describe("agenda — período", () => {
  const past = booking({ starts_at: "2026-11-30T13:00:00Z" });
  const future = booking({ starts_at: "2026-12-02T13:00:00Z" });
  const exactlyNow = booking({ starts_at: "2026-12-01T12:00:00Z" });

  it("separa próximos e anteriores pelo instante de referência", () => {
    const bookings = [past, future, exactlyNow];
    const upcoming = filterAgendaBookings(bookings, {
      period: "upcoming",
      search: "",
      now: NOW,
    });
    const previous = filterAgendaBookings(bookings, {
      period: "past",
      search: "",
      now: NOW,
    });

    expect(upcoming.map((item) => item.starts_at)).toEqual([
      "2026-12-01T12:00:00Z",
      "2026-12-02T13:00:00Z",
    ]);
    expect(previous.map((item) => item.starts_at)).toEqual([
      "2026-11-30T13:00:00Z",
    ]);
  });

  it("ordena próximos de forma crescente e anteriores de forma decrescente", () => {
    const bookings = [
      booking({ starts_at: "2026-11-01T13:00:00Z" }),
      booking({ starts_at: "2026-11-20T13:00:00Z" }),
      booking({ starts_at: "2026-12-05T13:00:00Z" }),
      booking({ starts_at: "2026-12-03T13:00:00Z" }),
    ];

    const upcoming = filterAgendaBookings(bookings, {
      period: "upcoming",
      search: "",
      now: NOW,
    });
    const previous = filterAgendaBookings(bookings, {
      period: "past",
      search: "",
      now: NOW,
    });
    const all = filterAgendaBookings(bookings, {
      period: "all",
      search: "",
      now: NOW,
    });

    expect(upcoming.map((item) => item.starts_at)).toEqual([
      "2026-12-03T13:00:00Z",
      "2026-12-05T13:00:00Z",
    ]);
    expect(previous.map((item) => item.starts_at)).toEqual([
      "2026-11-20T13:00:00Z",
      "2026-11-01T13:00:00Z",
    ]);
    expect(all.map((item) => item.starts_at)).toEqual([
      "2026-11-01T13:00:00Z",
      "2026-11-20T13:00:00Z",
      "2026-12-03T13:00:00Z",
      "2026-12-05T13:00:00Z",
    ]);
  });

  it("não muta a lista recebida", () => {
    const bookings = [
      booking({ starts_at: "2026-12-05T13:00:00Z" }),
      booking({ starts_at: "2026-12-03T13:00:00Z" }),
    ];
    const original = bookings.map((item) => item.starts_at);
    filterAgendaBookings(bookings, { period: "all", search: "", now: NOW });
    expect(bookings.map((item) => item.starts_at)).toEqual(original);
  });

  it("descarta data inválida em vez de quebrar a agenda", () => {
    const bookings = [booking({ starts_at: "not-a-date" }), booking()];
    expect(
      filterAgendaBookings(bookings, { period: "all", search: "", now: NOW }),
    ).toHaveLength(1);
  });
});

describe("agenda — fuso e agrupamento", () => {
  it("usa o fuso do prestador para a data local", () => {
    expect(agendaLocalDateKey("2026-12-01T02:30:00Z", "America/Sao_Paulo")).toBe(
      "2026-11-30",
    );
    expect(agendaLocalDateKey("2026-12-01T12:00:00Z", "America/Sao_Paulo")).toBe(
      "2026-12-01",
    );
    expect(agendaLocalDateKey("2026-12-01T12:00:00Z", "Asia/Tokyo")).toBe(
      "2026-12-01",
    );
    expect(agendaLocalDateKey("2026-12-01T23:30:00Z", "Asia/Tokyo")).toBe(
      "2026-12-02",
    );
  });

  it("agrupa eventos do mesmo dia local mesmo com ISO em dias diferentes", () => {
    const bookings = [
      // 02:30Z e 02:45Z caem em 2026-11-30 23:30/23:45 em America/Sao_Paulo (UTC-3).
      booking({ starts_at: "2026-12-01T02:30:00Z" }),
      booking({ starts_at: "2026-12-01T02:45:00Z" }),
      booking({ starts_at: "2026-12-01T12:00:00Z" }),
    ];

    const groups = groupAgendaByLocalDate(bookings);

    expect(groups.map((group) => group.date)).toEqual([
      "2026-11-30",
      "2026-12-01",
    ]);
    expect(groups[0].bookings).toHaveLength(2);
    expect(groups[1].bookings).toHaveLength(1);
    expect(groups[0].timezone).toBe("America/Sao_Paulo");
    expect(groups[0].referenceStartsAt).toBe("2026-12-01T02:30:00Z");
  });

  it("mantém o fuso de cada grupo separado", () => {
    const groups = groupAgendaByLocalDate([
      booking({ starts_at: "2026-12-01T23:00:00Z", timezone: "America/Sao_Paulo" }),
      booking({ starts_at: "2026-12-01T23:00:00Z", timezone: "Asia/Tokyo" }),
    ]);

    expect(groups.map((group) => group.date)).toEqual(["2026-12-01", "2026-12-02"]);
    expect(groups.map((group) => group.timezone)).toEqual([
      "America/Sao_Paulo",
      "Asia/Tokyo",
    ]);
  });

  it("devolve lista vazia quando não há agendamentos", () => {
    expect(groupAgendaByLocalDate([])).toEqual([]);
    expect(
      filterAgendaBookings([], { period: "upcoming", search: "ana", now: NOW }),
    ).toEqual([]);
  });
});
