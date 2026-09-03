// @vitest-environment jsdom

import React from "react";
import {cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
import {readFileSync} from "node:fs";
import path from "node:path";
import {ApiError} from "../lib/api";
import Page from "../app/page";
import LoginPage from "../app/login/page";
import DashboardPage from "../app/dashboard/page";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  logout: vi.fn(async () => undefined),
  router: {
    replace: vi.fn(),
  },
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("@/lib/api");
  return {
    ...actual,
    currentUser: mocks.currentUser,
    logout: mocks.logout,
  };
});

vi.mock("@/components/auth/LoginForm", () => ({
  LoginForm: ({onToken}: {onToken: (token: string) => void}) => (
    <button onClick={() => void onToken("owner-token")}>Mock login</button>
  ),
}));

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

vi.mock("@/components/BusinessPanel", () => ({
  BusinessPanel: ({onLogout}: {onLogout: () => void}) => (
    <div>
      <div>Business panel</div>
      <button onClick={() => void onLogout()}>Mock logout</button>
    </div>
  ),
}));

vi.mock("@/components/AdminPanel", () => ({
  AdminPanel: () => <div>Admin panel</div>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
}));

afterEach(() => {
  cleanup();
  mocks.currentUser.mockReset();
  mocks.logout.mockReset();
  mocks.router.replace.mockReset();
});

describe("Page", () => {
  it("renders the marketing landing without bootstrapping the authenticated shell", () => {
    render(<Page />);

    expect(
      screen.getByRole("heading", {
        name: "Nambre convierte tu carta en una experiencia digital lista para cambiar todos los días.",
      }),
    ).toBeTruthy();
    expect(screen.getAllByRole("link", {name: "Ingresar"}).some((link) => link.getAttribute("href") === "/login")).toBe(
      true,
    );
    expect(screen.getByRole("navigation", {name: "Secciones de Nambre"})).toBeTruthy();
    expect(screen.getByRole("img", {name: "Vista previa conceptual de una carta digital"})).toBeTruthy();
    expect(screen.getByTestId("hero-css-fallback")).toBeTruthy();
    expect(mocks.currentUser).not.toHaveBeenCalled();
    expect(screen.queryByText("Business panel")).toBeNull();
  });

  it("renders marketing CTAs, FAQ structure and legal footer links", () => {
    render(<Page />);

    expect(screen.getByRole("link", {name: "Empezar con Nambre"}).getAttribute("href")).toBe("#contacto");
    expect(screen.getByRole("link", {name: "Ir a Nambre"}).getAttribute("href")).toBe("/login");
    expect(screen.getByText("¿Necesito cambiar el QR cuando edito la carta?").tagName).toBe("SUMMARY");
    expect(screen.getByText("¿Qué necesito para empezar con Nambre?").tagName).toBe("SUMMARY");
    expect(screen.getAllByRole("link", {name: "Contacto"}).every((link) => link.getAttribute("href") === "#contacto")).toBe(
      true,
    );
    expect(screen.getByRole("link", {name: "Instagram"}).getAttribute("href")).toBe("#contacto");
    expect(screen.getByRole("link", {name: "Teléfono"}).getAttribute("href")).toBe("#contacto");
    expect(screen.getByRole("link", {name: "Privacidad"}).getAttribute("href")).toBe("/privacy");
    expect(screen.getByRole("link", {name: "Términos"}).getAttribute("href")).toBe("/terms");
  });

  it("keeps the WebGL dependency behind the dedicated hero client island", () => {
    const root = path.resolve(__dirname, "..");
    const marketingPage = readFileSync(path.join(root, "components/marketing/MarketingPage.tsx"), "utf8");
    const heroClient = readFileSync(path.join(root, "components/marketing/hero/HeroBackgroundClient.tsx"), "utf8");
    const gradientWaves = readFileSync(path.join(root, "components/marketing/hero/GradientWaves.tsx"), "utf8");

    expect(marketingPage).not.toContain('"use client"');
    expect(marketingPage).not.toContain("from \"ogl\"");
    expect(heroClient).toContain('"use client"');
    expect(heroClient).toContain("ssr: false");
    expect(gradientWaves).toContain("from \"ogl\"");
    expect(gradientWaves).toContain("1.0 - smoothstep(0.76, 1.0, vUv.y)");
  });

  it("keeps marketing copy commercial and isolated from persisted dark theme tokens", () => {
    const root = path.resolve(__dirname, "..");
    const marketingPage = readFileSync(path.join(root, "components/marketing/MarketingPage.tsx"), "utf8");
    const marketingCss = readFileSync(path.join(root, "components/marketing/marketing.css"), "utf8");

    expect(marketingPage).not.toMatch(/D2|Showcase base|mock interno|Mock visual interno|datos reales de clientes/i);
    expect(marketingCss).toContain(".marketing-shell");
    expect(marketingCss).toContain("color-scheme: light");
    expect(marketingCss).toContain("--marketing-background: #f4f7f6");
    expect(marketingCss).toContain("--nl-color-background: var(--marketing-background)");
    expect(marketingCss).toContain("--nl-color-text-primary: var(--marketing-text-primary)");
    expect(marketingCss).toContain("background: var(--marketing-text-primary)");
  });
});

describe("LoginPage", () => {
  it("redirects an already authenticated session to the dashboard", async () => {
    mocks.currentUser.mockResolvedValueOnce({
      email: "owner@example.com",
      id: "owner-1",
      is_platform_admin: false,
    });

    render(<LoginPage />);
    await waitFor(() => {
      expect(mocks.currentUser).toHaveBeenCalledWith();
    });
    expect(mocks.router.replace).toHaveBeenCalledWith("/dashboard");
    expect(screen.queryByRole("button", {name: "Mock login"})).toBeNull();
  });

  it("shows login after a bootstrap 401", async () => {
    mocks.currentUser.mockRejectedValueOnce(new ApiError(401, "Not authenticated"));

    render(<LoginPage />);

    await waitFor(() => {
      expect(mocks.currentUser).toHaveBeenCalledWith();
    });
    expect(screen.getByRole("button", {name: "Mock login"})).toBeTruthy();
    expect(screen.queryByText("Business panel")).toBeNull();
  });

  it("does not persist bearer tokens in browser storage during login", async () => {
    const localSetItem = vi.spyOn(Storage.prototype, "setItem");
    mocks.currentUser.mockRejectedValueOnce(new ApiError(401, "Not authenticated"));
    mocks.currentUser.mockResolvedValueOnce({
      email: "owner@example.com",
      id: "owner-1",
      is_platform_admin: false,
    });

    render(<LoginPage />);

    await screen.findByRole("button", {name: "Mock login"});
    fireEvent.click(screen.getByRole("button", {name: "Mock login"}));

    await waitFor(() => {
      expect(mocks.router.replace).toHaveBeenCalledWith("/dashboard");
    });
    expect(mocks.currentUser).toHaveBeenNthCalledWith(2, "owner-token");
    expect(localSetItem).not.toHaveBeenCalledWith(
      expect.stringMatching(/token|bearer|session/i),
      expect.any(String),
    );
  });
});

describe("DashboardPage", () => {
  it("restores a valid cookie session without flashing the login", async () => {
    mocks.currentUser.mockResolvedValueOnce({
      email: "owner@example.com",
      id: "owner-1",
      is_platform_admin: false,
    });

    render(<DashboardPage />);
    await waitFor(() => {
      expect(mocks.currentUser).toHaveBeenCalledWith();
    });
    expect(screen.getByText("Business panel")).toBeTruthy();
    expect(screen.queryByRole("button", {name: "Mock login"})).toBeNull();
    expect(screen.queryByRole("button", {name: "Admin"})).toBeNull();
  });

  it("redirects unauthenticated users to login", async () => {
    mocks.currentUser.mockRejectedValueOnce(new ApiError(401, "Not authenticated"));

    render(<DashboardPage />);

    await waitFor(() => {
      expect(mocks.currentUser).toHaveBeenCalledWith();
    });
    expect(mocks.router.replace).toHaveBeenCalledWith("/login");
    expect(screen.queryByText("Business panel")).toBeNull();
  });

  it("calls logout and returns to login after closing a cookie-restored session", async () => {
    mocks.currentUser.mockResolvedValueOnce({
      email: "owner@example.com",
      id: "owner-1",
      is_platform_admin: false,
    });

    render(<DashboardPage />);
    await screen.findByText("Business panel");
    fireEvent.click(screen.getByRole("button", {name: "Mock logout"}));

    await waitFor(() => {
      expect(mocks.logout).toHaveBeenCalledWith(null);
    });
    await waitFor(() => {
      expect(mocks.router.replace).toHaveBeenCalledWith("/login");
    });
  });
});
