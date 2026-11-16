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
        <span>Frase de impacto (opcional)</span>
        <textarea
          name="description"
          rows={3}
          maxLength={180}
          defaultValue={provider?.description ?? ""}
          placeholder="Ex.: Realçando sua beleza com cuidado e dedicação."
        />
        <span className="muted small">
          Uma frase curta para apresentar seu negócio na página de agendamento.
        </span>
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

const PANEL_MENU_ITEMS = [
  { id: "bookings", label: "Agendamentos", description: "Sua agenda e reservas", icon: "ic-agenda" },
  { id: "business", label: "Meu negócio", description: "Informações e página pública", icon: "ic-local" },
  { id: "services", label: "Serviços", description: "Preços, duração e cadastro", icon: "ic-sacola" },
  { id: "availability", label: "Horários", description: "Expediente e exceções", icon: "ic-horario" },
] as const;

export function ProviderPanelMenu({
  provider,
  services,
  rules,
  exceptions,
  unreadCount,
  bookingsContent,
}: ProviderPanelMenuProps) {
  const [activeSection, setActiveSection] = useState<string>("bookings");
  const activeItem = PANEL_MENU_ITEMS.find((item) => item.id === activeSection) ?? PANEL_MENU_ITEMS[0];

  function renderSection() {
    if (activeSection === "business") return <ProviderForm provider={provider} />;
    if (activeSection === "services") return <ServicesManager services={services} />;
    if (activeSection === "availability") return <AvailabilityManager rules={rules} exceptions={exceptions} />;
    return bookingsContent;
  }

  return (
    <section className="provider-dashboard">
      <aside className="provider-sidebar" aria-label="Navegação do painel">
        <div className="provider-sidebar-brand">
          <span className="provider-sidebar-mark" aria-hidden="true">m.</span>
          <span><strong>Marcou</strong><small>PAINEL DO PRESTADOR</small></span>
        </div>

        <nav className="provider-sidebar-nav" aria-label="Seções do painel">
          <span className="provider-nav-caption">MENU PRINCIPAL</span>
          {PANEL_MENU_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`provider-nav-item ${activeSection === item.id ? "is-active" : ""}`}
              aria-current={activeSection === item.id ? "page" : undefined}
              onClick={() => setActiveSection(item.id)}
            >
              <svg className="provider-nav-icon" aria-hidden="true" viewBox="0 0 48 48">
                <use href={`/icons/navigation/sprite.svg#${item.icon}`} />
              </svg>
              <span><strong>{item.label}</strong><small>{item.description}</small></span>
            </button>
          ))}
        </nav>

        <div className="provider-sidebar-bottom">
          <Link className="provider-utility-link" href={`/p/${provider.slug}`} target="_blank">
            <span className="provider-utility-icon" aria-hidden="true">↗</span>
            <span><strong>Ver página pública</strong><small>Como seus clientes veem</small></span>
          </Link>
          <Link className="provider-utility-link" href="/perfil?next=%2Fpainel">
            <svg className="provider-nav-icon" aria-hidden="true" viewBox="0 0 48 48"><use href="/icons/navigation/sprite.svg#ic-perfil" /></svg>
            <span><strong>Meu perfil</strong><small>Dados da sua conta</small></span>
          </Link>
          <Link className="provider-utility-link" href="/notificacoes">
            <svg className="provider-nav-icon" aria-hidden="true" viewBox="0 0 48 48"><use href="/icons/navigation/sprite.svg#ic-notificacoes" /></svg>
            <span><strong>Notificações</strong><small>{unreadCount ? `${unreadCount} não lida(s)` : "Suas atualizações"}</small></span>
            {unreadCount > 0 ? <span className="provider-notification-count">{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
          </Link>
          <form action={logoutAction} className="provider-sidebar-logout">
            <button type="submit" className="provider-logout-button">Sair da conta <span aria-hidden="true">↗</span></button>
          </form>
        </div>
      </aside>

      <div className="provider-dashboard-main">
        <header className="provider-dashboard-heading">
          <div>
            <span className="eyebrow">SEU ESPAÇO DE TRABALHO</span>
            <h2>{activeItem.label}</h2>
            <p>{activeItem.description}</p>
          </div>
          <Link className="provider-public-shortcut" href={`/p/${provider.slug}`} target="_blank">
            Visualizar página <span aria-hidden="true">↗</span>
          </Link>
        </header>
        <div className="provider-dashboard-content" key={activeSection}>
          {renderSection()}
        </div>
      </div>

      <nav className="provider-mobile-nav" aria-label="Navegação principal">
        {PANEL_MENU_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`provider-mobile-nav-item ${activeSection === item.id ? "is-active" : ""}`}
            aria-current={activeSection === item.id ? "page" : undefined}
            onClick={() => setActiveSection(item.id)}
          >
            <svg aria-hidden="true" viewBox="0 0 48 48"><use href={`/icons/navigation/sprite.svg#${item.icon}`} /></svg>
            <span>{item.id === "availability" ? "Horários" : item.id === "business" ? "Negócio" : item.label}</span>
          </button>
        ))}
      </nav>
    </section>
  );
}
