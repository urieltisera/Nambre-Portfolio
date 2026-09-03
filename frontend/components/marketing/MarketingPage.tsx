import Link from "next/link";
import React from "react";
import {Button, Container, Display, Eyebrow, Heading, NambreLogo, Text} from "@/design-language/components";
import {HeroBackgroundClient} from "./hero/HeroBackgroundClient";

const navItems = [
  {href: "#valor", label: "Valor"},
  {href: "#como-funciona", label: "Cómo funciona"},
  {href: "#producto", label: "Producto"},
  {href: "#contacto", label: "Contacto"},
  {href: "#faq", label: "FAQ"},
];

const valueCards = [
  {
    title: "Un QR que no se vence",
    body: "Compartí una carta digital estable y actualizá contenido sin reimprimir cada vez que cambia un plato.",
  },
  {
    title: "Control operativo simple",
    body: "Organizá categorías, productos, disponibilidad e imágenes desde una superficie pensada para uso diario.",
  },
  {
    title: "Presencia más profesional",
    body: "Ofrecé una experiencia clara y cuidada para clientes que llegan desde mesa, vidriera o redes.",
  },
];

const steps = [
  "Creás el negocio y cargás la carta.",
  "Nambre genera el QR y la URL pública.",
  "Actualizás precios, fotos y disponibilidad cuando lo necesitás.",
];

const capabilities = [
  "Carta digital pública",
  "QR estándar y con marca",
  "Carga de menú en PDF",
  "Edición de categorías y productos",
  "Estados de disponibilidad",
  "Ajustes visuales de la carta",
];

const faqs = [
  {
    question: "¿Nambre reemplaza mi carta impresa?",
    answer:
      "Puede convivir con la carta física. La ventaja es que el QR permite mantener una versión digital siempre actualizada.",
  },
  {
    question: "¿Necesito cambiar el QR cuando edito la carta?",
    answer:
      "No. La idea es conservar un acceso permanente y modificar el contenido desde el panel cuando haga falta.",
  },
  {
    question: "¿Qué necesito para empezar con Nambre?",
    answer: "Un negocio gastronómico, una carta para cargar y un canal de contacto para coordinar el alta comercial.",
  },
];

export function MarketingPage() {
  return (
    <main className="marketing-shell">
      <MarketingNav />
      <MarketingHero />
      <ValueProposition />
      <HowItWorks />
      <ProductShowcase />
      <Differentiators />
      <PricingTeaser />
      <MarketingFaq />
      <FinalCta />
      <MarketingFooter />
    </main>
  );
}

function MarketingNav() {
  return (
    <header className="marketing-nav">
      <Container className="marketing-nav__inner">
        <Link aria-label="Nambre, inicio" className="marketing-nav__brand" href="/">
          <NambreLogo size="sm" variant="currentColor" />
          <span>Nambre</span>
        </Link>
        <nav aria-label="Secciones de Nambre" className="marketing-nav__links">
          {navItems.map((item) => (
            <Link href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <Link className="marketing-nav__login" href="/login">
          Ingresar
        </Link>
      </Container>
    </header>
  );
}

function MarketingHero() {
  return (
    <section className="marketing-hero">
      <HeroBackgroundClient />
      <Container className="marketing-hero__inner">
        <div className="marketing-hero__copy">
          <Eyebrow>Menú digital y QR profesional</Eyebrow>
          <Display>Nambre convierte tu carta en una experiencia digital lista para cambiar todos los días.</Display>
          <Text size="lg">
            Administrá tu menú, mantené un QR permanente y mostrale a tus clientes una carta clara, moderna y siempre
            actualizada.
          </Text>
          <div className="marketing-hero__actions" aria-label="Acciones principales">
            <Link className="nl-button nl-button--primary nl-button--lg" href="#contacto">
              Empezar con Nambre
            </Link>
            <Link className="nl-button nl-button--ghost nl-button--lg" href="/login">
              Ingresar
            </Link>
          </div>
        </div>
        <div className="marketing-hero__visual" aria-label="Vista previa conceptual de una carta digital" role="img">
          <div className="marketing-orbit" aria-hidden="true" />
          <div className="marketing-device">
            <div className="marketing-device__topline">
              <span>Carta Nambre</span>
              <span>QR activo</span>
            </div>
            <div className="marketing-device__title">Café del Centro</div>
            <div className="marketing-device__category">Especiales de hoy</div>
            <div className="marketing-menu-card">
              <span>Tostado de masa madre</span>
              <strong>$ 7.900</strong>
            </div>
            <div className="marketing-menu-card">
              <span>Limonada fresca</span>
              <strong>$ 3.400</strong>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

function ValueProposition() {
  return (
    <section className="marketing-section" id="valor">
      <Container>
        <div className="marketing-section__header">
          <Eyebrow>Propuesta de valor</Eyebrow>
          <Heading>Menos fricción para vos, mejor primera impresión para tus clientes.</Heading>
        </div>
        <div className="marketing-card-grid">
          {valueCards.map((card) => (
            <article className="marketing-card" key={card.title}>
              <Heading as="h3">{card.title}</Heading>
              <Text>{card.body}</Text>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="marketing-section marketing-section--muted" id="como-funciona">
      <Container className="marketing-split">
        <div className="marketing-section__header">
          <Eyebrow>Cómo funciona</Eyebrow>
          <Heading>Una base simple para operar tu carta digital.</Heading>
          <Text>Publicá tu carta, compartí un QR estable y mantené la información al día con una operación simple.</Text>
        </div>
        <ol className="marketing-steps">
          {steps.map((step, index) => (
            <li key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {step}
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

function ProductShowcase() {
  return (
    <section className="marketing-section" id="producto">
      <Container className="marketing-showcase">
        <div className="marketing-product-panel">
          <div className="marketing-product-panel__bar">
            <span />
            <span />
            <span />
          </div>
          <div className="marketing-product-panel__content">
            <div>
              <Eyebrow>Panel del negocio</Eyebrow>
              <Heading as="h3">Controlá lo que el cliente ve sin cambiar de herramienta.</Heading>
            </div>
            <div className="marketing-product-list">
              <span>Categorías ordenadas</span>
              <span>Productos con precio e imagen</span>
              <span>QR listo para compartir</span>
            </div>
            <div className="marketing-product-panel__actions">
              <Button disabled size="sm" variant="primary">
                Guardado
              </Button>
              <Button disabled size="sm" variant="secondary">
                Vista previa
              </Button>
            </div>
          </div>
        </div>
        <div className="marketing-section__header">
          <Eyebrow>Producto</Eyebrow>
          <Heading>Una vista clara para presentar tu carta con identidad profesional.</Heading>
          <Text>
            Nambre reúne el menú, el QR y la edición diaria en una experiencia simple para tu equipo y tus clientes.
          </Text>
        </div>
      </Container>
    </section>
  );
}

function Differentiators() {
  return (
    <section className="marketing-section marketing-section--muted">
      <Container>
        <div className="marketing-section__header">
          <Eyebrow>Capacidades</Eyebrow>
          <Heading>La capa que necesitás para que la carta deje de ser un archivo estático.</Heading>
        </div>
        <ul className="marketing-capabilities" aria-label="Capacidades de Nambre">
          {capabilities.map((capability) => (
            <li key={capability}>{capability}</li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

function PricingTeaser() {
  return (
    <section className="marketing-section" id="contacto">
      <Container className="marketing-pricing">
        <div>
          <Eyebrow>Contacto comercial</Eyebrow>
          <Heading>Empezá con una carta digital profesional y un alta acompañada por el equipo de Nambre.</Heading>
        </div>
        <Text>
          Coordinamos los próximos pasos para preparar tu QR, cargar la carta y dejar el panel listo para operar.
        </Text>
      </Container>
    </section>
  );
}

function MarketingFaq() {
  return (
    <section className="marketing-section marketing-section--muted" id="faq">
      <Container className="marketing-faq">
        <div className="marketing-section__header">
          <Eyebrow>FAQ</Eyebrow>
          <Heading>Preguntas frecuentes</Heading>
        </div>
        <div className="marketing-faq__items">
          {faqs.map((faq) => (
            <details className="marketing-faq__item" key={faq.question}>
              <summary>{faq.question}</summary>
              <Text>{faq.answer}</Text>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="marketing-final-cta">
      <Container className="marketing-final-cta__inner">
        <NambreLogo size="md" variant="teal" />
        <Heading>Prepará tu carta para cambiar al ritmo de tu negocio.</Heading>
        <Text>Un QR permanente, una carta digital cuidada y un panel simple para mantener todo al día.</Text>
        <Link className="nl-button nl-button--primary nl-button--lg" href="/login">
          Ir a Nambre
        </Link>
      </Container>
    </section>
  );
}

function MarketingFooter() {
  return (
    <footer className="marketing-footer">
      <Container className="marketing-footer__inner">
        <Link aria-label="Nambre, inicio" className="marketing-footer__brand" href="/">
          <NambreLogo size="sm" variant="currentColor" />
          <span>Nambre</span>
        </Link>
        <nav aria-label="Enlaces de Nambre" className="marketing-footer__links">
          <Link href="#contacto">Contacto</Link>
          <Link href="#contacto">Instagram</Link>
          <Link href="#contacto">Teléfono</Link>
          <Link href="/privacy">Privacidad</Link>
          <Link href="/terms">Términos</Link>
          <Link href="/acceptable-use">Uso aceptable</Link>
        </nav>
      </Container>
    </footer>
  );
}
