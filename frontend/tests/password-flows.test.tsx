// @vitest-environment jsdom

import React from "react";
import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
import {ActivateAccountForm} from "../components/auth/ActivateAccountForm";
import {ForgotPasswordForm} from "../components/auth/ForgotPasswordForm";
import {ResetPasswordForm} from "../components/auth/ResetPasswordForm";
import {LoginForm} from "../components/auth/LoginForm";
import {OwnerSettings} from "../components/owner/OwnerSettings";
import {AppearanceProvider} from "../components/ui/AppearanceProvider";
import {type Business, type User} from "../lib/api";

const mocks = vi.hoisted(() => ({
  acceptInvitation: vi.fn(),
  changePassword: vi.fn(),
  confirmPasswordReset: vi.fn(),
  login: vi.fn(),
  replace: vi.fn(),
  requestPasswordReset: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("@/lib/api");
  return {
    ...actual,
    acceptInvitation: mocks.acceptInvitation,
    changePassword: mocks.changePassword,
    confirmPasswordReset: mocks.confirmPasswordReset,
    login: mocks.login,
    requestPasswordReset: mocks.requestPasswordReset,
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mocks.replace,
  }),
}));

afterEach(() => {
  cleanup();
  mocks.changePassword.mockReset();
  mocks.acceptInvitation.mockReset();
  mocks.confirmPasswordReset.mockReset();
  mocks.login.mockReset();
  mocks.replace.mockReset();
  mocks.requestPasswordReset.mockReset();
  vi.useRealTimers();
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

describe("Password flows", () => {
  it("shows the forgot password link on login", () => {
    stubMatchMedia(false);

    render(
      <AppearanceProvider>
        <LoginForm onToken={vi.fn()} />
      </AppearanceProvider>,
    );

    expect(
      screen.getByRole("link", {name: "¿Olvidaste tu contraseña?"}).getAttribute("href"),
    ).toBe("/forgot-password");
  });

  it("submits the forgot password form and keeps the generic message", async () => {
    stubMatchMedia(false);
    mocks.requestPasswordReset.mockResolvedValue(
      "Si existe una cuenta asociada a ese correo, vas a recibir instrucciones para restablecer tu contraseña.",
    );

    render(
      <AppearanceProvider>
        <ForgotPasswordForm />
      </AppearanceProvider>,
    );

    fireEvent.change(screen.getByLabelText("Email"), {target: {value: "owner@example.com"}});
    fireEvent.submit(screen.getByRole("button", {name: "Enviar instrucciones"}).closest("form")!);

    await waitFor(() => {
      expect(mocks.requestPasswordReset).toHaveBeenCalledWith("owner@example.com");
    });
    expect(
      screen.getByText(
        "Si existe una cuenta asociada a ese correo, vas a recibir instrucciones para restablecer tu contraseña.",
      ),
    ).toBeTruthy();
  });

  it("validates password confirmation, shows success and redirects to login after a successful reset", async () => {
    stubMatchMedia(false);
    vi.useFakeTimers();
    mocks.confirmPasswordReset.mockResolvedValue("La contraseña fue actualizada.");
    const localSetItem = vi.spyOn(Storage.prototype, "setItem");
    const sessionSetItem = vi.spyOn(Storage.prototype, "setItem");

    render(
      <AppearanceProvider>
        <ResetPasswordForm initialToken="reset-token" />
      </AppearanceProvider>,
    );

    fireEvent.change(screen.getByLabelText("Nueva contraseña"), {target: {value: "new-pass-123"}});
    fireEvent.change(screen.getByLabelText("Confirmar nueva contraseña"), {
      target: {value: "different-pass"},
    });
    expect(
      screen.getByRole("button", {name: "Actualizar contraseña"}).hasAttribute("disabled"),
    ).toBe(true);

    fireEvent.change(screen.getByLabelText("Confirmar nueva contraseña"), {
      target: {value: "new-pass-123"},
    });
    fireEvent.submit(screen.getByRole("button", {name: "Actualizar contraseña"}).closest("form")!);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.confirmPasswordReset).toHaveBeenCalledWith("reset-token", "new-pass-123");
    expect(screen.getByText("La contraseña fue actualizada.")).toBeTruthy();
    expect(screen.getByRole("link", {name: "Volver al login"}).getAttribute("href")).toBe("/");
    expect(mocks.replace).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(mocks.replace).toHaveBeenCalledWith("/");
    expect(mocks.confirmPasswordReset).toHaveBeenCalledTimes(1);
    expect(localSetItem).not.toHaveBeenCalledWith(
      expect.stringMatching(/reset|token|password/i),
      expect.any(String),
    );
    expect(sessionSetItem).not.toHaveBeenCalledWith(
      expect.stringMatching(/reset|token|password/i),
      expect.any(String),
    );
  });

  it("activates an invited account, requires legal acceptance and redirects to login", async () => {
    stubMatchMedia(false);
    vi.useFakeTimers();
    mocks.acceptInvitation.mockResolvedValue("Tu cuenta fue activada.");

    render(
      <AppearanceProvider>
        <ActivateAccountForm initialToken="invite-token" />
      </AppearanceProvider>,
    );

    fireEvent.change(screen.getByLabelText("Nueva contraseña"), {target: {value: "new-pass-123"}});
    fireEvent.change(screen.getByLabelText("Confirmar contraseña"), {
      target: {value: "other-pass"},
    });
    expect(screen.getByRole("button", {name: "Crear contraseña"}).hasAttribute("disabled")).toBe(
      true,
    );

    fireEvent.change(screen.getByLabelText("Confirmar contraseña"), {
      target: {value: "new-pass-123"},
    });
    fireEvent.click(
      screen.getByLabelText("Aceptar documentos legales vigentes para activar la cuenta"),
    );
    fireEvent.submit(screen.getByRole("button", {name: "Crear contraseña"}).closest("form")!);

    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.acceptInvitation).toHaveBeenCalledWith("invite-token", "new-pass-123", true);
    expect(screen.getByText("Tu cuenta fue activada.")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(mocks.replace).toHaveBeenCalledWith("/");
  });

  it("shows clear activation errors for missing token and missing legal acceptance", async () => {
    stubMatchMedia(false);

    const {rerender} = render(
      <AppearanceProvider>
        <ActivateAccountForm initialToken="" />
      </AppearanceProvider>,
    );

    expect(
      screen.getByText(
        "La invitación es inválida, expiró o ya fue utilizada. Pedile a tu admin una nueva invitación.",
      ),
    ).toBeTruthy();

    rerender(
      <AppearanceProvider>
        <ActivateAccountForm initialToken="invite-token" />
      </AppearanceProvider>,
    );

    fireEvent.change(screen.getByLabelText("Nueva contraseña"), {target: {value: "new-pass-123"}});
    fireEvent.change(screen.getByLabelText("Confirmar contraseña"), {
      target: {value: "new-pass-123"},
    });
    fireEvent.submit(screen.getByRole("button", {name: "Crear contraseña"}).closest("form")!);

    expect(
      await screen.findByText(
        "Necesitás aceptar los documentos legales vigentes para activar la cuenta.",
      ),
    ).toBeTruthy();
  });

  it("changes the authenticated password and refreshes the active session token", async () => {
    stubMatchMedia(false);
    mocks.changePassword.mockResolvedValue("rotated-session-token");
    const onSessionRefresh = vi.fn().mockResolvedValue(undefined);
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

    render(
      <AppearanceProvider userId={user.id}>
        <OwnerSettings
          business={business}
          onLogout={vi.fn()}
          onNavigateBusiness={vi.fn()}
          onSessionRefresh={onSessionRefresh}
          token="old-session-token"
          user={user}
        />
      </AppearanceProvider>,
    );

    fireEvent.change(screen.getByLabelText("Contraseña actual"), {
      target: {value: "old-pass-123"},
    });
    fireEvent.change(screen.getByLabelText("Nueva contraseña"), {
      target: {value: "new-pass-123"},
    });
    fireEvent.change(screen.getByLabelText("Confirmar nueva contraseña"), {
      target: {value: "new-pass-123"},
    });
    fireEvent.submit(screen.getByRole("button", {name: "Guardar nueva contraseña"}).closest("form")!);

    await waitFor(() => {
      expect(mocks.changePassword).toHaveBeenCalledWith(
        "old-session-token",
        "old-pass-123",
        "new-pass-123",
      );
    });
    expect(onSessionRefresh).toHaveBeenCalledWith("rotated-session-token");
    expect(
      screen.getByText("La contraseña fue actualizada y esta sesión ya usa la credencial nueva."),
    ).toBeTruthy();
  });
});
