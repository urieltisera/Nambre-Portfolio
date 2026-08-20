// @vitest-environment jsdom

import React from "react";
import {cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
import {AdminPanel} from "../components/AdminPanel";
import type {Business} from "../lib/api";

const mocks = vi.hoisted(() => ({
  listBusinesses: vi.fn(),
  request: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("@/lib/api");
  return {
    ...actual,
    listBusinesses: mocks.listBusinesses,
    request: mocks.request,
  };
});

afterEach(() => {
  cleanup();
  mocks.listBusinesses.mockReset();
  mocks.request.mockReset();
});

function rowFor(text: string): HTMLElement {
  const row = screen.getByText(text).closest(".business-admin-row");
  if (!(row instanceof HTMLElement)) {
    throw new Error(`Row not found for ${text}`);
  }
  return row;
}

describe("AdminPanel", () => {
  it("renders all businesses, exposes valid actions, updates status and reloads after creation", async () => {
    const businesses: Business[] = [
      {id: "biz-1", logo_url: null, name: "Bar Central", slug: "bar-central", status: "active"},
      {id: "biz-2", logo_url: null, name: "Cafe Norte", slug: "cafe-norte", status: "demo"},
      {id: "biz-3", logo_url: null, name: "Hamburgueseria X", slug: "hamburgueseria-x", status: "suspended"},
    ];
    const created: Business = {
      id: "biz-4",
      logo_url: null,
      name: "Pizzeria Sur",
      slug: "pizzeria-sur",
      status: "suspended",
    };

    mocks.listBusinesses
      .mockResolvedValueOnce(businesses)
      .mockResolvedValueOnce([...businesses, created]);
    mocks.request.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
      if (path === "/admin/businesses/biz-2" && init?.method === "PATCH") {
        return {...businesses[1], status: "active"};
      }
      if (path === "/admin/businesses" && init?.method === "POST") {
        return created;
      }
      if (path === "/admin/businesses/biz-4/owner" && init?.method === "POST") {
        return {email: "owner@sur.com", id: "owner-4", is_platform_admin: false};
      }
      throw new Error(`Unhandled request: ${path}`);
    });

    render(<AdminPanel token="admin-token" />);

    expect(await screen.findByText("Bar Central")).toBeTruthy();
    expect(screen.getByTestId("admin-layout")).toBeTruthy();
    expect(screen.getByTestId("admin-businesses-panel")).toBeTruthy();
    expect(screen.getByTestId("admin-create-panel")).toBeTruthy();
    expect(screen.getByTestId("admin-business-list")).toBeTruthy();
    expect(screen.getAllByText("Activo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Demo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Suspendido").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText("Nombre"), {target: {value: "Cafe Norte Deluxe"}});
    expect(screen.getByPlaceholderText("Slug").getAttribute("value")).toBe("cafe-norte-deluxe");

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

    fireEvent.change(screen.getByPlaceholderText("Nombre"), {target: {value: "Pizzeria Sur"}});
    fireEvent.change(screen.getByPlaceholderText("Slug"), {target: {value: "pizzeria-sur"}});
    fireEvent.change(screen.getByPlaceholderText("Owner email"), {target: {value: "owner@sur.com"}});
    fireEvent.change(screen.getByPlaceholderText("Password owner"), {target: {value: "owner12345"}});
    fireEvent.change(screen.getByDisplayValue("Activo"), {target: {value: "suspended"}});
    fireEvent.click(screen.getByRole("button", {name: "Crear negocio"}));

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/admin/businesses",
        "admin-token",
        expect.objectContaining({method: "POST"}),
      );
      expect(mocks.request).toHaveBeenCalledWith(
        "/admin/businesses/biz-4/owner",
        "admin-token",
        expect.objectContaining({method: "POST"}),
      );
    });
    expect(await screen.findByText("Pizzeria Sur")).toBeTruthy();
    expect(
      screen
        .getAllByText("Suspendido")
        .filter((element) => element.tagName.toLowerCase() === "p"),
    ).toHaveLength(2);
    expect(mocks.listBusinesses).toHaveBeenCalledTimes(2);
  });
});
