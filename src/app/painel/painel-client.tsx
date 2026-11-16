"use client";

import Link from "next/link";
import { logoutAction } from "../(auth)/actions";

import { useActionState, useState, type ReactNode } from "react";
import {
  deleteExceptionAction,
  deleteRuleAction,
  saveExceptionAction,
  saveProviderAction,
  saveRuleAction,
  saveServiceAction,
  toggleServiceAction,
  type PainelActionState,
} from "./actions";
import type {
  AvailabilityExceptionRow,
  AvailabilityRuleRow,
  Provider,
  Service,
} from "@/server/bookings";
import { formatCents } from "@/lib/format";

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Fortaleza",
  "America/Recife",
  "America/Bahia",
  "America/Manaus",
  "America/Cuiaba",
  "America/Rio_Branco",
  "America/Boa_Vista",
];

const WEEKDAYS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

function Alert({ state }: { state: PainelActionState }) {
  if (state.error) return <p className="alert alert-error">{state.error}</p>;
  if (state.success) return <p className="alert alert-success">{state.success}</p>;
  return null;
}

export function ProviderForm({ provider }: { provider: Provider | null }) {
  const [state, action, pending] = useActionState(saveProviderAction, {});

  // Um fuso já salvo que não está na lista curada precisa aparecer como opção,
  // senão o `<select>` o substitui silenciosamente pelo primeiro da lista.
  const timezoneOptions =
    provider?.timezone && !TIMEZONES.includes(provider.timezone)
      ? [provider.timezone, ...TIMEZONES]
      : TIMEZONES;

  return (
    <form action={action} className="card form-stack">
      <h2>{provider ? "Dados do negócio" : "Seu negócio"}</h2>

      <Alert state={state} />

      <label className="field">
        <span>Endereço da página</span>
        <div className="input-affix">
          <span>/p/</span>
          <input
            type="text"
            name="slug"
            required
            minLength={3}
            maxLength={48}
            pattern="^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$"
            defaultValue={provider?.slug ?? ""}
            onChange={(event) => {
              event.currentTarget.value = event.currentTarget.value.toLowerCase();
            }}
            placeholder="exemplo: studio-ana"
            autoComplete="off"
            aria-describedby="provider-slug-help"
          />
        </div>
        <span id="provider-slug-help" className="muted small">
          Use letras minúsculas, números e hífens. Alterar o endereço muda o link público.
        </span>
      </label>

      <label className="field">
        <span>Nome do negócio</span>
        <input
          type="text"
          name="displayName"
          required
          maxLength={80}
          defaultValue={provider?.display_name ?? ""}
        />
      </label>

      <label className="field">
        <span>Fuso horário</span>
        <select name="timezone" defaultValue={provider?.timezone ?? "America/Sao_Paulo"}>
          {timezoneOptions.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replace("_", " ")}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Prazo da reserva temporária (minutos)</span>
        <input
          type="number"
          name="bookingHoldMinutes"
          min={5}
          max={1440}
          required
          defaultValue={provider?.booking_hold_minutes ?? 30}
        />
      </label>

      <label className="checkbox">
        <input
          type="checkbox"
          name="isPublished"
          defaultChecked={provider?.is_published ?? false}
        />
        <span>Página pública visível para agendamentos</span>
      </label>

      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Salvando..." : provider ? "Salvar alterações" : "Criar negócio"}
      </button>
    </form>
  );
}

export function ServicesManager({ services }: { services: Service[] }) {
  const [state, action, pending] = useActionState(saveServiceAction, {});
  const [editing, setEditing] = useState<Service | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <section className="card">
      <div className="card-heading">
        <h2>Serviços</h2>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setEditing(null);
            setOpen((value) => !value);
          }}
        >
          {open && !editing ? "Fechar" : "Novo serviço"}
        </button>
      </div>

      {services.length === 0 ? (
        <p className="muted">Nenhum serviço cadastrado.</p>
      ) : (
        <ul className="item-list">
          {services.map((service) => (
            <li key={service.id} className="item-row">
              <div>
                <strong>{service.name}</strong>
                <span className="muted small">
                  {service.duration_minutes} min · {formatCents(service.price_cents)}{" "}
                  · sinal {formatCents(service.deposit_cents)} · intervalo{" "}
                  {service.buffer_minutes} min
                </span>
              </div>
              <div className="item-actions">
                <span className={service.is_active ? "tag tag-on" : "tag tag-off"}>
                  {service.is_active ? "Ativo" : "Inativo"}
                </span>
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => {
                    setEditing(service);
                    setOpen(true);
                  }}
                >
                  Editar
                </button>
                <form action={toggleServiceAction}>
                  <input type="hidden" name="serviceId" value={service.id} />
                  <input
                    type="hidden"
                    name="isActive"
                    value={service.is_active ? "false" : "true"}
                  />
                  <button type="submit" className="btn btn-small btn-ghost">
                    {service.is_active ? "Desativar" : "Ativar"}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <form
          key={editing?.id ?? "new"}
          action={action}
          className="form-stack nested-form"
        >
          <h3>{editing ? "Editar serviço" : "Novo serviço"}</h3>
          <Alert state={state} />

          <input type="hidden" name="intent" value={editing ? "update" : "create"} />
          {editing ? <input type="hidden" name="serviceId" value={editing.id} /> : null}

          <label className="field">
            <span>Nome</span>
            <input
              type="text"
              name="name"
              required
              maxLength={120}
              defaultValue={editing?.name ?? ""}
            />
          </label>
          <label className="field">
            <span>Descrição</span>
            <textarea
              name="description"
              maxLength={500}
              rows={2}
              defaultValue={editing?.description ?? ""}
            />
          </label>
          <div className="field-grid">
            <label className="field">
              <span>Duração (min)</span>
              <input
                type="number"
                name="durationMinutes"
                min={5}
                max={1440}
                required
                defaultValue={editing?.duration_minutes ?? 60}
              />
            </label>
            <label className="field">
              <span>Intervalo (min)</span>
              <input
                type="number"
                name="bufferMinutes"
                min={0}
                max={480}
                required
                defaultValue={editing?.buffer_minutes ?? 0}
              />
            </label>
            <label className="field">
              <span>Preço (R$)</span>
              <input
                type="text"
                inputMode="decimal"
                name="price"
                required
                defaultValue={
                  editing ? (editing.price_cents / 100).toFixed(2) : ""
                }
              />
            </label>
            <label className="field">
              <span>Sinal (R$)</span>
              <input
                type="text"
                inputMode="decimal"
                name="deposit"
                required
                defaultValue={
                  editing ? (editing.deposit_cents / 100).toFixed(2) : "0.00"
                }
              />
            </label>
          </div>

          <div>
            <button type="submit" className="btn" disabled={pending}>
              {pending ? "Salvando..." : editing ? "Salvar serviço" : "Adicionar serviço"}
            </button>
            {editing ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setEditing(null);
                  setOpen(false);
                }}
              >
                Cancelar
              </button>
            ) : null}
          </div>
        </form>
      ) : null}
    </section>
  );
}

export function AvailabilityManager({
  rules,
  exceptions,
}: {
  rules: AvailabilityRuleRow[];
  exceptions: AvailabilityExceptionRow[];
}) {
  const [ruleState, ruleAction, rulePending] = useActionState(saveRuleAction, {});
  const [exceptionState, exceptionAction, exceptionPending] = useActionState(
    saveExceptionAction,
    {},
  );
  const [editingRule, setEditingRule] = useState<AvailabilityRuleRow | null>(null);


  return (
    <section className="card">
      <h2>Disponibilidade</h2>

      <div className="card-heading">
        <h3>Expediente semanal</h3>
        {editingRule ? (
          <button type="button" className="btn btn-small btn-ghost" onClick={() => setEditingRule(null)}>
            Cancelar edição
          </button>
        ) : null}
      </div>
      {rules.length === 0 ? (
        <p className="muted">Nenhum período configurado.</p>
      ) : (
        <ul className="item-list">
          {rules.map((rule) => (
            <li key={rule.id} className="item-row">
              <div>
                <strong>{WEEKDAYS[rule.day_of_week] ?? rule.day_of_week}</strong>
                <span className="muted small">
                  {rule.starts_at.slice(0, 5)} às {rule.ends_at.slice(0, 5)}
                  {rule.valid_from || rule.valid_until
                    ? ` · vigência ${rule.valid_from ?? "…"}–${rule.valid_until ?? "…"}`
                    : ""}
                </span>
              </div>
              <div className="item-actions">
                <button type="button" className="btn btn-small" onClick={() => setEditingRule(rule)}>
                  Editar
                </button>
                <form action={deleteRuleAction}>
                  <input type="hidden" name="ruleId" value={rule.id} />
                  <button type="submit" className="btn btn-small btn-ghost">
                    Remover
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        key={editingRule?.id ?? "new-rule"}
        action={ruleAction}
        className="form-stack nested-form"
      >
        <Alert state={ruleState} />
        {editingRule ? <input type="hidden" name="ruleId" value={editingRule.id} /> : null}
        <div className="field-grid">
          <label className="field">
            <span>Dia da semana</span>
            <select name="dayOfWeek" defaultValue={String(editingRule?.day_of_week ?? 2)}>
              {WEEKDAYS.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Início</span>
            <input type="time" name="startsAt" required defaultValue={editingRule?.starts_at.slice(0, 5) ?? "09:00"} />
          </label>
          <label className="field">
            <span>Fim</span>
            <input type="time" name="endsAt" required defaultValue={editingRule?.ends_at.slice(0, 5) ?? "18:00"} />
          </label>
          <label className="field">
            <span>Válido a partir de</span>
            <input type="date" name="validFrom" defaultValue={editingRule?.valid_from ?? ""} />
          </label>
          <label className="field">
            <span>Válido até</span>
            <input type="date" name="validUntil" defaultValue={editingRule?.valid_until ?? ""} />
          </label>
        </div>
        <button type="submit" className="btn" disabled={rulePending}>
          {rulePending ? "Salvando..." : editingRule ? "Salvar alterações" : "Adicionar período"}
        </button>
        {editingRule ? (
          <button type="button" className="btn btn-ghost" onClick={() => setEditingRule(null)}>
            Cancelar
          </button>
        ) : null}
      </form>

      <h3>Exceções e bloqueios</h3>
      {exceptions.length === 0 ? (
        <p className="muted">Nenhuma exceção.</p>
      ) : (
        <ul className="item-list">
          {exceptions.map((exception) => (
            <li key={exception.id} className="item-row">
              <div>
                <strong>
                  {exception.kind === "blocked" ? "Bloqueio" : "Horário especial"}
                </strong>
                <span className="muted small">
                  {exception.exception_date}
                  {exception.starts_at
                    ? ` · ${exception.starts_at.slice(0, 5)} às ${exception.ends_at?.slice(0, 5)}`
                    : ""}
                  {exception.note ? ` · ${exception.note}` : ""}
                </span>
              </div>
              <form action={deleteExceptionAction}>
                <input type="hidden" name="exceptionId" value={exception.id} />
                <button type="submit" className="btn btn-small btn-ghost">
                  Remover
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={exceptionAction} className="form-stack nested-form">
        <Alert state={exceptionState} />
        <div className="field-grid">
          <label className="field">
            <span>Data</span>
            <input type="date" name="date" required />
          </label>
          <label className="field">
            <span>Tipo</span>
            <select name="kind" defaultValue="blocked">
              <option value="blocked">Bloqueio do dia</option>
              <option value="custom_hours">Horário especial</option>
            </select>
          </label>
          <label className="field">
            <span>Início</span>
            <input type="time" name="startsAt" />
          </label>
          <label className="field">
            <span>Fim</span>
            <input type="time" name="endsAt" />
          </label>
          <label className="field">
            <span>Observação</span>
            <input type="text" name="note" maxLength={200} />
          </label>
        </div>
        <button type="submit" className="btn" disabled={exceptionPending}>
          {exceptionPending ? "Salvando..." : "Adicionar exceção"}
        </button>
      </form>
    </section>
  );
}


type ProviderPanelMenuProps = {
  provider: Provider;
  services: Service[];
  rules: AvailabilityRuleRow[];
  exceptions: AvailabilityExceptionRow[];
  unreadCount: number;
  bookingsContent: ReactNode;
};

export function ProviderPanelMenu({
  provider,
  services,
  rules,
  exceptions,
  unreadCount,
  bookingsContent,
}: ProviderPanelMenuProps) {
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuItems = [
    { id: "business", label: "Dados do negócio", description: "Informações e página pública" },
    { id: "services", label: "Serviços", description: "Preços, duração e cadastro" },
    { id: "availability", label: "Horários de atendimento", description: "Expediente e exceções" },
  ];

  return (
    <section className="provider-tools">
      <div className="provider-tools-bar">
        <div>
          <span className="eyebrow">GERENCIAR</span>
          <h2>{activeSection ? menuItems.find((item) => item.id === activeSection)?.label : "Menu do painel"}</h2>
        </div>
        <button type="button" className="btn btn-ghost provider-menu-trigger"
          aria-expanded={menuOpen} aria-controls="provider-panel-menu"
          onClick={() => setMenuOpen((open) => !open)}>
          <span aria-hidden="true">☰</span> Menu
        </button>
      </div>
      {menuOpen ? (
        <nav id="provider-panel-menu" className="provider-menu card" aria-label="Menu do painel">
          {menuItems.map((item) => (
            <button key={item.id} type="button" className="provider-menu-item"
              onClick={() => { setActiveSection(item.id); setMenuOpen(false); }}>
              <span><strong>{item.label}</strong><small>{item.description}</small></span>
              <span aria-hidden="true">→</span>
            </button>
          ))}
          <Link className="provider-menu-item" href={`/p/${provider.slug}`} target="_blank">
            <span><strong>Visualizar página pública</strong><small>Ver como seus clientes enxergam sua página</small></span><span aria-hidden="true">↗</span>
          </Link>
          <Link className="provider-menu-item" href="/perfil?next=%2Fpainel">
            <span><strong>Meu perfil</strong><small>Foto, nome, e-mail e telefone</small></span><span aria-hidden="true">→</span>
          </Link>
          <Link className="provider-menu-item" href="/notificacoes">
            <span><strong>Notificações</strong><small>{unreadCount ? `${unreadCount} não lida(s)` : "Suas atualizações"}</small></span><span aria-hidden="true">→</span>
          </Link>
          <form action={logoutAction} className="provider-menu-logout">
            <button type="submit" className="btn btn-ghost">Sair da conta</button>
          </form>
        </nav>
      ) : null}
      {activeSection === null ? bookingsContent : null}
      {activeSection ? (
        <div className="provider-tool-content">
          <button type="button" className="btn btn-small btn-ghost"
            onClick={() => setActiveSection(null)}>← Voltar aos agendamentos</button>
          {activeSection === "business" ? <ProviderForm provider={provider} /> : null}
          {activeSection === "services" ? <ServicesManager services={services} /> : null}
          {activeSection === "availability" ? <AvailabilityManager rules={rules} exceptions={exceptions} /> : null}
        </div>
      ) : null}
    </section>
  );
}
