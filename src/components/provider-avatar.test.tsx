import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProviderAvatar } from "./provider-avatar";

describe("ProviderAvatar", () => {
  it("renderiza a foto com texto alternativo contextual", () => {
    const html = renderToStaticMarkup(
      <ProviderAvatar src="https://cdn.example.test/avatar.jpg" name="Ana Silva" />,
    );

    expect(html).toContain('src="https://cdn.example.test/avatar.jpg"');
    expect(html).toContain('alt="Ana Silva — foto do profissional"');
  });

  it("renderiza iniciais como fallback acessível quando não há foto", () => {
    const html = renderToStaticMarkup(<ProviderAvatar name="Ana Silva" />);

    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Ana Silva — foto do profissional não cadastrada"');
    expect(html).toContain(">AS</span>");
  });

  it("usa ícone fallback para nome vazio", () => {
    const html = renderToStaticMarkup(<ProviderAvatar name=" " />);

    expect(html).toContain(">✦</span>");
  });
});
