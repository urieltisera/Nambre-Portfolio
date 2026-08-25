// @vitest-environment jsdom

import React from "react";
import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import type {PublicDigitalMenuPage} from "@/lib/api";
import {PublicMenuPage} from "@/components/public-menu/PublicMenuPage";
import {PublicMenuState} from "@/components/public-menu/PublicMenuState";
import {menuThemePresets, nambreDefaultThemeConfig} from "@/components/public-menu/theme";

const scrollIntoView = vi.fn();

class MockIntersectionObserver {
  disconnect() {}

  observe() {}

  unobserve() {}
}

const publicMenuFixture: PublicDigitalMenuPage = {
  business: {
    id: "business-1",
    logo_url: null,
    name: "Cafe Nambre",
  },
  menu: {
    business_id: "business-1",
    created_at: "2026-08-24T10:00:00Z",
    id: "menu-1",
    is_published: true,
    name: "Carta brunch",
    status: "published",
    template_key: "modern",
    theme: {...nambreDefaultThemeConfig},
    updated_at: "2026-08-24T10:00:00Z",
  },
  theme: {...nambreDefaultThemeConfig},
  categories: [
    {
      description: "Jugos y cafetería",
      id: "category-1",
      is_visible: true,
      items: [
        {
          category_id: "category-1",
          currency: "ARS",
          description: "Con menta fresca",
          id: "item-1",
          image_url: "https://example.com/limonada.webp",
          is_available: true,
          is_featured: true,
          is_visible: true,
          name: "Limonada de autor",
          position: 0,
          price: "4200.00",
        },
        {
          category_id: "category-1",
          currency: "ARS",
          description: null,
          id: "item-2",
          image_url: null,
          is_available: false,
          is_featured: false,
          is_visible: true,
          name: "Cold brew",
          position: 1,
          price: "3800.00",
        },
        {
          category_id: "category-1",
          currency: "ARS",
          description: null,
          id: "item-3",
          image_url: null,
          is_available: true,
          is_featured: false,
          is_visible: false,
          name: "No mostrar",
          position: 2,
          price: "1.00",
        },
      ],
      name: "Bebidas",
      position: 0,
    },
    {
      description: "Platos del día",
      id: "category-2",
      is_visible: true,
      items: [
        {
          category_id: "category-2",
          currency: "ARS",
          description: "Con huevos y palta",
          id: "item-4",
          image_url: "https://example.com/tostada.jpg",
          is_available: true,
          is_featured: false,
          is_visible: true,
          name: "Tostada premium",
          position: 0,
          price: "7600.00",
        },
      ],
      name: "Brunch",
      position: 1,
    },
    {
      description: "Nunca debería verse",
      id: "category-3",
      is_visible: false,
      items: [
        {
          category_id: "category-3",
          currency: "ARS",
          description: null,
          id: "item-5",
          image_url: null,
          is_available: true,
          is_featured: false,
          is_visible: true,
          name: "Secreto",
          position: 0,
          price: "999.00",
        },
      ],
      name: "Oculta",
      position: 2,
    },
  ],
};

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
    writable: true,
  });
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  scrollIntoView.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PublicMenuPage", () => {
  it("renders visible content, keeps featured items, and supports category navigation", () => {
    render(<PublicMenuPage data={publicMenuFixture} />);

    expect(screen.getByRole("heading", {name: "Cafe Nambre"})).toBeTruthy();
    expect(screen.getByText("Carta brunch")).toBeTruthy();
    expect(screen.getByRole("heading", {name: "Recomendados"})).toBeTruthy();
    expect(screen.getAllByText("Limonada de autor")).toHaveLength(2);
    expect(screen.getByText("Cold brew")).toBeTruthy();
    expect(screen.getByText("Agotado")).toBeTruthy();
    expect(screen.getAllByText("$ 4.200,00")).toHaveLength(2);
    expect(screen.getByText("$ 7.600,00")).toBeTruthy();
    expect(screen.getAllByAltText("Limonada de autor")).toHaveLength(2);
    expect(screen.getByAltText("Tostada premium")).toBeTruthy();
    expect(screen.queryByAltText("Cold brew")).toBeNull();
    expect(screen.queryByText("No mostrar")).toBeNull();
    expect(screen.queryByText("Oculta")).toBeNull();
    expect(screen.queryByText("Secreto")).toBeNull();

    fireEvent.click(screen.getByRole("button", {name: "Brunch"}));
    expect(scrollIntoView).toHaveBeenCalledWith({behavior: "smooth", block: "start"});
  });

  it("applies theme tokens and keeps dark presets readable with and without images", () => {
    render(
      <PublicMenuPage
        data={{
          ...publicMenuFixture,
          menu: {...publicMenuFixture.menu, theme: menuThemePresets[2]!.theme},
          theme: menuThemePresets[2]!.theme,
        }}
      />,
    );

    const shell = screen.getByRole("main");
    expect(shell.getAttribute("style")).toContain("--public-menu-accent");
    expect(shell.getAttribute("style")).toContain("--public-menu-background");
    expect(screen.getByText("Cold brew")).toBeTruthy();
    expect(screen.getByAltText("Tostada premium")).toBeTruthy();
    expect(screen.getByText("Powered by Nambre")).toBeTruthy();
    expect(screen.queryByText("Una carta pensada para móvil, sin descuidar la legibilidad.")).toBeNull();
  });

  it("renders the safe unavailable state", () => {
    render(
      <PublicMenuState
        description="Todavía no hay una carta publicada para este QR."
        title="Carta no disponible"
      />,
    );

    expect(screen.getByRole("heading", {name: "Carta no disponible"})).toBeTruthy();
    expect(screen.getByText("Todavía no hay una carta publicada para este QR.")).toBeTruthy();
    expect(screen.getByRole("link", {name: "Powered by Nambre"})).toBeTruthy();
  });
});
