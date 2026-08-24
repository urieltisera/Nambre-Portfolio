// @vitest-environment jsdom

import React from "react";
import {cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
import {BusinessPanel} from "../components/BusinessPanel";
import {AppearanceProvider} from "../components/ui/AppearanceProvider";
import {appearancePreferences} from "../lib/appearance-preferences";
import type {Business, MenuState} from "../lib/api";

const mocks = vi.hoisted(() => ({
  downloadQrAsset: vi.fn(async () => undefined),
  fetchQrAssetBlob: vi.fn(async () => new Blob(["qr"])),
  listBusinesses: vi.fn(),
  request: vi.fn(),
  updateBusinessDestination: vi.fn(
    async (
      token: string | null | undefined,
      businessId: string,
      payload: {destination_type: "menu_pdf" | "external_url"; external_url?: string | null},
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
    downloadQrAsset: mocks.downloadQrAsset,
    fetchQrAssetBlob: mocks.fetchQrAssetBlob,
    listBusinesses: mocks.listBusinesses,
    request: mocks.request,
    updateBusinessDestination: mocks.updateBusinessDestination,
  };
});

afterEach(() => {
  cleanup();
  mocks.downloadQrAsset.mockClear();
  mocks.fetchQrAssetBlob.mockClear();
  mocks.listBusinesses.mockReset();
  mocks.request.mockReset();
  mocks.updateBusinessDestination.mockClear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderPanel(ui: React.ReactElement, visualStyle: "minimal" | "maximal" = "maximal") {
  localStorage.setItem(
    appearancePreferences.keyForUser("owner-1"),
    JSON.stringify({theme: "light", visualStyle}),
  );
  return render(<AppearanceProvider userId="owner-1">{ui}</AppearanceProvider>);
}

describe("BusinessPanel logo flow", () => {
  it("refreshes the branded preview after regenerating QR for a new logo without touching the PDF", async () => {
    const businessWithoutLogo: Business = {
      id: "biz-1",
      logo_url: null,
      name: "Demo Biz",
      slug: "demo-biz",
      status: "active" as const,
      updated_at: "2026-08-20T12:00:00Z",
    };
    const businessWithLogoA: Business = {
      ...businessWithoutLogo,
      logo_url: "/logos/biz-1",
      updated_at: "2026-08-20T12:05:00Z",
    };
    const businessWithLogoB: Business = {
      ...businessWithoutLogo,
      logo_url: "/logos/biz-1",
      updated_at: "2026-08-20T12:10:00Z",
    };
    const menuState = {
      current: {
        created_at: "2026-08-20T11:55:00Z",
        file_size: 128,
        id: "menu-1",
        original_filename: "menu.pdf",
        status: "active" as const,
        version: 1,
      },
      public_code: "demo-code",
      versions: [
        {
          created_at: "2026-08-20T11:55:00Z",
          file_size: 128,
          id: "menu-1",
          original_filename: "menu.pdf",
          status: "active" as const,
          version: 1,
        },
      ],
    };
    const qrAssets = [
      {
        asset_url: "/api/businesses/biz-1/qr-assets/standard.png",
        id: "standard-png",
        qr_type: "standard" as const,
        status: "approved",
      },
      {
        asset_url: "/api/businesses/biz-1/qr-assets/standard.svg",
        id: "standard-svg",
        qr_type: "standard" as const,
        status: "approved",
      },
      {
        asset_url: "/api/businesses/biz-1/qr-assets/branded.png",
        id: "branded-png",
        qr_type: "branded" as const,
        status: "approved",
      },
      {
        asset_url: "/api/businesses/biz-1/qr-assets/branded.svg",
        id: "branded-svg",
        qr_type: "branded" as const,
        status: "approved",
      },
    ];
    const previewBlobs = [new Blob(["standard-a"]), new Blob(["branded-a"]), new Blob(["standard-b"]), new Blob(["branded-b"])];

    let currentBusiness: Business = businessWithoutLogo;
    let currentQr: typeof qrAssets = [];
    let logoUploads = 0;
    let qrGenerations = 0;

    mocks.listBusinesses.mockImplementation(async () => [currentBusiness]);
    mocks.request.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
      if (path === "/api/businesses/biz-1") return currentBusiness;
      if (path === "/api/businesses/biz-1/menu") return menuState;
      if (path === "/api/businesses/biz-1/analytics/summary") {
        return {busiest_hour: 12, scans_30d: 30, scans_7d: 7, scans_today: 1};
      }
      if (path === "/api/businesses/biz-1/analytics/scans?period=30d") return [];
      if (path === "/api/businesses/biz-1/qr") return currentQr;
      if (path === "/api/businesses/biz-1/logo" && init?.method === "POST") {
        logoUploads += 1;
        currentBusiness = logoUploads === 1 ? businessWithLogoA : businessWithLogoB;
        return currentBusiness;
      }
      if (path === "/api/businesses/biz-1/qr/generate" && init?.method === "POST") {
        qrGenerations += 1;
        currentQr = qrAssets;
        return qrAssets;
      }
      throw new Error(`Unhandled request: ${path}`);
    });

    const createObjectURL = vi
      .fn()
      .mockReturnValueOnce("blob:standard-preview-a")
      .mockReturnValueOnce("blob:branded-preview-a")
      .mockReturnValueOnce("blob:standard-preview-b")
      .mockReturnValueOnce("blob:branded-preview-b");
    const revokeObjectURL = vi.fn();
    mocks.fetchQrAssetBlob
      .mockResolvedValueOnce(previewBlobs[0])
      .mockResolvedValueOnce(previewBlobs[1])
      .mockResolvedValueOnce(previewBlobs[2])
      .mockResolvedValueOnce(previewBlobs[3]);
    vi.stubGlobal("URL", {createObjectURL, revokeObjectURL});
    vi.stubGlobal("confirm", vi.fn(() => true));

    const {container} = renderPanel(<BusinessPanel token="owner-token" user={null} />);

    await screen.findByText("Hola, Demo Biz 👋");
    fireEvent.click(screen.getByRole("button", {name: "Mi carta"}));

    const [logoInput] = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'));
    fireEvent.change(logoInput, {
      target: {files: [new File(["logo-a"], "logo-a.png", {type: "image/png"})]},
    });
    fireEvent.click(screen.getByRole("button", {name: "Guardar logo"}));

    await screen.findByText("Logo guardado correctamente.");
    await waitFor(() => {
      const image = screen.getByAltText("Logo de Demo Biz");
      expect(image.getAttribute("src")).toContain(encodeURIComponent(businessWithLogoA.updated_at!));
    });

    fireEvent.change(logoInput, {
      target: {files: [new File(["logo-b"], "logo-b.png", {type: "image/png"})]},
    });
    fireEvent.click(screen.getByRole("button", {name: "Guardar logo"}));

    await waitFor(() => {
      const image = screen.getByAltText("Logo de Demo Biz");
      expect(image.getAttribute("src")).toContain(encodeURIComponent(businessWithLogoB.updated_at!));
    });

    fireEvent.click(screen.getByRole("button", {name: "Mi QR"}));
    fireEvent.click(screen.getByRole("button", {name: "Generar QR"}));

    await waitFor(() => {
      expect(mocks.fetchQrAssetBlob).toHaveBeenNthCalledWith(
        2,
        "/api/businesses/biz-1/qr-assets/branded.png",
        "owner-token",
      );
    });
    const firstBrandedPreview = await screen.findByAltText("Preview QR con logo");
    expect(firstBrandedPreview.getAttribute("src")).toBe("blob:branded-preview-a");

    fireEvent.click(screen.getByRole("button", {name: "Mi carta"}));
    fireEvent.change(logoInput, {
      target: {files: [new File(["logo-b"], "logo-b.png", {type: "image/png"})]},
    });
    fireEvent.click(screen.getByRole("button", {name: "Guardar logo"}));

    await waitFor(() => {
      const image = screen.getByAltText("Logo de Demo Biz");
      expect(image.getAttribute("src")).toContain(encodeURIComponent(businessWithLogoB.updated_at!));
    });

    fireEvent.click(screen.getByRole("button", {name: "Mi QR"}));
    fireEvent.click(screen.getByRole("button", {name: "Generar QR"}));

    await waitFor(() => {
      expect(mocks.fetchQrAssetBlob).toHaveBeenNthCalledWith(
        4,
        "/api/businesses/biz-1/qr-assets/branded.png",
        "owner-token",
      );
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:branded-preview-a");
    });
    const secondBrandedPreview = await screen.findByAltText("Preview QR con logo");
    expect(secondBrandedPreview.getAttribute("src")).toBe("blob:branded-preview-b");

    const brandedCard = screen.getByTestId("qr-card-branded");
    fireEvent.click(within(brandedCard).getByRole("button", {name: "Descargar PNG"}));
    fireEvent.click(within(brandedCard).getByRole("button", {name: "Descargar SVG"}));

    await waitFor(() => {
      expect(mocks.downloadQrAsset).toHaveBeenNthCalledWith(
        1,
        "/api/businesses/biz-1/qr-assets/branded.png",
        "owner-token",
      );
      expect(mocks.downloadQrAsset).toHaveBeenNthCalledWith(
        2,
        "/api/businesses/biz-1/qr-assets/branded.svg",
        "owner-token",
      );
    });

    const paths = mocks.request.mock.calls.map(([path]) => path as string);
    expect(qrGenerations).toBe(2);
    expect(paths.filter((path) => path === "/api/businesses/biz-1/logo")).toHaveLength(2);
    expect(paths).not.toContain("/api/businesses/biz-1/menu/replace");
    expect(paths.filter((path) => path === "/api/businesses/biz-1")).toHaveLength(3);
    expect(paths.filter((path) => path === "/api/businesses/biz-1/qr/generate")).toHaveLength(2);
  }, 90000);

  it("loads the business selector from the admin listing for platform admins", async () => {
    const adminBusiness: Business = {
      id: "biz-admin",
      logo_url: null,
      name: "Admin Biz",
      slug: "admin-biz",
      status: "demo",
      updated_at: "2026-08-20T12:00:00Z",
    };

    mocks.listBusinesses.mockResolvedValue([adminBusiness]);
    mocks.request.mockImplementation(async (path: string) => {
      if (path === "/api/businesses/biz-admin") return adminBusiness;
      if (path === "/api/businesses/biz-admin/menu") {
        return {current: null, public_code: null, versions: []};
      }
      if (path === "/api/businesses/biz-admin/analytics/summary") {
        return {busiest_hour: null, scans_30d: 0, scans_7d: 0, scans_today: 0};
      }
      if (path === "/api/businesses/biz-admin/analytics/scans?period=30d") return [];
      if (path === "/api/businesses/biz-admin/qr") return [];
      throw new Error(`Unhandled request: ${path}`);
    });

    renderPanel(<BusinessPanel isPlatformAdmin token="admin-token" user={null} />);

    await screen.findByText("Hola, Admin Biz 👋");
    expect(mocks.listBusinesses).toHaveBeenCalledWith("admin-token", true);
  });

  it("shows suspended owners in read-only mode and recovers after a focus refresh", async () => {
    let currentBusiness: Business = {
      id: "biz-2",
      logo_url: null,
      name: "Cafe Norte",
      slug: "cafe-norte",
      status: "suspended",
      updated_at: "2026-08-20T12:00:00Z",
    };
    const menuState = {
      current: {
        created_at: "2026-08-20T12:00:00Z",
        file_size: 128,
        id: "menu-2",
        original_filename: "menu.pdf",
        status: "active" as const,
        version: 1,
      },
      public_code: "cafe-code",
      versions: [
        {
          created_at: "2026-08-20T12:00:00Z",
          file_size: 128,
          id: "menu-1",
          original_filename: "menu-v1.pdf",
          status: "archived" as const,
          version: 1,
        },
        {
          created_at: "2026-08-20T12:05:00Z",
          file_size: 128,
          id: "menu-2",
          original_filename: "menu-v2.pdf",
          status: "active" as const,
          version: 2,
        },
      ],
    };

    mocks.listBusinesses.mockImplementation(async () => [currentBusiness]);
    mocks.request.mockImplementation(async (path: string) => {
      if (path === "/api/businesses/biz-2") return currentBusiness;
      if (path === "/api/businesses/biz-2/menu") return menuState;
      if (path === "/api/businesses/biz-2/analytics/summary") {
        return {busiest_hour: 5, scans_30d: 30, scans_7d: 7, scans_today: 1};
      }
      if (path === "/api/businesses/biz-2/analytics/scans?period=30d") return [];
      if (path === "/api/businesses/biz-2/qr") return [];
      throw new Error(`Unhandled request: ${path}`);
    });

    vi.stubGlobal("confirm", vi.fn(() => true));

    const {container} = renderPanel(<BusinessPanel token="owner-token" user={null} />);

    await screen.findByText("Hola, Cafe Norte 👋");
    expect(screen.getByTestId("suspended-panel")).toBeTruthy();
    expect(screen.getByText("Negocio suspendido")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", {name: "Mi carta"}));

    const fileInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'));
    for (const input of fileInputs) {
      expect(input.disabled).toBe(true);
    }
    expect(screen.getByRole("button", {name: "Guardar logo"}).hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByRole("button", {name: /Guardar carta|Reemplazar carta/}).hasAttribute("disabled"),
    ).toBe(true);
    const restoreButton = screen.queryByRole("button", {name: /Restaurar/});
    if (restoreButton) {
      expect(restoreButton.hasAttribute("disabled")).toBe(true);
    }

    fireEvent.click(screen.getByRole("button", {name: "Mi QR"}));
    expect(screen.getByRole("button", {name: "Generar QR"}).hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", {name: "Estadísticas"}));
    expect(screen.getByText("05:00")).toBeTruthy();

    currentBusiness = {
      ...currentBusiness,
      status: "active",
      updated_at: "2026-08-20T12:10:00Z",
    };

    fireEvent.focus(window);

    await waitFor(() => {
      expect(screen.queryByTestId("suspended-panel")).toBeNull();
    });

    fireEvent.click(screen.getByRole("button", {name: "Mi carta"}));
    const refreshedInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'));
    expect(refreshedInputs.every((input) => input.disabled === false)).toBe(true);
    fireEvent.click(screen.getByRole("button", {name: "Mi QR"}));
    expect(screen.getByRole("button", {name: "Generar QR"}).hasAttribute("disabled")).toBe(false);
  }, 15000);

  it("refreshes the header metadata after replace and rollback", async () => {
    const currentBusiness: Business = {
      id: "biz-3",
      logo_url: null,
      name: "Bar Central",
      slug: "bar-central",
      status: "active",
      updated_at: "2026-08-20T12:00:00Z",
    };
    let currentMenuState: MenuState = {
      current: {
        created_at: "2026-08-20T10:00:00Z",
        file_size: 128,
        id: "menu-1",
        original_filename: "menu-v1.pdf",
        status: "active" as const,
        version: 1,
      },
      public_code: "bar-code",
      versions: [
        {
          created_at: "2026-08-20T10:00:00Z",
          file_size: 128,
          id: "menu-1",
          original_filename: "menu-v1.pdf",
          status: "active" as const,
          version: 1,
        },
      ],
    };

    mocks.listBusinesses.mockResolvedValue([currentBusiness]);
    mocks.request.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
      if (path === "/api/businesses/biz-3") return currentBusiness;
      if (path === "/api/businesses/biz-3/menu") return currentMenuState;
      if (path === "/api/businesses/biz-3/analytics/summary") {
        return {busiest_hour: null, scans_30d: 0, scans_7d: 0, scans_today: 0};
      }
      if (path === "/api/businesses/biz-3/analytics/scans?period=30d") return [];
      if (path === "/api/businesses/biz-3/qr") return [];
      if (path === "/api/businesses/biz-3/menu/replace" && init?.method === "POST") {
        currentMenuState = {
          current: {
            created_at: "2026-08-21T10:00:00Z",
            file_size: 256,
            id: "menu-2",
            original_filename: "menu-v2.pdf",
            status: "active" as const,
            version: 2,
          },
          public_code: "bar-code",
          versions: [
            {
              created_at: "2026-08-20T10:00:00Z",
              file_size: 128,
              id: "menu-1",
              original_filename: "menu-v1.pdf",
              status: "archived" as const,
              version: 1,
            },
            {
              created_at: "2026-08-21T10:00:00Z",
              file_size: 256,
              id: "menu-2",
              original_filename: "menu-v2.pdf",
              status: "active" as const,
              version: 2,
            },
          ],
        };
        return currentMenuState;
      }
      if (path === "/api/businesses/biz-3/menu/rollback" && init?.method === "POST") {
        currentMenuState = {
          current: {
            created_at: "2026-08-20T10:00:00Z",
            file_size: 128,
            id: "menu-1",
            original_filename: "menu-v1.pdf",
            status: "active" as const,
            version: 1,
          },
          public_code: "bar-code",
          versions: [
            {
              created_at: "2026-08-20T10:00:00Z",
              file_size: 128,
              id: "menu-1",
              original_filename: "menu-v1.pdf",
              status: "active" as const,
              version: 1,
            },
            {
              created_at: "2026-08-21T10:00:00Z",
              file_size: 256,
              id: "menu-2",
              original_filename: "menu-v2.pdf",
              status: "archived" as const,
              version: 2,
            },
          ],
        };
        return currentMenuState;
      }
      throw new Error(`Unhandled request: ${path}`);
    });

    vi.stubGlobal("confirm", vi.fn(() => true));

    const {container} = renderPanel(<BusinessPanel token="owner-token" user={null} />);

    await screen.findByText("Hola, Bar Central 👋");
    await waitFor(() => {
      expect(screen.getByText(/Última actualización: 20\/8\/2026/)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", {name: "Mi carta"}));
    const pdfInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'));
    const pdfInput = pdfInputs[pdfInputs.length - 1];
    fireEvent.change(pdfInput, {
      target: {files: [new File(["pdf"], "menu-v2.pdf", {type: "application/pdf"})]},
    });
    fireEvent.click(screen.getByRole("button", {name: "Reemplazar carta"}));

    await waitFor(() => {
      expect(screen.getByText(/Última actualización: 21\/8\/2026/)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", {name: /Restaurar/}));

    await waitFor(() => {
      expect(screen.getByText(/Última actualización: 20\/8\/2026/)).toBeTruthy();
    });
  }, 15000);

  it("switches analytics between 7 and 30 real days without changing the source endpoint", async () => {
    const business: Business = {
      id: "biz-4",
      logo_url: null,
      name: "Analytics Biz",
      slug: "analytics-biz",
      status: "active",
      updated_at: "2026-08-20T12:00:00Z",
    };
    const series30 = Array.from({length: 30}, (_, index) => ({
      date: `2026-08-${String(index + 1).padStart(2, "0")}`,
      scans: index + 1,
    }));

    mocks.listBusinesses.mockResolvedValue([business]);
    mocks.request.mockImplementation(async (path: string) => {
      if (path === "/api/businesses/biz-4") return business;
      if (path === "/api/businesses/biz-4/menu") {
        return {current: null, public_code: null, versions: []};
      }
      if (path === "/api/businesses/biz-4/analytics/summary") {
        return {busiest_hour: 21, scans_30d: 465, scans_7d: 189, scans_today: 30};
      }
      if (path === "/api/businesses/biz-4/analytics/scans?period=30d") return series30;
      if (path === "/api/businesses/biz-4/qr") return [];
      throw new Error(`Unhandled request: ${path}`);
    });

    renderPanel(<BusinessPanel token="owner-token" user={null} />);

    await screen.findByText("Hola, Analytics Biz 👋");
    fireEvent.click(screen.getByRole("button", {name: "Estadísticas"}));

    const [windowSwitcher] = screen.getAllByRole("tablist", {name: "Ventana de actividad"});
    expect(within(windowSwitcher).getByRole("tab", {name: "7 días"}).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("activity-chart-summary").textContent).toContain("189");
    expect(screen.getByTestId("activity-chart-summary").textContent).toContain("30-ago");
    expect(screen.getByTestId("activity-chart-summary").textContent).toContain("30 visualizaciones");

    fireEvent.click(within(windowSwitcher).getByRole("tab", {name: "30 días"}));

    await waitFor(() => {
      expect(within(windowSwitcher).getByRole("tab", {name: "30 días"}).getAttribute("aria-selected")).toBe("true");
      expect(screen.getByTestId("activity-chart-summary").textContent).toContain("465");
      expect(screen.getByTestId("activity-chart-summary").textContent).toContain("30-ago");
    });

    expect(mocks.request).toHaveBeenCalledWith(
      "/api/businesses/biz-4/analytics/scans?period=30d",
      "owner-token",
    );
  }, 15000);

  it("deduplicates bootstrap requests across strict-mode mount and paired visibility sync events", async () => {
    const business: Business = {
      id: "biz-5",
      logo_url: null,
      name: "Perf Biz",
      slug: "perf-biz",
      status: "active",
      updated_at: "2026-08-21T12:00:00Z",
    };

    mocks.listBusinesses.mockResolvedValue([business]);
    mocks.request.mockImplementation(async (path: string) => {
      if (path === "/api/businesses/biz-5") return business;
      if (path === "/api/businesses/biz-5/menu") {
        return {current: null, public_code: null, versions: []};
      }
      if (path === "/api/businesses/biz-5/analytics/summary") {
        return {busiest_hour: 20, scans_30d: 33, scans_7d: 8, scans_today: 3};
      }
      if (path === "/api/businesses/biz-5/analytics/scans?period=30d") return [];
      if (path === "/api/businesses/biz-5/qr") return [];
      throw new Error(`Unhandled request: ${path}`);
    });

    render(
      <AppearanceProvider>
        <React.StrictMode>
          <BusinessPanel token="owner-token" user={null} />
        </React.StrictMode>
      </AppearanceProvider>,
    );

    await screen.findByText("Hola, Perf Biz 👋");
    await waitFor(() => {
      expect(mocks.listBusinesses).toHaveBeenCalledTimes(1);
    });

    const initialPaths = mocks.request.mock.calls.map(([path]) => path as string);
    expect(initialPaths.filter((path) => path === "/api/businesses/biz-5")).toHaveLength(1);
    expect(initialPaths.filter((path) => path === "/api/businesses/biz-5/menu")).toHaveLength(1);
    expect(
      initialPaths.filter((path) => path === "/api/businesses/biz-5/analytics/summary"),
    ).toHaveLength(1);
    expect(
      initialPaths.filter((path) => path === "/api/businesses/biz-5/analytics/scans?period=30d"),
    ).toHaveLength(1);
    expect(initialPaths.filter((path) => path === "/api/businesses/biz-5/qr")).toHaveLength(1);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    fireEvent.focus(window);
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => {
      expect(mocks.listBusinesses).toHaveBeenCalledTimes(2);
    });

    const syncedPaths = mocks.request.mock.calls.map(([path]) => path as string);
    expect(syncedPaths.filter((path) => path === "/api/businesses/biz-5")).toHaveLength(2);
    expect(syncedPaths.filter((path) => path === "/api/businesses/biz-5/menu")).toHaveLength(2);
    expect(
      syncedPaths.filter((path) => path === "/api/businesses/biz-5/analytics/summary"),
    ).toHaveLength(2);
    expect(
      syncedPaths.filter((path) => path === "/api/businesses/biz-5/analytics/scans?period=30d"),
    ).toHaveLength(2);
    expect(syncedPaths.filter((path) => path === "/api/businesses/biz-5/qr")).toHaveLength(2);
  });

  it("hides the redundant activity block in minimal mode and keeps it in maximal mode", async () => {
    const business: Business = {
      id: "biz-6",
      logo_url: null,
      name: "Minimal Biz",
      slug: "minimal-biz",
      status: "active",
      destination_type: "menu_pdf",
      external_url: null,
      updated_at: "2026-08-20T12:00:00Z",
    };

    mocks.listBusinesses.mockResolvedValue([business]);
    mocks.request.mockImplementation(async (path: string) => {
      if (path === "/api/businesses/biz-6") return business;
      if (path === "/api/businesses/biz-6/menu") {
        return {current: null, public_code: "minimal-code", versions: []};
      }
      if (path === "/api/businesses/biz-6/analytics/summary") {
        return {busiest_hour: 21, scans_30d: 30, scans_7d: 7, scans_today: 1};
      }
      if (path === "/api/businesses/biz-6/analytics/scans?period=30d") return [];
      if (path === "/api/businesses/biz-6/qr") return [];
      throw new Error(`Unhandled request: ${path}`);
    });

    const minimal = renderPanel(<BusinessPanel token="owner-token" user={null} />, "minimal");
    await screen.findByTestId("dashboard-layout-minimal");
    expect(screen.queryByText("Actividad en 7 días")).toBeNull();
    minimal.unmount();

    renderPanel(<BusinessPanel token="owner-token" user={null} />, "maximal");
    await screen.findByTestId("dashboard-layout-maximal");
    expect(screen.getByText("Actividad reciente")).toBeTruthy();
  });

  it("lets the owner switch between hosted and external menu destinations", async () => {
    let currentBusiness: Business = {
      id: "biz-7",
      logo_url: null,
      name: "Destination Owner Biz",
      slug: "destination-owner-biz",
      status: "active",
      destination_type: "menu_pdf",
      external_url: null,
      updated_at: "2026-08-20T12:00:00Z",
    };

    mocks.listBusinesses.mockImplementation(async () => [currentBusiness]);
    mocks.request.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
      if (path === "/api/businesses/biz-7" && init?.method === "PATCH") {
        const payload = JSON.parse(String(init.body)) as {
          destination_type: "menu_pdf" | "external_url";
          external_url?: string;
        };
        currentBusiness = {
          ...currentBusiness,
          destination_type: payload.destination_type,
          external_url:
            payload.destination_type === "external_url" ? payload.external_url ?? null : null,
        };
        return currentBusiness;
      }
      if (path === "/api/businesses/biz-7") return currentBusiness;
      if (path === "/api/businesses/biz-7/menu") {
        return {current: null, public_code: "owner-destination-code", versions: []};
      }
      if (path === "/api/businesses/biz-7/analytics/summary") {
        return {busiest_hour: null, scans_30d: 0, scans_7d: 0, scans_today: 0};
      }
      if (path === "/api/businesses/biz-7/analytics/scans?period=30d") return [];
      if (path === "/api/businesses/biz-7/qr") return [];
      throw new Error(`Unhandled request: ${path}`);
    });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    renderPanel(<BusinessPanel token="owner-token" user={null} />);

    await screen.findByText("Hola, Destination Owner Biz 👋");
    fireEvent.click(screen.getByRole("button", {name: "Mi negocio"}));

    fireEvent.click(screen.getByLabelText("Usar una carta que ya tengo"));
    fireEvent.change(screen.getByLabelText("URL de tu carta"), {
      target: {value: "https://carta.ejemplo.com/menu"},
    });
    fireEvent.click(screen.getByRole("button", {name: "Guardar"}));

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/api/businesses/biz-7",
        "owner-token",
        expect.objectContaining({
          body: JSON.stringify({
            destination_type: "external_url",
            external_url: "https://carta.ejemplo.com/menu",
          }),
          headers: {"Content-Type": "application/json"},
          method: "PATCH",
        }),
      );
    });
    expect(screen.getByRole("button", {name: "Abrir/probar enlace actual"}).hasAttribute("disabled")).toBe(
      false,
    );

    fireEvent.click(screen.getByRole("button", {name: "Abrir/probar enlace actual"}));
    expect(openSpy).toHaveBeenCalledWith(
      "https://carta.ejemplo.com/menu",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
