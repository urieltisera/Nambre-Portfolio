// @vitest-environment jsdom

import React from "react";
import {cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
import {LoginForm} from "../components/auth/LoginForm";
import {BusinessPanel} from "../components/BusinessPanel";
import {AppearanceProvider, useAppearance} from "../components/ui/AppearanceProvider";
import {appearancePreferences, LEGACY_STORAGE_KEY} from "../lib/appearance-preferences";
import type {Business, User} from "../lib/api";

const mocks = vi.hoisted(() => ({
  listBusinesses: vi.fn(),
  login: vi.fn(),
  request: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("@/lib/api");
  return {
    ...actual,
    listBusinesses: mocks.listBusinesses,
    login: mocks.login,
    request: mocks.request,
  };
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  mocks.listBusinesses.mockReset();
  mocks.login.mockReset();
  mocks.request.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function AppearanceHarness() {
  const {setVisualStyle, visualStyle} = useAppearance();
  return (
    <div>
      <p data-testid="appearance-value">{visualStyle}</p>
      <button onClick={() => setVisualStyle("minimal")} type="button">
        Minimal
      </button>
      <button onClick={() => setVisualStyle("maximal")} type="button">
        Maximal
      </button>
    </div>
  );
}

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

describe("LoginForm", () => {
  it("renders official branding, exposes the access CTA, toggles password visibility and submits the real login flow", async () => {
    const onToken = vi.fn();
    mocks.login.mockResolvedValue("abc123");
    stubMatchMedia(false);

    render(
      <AppearanceProvider>
        <LoginForm onToken={onToken} />
      </AppearanceProvider>,
    );

    const email = screen.getByLabelText("Email") as HTMLInputElement;
    const password = screen.getByLabelText("Contraseña") as HTMLInputElement;
    const brand = screen.getByAltText("MenuFlow") as HTMLImageElement;

    expect(brand.getAttribute("src")).toContain("/brand/logo-horizontal-light.svg");
    expect(email.value).toBe("");
    expect(password.value).toBe("");
    expect(screen.getByRole("button", {name: "Ingresar"}).hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByRole("button", {name: "¿Todavía no tenés cuenta? Solicitar acceso"}),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {name: "¿Todavía no tenés cuenta? Solicitar acceso"}),
    );
    expect(
      screen.getByText(/Durante el piloto el acceso se habilita manualmente/i),
    ).toBeTruthy();
    expect(mocks.login).not.toHaveBeenCalled();

    fireEvent.change(email, {target: {value: "owner@example.com"}});
    fireEvent.change(password, {target: {value: "owner12345"}});

    fireEvent.click(screen.getByRole("button", {name: "Mostrar contraseña"}));
    expect(password.type).toBe("text");
    fireEvent.click(screen.getByRole("button", {name: "Ocultar contraseña"}));
    expect(password.type).toBe("password");

    fireEvent.submit(screen.getByRole("button", {name: "Ingresar"}).closest("form")!);

    await waitFor(() => {
      expect(mocks.login).toHaveBeenCalledWith("owner@example.com", "owner12345");
    });
    expect(onToken).toHaveBeenCalledWith("abc123");
  });
});

describe("Owner shell", () => {
  it("opens the mobile drawer, navigates to settings and persists appearance preferences", async () => {
    stubMatchMedia(false);
    const user: User = {
      email: "owner@example.com",
      id: "owner-1",
      is_platform_admin: false,
    };
    const business: Business = {
      id: "biz-1",
      logo_url: null,
      name: "Demo Biz",
      slug: "demo-biz",
      status: "active",
      updated_at: "2026-08-20T12:00:00Z",
    };

    mocks.listBusinesses.mockResolvedValue([business]);
    mocks.request.mockImplementation(async (path: string) => {
      if (path === "/api/businesses/biz-1") return business;
      if (path === "/api/businesses/biz-1/menu") {
        return {current: null, public_code: null, versions: []};
      }
      if (path === "/api/businesses/biz-1/analytics/summary") {
        return {busiest_hour: null, scans_30d: 0, scans_7d: 0, scans_today: 0};
      }
      if (path === "/api/businesses/biz-1/analytics/scans?period=30d") return [];
      if (path === "/api/businesses/biz-1/qr") return [];
      throw new Error(`Unhandled request: ${path}`);
    });

    render(
      <AppearanceProvider userId={user.id}>
        <BusinessPanel onLogout={vi.fn()} token="owner-token" user={user} />
      </AppearanceProvider>,
    );

    await screen.findByText("Hola, Demo Biz 👋");

    fireEvent.click(screen.getByRole("button", {name: "Abrir navegación"}));
    const drawer = screen.getByRole("dialog", {name: "MenuFlow"});
    expect(drawer).toBeTruthy();

    fireEvent.click(within(drawer).getByRole("button", {name: "Configuración"}));

    await screen.findByRole("heading", {name: "Configuración"});
    expect(screen.queryByRole("dialog", {name: "MenuFlow"})).toBeNull();

    fireEvent.click(screen.getByRole("radio", {name: /Oscuro/}));
    fireEvent.click(screen.getByRole("radio", {name: /Maximalista/}));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(document.documentElement.dataset.visualStyle).toBe("maximal");
    });

    const stored = localStorage.getItem(appearancePreferences.keyForUser(user.id));
    expect(stored).toContain("\"theme\":\"dark\"");
    expect(stored).toContain("\"visualStyle\":\"maximal\"");

    fireEvent.click(screen.getByRole("button", {name: "Administrar negocio"}));
    await screen.findByRole("heading", {name: "Mi negocio"});
  }, 15000);

  it("collapses the desktop sidebar without leaving labels or business text visible", async () => {
    stubMatchMedia(false);
    const user: User = {
      email: "owner@example.com",
      id: "owner-1",
      is_platform_admin: false,
    };
    const business: Business = {
      id: "biz-2",
      logo_url: null,
      name: "Bar Central",
      slug: "bar-central",
      status: "active",
      updated_at: "2026-08-20T12:00:00Z",
    };

    mocks.listBusinesses.mockResolvedValue([business]);
    mocks.request.mockImplementation(async (path: string) => {
      if (path === "/api/businesses/biz-2") return business;
      if (path === "/api/businesses/biz-2/menu") {
        return {current: null, public_code: null, versions: []};
      }
      if (path === "/api/businesses/biz-2/analytics/summary") {
        return {busiest_hour: 21, scans_30d: 36, scans_7d: 18, scans_today: 4};
      }
      if (path === "/api/businesses/biz-2/analytics/scans?period=30d") return [];
      if (path === "/api/businesses/biz-2/qr") return [];
      throw new Error(`Unhandled request: ${path}`);
    });

    const {container} = render(
      <AppearanceProvider userId={user.id}>
        <BusinessPanel onLogout={vi.fn()} token="owner-token" user={user} />
      </AppearanceProvider>,
    );

    await screen.findByText("Hola, Bar Central 👋");

    const sidebar = container.querySelector("aside");
    if (!(sidebar instanceof HTMLElement)) {
      throw new Error("Sidebar not found");
    }

    const expandedBrand = within(sidebar).getByAltText("MenuFlow") as HTMLImageElement;
    expect(expandedBrand.getAttribute("src")).toContain("/brand/logo-horizontal-light.svg");
    expect(screen.getByTestId("dashboard-layout-minimal")).toBeTruthy();

    const homeButton = screen.getByRole("button", {name: "Inicio"});
    expect(homeButton.className).toContain("is-active");
    fireEvent.click(screen.getByRole("button", {name: "Contraer sidebar"}));

    expect(within(sidebar).queryByText("Mi carta")).toBeNull();
    expect(within(sidebar).queryByText("Bar Central")).toBeNull();
    expect(within(sidebar).queryByText("Activo")).toBeNull();
    expect(within(sidebar).getByRole("button", {name: "Inicio"})).toBeTruthy();
    expect(within(sidebar).getByRole("button", {name: "Cerrar sesión"})).toBeTruthy();
    const collapsedBrand = within(sidebar).getByAltText("MenuFlow") as HTMLImageElement;
    expect(collapsedBrand.getAttribute("src")).toContain("/brand/isotype-teal.svg");
    expect(within(sidebar).getByRole("button", {name: "Inicio"}).className).toContain("is-active");

    fireEvent.click(screen.getByRole("button", {name: "Expandir sidebar"}));
    expect(within(sidebar).getByText("Mi carta")).toBeTruthy();
    expect(within(sidebar).getByText("Bar Central")).toBeTruthy();
  });

  it("switches between minimal and maximal layouts and persists the visible change", async () => {
    stubMatchMedia(false);
    const user: User = {
      email: "owner@example.com",
      id: "owner-1",
      is_platform_admin: false,
    };
    const business: Business = {
      id: "biz-3",
      logo_url: null,
      name: "Minimal Biz",
      slug: "minimal-biz",
      status: "active",
      updated_at: "2026-08-21T12:00:00Z",
    };

    mocks.listBusinesses.mockResolvedValue([business]);
    mocks.request.mockImplementation(async (path: string) => {
      if (path === "/api/businesses/biz-3") return business;
      if (path === "/api/businesses/biz-3/menu") {
        return {current: null, public_code: null, versions: []};
      }
      if (path === "/api/businesses/biz-3/analytics/summary") {
        return {busiest_hour: 18, scans_30d: 42, scans_7d: 9, scans_today: 2};
      }
      if (path === "/api/businesses/biz-3/analytics/scans?period=30d") return [];
      if (path === "/api/businesses/biz-3/qr") return [];
      throw new Error(`Unhandled request: ${path}`);
    });

    render(
      <AppearanceProvider userId={user.id}>
        <BusinessPanel onLogout={vi.fn()} token="owner-token" user={user} />
      </AppearanceProvider>,
    );

    await screen.findByText("Hola, Minimal Biz 👋");
    expect(screen.getByTestId("dashboard-layout-minimal")).toBeTruthy();
    expect(screen.queryByTestId("dashboard-layout-maximal")).toBeNull();
    expect(screen.queryByText("Resumen rápido")).toBeNull();

    fireEvent.click(screen.getByRole("button", {name: "Configuración"}));
    await screen.findByRole("heading", {name: "Configuración"});
    fireEvent.click(screen.getByRole("radio", {name: /Maximalista/}));
    fireEvent.click(screen.getByRole("button", {name: "Inicio"}));

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-layout-maximal")).toBeTruthy();
    });
    expect(screen.getByText("Resumen rápido")).toBeTruthy();
    expect(localStorage.getItem(appearancePreferences.keyForUser(user.id))).toContain(
      "\"visualStyle\":\"maximal\"",
    );
  }, 15000);

  it("isolates appearance preferences per user id and ignores the legacy global key", async () => {
    stubMatchMedia(false);
    localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify({theme: "dark", visualStyle: "maximal"}),
    );
    localStorage.setItem(
      appearancePreferences.keyForUser("owner-b"),
      JSON.stringify({theme: "light", visualStyle: "maximal"}),
    );

    const ownerA = render(
      <AppearanceProvider key="owner-a" userId="owner-a">
        <AppearanceHarness />
      </AppearanceProvider>,
    );
    expect(screen.getByTestId("appearance-value").textContent).toBe("minimal");
    fireEvent.click(screen.getByRole("button", {name: "Minimal"}));
    await waitFor(() => {
      expect(localStorage.getItem(appearancePreferences.keyForUser("owner-a"))).toContain(
        "\"visualStyle\":\"minimal\"",
      );
    });
    ownerA.unmount();

    const ownerB = render(
      <AppearanceProvider key="owner-b" userId="owner-b">
        <AppearanceHarness />
      </AppearanceProvider>,
    );
    expect(screen.getByTestId("appearance-value").textContent).toBe("maximal");
    fireEvent.click(screen.getByRole("button", {name: "Maximal"}));
    await waitFor(() => {
      expect(localStorage.getItem(appearancePreferences.keyForUser("owner-b"))).toContain(
        "\"visualStyle\":\"maximal\"",
      );
    });
    ownerB.unmount();

    const admin = render(
      <AppearanceProvider key="admin-1" userId="admin-1">
        <AppearanceHarness />
      </AppearanceProvider>,
    );
    expect(screen.getByTestId("appearance-value").textContent).toBe("minimal");
    admin.unmount();

    render(
      <AppearanceProvider key="owner-a-return" userId="owner-a">
        <AppearanceHarness />
      </AppearanceProvider>,
    );
    expect(screen.getByTestId("appearance-value").textContent).toBe("minimal");
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toContain("\"visualStyle\":\"maximal\"");
  });
});
