// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "../components/auth/LoginForm";
import { AppearanceProvider } from "../components/ui/AppearanceProvider";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("@/lib/api");
  return {
    ...actual,
    login: vi.fn(),
  };
});

function stubMatchMedia(matches = false) {
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    matches,
    media: "(prefers-color-scheme: dark)",
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  })));
}

async function loadWebModules() {
  vi.resetModules();
  const [{ metadata }, { default: robots }, { default: sitemap }] = await Promise.all([
    import("../app/layout"),
    import("../app/robots"),
    import("../app/sitemap"),
  ]);

  return { metadata, robots, sitemap };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("web launch surfaces", () => {
  it("exposes launch metadata with Open Graph and canonical data", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("SITE_URL", "https://menus.nambre.test");
    const { metadata } = await loadWebModules();
    const images = Array.isArray(metadata.openGraph?.images)
      ? metadata.openGraph.images
      : metadata.openGraph?.images
        ? [metadata.openGraph.images]
        : [];

    expect(metadata.title).toMatchObject({
      default: "Nambre | Carta digital y QR para tu negocio",
    });
    expect(metadata.description).toContain("carta digital");
    expect(images[0]).toMatchObject({
      alt: "Identidad visual de Nambre sobre fondo teal",
      url: "https://menus.nambre.test/opengraph-image",
    });
    expect(metadata.alternates?.canonical).toBe("/");
  });

  it("publishes robots rules for public and private surfaces", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("SITE_URL", "https://menus.nambre.test");
    const { robots } = await loadWebModules();
    const result = robots();
    expect(result.sitemap).toBe("https://menus.nambre.test/sitemap.xml");
    expect(result.rules).toEqual([
      {
        allow: ["/", "/privacy", "/terms", "/acceptable-use", "/cookies-analytics", "/ai-policy"],
        disallow: ["/admin/", "/api/", "/auth/", "/docs", "/logos/", "/m/", "/openapi.json", "/r/"],
        userAgent: "*",
      },
    ]);
  });

  it("publishes a sitemap with the public routes only", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("SITE_URL", "https://menus.nambre.test");
    const { sitemap } = await loadWebModules();
    expect(sitemap().map((entry) => entry.url)).toEqual([
      "https://menus.nambre.test/",
      "https://menus.nambre.test/privacy",
      "https://menus.nambre.test/terms",
      "https://menus.nambre.test/acceptable-use",
      "https://menus.nambre.test/cookies-analytics",
      "https://menus.nambre.test/ai-policy",
    ]);
  });

  it("shows public legal links in the login surface", () => {
    stubMatchMedia(false);
    render(
      <AppearanceProvider>
        <LoginForm onToken={vi.fn()} />
      </AppearanceProvider>,
    );

    expect(screen.getByRole("link", { name: "Terminos" }).getAttribute("href")).toBe("/terms");
    expect(screen.getByRole("link", { name: "Privacidad" }).getAttribute("href")).toBe("/privacy");
  });
});
