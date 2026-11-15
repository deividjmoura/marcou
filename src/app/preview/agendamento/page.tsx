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
  {
    id: "manicure",
    name: "Manicure",
    description: "Cuidado e esmaltação das unhas.",
    duration: 45,
    price: 45,
    image:
      "https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=480&q=85",
    imageAlt: "Unhas cuidadas com esmalte em tom rosado",
  },
  {
    id: "pedicure",
    name: "Pedicure",
    description: "Um cuidado especial para os pés.",
    duration: 45,
    price: 40,
    image:
      "https://images.unsplash.com/photo-1519014816548-bf5fe059798b?auto=format&fit=crop&w=480&q=85",
    imageAlt: "Atendimento profissional de cuidado das unhas",
  },
  {
    id: "eyebrows",
    name: "Design de sobrancelhas",
    description: "Design pensado para valorizar seu olhar.",
    duration: 30,
    price: 35,
    image:
      "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=480&q=85",
    imageAlt: "Detalhes de maquiagem e beleza",
  },
];

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}min`;
}

export default function BookingPreviewPage() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");

  const selectedServices = useMemo(
    () => services.filter((service) => selectedIds.includes(service.id)),
    [selectedIds],
  );

  const totalPrice = selectedServices.reduce(
    (total, service) => total + service.price,
    0,
  );
  const totalDuration = selectedServices.reduce(
    (total, service) => total + service.duration,
    0,
  );

  function toggleService(id: string) {
    setNotice("");
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.pageInner}>
        <header className={styles.header}>
          <a className={styles.brand} href="/" aria-label="Marcou, início">
            marcou<span>.</span>
          </a>
          <span className={styles.secureLabel}>
            <span aria-hidden="true">✦</span> Agendamento online
          </span>
        </header>

        <section className={styles.business} aria-label="Estabelecimento">
          <div className={styles.avatar} aria-hidden="true">
            S
          </div>
          <div className={styles.businessInfo}>
            <span className={styles.overline}>ESPAÇO DE BELEZA</span>
            <h1>Studio Exemplo</h1>
            <p>Beleza e cuidado em cada detalhe</p>
          </div>
          <span className={styles.previewTag}>Prévia</span>
        </section>

        <section className={styles.intro}>
          <p className={styles.eyebrow}>VAMOS AGENDAR?</p>
          <h2>Seu momento começa aqui.</h2>
          <p className={styles.introText}>
            Escolha um ou mais serviços para montar seu agendamento.
          </p>
        </section>

        <section className={styles.catalog} aria-labelledby="services-title">
          <div className={styles.catalogHeading}>
            <div>
              <h3 id="services-title">Nossos serviços</h3>
              <p>Toque nos serviços que deseja realizar.</p>
            </div>
            <span className={styles.selectionCount}>
              {selectedIds.length} selecionado{selectedIds.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className={styles.serviceList}>
            {services.map((service) => {
              const selected = selectedIds.includes(service.id);
              return (
                <button
                  className={`${styles.serviceCard} ${selected ? styles.serviceSelected : ""}`}
                  type="button"
                  key={service.id}
                  aria-pressed={selected}
                  onClick={() => toggleService(service.id)}
                >
                  <img
                    className={styles.serviceImage}
                    src={service.image}
                    alt={service.imageAlt}
                    loading="lazy"
                  />
                  <span className={styles.serviceContent}>
                    <span className={styles.serviceName}>{service.name}</span>
                    <span className={styles.serviceDescription}>
                      {service.description}
                    </span>
                    <span className={styles.serviceMeta}>
                      {formatDuration(service.duration)}
                    </span>
                    <strong className={styles.servicePrice}>
                      {currency.format(service.price)}
                    </strong>
                  </span>
                  <span
                    className={`${styles.checkmark} ${selected ? styles.checkmarkSelected : ""}`}
                    aria-hidden="true"
                  >
                    {selected ? "✓" : "+"}
                  </span>
                </button>
              );
            })}
          </div>
          <p className={styles.demoNote}>
            Serviços, imagens e valores ilustrativos desta prévia.
          </p>
        </section>
      </div>

      <aside className={styles.summary} aria-live="polite">
        <div className={styles.summaryInner}>
          <div className={styles.summaryDetails}>
            <div className={styles.summaryTopline}>
              <span>
                {selectedServices.length === 0
                  ? "Nenhum serviço selecionado"
                  : `${selectedServices.length} serviço${selectedServices.length === 1 ? "" : "s"} selecionado${selectedServices.length === 1 ? "" : "s"}`}
              </span>
              {selectedServices.length > 0 && (
                <button
                  className={styles.clearButton}
                  type="button"
                  onClick={() => {
                    setSelectedIds([]);
                    setNotice("");
                  }}
                >
                  Limpar
                </button>
              )}
            </div>
            <div className={styles.summaryNumbers}>
              <strong>{currency.format(totalPrice)}</strong>
              <span>
                {selectedServices.length > 0
                  ? `Tempo estimado: ${formatDuration(totalDuration)}`
                  : "Selecione os serviços para continuar"}
              </span>
            </div>
          </div>
          <button
            className={styles.continueButton}
            type="button"
            disabled={selectedServices.length === 0}
            onClick={() =>
              setNotice(
                "Seleção concluída nesta prévia. A próxima etapa será conectada à disponibilidade real do profissional.",
              )
            }
          >
            Continuar
            <span aria-hidden="true">→</span>
          </button>
          {notice && <p className={styles.notice}>{notice}</p>}
        </div>
      </aside>
    </main>
  );
}
