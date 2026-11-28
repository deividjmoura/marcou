import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BookingWidget } from "./booking-widget";

describe("BookingWidget service images", () => {
  it("renders a public service image with alt text derived from its name", () => {
    const html = renderToStaticMarkup(
      <BookingWidget
        slug="studio-ana"
        timeZone="America/Sao_Paulo"
        services={[{
          id: "service-1",
          name: "Corte feminino",
          description: null,
          imageUrl: "https://storage.example.test/service-images/corte.webp",
          durationMinutes: 45,
          priceCents: 8000,
        }]}
      />,
    );

    expect(html).toContain('src="https://storage.example.test/service-images/corte.webp"');
    expect(html).toContain('alt="Corte feminino — imagem do serviço"');
  });

  it("renders the existing placeholder when a service has no image", () => {
    const html = renderToStaticMarkup(
      <BookingWidget
        slug="studio-ana"
        timeZone="America/Sao_Paulo"
        services={[{
          id: "service-1",
          name: "Corte feminino",
          description: null,
          imageUrl: null,
          durationMinutes: 45,
          priceCents: 8000,
        }]}
      />,
    );

    expect(html).toContain("booking-service-image");
    expect(html).toContain("✦");
    expect(html).not.toContain("<img");
  });
});
