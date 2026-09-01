// @vitest-environment jsdom

import React from "react";
import {cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
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
  it("renders a public root without bootstrapping the authenticated shell", () => {
    render(<Page />);

    expect(screen.getByRole("heading", {name: "Nambre"})).toBeTruthy();
    expect(screen.getByRole("link", {name: "Ingresar"}).getAttribute("href")).toBe("/login");
    expect(mocks.currentUser).not.toHaveBeenCalled();
    expect(screen.queryByText("Business panel")).toBeNull();
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
