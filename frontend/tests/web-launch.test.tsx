// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { metadata } from "../app/layout";
import robots from "../app/robots";
import sitemap from "../app/sitemap";
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

describe("web launch surfaces", () => {
  it("exposes launch metadata with Open Graph and canonical data", () => {
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
      url: "http://localhost:3000/opengraph-image",
    });
    expect(metadata.alternates?.canonical).toBe("/");
  });

  it("publishes robots rules for public and private surfaces", () => {
    const result = robots();
    expect(result.sitemap).toBe("http://localhost:3000/sitemap.xml");
    expect(result.rules).toEqual([
      {
        allow: ["/", "/privacy", "/terms"],
        disallow: ["/admin/", "/api/", "/auth/", "/docs", "/logos/", "/m/", "/openapi.json", "/r/"],
        userAgent: "*",
      },
    ]);
  });

  it("publishes a sitemap with the public routes only", () => {
    expect(sitemap().map((entry) => entry.url)).toEqual([
      "http://localhost:3000/",
      "http://localhost:3000/privacy",
      "http://localhost:3000/terms",
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
