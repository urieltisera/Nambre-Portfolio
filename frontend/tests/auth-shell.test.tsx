// @vitest-environment jsdom

import React from "react";
import {cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
import {LoginForm} from "../components/auth/LoginForm";
import {BusinessPanel} from "../components/BusinessPanel";
import {AppearanceProvider} from "../components/ui/AppearanceProvider";
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
  it("renders empty credentials, toggles password visibility and submits the real login flow", async () => {
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

    expect(email.value).toBe("");
    expect(password.value).toBe("");
    expect(screen.getByRole("button", {name: "Ingresar"}).hasAttribute("disabled")).toBe(true);

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
      <AppearanceProvider>
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

    expect(localStorage.getItem("menuflow.appearance")).toContain("\"theme\":\"dark\"");
    expect(localStorage.getItem("menuflow.appearance")).toContain("\"visualStyle\":\"maximal\"");

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
      <AppearanceProvider>
        <BusinessPanel onLogout={vi.fn()} token="owner-token" user={user} />
      </AppearanceProvider>,
    );

    await screen.findByText("Hola, Bar Central 👋");
    fireEvent.click(screen.getByRole("button", {name: "Contraer sidebar"}));

    const sidebar = container.querySelector("aside");
    if (!(sidebar instanceof HTMLElement)) {
      throw new Error("Sidebar not found");
    }

    expect(within(sidebar).queryByText("Mi carta")).toBeNull();
    expect(within(sidebar).queryByText("Bar Central")).toBeNull();
    expect(within(sidebar).queryByText("Activo")).toBeNull();
    expect(within(sidebar).getByRole("button", {name: "Inicio"})).toBeTruthy();
    expect(within(sidebar).getByRole("button", {name: "Cerrar sesión"})).toBeTruthy();
  });
});
