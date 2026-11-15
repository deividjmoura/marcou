"use client";

import { useMemo, useState } from "react";
import styles from "./booking-preview.module.css";

type Service = {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: number;
  image: string;
  imageAlt: string;
};

const services: Service[] = [
  { id: "manicure", name: "Manicure", description: "Cuidado e esmaltação das unhas.", duration: 45, price: 45, image: "https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=480&q=85", imageAlt: "Unhas cuidadas com esmalte em tom rosado" },
  { id: "pedicure", name: "Pedicure", description: "Um cuidado especial para os pés.", duration: 45, price: 40, image: "https://images.unsplash.com/photo-1519014816548-bf5fe059798b?auto=format&fit=crop&w=480&q=85", imageAlt: "Atendimento profissional de cuidado das unhas" },
  { id: "eyebrows", name: "Design de sobrancelhas", description: "Design pensado para valorizar seu olhar.", duration: 30, price: 35, image: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=480&q=85", imageAlt: "Detalhes de maquiagem e beleza" },
];

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const demoTimes = ["08:00", "08:45", "09:30", "10:15", "11:00", "13:30", "14:15", "15:00", "15:45", "16:30"];

function formatDuration(minutes: number) {
  if (minutes < 60) return minutes + " min";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? hours + "h" : hours + "h " + rest + "min";
}

function dateKey(date: Date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

export default function BookingPreviewPage() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [step, setStep] = useState<"services" | "calendar">("services");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [notice, setNotice] = useState("");

  const selectedServices = useMemo(() => services.filter((service) => selectedIds.includes(service.id)), [selectedIds]);
  const totalPrice = selectedServices.reduce((total, service) => total + service.price, 0);
  const totalDuration = selectedServices.reduce((total, service) => total + service.duration, 0);
  const dates = useMemo(() => Array.from({ length: 14 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + index + 1);
    return date;
  }), []);
  const monthLabel = dates.length ? new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(dates.find((date) => dateKey(date) === selectedDate) || dates[0]) : "";

  function toggleService(id: string) {
    setNotice("");
    setSelectedIds((current) => current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]);
  }

  function continueToCalendar() {
    if (selectedServices.length === 0) return;
    setNotice("");
    setStep("calendar");
  }

  function backToServices() {
    setStep("services");
    setSelectedTime("");
    setNotice("");
  }

  function chooseDate(date: Date) {
    setSelectedDate(dateKey(date));
    setSelectedTime("");
    setNotice("");
  }

  return (
    <main className={styles.page}>
      <div className={styles.pageInner}>
        <header className={styles.header}>
          <a className={styles.brand} href="/" aria-label="Marcou, início">marcou<span>.</span></a>
          <span className={styles.secureLabel}><span aria-hidden="true">✦</span> Agendamento online</span>
        </header>

        <section className={styles.business} aria-label="Estabelecimento">
          <div className={styles.avatar} aria-hidden="true">S</div>
          <div className={styles.businessInfo}>
            <span className={styles.overline}>ESPAÇO DE BELEZA</span>
            <h1>Studio Exemplo</h1>
            <p>Beleza e cuidado em cada detalhe</p>
          </div>
          <span className={styles.previewTag}>Prévia</span>
        </section>

        <div className={styles.progress} aria-label="Etapas do agendamento">
          <span className={step === "services" ? styles.progressActive : styles.progressDone}>1 <span>Serviços</span></span>
          <i className={step === "calendar" ? styles.progressLineActive : ""} />
          <span className={step === "calendar" ? styles.progressActive : styles.progressPending}>2 <span>Data e horário</span></span>
        </div>

        {step === "services" ? (
          <section className={styles.stepPanel} key="services">
            <div className={styles.intro}>
              <p className={styles.eyebrow}>VAMOS AGENDAR?</p>
              <h2>Seu momento começa aqui.</h2>
              <p className={styles.introText}>Escolha um ou mais serviços para montar seu agendamento.</p>
            </div>
            <section className={styles.catalog} aria-labelledby="services-title">
              <div className={styles.catalogHeading}>
                <div><h3 id="services-title">Nossos serviços</h3><p>Toque nos serviços que deseja realizar.</p></div>
                <span className={styles.selectionCount}>{selectedIds.length} selecionado{selectedIds.length === 1 ? "" : "s"}</span>
              </div>
              <div className={styles.serviceList}>
                {services.map((service) => {
                  const selected = selectedIds.includes(service.id);
                  return (
                    <button className={styles.serviceCard + " " + (selected ? styles.serviceSelected : "")} type="button" key={service.id} aria-pressed={selected} onClick={() => toggleService(service.id)}>
                      <img className={styles.serviceImage} src={service.image} alt={service.imageAlt} loading="lazy" />
                      <span className={styles.serviceContent}>
                        <span className={styles.serviceName}>{service.name}</span>
                        <span className={styles.serviceDescription}>{service.description}</span>
                        <span className={styles.serviceMeta}>{formatDuration(service.duration)}</span>
                        <strong className={styles.servicePrice}>{currency.format(service.price)}</strong>
                      </span>
                      <span className={styles.checkmark + " " + (selected ? styles.checkmarkSelected : "")} aria-hidden="true">{selected ? "✓" : "+"}</span>
                    </button>
                  );
                })}
              </div>
              <p className={styles.demoNote}>Serviços, imagens e valores ilustrativos desta prévia.</p>
            </section>
          </section>
        ) : (
          <section className={styles.stepPanel} key="calendar">
            <button type="button" className={styles.backButton} onClick={backToServices}>← Voltar aos serviços</button>
            <div className={styles.intro + " " + styles.calendarIntro}>
              <p className={styles.eyebrow}>ESCOLHA SEU HORÁRIO</p>
              <h2>Um momento só seu.</h2>
              <p className={styles.introText}>Selecione o melhor dia e veja os horários disponíveis.</p>
            </div>

            <section className={styles.calendarCard} aria-label="Escolha da data">
              <div className={styles.monthHeading}>
                <div><span className={styles.calendarCaption}>AGENDA</span><h3>{monthLabel}</h3></div>
                <span className={styles.daysHint}>Próximos 14 dias</span>
              </div>
              <div className={styles.dateScroller}>
                {dates.map((date) => {
                  const active = selectedDate === dateKey(date);
                  return (
                    <button type="button" key={dateKey(date)} className={styles.dateTile + " " + (active ? styles.dateTileActive : "")} aria-pressed={active} onClick={() => chooseDate(date)}>
                      <span>{new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date).replace(".", "")}</span>
                      <strong>{date.getDate()}</strong>
                      <i />
                    </button>
                  );
                })}
              </div>
              <p className={styles.dateHelp}>Deslize para ver os próximos dias.</p>
            </section>

            <section className={styles.timeSection} aria-label="Horários">
              <div className={styles.timeHeading}><div><h3>Horários</h3><p>{selectedDate ? new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(selectedDate + "T12:00:00")) : "Escolha uma data para continuar"}</p></div><span className={styles.durationPill}>{formatDuration(totalDuration)}</span></div>
              {!selectedDate ? (
                <div className={styles.emptyState}><span>✦</span><strong>Primeiro, escolha um dia</strong><p>Os horários serão exibidos aqui.</p></div>
              ) : (
                <div className={styles.timeGrid}>
                  {demoTimes.map((time, index) => {
                    const unavailable = [2, 5, 8].includes(index);
                    const active = selectedTime === time;
                    return <button type="button" key={time} disabled={unavailable} aria-pressed={active} className={styles.timeSlot + " " + (active ? styles.timeSlotActive : "")} onClick={() => { setSelectedTime(time); setNotice(""); }}>{time}</button>;
                  })}
                </div>
              )}
              <div className={styles.legend}><span><i /> Disponível</span><span><i /> Ocupado</span><span><i /> Selecionado</span></div>
            </section>
            <p className={styles.demoNote}>Calendário e horários demonstrativos. A disponibilidade real será calculada com a agenda do profissional.</p>
          </section>
        )}
      </div>

      <aside className={styles.summary} aria-live="polite">
        <div className={styles.summaryInner}>
          <div className={styles.summaryDetails}>
            <div className={styles.summaryTopline}>
              <span>{selectedServices.length === 0 ? "Nenhum serviço selecionado" : selectedServices.length + " serviço" + (selectedServices.length === 1 ? "" : "s") + " selecionado" + (selectedServices.length === 1 ? "" : "s")}</span>
              {step === "services" && selectedServices.length > 0 && <button className={styles.clearButton} type="button" onClick={() => { setSelectedIds([]); setNotice(""); }}>Limpar</button>}
            </div>
            <div className={styles.summaryNumbers}><strong>{currency.format(totalPrice)}</strong><span>{step === "calendar" && selectedTime ? "Horário escolhido: " + selectedTime : "Tempo estimado: " + formatDuration(totalDuration)}</span></div>
          </div>
          {step === "services" ? (
            <button className={styles.continueButton} type="button" disabled={selectedServices.length === 0} onClick={continueToCalendar}>Escolher horário <span aria-hidden="true">→</span></button>
          ) : (
            <button className={styles.continueButton} type="button" disabled={!selectedDate || !selectedTime} onClick={() => setNotice("Dia e horário selecionados nesta prévia. A confirmação será habilitada quando a disponibilidade real estiver conectada.")}>Continuar <span aria-hidden="true">→</span></button>
          )}
          {notice && <p className={styles.notice}>{notice}</p>}
        </div>
      </aside>
    </main>
  );
}
