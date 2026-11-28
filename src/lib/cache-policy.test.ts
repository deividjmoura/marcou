import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import {
  applyCacheHeaders,
  hasSupabaseAuthCookie,
  isPrivatePath,
  PRIVATE_NO_STORE_HEADER,
  PRIVATE_ROUTE_PREFIXES,
  PUBLIC_DYNAMIC_CACHE_HEADER,
  PUBLIC_STATIC_CACHE_HEADER,
  resolveCachePolicy,
} from "./cache-policy";

describe("cache-policy", () => {
  it("classifies all authenticated, auth callback and API routes as private no-store", () => {
    const privatePaths = [
      "/inicio",
      "/minha-conta",
      "/painel",
      "/painel/integracoes/calendario",
      "/perfil",
      "/meus-agendamentos",
      "/notificacoes",
      "/reserva/123",
      "/consentimento",
      "/redefinir-senha",
      "/auth/callback",
      "/auth/confirm",
      "/api/health",
      "/api/cron",
      "/api/calendar/status",
    ];

    for (const path of privatePaths) {
      expect(isPrivatePath(path)).toBe(true);
      const policy = resolveCachePolicy(path);
      expect(policy.kind).toBe("private");
      expect(policy.noStore).toBe(true);
      expect(policy.cacheControl).toBe(PRIVATE_NO_STORE_HEADER);
    }
  });

  it("does not misclassify public sibling paths that merely share a prefix string", () => {
    expect(isPrivatePath("/p/painel-studio")).toBe(false);
    expect(isPrivatePath("/inicio-publico")).toBe(false);
  });

  it("applies explicit cache policy to anonymous public static and dynamic pages", () => {
    for (const staticPath of [
      "/",
      "/documentos",
      "/termos",
      "/privacidade",
      "/diretrizes-da-comunidade",
      "/politica-de-conteudo-e-avaliacoes",
    ]) {
      const policy = resolveCachePolicy(staticPath);
      expect(policy.kind).toBe("public_static");
      expect(policy.noStore).toBe(false);
      expect(policy.cacheControl).toBe(PUBLIC_STATIC_CACHE_HEADER);
    }

    for (const dynamicPublicPath of [
      "/p/barbearia-centro",
      "/login",
      "/cadastro",
      "/esqueci-senha",
    ]) {
      const policy = resolveCachePolicy(dynamicPublicPath);
      expect(policy.kind).toBe("public_dynamic");
      expect(policy.noStore).toBe(false);
      expect(policy.cacheControl).toBe(PUBLIC_DYNAMIC_CACHE_HEADER);
    }
  });

  it("downgrades public routes to private no-store whenever auth cookies or Set-Cookie are present", () => {
    expect(resolveCachePolicy("/", { hasAuthCookie: true }).cacheControl).toBe(
      PRIVATE_NO_STORE_HEADER,
    );
    expect(
      resolveCachePolicy("/p/barbearia", { hasSetCookie: true }).cacheControl,
    ).toBe(PRIVATE_NO_STORE_HEADER);

    expect(
      hasSupabaseAuthCookie([{ name: "sb-peornypgltuueubmsucm-auth-token" }]),
    ).toBe(true);
    expect(
      hasSupabaseAuthCookie([{ name: "sb-abc123-auth-token.0" }]),
    ).toBe(true);
    expect(hasSupabaseAuthCookie([{ name: "theme" }])).toBe(false);
  });

  it("preserves existing no-store headers and sets Vary: Cookie on public responses", () => {
    const alreadyPrivate = new Response("ok", {
      headers: { "Cache-Control": "private, no-store" },
    });
    applyCacheHeaders(alreadyPrivate, "/");
    expect(alreadyPrivate.headers.get("cache-control")).toBe("private, no-store");

    const anonPublic = new Response("ok");
    applyCacheHeaders(anonPublic, "/");
    expect(anonPublic.headers.get("cache-control")).toBe(
      PUBLIC_STATIC_CACHE_HEADER,
    );
    expect(anonPublic.headers.get("vary")).toBe("Cookie");

    const privateRes = new Response("ok");
    applyCacheHeaders(privateRes, "/painel");
    expect(privateRes.headers.get("cache-control")).toBe(
      PRIVATE_NO_STORE_HEADER,
    );
    expect(privateRes.headers.get("pragma")).toBe("no-cache");
    expect(privateRes.headers.get("expires")).toBe("0");
  });

  it("configures defense-in-depth private no-store headers in next.config.ts for every private prefix", async () => {
    expect(typeof nextConfig.headers).toBe("function");
    const rules = await nextConfig.headers!();
    const sources = new Set(rules.map((rule) => rule.source));

    for (const prefix of PRIVATE_ROUTE_PREFIXES) {
      expect(sources.has(prefix)).toBe(true);
      expect(sources.has(`${prefix}/:path*`)).toBe(true);
    }

    for (const rule of rules) {
      const cacheControl = rule.headers.find(
        (h) => h.key.toLowerCase() === "cache-control",
      )?.value;
      expect(cacheControl).toBe(PRIVATE_NO_STORE_HEADER);
    }
  });
});
