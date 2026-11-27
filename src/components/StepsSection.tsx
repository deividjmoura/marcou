"use client";

import { useEffect, useRef } from "react";

const steps = [
  { number: "01", title: "Apresente seus serviços", description: "Organize serviços, duração e valores em um catálogo simples." },
  { number: "02", title: "Compartilhe seus horários", description: "Deixe seus clientes encontrarem os horários disponíveis." },
  { number: "03", title: "Cuide da sua agenda", description: "Acompanhe solicitações e confirmações em um só lugar." },
];

export default function StepsSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        section.classList.add("is-visible");
        observer.disconnect();
      }
    }, { threshold: 0.18 });

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="steps" aria-labelledby="steps-title">
      <div className="section-heading"><span className="eyebrow">SIMPLES DESDE O COMEÇO</span><h2 id="steps-title">Uma rotina mais organizada.</h2></div>
      <div className="steps-grid">
        {steps.map((step) => <article className="step" key={step.number}><h3>{step.title}</h3><p>{step.description}</p></article>)}
      </div>
    </section>
  );
}
