// @vitest-environment jsdom

import React from "react";
import {cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
import {AdminPanel} from "../components/AdminPanel";
import {AppearanceProvider} from "../components/ui/AppearanceProvider";
import type {Business} from "../lib/api";

const mocks = vi.hoisted(() => ({
  inviteClient: vi.fn(),
  listBusinesses: vi.fn(),
  request: vi.fn(),
  updateBusinessDestination: vi.fn(
    async (
      token: string | null | undefined,
      businessId: string,
      payload: {destination_type: "menu_pdf" | "external_url" | "digital_menu"; external_url?: string | null},
      isPlatformAdmin = false,
    ) =>
      mocks.request(`${isPlatformAdmin ? "/admin" : "/api"}/businesses/${businessId}`, token, {
        body: JSON.stringify(payload),
        headers: {"Content-Type": "application/json"},
        method: "PATCH",
      }),
  ),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("@/lib/api");
  return {
    ...actual,
    inviteClient: mocks.inviteClient,
    listBusinesses: mocks.listBusinesses,
    request: mocks.request,
    updateBusinessDestination: mocks.updateBusinessDestination,
  };
});

afterEach(() => {
  cleanup();
  mocks.inviteClient.mockReset();
  mocks.listBusinesses.mockReset();
  mocks.request.mockReset();
  mocks.updateBusinessDestination.mockClear();
});

function rowFor(text: string): HTMLElement {
  const row = screen.getByText(text).closest(".business-admin-row");
  if (!(row instanceof HTMLElement)) {
    throw new Error(`Row not found for ${text}`);
  }
  return row;
}

describe("AdminPanel", () => {
  it("renders all businesses, exposes valid actions, updates status and sends invitations", async () => {
    const businesses: Business[] = [
      {
        id: "biz-1",
        logo_url: null,
        name: "Bar Central",
        slug: "bar-central",
        plan_key: "essential",
        features: {digital_menu: false},
        status: "active",
        destination_type: "menu_pdf",
        external_url: null,
      },
      {
        id: "biz-2",
        logo_url: null,
        name: "Cafe Norte",
        slug: "cafe-norte",
        plan_key: "premium",
        features: {digital_menu: true},
        status: "demo",
        destination_type: "external_url",
        external_url: "https://cafe.example/menu",
      },
      {
        id: "biz-3",
        logo_url: null,
        name: "Hamburgueseria X",
        slug: "hamburgueseria-x",
        plan_key: "essential",
        features: {digital_menu: false},
        status: "suspended",
        destination_type: "menu_pdf",
        external_url: null,
      },
    ];
    const created: Business = {
      id: "biz-4",
      logo_url: null,
      name: "Pizzeria Sur",
      slug: "pizzeria-sur",
      plan_key: "essential",
      features: {digital_menu: false},
      status: "active",
      destination_type: "menu_pdf",
      external_url: null,
    };

    mocks.listBusinesses
      .mockResolvedValueOnce(businesses)
      .mockResolvedValueOnce([...businesses, created]);
    mocks.inviteClient.mockResolvedValue({
      business_id: "biz-4",
      email: "owner@sur.com",
      message: "Invitación enviada a owner@sur.com",
    });
    mocks.request.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
      if (path === "/admin/businesses/biz-2" && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body ?? "{}")) as Record<string, string>;
        if (body.plan_key) {
          return {...businesses[1], plan_key: body.plan_key, features: {digital_menu: body.plan_key === "premium"}};
        }
        return {...businesses[1], status: "active"};
      }
      if (path === "/admin/businesses/biz-1" && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body ?? "{}")) as Record<string, string>;
        if (body.plan_key) {
          return {...businesses[0], plan_key: body.plan_key, features: {digital_menu: body.plan_key === "premium"}};
        }
        return {
          ...businesses[0],
          destination_type: "external_url",
          external_url: "https://bar.example/menu",
        };
      }
      throw new Error(`Unhandled request: ${path}`);
    });

    render(
      <AppearanceProvider>
        <AdminPanel token="admin-token" />
      </AppearanceProvider>,
    );

    expect(await screen.findByText("Bar Central")).toBeTruthy();
    expect(screen.getByTestId("admin-layout")).toBeTruthy();
    expect(screen.getByTestId("admin-businesses-panel")).toBeTruthy();
    expect(screen.getByTestId("admin-create-panel")).toBeTruthy();
    expect(screen.getByTestId("admin-business-list")).toBeTruthy();
    expect(screen.getAllByText("Activo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Demo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Suspendido").length).toBeGreaterThan(0);

    const demoRow = rowFor("Cafe Norte");
    expect(within(demoRow).getByRole("button", {name: "Activar"})).toBeTruthy();
    expect(within(demoRow).getByRole("button", {name: "Suspender"})).toBeTruthy();

    const activeRow = rowFor("Bar Central");
    expect(within(activeRow).getByRole("button", {name: "Suspender"})).toBeTruthy();

    const suspendedRow = rowFor("Hamburgueseria X");
    expect(within(suspendedRow).getByRole("button", {name: "Reactivar"})).toBeTruthy();

    fireEvent.click(within(demoRow).getByRole("button", {name: "Activar"}));

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/admin/businesses/biz-2",
        "admin-token",
        expect.objectContaining({method: "PATCH"}),
      );
    });
    await waitFor(() => {
      expect(within(demoRow).getByText("Activo")).toBeTruthy();
      expect(within(demoRow).queryByRole("button", {name: "Activar"})).toBeNull();
    });

    fireEvent.change(within(activeRow).getByDisplayValue("Carta en Nambre"), {
      target: {value: "external_url"},
    });
    fireEvent.change(within(activeRow).getByPlaceholderText("https://tu-carta.com/menu"), {
      target: {value: "https://bar.example/menu"},
    });
    fireEvent.click(within(activeRow).getByRole("button", {name: "Guardar destino"}));

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/admin/businesses/biz-1",
        "admin-token",
        expect.objectContaining({method: "PATCH"}),
      );
      expect(within(activeRow).getByText("Destino: Carta digital propia")).toBeTruthy();
    });

    fireEvent.change(within(activeRow).getByLabelText("Plan de Bar Central"), {
      target: {value: "premium"},
    });
    fireEvent.click(within(activeRow).getByRole("button", {name: "Guardar plan"}));

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/admin/businesses/biz-1",
        "admin-token",
        expect.objectContaining({
          body: JSON.stringify({plan_key: "premium"}),
          method: "PATCH",
        }),
      );
      expect(within(activeRow).getByText("Plan: Premium")).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText("Nombre del negocio"), {
      target: {value: "Pizzeria Sur"},
    });
    fireEvent.change(screen.getByPlaceholderText("Email del cliente"), {
      target: {value: "owner@sur.com"},
    });
    fireEvent.click(screen.getByRole("button", {name: "Invitar cliente"}));

    await waitFor(() => {
      expect(mocks.inviteClient).toHaveBeenCalledWith(
        "admin-token",
        "Pizzeria Sur",
        "owner@sur.com",
      );
    });
    expect(await screen.findByText("Pizzeria Sur")).toBeTruthy();
    expect(screen.getByText("Invitación enviada a owner@sur.com")).toBeTruthy();
    expect(mocks.listBusinesses).toHaveBeenCalledTimes(2);
  }, 15000);
});
