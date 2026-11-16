import Link from "next/link";

const steps = [
  { number: "01", title: "Apresente seus serviços", description: "Organize serviços, duração e valores em um catálogo simples." },
  { number: "02", title: "Compartilhe seus horários", description: "Deixe seus clientes encontrarem os horários disponíveis." },
  { number: "03", title: "Cuide da sua agenda", description: "Acompanhe solicitações e confirmações em um só lugar." },
];

export default function Home() {
  return (
    <main className="page-shell">
      <nav className="topbar" aria-label="Navegação principal">
        <Link className="brand brand-logo" href="/" aria-label="Marcou, início"><img src="/branding/marcou-logo.svg" alt="Marcou." /></Link>
        <div className="topbar-actions">
          <Link href="/login">Entrar</Link>
          <Link href="/cadastro" className="btn btn-small">Criar conta</Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">SUA AGENDA, NO SEU RITMO</span>
          <h1>Menos tempo<br />organizando.<br /><span>Mais tempo atendendo.</span></h1>
          <p>
            O Marcou está sendo preparado para ajudar prestadores de serviço a
            organizar horários e facilitar a vida de quem precisa marcar.
          </p>
        </div>

        <div className="hero-card" aria-label="Prévia ilustrativa da agenda">
          <div className="card-heading">
            <div><span className="muted-label">VISÃO DA AGENDA</span><h2>Seu dia, mais claro.</h2></div>
            <span className="calendar-mark" aria-hidden="true">M</span>
          </div>
          <div className="calendar-date"><span>TERÇA-FEIRA</span><strong>Uma agenda que trabalha com você.</strong></div>
          <div className="schedule-line"><span>09:00</span><div className="schedule-event"><strong>Seu primeiro horário</strong><small>Serviço e cliente</small></div></div>
          <div className="schedule-line"><span>10:30</span><div className="schedule-event event-soft"><strong>Próximo atendimento</strong><small>Horário organizado</small></div></div>
          <div className="schedule-line"><span>13:00</span><div className="schedule-open">Espaço para você respirar</div></div>
          <p className="card-footnote">Prévia conceitual · dados fictícios</p>
        </div>
      </section>

      <section className="steps" aria-labelledby="steps-title">
        <div className="section-heading"><span className="eyebrow">SIMPLES DESDE O COMEÇO</span><h2 id="steps-title">Uma rotina mais organizada.</h2></div>
        <div className="steps-grid">
          {steps.map((step) => <article className="step" key={step.number}><h3>{step.title}</h3><p>{step.description}</p></article>)}
        </div>
      </section>

      <footer className="footer">
        <Link className="brand brand-logo" href="/" aria-label="Marcou, início"><img src="/branding/marcou-logo.svg" alt="Marcou." /></Link>
        <p>Feito para deixar os encontros mais simples.</p>
      </footer>
    </main>
  );
}
