// @vitest-environment jsdom

import React from "react";
import {cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
import {BusinessPanel} from "../components/BusinessPanel";
import {nambreDefaultThemeConfig} from "../components/public-menu/theme";
import {AppearanceProvider} from "../components/ui/AppearanceProvider";
import {appearancePreferences} from "../lib/appearance-preferences";
import {ApiError, type Business, type DigitalMenu, type MenuCategory, type MenuItem, type MenuState} from "../lib/api";

const mocks = vi.hoisted(() => ({
  createDigitalMenu: vi.fn(),
  createMenuCategory: vi.fn(),
  createMenuItem: vi.fn(),
  deleteMenuItemImage: vi.fn(),
  deleteMenuCategory: vi.fn(),
  deleteMenuItem: vi.fn<
    (_token: string | null | undefined, _businessId: string, _menuId: string, itemId: string) => Promise<void>
  >(async () => undefined),
  downloadQrAsset: vi.fn(async () => undefined),
  fetchDigitalMenu: vi.fn(),
  fetchQrAssetBlob: vi.fn(async () => new Blob(["qr"])),
  listBusinesses: vi.fn(),
  listMenuCategories: vi.fn(),
  listMenuItems: vi.fn(),
  request: vi.fn(),
  updateDigitalMenu: vi.fn(),
  updateMenuCategory: vi.fn(),
  updateBusinessDestination: vi.fn(
    async (
      token: string | null | undefined,
      businessId: string,
      payload: {
        destination_type: "menu_pdf" | "external_url" | "digital_menu";
        external_url?: string | null;
      },
      isPlatformAdmin = false,
    ) =>
      mocks.request(`${isPlatformAdmin ? "/admin" : "/api"}/businesses/${businessId}`, token, {
        body: JSON.stringify(payload),
        headers: {"Content-Type": "application/json"},
        method: "PATCH",
      }),
  ),
  updateMenuItem: vi.fn(),
  uploadMenuItemImage: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("@/lib/api");
  return {
    ...actual,
    createDigitalMenu: mocks.createDigitalMenu,
    createMenuCategory: mocks.createMenuCategory,
    createMenuItem: mocks.createMenuItem,
    deleteMenuItemImage: mocks.deleteMenuItemImage,
    deleteMenuCategory: mocks.deleteMenuCategory,
    deleteMenuItem: mocks.deleteMenuItem,
    downloadQrAsset: mocks.downloadQrAsset,
    fetchDigitalMenu: mocks.fetchDigitalMenu,
    fetchQrAssetBlob: mocks.fetchQrAssetBlob,
    listBusinesses: mocks.listBusinesses,
    listMenuCategories: mocks.listMenuCategories,
    listMenuItems: mocks.listMenuItems,
    request: mocks.request,
    updateDigitalMenu: mocks.updateDigitalMenu,
    updateMenuCategory: mocks.updateMenuCategory,
    updateBusinessDestination: mocks.updateBusinessDestination,
    updateMenuItem: mocks.updateMenuItem,
    uploadMenuItemImage: mocks.uploadMenuItemImage,
  };
});

afterEach(() => {
  cleanup();
  mocks.createDigitalMenu.mockReset();
  mocks.createMenuCategory.mockReset();
  mocks.createMenuItem.mockReset();
  mocks.deleteMenuItemImage.mockReset();
  mocks.deleteMenuCategory.mockReset();
  mocks.deleteMenuItem.mockClear();
  mocks.downloadQrAsset.mockClear();
  mocks.fetchDigitalMenu.mockReset();
  mocks.fetchQrAssetBlob.mockClear();
  mocks.listBusinesses.mockReset();
  mocks.listMenuCategories.mockReset();
  mocks.listMenuItems.mockReset();
  mocks.request.mockReset();
  mocks.updateDigitalMenu.mockReset();
  mocks.updateMenuCategory.mockReset();
  mocks.updateBusinessDestination.mockClear();
  mocks.updateMenuItem.mockReset();
  mocks.uploadMenuItemImage.mockReset();
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

    renderPanel(<BusinessPanel token="owner-token" user={null} />);

    await screen.findByText("Hola, Demo Biz 👋");
    fireEvent.click(screen.getByRole("button", {name: "Mi carta"}));

    const logoInput = screen.getByLabelText("Logo") as HTMLInputElement;
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
    expect(screen.getByText(/5:00/)).toBeTruthy();

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
  }, 30000);

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

    renderPanel(<BusinessPanel token="owner-token" user={null} />);

    await screen.findByText("Hola, Bar Central 👋");
    await waitFor(() => {
      expect(screen.getByText(/Última actualización: 20\/8\/2026/)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", {name: "Mi carta"}));
    const pdfInput = screen.getByLabelText("PDF") as HTMLInputElement;
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
    fireEvent.click(screen.getByRole("button", {name: "Mi carta"}));

    fireEvent.click(screen.getByRole("radio", {name: /Carta digital propia/i}));
    fireEvent.change(screen.getByLabelText("URL de tu carta"), {
      target: {value: "https://carta.ejemplo.com/menu"},
    });
    fireEvent.click(screen.getByRole("button", {name: "Guardar modalidad"}));

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
    expect(screen.getByRole("button", {name: "Abrir enlace actual"}).hasAttribute("disabled")).toBe(
      false,
    );

    fireEvent.click(screen.getByRole("button", {name: "Abrir enlace actual"}));
    expect(openSpy).toHaveBeenCalledWith(
      "https://carta.ejemplo.com/menu",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("shows the empty state for Carta Nambre and creates the menu", async () => {
    const business: Business = {
      destination_type: "menu_pdf",
      external_url: null,
      features: {digital_menu: true},
      id: "biz-dm-empty",
      logo_url: null,
      name: "Carta Nambre Vacia",
      plan_key: "premium",
      slug: "carta-nambre-vacia",
      status: "active",
    };
    let currentMenu: DigitalMenu | null = null;

    mocks.listBusinesses.mockResolvedValue([business]);
    mocks.request.mockImplementation(async (path: string) => {
      if (path === "/api/businesses/biz-dm-empty") return business;
      if (path === "/api/businesses/biz-dm-empty/menu") {
        return {current: null, public_code: "empty-code", versions: []};
      }
      if (path === "/api/businesses/biz-dm-empty/analytics/summary") {
        return {busiest_hour: null, scans_30d: 0, scans_7d: 0, scans_today: 0};
      }
      if (path === "/api/businesses/biz-dm-empty/analytics/scans?period=30d") return [];
      if (path === "/api/businesses/biz-dm-empty/qr") return [];
      throw new Error(`Unhandled request: ${path}`);
    });
    mocks.fetchDigitalMenu.mockImplementation(async () => currentMenu);
    mocks.listMenuCategories.mockResolvedValue([]);
    mocks.listMenuItems.mockResolvedValue([]);
    mocks.createDigitalMenu.mockImplementation(async () => {
      currentMenu = {
        business_id: business.id,
        created_at: "2026-08-24T10:00:00Z",
        id: "dm-1",
        is_published: false,
        name: "Carta Carta Nambre Vacia",
        status: "draft",
        template_key: "modern",
        updated_at: "2026-08-24T10:00:00Z",
      };
      return currentMenu;
    });

    renderPanel(<BusinessPanel token="owner-token" user={null} />);

    await screen.findByText("Hola, Carta Nambre Vacia 👋");
    fireEvent.click(screen.getByRole("button", {name: "Mi carta"}));
    fireEvent.click(screen.getByRole("radio", {name: /Carta Nambre/i}));

    expect(await screen.findByText("Creá tu Carta Nambre")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", {name: "Crear Carta Nambre"}));

    await waitFor(() => expect(mocks.createDigitalMenu).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Carta Nambre creada correctamente.")).toBeTruthy();
  });

  it("lets the owner create, edit, hide and move categories in Carta Nambre", async () => {
    const business: Business = {
      destination_type: "digital_menu",
      external_url: null,
      features: {digital_menu: true},
      id: "biz-dm-categories",
      logo_url: null,
      name: "Carta Categorias",
      plan_key: "premium",
      slug: "carta-categorias",
      status: "active",
    };
    const menu: DigitalMenu = {
      business_id: business.id,
      created_at: "2026-08-24T10:00:00Z",
      id: "dm-cat",
      is_published: false,
      name: "Carta Categorias",
      status: "draft",
      template_key: "modern",
      updated_at: "2026-08-24T10:00:00Z",
    };
    let categories: MenuCategory[] = [
      {
        created_at: "2026-08-24T10:00:00Z",
        description: null,
        digital_menu_id: menu.id,
        id: "cat-1",
        is_visible: true,
        name: "Bebidas",
        position: 0,
        updated_at: "2026-08-24T10:00:00Z",
      },
      {
        created_at: "2026-08-24T10:05:00Z",
        description: null,
        digital_menu_id: menu.id,
        id: "cat-2",
        is_visible: true,
        name: "Comidas",
        position: 1,
        updated_at: "2026-08-24T10:05:00Z",
      },
    ];

    mocks.listBusinesses.mockResolvedValue([business]);
    mocks.request.mockImplementation(async (path: string) => {
      if (path === "/api/businesses/biz-dm-categories") return business;
      if (path === "/api/businesses/biz-dm-categories/menu") {
        return {current: null, public_code: "cat-code", versions: []};
      }
      if (path === "/api/businesses/biz-dm-categories/analytics/summary") {
        return {busiest_hour: null, scans_30d: 0, scans_7d: 0, scans_today: 0};
      }
      if (path === "/api/businesses/biz-dm-categories/analytics/scans?period=30d") return [];
      if (path === "/api/businesses/biz-dm-categories/qr") return [];
      throw new Error(`Unhandled request: ${path}`);
    });
    mocks.fetchDigitalMenu.mockResolvedValue(menu);
    mocks.listMenuItems.mockResolvedValue([]);
    mocks.listMenuCategories.mockImplementation(async () =>
      [...categories].sort((a, b) => a.position - b.position),
    );
    mocks.createMenuCategory.mockImplementation(async (_token, _businessId, menuId, payload) => {
      const created: MenuCategory = {
        created_at: "2026-08-24T10:10:00Z",
        description: payload.description ?? null,
        digital_menu_id: menuId,
        id: `cat-${categories.length + 1}`,
        is_visible: payload.is_visible ?? true,
        name: payload.name,
        position: payload.position ?? categories.length,
        updated_at: "2026-08-24T10:10:00Z",
      };
      categories = [...categories, created];
      return created;
    });
    mocks.updateMenuCategory.mockImplementation(async (_token, _businessId, _menuId, categoryId, payload) => {
      categories = categories.map((category) =>
        category.id === categoryId
          ? {
              ...category,
              description: payload.description ?? category.description,
              is_visible: payload.is_visible ?? category.is_visible,
              name: payload.name ?? category.name,
              position: payload.position ?? category.position,
            }
          : category,
      );
      return categories.find((category) => category.id === categoryId)!;
    });

    renderPanel(<BusinessPanel token="owner-token" user={null} />);

    await screen.findByText("Hola, Carta Categorias 👋");
    fireEvent.click(screen.getByRole("button", {name: "Mi carta"}));

    expect(await screen.findByText("Bebidas")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", {name: /Nueva categoría/i}));
    fireEvent.change(screen.getByLabelText("Nombre *"), {target: {value: "Postres"}});
    fireEvent.change(screen.getByLabelText("Descripción"), {target: {value: "Dulces"}});
    fireEvent.click(screen.getByRole("button", {name: "Crear categoría"}));

    await waitFor(() => expect(mocks.createMenuCategory).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Postres")).toBeTruthy();

    const editButtons = screen.getAllByRole("button", {name: /Editar/i});
    fireEvent.click(editButtons[editButtons.length - 1]!);
    fireEvent.change(screen.getByLabelText("Nombre *"), {target: {value: "Bebidas frías"}});
    fireEvent.click(screen.getByLabelText("Visible"));
    fireEvent.click(screen.getByRole("button", {name: "Guardar categoría"}));

    await waitFor(() => expect(mocks.updateMenuCategory).toHaveBeenCalled());
    expect(await screen.findByText("Bebidas frías")).toBeTruthy();
    expect(await screen.findByText("Oculta")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", {name: "Bajar Bebidas frías"}));
    await waitFor(() => {
      const headings = screen.getAllByText(/Bebidas frías|Comidas|Postres/).map((node) => node.textContent);
      expect(headings.indexOf("Bebidas frías")).toBeGreaterThan(headings.indexOf("Comidas"));
    });
  }, 15000);

  it("lets the owner create, edit, toggle, move and delete products in Carta Nambre", async () => {
    const business: Business = {
      destination_type: "digital_menu",
      external_url: null,
      features: {digital_menu: true},
      id: "biz-dm-items",
      logo_url: null,
      name: "Carta Productos",
      plan_key: "premium",
      slug: "carta-productos",
      status: "active",
    };
    const menu: DigitalMenu = {
      business_id: business.id,
      created_at: "2026-08-24T10:00:00Z",
      id: "dm-items",
      is_published: false,
      name: "Carta Productos",
      status: "draft",
      template_key: "modern",
      updated_at: "2026-08-24T10:00:00Z",
    };
    const categories: MenuCategory[] = [
      {
        created_at: "2026-08-24T10:00:00Z",
        description: null,
        digital_menu_id: menu.id,
        id: "cat-main",
        is_visible: true,
        name: "Hamburguesas",
        position: 0,
        updated_at: "2026-08-24T10:00:00Z",
      },
    ];
    let items: MenuItem[] = [
      {
        category_id: "cat-main",
        created_at: "2026-08-24T10:00:00Z",
        currency: "ARS",
        description: "Simple",
        id: "item-1",
        image_url: null,
        is_available: true,
        is_featured: false,
        is_visible: true,
        name: "Clasica",
        position: 0,
        price: "10000.00",
        updated_at: "2026-08-24T10:00:00Z",
      },
      {
        category_id: "cat-main",
        created_at: "2026-08-24T10:01:00Z",
        currency: "ARS",
        description: "Con cheddar",
        id: "item-2",
        image_url: null,
        is_available: true,
        is_featured: false,
        is_visible: true,
        name: "Cheddar",
        position: 1,
        price: "12000.00",
        updated_at: "2026-08-24T10:01:00Z",
      },
    ];

    mocks.listBusinesses.mockResolvedValue([business]);
    mocks.request.mockImplementation(async (path: string) => {
      if (path === "/api/businesses/biz-dm-items") return business;
      if (path === "/api/businesses/biz-dm-items/menu") {
        return {current: null, public_code: "items-code", versions: []};
      }
      if (path === "/api/businesses/biz-dm-items/analytics/summary") {
        return {busiest_hour: null, scans_30d: 0, scans_7d: 0, scans_today: 0};
      }
      if (path === "/api/businesses/biz-dm-items/analytics/scans?period=30d") return [];
      if (path === "/api/businesses/biz-dm-items/qr") return [];
      throw new Error(`Unhandled request: ${path}`);
    });
    mocks.fetchDigitalMenu.mockResolvedValue(menu);
    mocks.listMenuCategories.mockResolvedValue(categories);
    mocks.listMenuItems.mockImplementation(async () => [...items].sort((a, b) => a.position - b.position));
    mocks.createMenuItem.mockImplementation(async (_token, _businessId, _menuId, categoryId, payload) => {
      const created: MenuItem = {
        category_id: categoryId,
        created_at: "2026-08-24T10:02:00Z",
        currency: payload.currency ?? "ARS",
        description: payload.description ?? null,
        id: `item-${items.length + 1}`,
        image_url: null,
        is_available: payload.is_available ?? true,
        is_featured: payload.is_featured ?? false,
        is_visible: payload.is_visible ?? true,
        name: payload.name,
        position: payload.position ?? items.length,
        price: payload.price,
        updated_at: "2026-08-24T10:02:00Z",
      };
      items = [...items, created];
      return created;
    });
    mocks.updateMenuItem.mockImplementation(async (_token, _businessId, _menuId, itemId, payload) => {
      items = items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              description: payload.description ?? item.description,
              is_available: payload.is_available ?? item.is_available,
              is_featured: payload.is_featured ?? item.is_featured,
              is_visible: payload.is_visible ?? item.is_visible,
              name: payload.name ?? item.name,
              position: payload.position ?? item.position,
              price: payload.price ?? item.price,
            }
          : item,
      );
      return items.find((item) => item.id === itemId)!;
    });
    mocks.deleteMenuItem.mockImplementation(async (_token, _businessId, _menuId, itemId) => {
      items = items.filter((item) => item.id !== itemId);
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderPanel(<BusinessPanel token="owner-token" user={null} />);

    await screen.findByText("Hola, Carta Productos 👋");
    fireEvent.click(screen.getByRole("button", {name: "Mi carta"}));

    await screen.findByText("Hamburguesas");
    fireEvent.click(screen.getAllByRole("button", {name: /Agregar producto/i})[0]);
    await screen.findByRole("heading", {name: "Nuevo producto"});
    fireEvent.change(screen.getByLabelText("Nombre *"), {target: {value: "Doble Bacon"}});
    fireEvent.change(screen.getByLabelText("Descripción"), {target: {value: "Con panceta"}});
    fireEvent.change(screen.getByRole("textbox", {name: /Precio/i}), {target: {value: "12500,50"}});
    fireEvent.click(screen.getByLabelText("Destacado"));
    fireEvent.click(screen.getByRole("button", {name: "Crear producto"}));

    await waitFor(() => expect(mocks.createMenuItem).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Doble Bacon")).toBeTruthy();
    expect(await screen.findByText(/\$.*12\.500,50/)).toBeTruthy();

    const createdItemRow = screen.getByText("Doble Bacon").closest(".digital-menu-item-row");
    expect(createdItemRow).toBeTruthy();
    fireEvent.click(within(createdItemRow as HTMLElement).getByRole("button", {name: /Editar/i}));
    await screen.findByRole("heading", {name: "Editar producto"});
    fireEvent.change(screen.getByLabelText("Descripción"), {target: {value: "Con papas"}});
    fireEvent.change(screen.getByRole("textbox", {name: /Precio/i}), {target: {value: "13000"}});
    fireEvent.click(screen.getByRole("button", {name: "Guardar producto"}));

    await waitFor(() => expect(mocks.updateMenuItem).toHaveBeenCalled());
    expect(await screen.findByText(/\$.*13\.000/)).toBeTruthy();
    expect(await screen.findByText("Con papas")).toBeTruthy();

    const updatedItemRow = screen.getByText("Doble Bacon").closest(".digital-menu-item-row");
    expect(updatedItemRow).toBeTruthy();
    fireEvent.click(within(updatedItemRow as HTMLElement).getByRole("button", {name: "Marcar agotado"}));
    expect(await screen.findByText("Agotado")).toBeTruthy();
    fireEvent.click(within(updatedItemRow as HTMLElement).getByRole("button", {name: "Ocultar"}));
    expect(await screen.findByText("Oculto")).toBeTruthy();
    fireEvent.click(within(updatedItemRow as HTMLElement).getByRole("button", {name: "Quitar destacado"}));
    await waitFor(() => {
      expect(within(updatedItemRow as HTMLElement).queryByText("Destacado")).toBeNull();
    });

    fireEvent.click(screen.getByRole("button", {name: "Bajar Clasica"}));
    await waitFor(() => {
      const labels = screen.getAllByText(/Clasica|Cheddar|Doble Bacon/).map((node) => node.textContent);
      expect(labels.indexOf("Clasica")).toBeGreaterThan(labels.indexOf("Cheddar"));
    });

    fireEvent.click(within(updatedItemRow as HTMLElement).getByRole("button", {name: "Eliminar"}));
    await waitFor(() => expect(mocks.deleteMenuItem).toHaveBeenCalled());
  }, 15000);

  it("shows friendly errors and releases the submit state after a failed product save", async () => {
    const business: Business = {
      destination_type: "digital_menu",
      external_url: null,
      features: {digital_menu: true},
      id: "biz-dm-error",
      logo_url: null,
      name: "Carta Error",
      plan_key: "premium",
      slug: "carta-error",
      status: "active",
    };
    const menu: DigitalMenu = {
      business_id: business.id,
      created_at: "2026-08-24T10:00:00Z",
      id: "dm-error",
      is_published: false,
      name: "Carta Error",
      status: "draft",
      template_key: "modern",
      updated_at: "2026-08-24T10:00:00Z",
    };
    const categories: MenuCategory[] = [
      {
        created_at: "2026-08-24T10:00:00Z",
        description: null,
        digital_menu_id: menu.id,
        id: "cat-error",
        is_visible: true,
        name: "Sandwiches",
        position: 0,
        updated_at: "2026-08-24T10:00:00Z",
      },
    ];

    mocks.listBusinesses.mockResolvedValue([business]);
    mocks.request.mockImplementation(async (path: string) => {
      if (path === "/api/businesses/biz-dm-error") return business;
      if (path === "/api/businesses/biz-dm-error/menu") {
        return {current: null, public_code: "error-code", versions: []};
      }
      if (path === "/api/businesses/biz-dm-error/analytics/summary") {
        return {busiest_hour: null, scans_30d: 0, scans_7d: 0, scans_today: 0};
      }
      if (path === "/api/businesses/biz-dm-error/analytics/scans?period=30d") return [];
      if (path === "/api/businesses/biz-dm-error/qr") return [];
      throw new Error(`Unhandled request: ${path}`);
    });
    mocks.fetchDigitalMenu.mockResolvedValue(menu);
    mocks.listMenuCategories.mockResolvedValue(categories);
    mocks.listMenuItems.mockResolvedValue([]);
    mocks.createMenuItem.mockRejectedValue(new ApiError(422, "validation"));

    renderPanel(<BusinessPanel token="owner-token" user={null} />);

    await screen.findByText("Hola, Carta Error 👋");
    fireEvent.click(screen.getByRole("button", {name: "Mi carta"}));
    await screen.findByText("Sandwiches");
    fireEvent.click(screen.getAllByRole("button", {name: /Agregar producto/i})[0]);
    await screen.findByRole("heading", {name: "Nuevo producto"});
    fireEvent.change(screen.getByLabelText("Nombre *"), {target: {value: "Especial"}});
    fireEvent.change(screen.getByRole("textbox", {name: /Precio/i}), {target: {value: "abc"}});
    fireEvent.click(screen.getByRole("button", {name: "Crear producto"}));
    expect(await screen.findByText("Ingresá un precio válido. Ejemplo: 12500,50")).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox", {name: /Precio/i}), {target: {value: "12000"}});
    fireEvent.click(screen.getByRole("button", {name: "Crear producto"}));

    expect(await screen.findByText("No pudimos guardar el producto. Revisá el precio e intentá nuevamente.")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole("button", {name: "Crear producto"}).textContent).toBe("Crear producto"),
    );
  }, 15000);

  it("shows product image controls, previews, uploads, replaces and deletes images", async () => {
    const createObjectURL = vi.fn((file: File) => `blob:${file.name}`);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL,
        revokeObjectURL,
      }),
    );

    const business: Business = {
      destination_type: "digital_menu",
      external_url: null,
      features: {digital_menu: true},
      id: "biz-dm-images",
      logo_url: null,
      name: "Carta Fotos",
      plan_key: "premium",
      slug: "carta-fotos",
      status: "active",
    };
    const menu: DigitalMenu = {
      business_id: business.id,
      created_at: "2026-08-24T10:00:00Z",
      id: "dm-images",
      is_published: false,
      name: "Carta Fotos",
      status: "draft",
      template_key: "modern",
      updated_at: "2026-08-24T10:00:00Z",
    };
    const categories: MenuCategory[] = [
      {
        created_at: "2026-08-24T10:00:00Z",
        description: null,
        digital_menu_id: menu.id,
        id: "cat-images",
        is_visible: true,
        name: "Especiales",
        position: 0,
        updated_at: "2026-08-24T10:00:00Z",
      },
    ];
    let items: MenuItem[] = [];

    mocks.listBusinesses.mockResolvedValue([business]);
    mocks.request.mockImplementation(async (path: string) => {
      if (path === "/api/businesses/biz-dm-images") return business;
      if (path === "/api/businesses/biz-dm-images/menu") {
        return {current: null, public_code: "images-code", versions: []};
      }
      if (path === "/api/businesses/biz-dm-images/analytics/summary") {
        return {busiest_hour: null, scans_30d: 0, scans_7d: 0, scans_today: 0};
      }
      if (path === "/api/businesses/biz-dm-images/analytics/scans?period=30d") return [];
      if (path === "/api/businesses/biz-dm-images/qr") return [];
      throw new Error(`Unhandled request: ${path}`);
    });
    mocks.fetchDigitalMenu.mockResolvedValue(menu);
    mocks.listMenuCategories.mockResolvedValue(categories);
    mocks.listMenuItems.mockImplementation(async () => [...items].sort((a, b) => a.position - b.position));
    mocks.createMenuItem.mockImplementation(async (_token, _businessId, _menuId, categoryId, payload) => {
      const created: MenuItem = {
        category_id: categoryId,
        created_at: "2026-08-24T10:02:00Z",
        currency: payload.currency ?? "ARS",
        description: payload.description ?? null,
        id: `item-${items.length + 1}`,
        image_url: null,
        is_available: payload.is_available ?? true,
        is_featured: payload.is_featured ?? false,
        is_visible: payload.is_visible ?? true,
        name: payload.name,
        position: payload.position ?? items.length,
        price: payload.price,
        updated_at: "2026-08-24T10:02:00Z",
      };
      items = [...items, created];
      return created;
    });
    mocks.updateMenuItem.mockImplementation(async (_token, _businessId, _menuId, itemId, payload) => {
      items = items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              description: payload.description ?? item.description,
              is_available: payload.is_available ?? item.is_available,
              is_featured: payload.is_featured ?? item.is_featured,
              is_visible: payload.is_visible ?? item.is_visible,
              name: payload.name ?? item.name,
              position: payload.position ?? item.position,
              price: payload.price ?? item.price,
            }
          : item,
      );
      return items.find((item) => item.id === itemId)!;
    });
    const uploadControl: {release: null | (() => void)} = {release: null};
    mocks.uploadMenuItemImage.mockImplementation(
      async (_token, _businessId, _menuId, itemId, file: File) =>
        await new Promise<MenuItem>((resolve) => {
          uploadControl.release = () => {
            items = items.map((item) =>
              item.id === itemId
                ? {
                    ...item,
                    image_url: `/media/menu-items/${itemId}/${file.name.replace(/\.[^.]+$/, "")}.webp`,
                  }
                : item,
            );
            resolve(items.find((item) => item.id === itemId)!);
          };
        }),
    );
    mocks.deleteMenuItemImage.mockImplementation(async (_token, _businessId, _menuId, itemId) => {
      items = items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              image_url: null,
            }
          : item,
      );
      return items.find((item) => item.id === itemId)!;
    });

    renderPanel(<BusinessPanel token="owner-token" user={null} />);

    await screen.findByText("Hola, Carta Fotos 👋");
    fireEvent.click(screen.getByRole("button", {name: "Mi carta"}));
    await screen.findByText("Especiales");

    fireEvent.click(screen.getAllByRole("button", {name: /Agregar producto/i})[0]);
    await screen.findByRole("heading", {name: "Nuevo producto"});
    expect(screen.getByText("Imagen del producto")).toBeTruthy();
    expect(screen.getByText("Sin foto cargada")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Imagen del producto"), {
      target: {files: [new File(["bad"], "bad.txt", {type: "text/plain"})]},
    });
    expect(screen.getByText("Formato no compatible. Usá JPG, PNG o WebP.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Imagen del producto"), {
      target: {files: [new File(["photo"], "burger.jpg", {type: "image/jpeg"})]},
    });
    expect(screen.getByAltText("Preview de imagen del producto")).toBeTruthy();
    expect(screen.getByText("Se guardará al confirmar.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Nombre *"), {target: {value: "Burger Melt"}});
    fireEvent.change(screen.getByRole("textbox", {name: /Precio/i}), {target: {value: "14500"}});
    fireEvent.click(screen.getByRole("button", {name: "Crear producto"}));

    await waitFor(() => expect(mocks.createMenuItem).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.uploadMenuItemImage).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", {name: "Guardando..."}).hasAttribute("disabled")).toBe(true);
    if (uploadControl.release === null) {
      throw new Error("Expected pending upload");
    }
    uploadControl.release();

    await screen.findByText("Producto creado correctamente.");
    expect(await screen.findByText("Burger Melt")).toBeTruthy();
    expect(await screen.findByText("Con foto")).toBeTruthy();

    const createdRow = screen.getByText("Burger Melt").closest(".digital-menu-item-row");
    expect(createdRow).toBeTruthy();
    fireEvent.click(within(createdRow as HTMLElement).getByRole("button", {name: /Editar/i}));
    await screen.findByRole("heading", {name: "Editar producto"});
    expect(screen.getByAltText("Preview de Burger Melt")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Imagen del producto"), {
      target: {files: [new File(["photo-2"], "burger-2.png", {type: "image/png"})]},
    });
    fireEvent.click(screen.getByRole("button", {name: "Guardar producto"}));
    await waitFor(() => expect(mocks.uploadMenuItemImage).toHaveBeenCalledTimes(2));
    if (uploadControl.release === null) {
      throw new Error("Expected pending replacement upload");
    }
    uploadControl.release();
    await screen.findByText("Producto guardado correctamente.");

    const updatedRow = screen.getByText("Burger Melt").closest(".digital-menu-item-row");
    expect(updatedRow).toBeTruthy();
    fireEvent.click(within(updatedRow as HTMLElement).getByRole("button", {name: /Editar/i}));
    await screen.findByRole("heading", {name: "Editar producto"});
    const editForm = screen.getByRole("heading", {name: "Editar producto"}).closest("form");
    expect(editForm).toBeTruthy();
    fireEvent.click(within(editForm as HTMLElement).getByRole("button", {name: "Eliminar"}));
    expect(screen.getByText("Sin foto cargada")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", {name: "Guardar producto"}));
    await waitFor(() => expect(mocks.deleteMenuItemImage).toHaveBeenCalledTimes(1));
    await screen.findByText("Producto guardado correctamente.");
    await waitFor(() => {
      expect(screen.queryByText("Con foto")).toBeNull();
    });

    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();
  }, 15000);

  it("opens Diseño, updates preview, saves the theme and restores defaults", async () => {
    const business: Business = {
      destination_type: "digital_menu",
      external_url: null,
      features: {digital_menu: true},
      id: "biz-theme",
      logo_url: "/logos/biz-theme",
      name: "Theme Bistro",
      plan_key: "premium",
      slug: "theme-bistro",
      status: "active",
    };
    let menu: DigitalMenu = {
      business_id: business.id,
      created_at: "2026-08-24T10:00:00Z",
      id: "dm-theme",
      is_published: true,
      name: "Carta Theme",
      status: "published",
      template_key: "modern",
      theme: {...nambreDefaultThemeConfig},
      updated_at: "2026-08-24T10:00:00Z",
    };
    const categories: MenuCategory[] = [
      {
        created_at: "2026-08-24T10:00:00Z",
        description: "Cocina de estación",
        digital_menu_id: menu.id,
        id: "cat-theme",
        is_visible: true,
        name: "Especiales",
        position: 0,
        updated_at: "2026-08-24T10:00:00Z",
      },
    ];
    const items: MenuItem[] = [
      {
        category_id: "cat-theme",
        created_at: "2026-08-24T10:00:00Z",
        currency: "ARS",
        description: "Con pesto y queso",
        id: "item-theme",
        image_url: null,
        is_available: true,
        is_featured: true,
        is_visible: true,
        name: "Tostón de la casa",
        position: 0,
        price: "9800.00",
        updated_at: "2026-08-24T10:00:00Z",
      },
    ];

    mocks.listBusinesses.mockResolvedValue([business]);
    mocks.request.mockImplementation(async (path: string) => {
      if (path === "/api/businesses/biz-theme") return business;
      if (path === "/api/businesses/biz-theme/menu") {
        return {current: null, public_code: "theme-code", versions: []};
      }
      if (path === "/api/businesses/biz-theme/analytics/summary") {
        return {busiest_hour: null, scans_30d: 0, scans_7d: 0, scans_today: 0};
      }
      if (path === "/api/businesses/biz-theme/analytics/scans?period=30d") return [];
      if (path === "/api/businesses/biz-theme/qr") return [];
      throw new Error(`Unhandled request: ${path}`);
    });
    mocks.fetchDigitalMenu.mockImplementation(async () => menu);
    mocks.listMenuCategories.mockResolvedValue(categories);
    mocks.listMenuItems.mockResolvedValue(items);
    mocks.updateDigitalMenu.mockImplementation(async (_token, _businessId, _menuId, payload) => {
      menu = {
        ...menu,
        theme: {
          ...menu.theme,
          ...payload.theme,
        },
      };
      return menu;
    });

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    renderPanel(<BusinessPanel token="owner-token" user={null} />);

    await screen.findByText("Hola, Theme Bistro 👋");
    fireEvent.click(screen.getByRole("button", {name: "Mi carta"}));
    fireEvent.click(await screen.findByRole("tab", {name: "Diseño"}));

    expect(await screen.findByText("Nambre Natural")).toBeTruthy();
    expect(screen.getByText("Vista previa")).toBeTruthy();

    const preview = screen.getByTestId("digital-menu-theme-preview");
    const accentInput = screen.getByLabelText("Color principal");
    fireEvent.change(accentInput, {target: {value: "#1F3A2D"}});
    expect(preview.getAttribute("style")).toContain("--public-menu-accent: #1F3A2D");

    fireEvent.change(screen.getByLabelText("Fondo"), {target: {value: "#FAF7F2"}});
    fireEvent.change(screen.getByLabelText("Texto principal"), {target: {value: "#17110E"}});
    fireEvent.change(screen.getByLabelText("Texto secundario"), {target: {value: "#5C524A"}});
    fireEvent.change(screen.getByLabelText("Tipografía de títulos"), {target: {value: "rounded"}});
    fireEvent.change(screen.getByLabelText("Tipografía de cuerpo"), {target: {value: "modern"}});
    fireEvent.change(screen.getByLabelText("Estilo de cards"), {target: {value: "square"}});
    expect(preview.getAttribute("style")).toContain("--public-menu-radius: 8px");

    fireEvent.click(screen.getByRole("button", {name: "Guardar diseño"}));
    await waitFor(() => expect(mocks.updateDigitalMenu).toHaveBeenCalledTimes(1));
    expect(mocks.updateDigitalMenu).toHaveBeenCalledWith(
      "owner-token",
      "biz-theme",
      "dm-theme",
      expect.objectContaining({
        theme: expect.objectContaining({
          accent_color: "#1F3A2D",
          body_font: "modern",
          card_style: "square",
          heading_font: "rounded",
        }),
      }),
    );
    expect(await screen.findByText("Diseño guardado correctamente.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", {name: "Restaurar diseño Nambre"}));
    expect(confirmSpy).toHaveBeenCalled();
    expect(preview.getAttribute("style")).toContain(`--public-menu-accent: ${nambreDefaultThemeConfig.accent_color}`);
  });

  it("shows API errors while saving Diseño", async () => {
    const business: Business = {
      destination_type: "digital_menu",
      external_url: null,
      features: {digital_menu: true},
      id: "biz-theme-error",
      logo_url: null,
      name: "Theme Error",
      plan_key: "premium",
      slug: "theme-error",
      status: "active",
    };
    const menu: DigitalMenu = {
      business_id: business.id,
      created_at: "2026-08-24T10:00:00Z",
      id: "dm-theme-error",
      is_published: false,
      name: "Carta Error",
      status: "draft",
      template_key: "modern",
      theme: {...nambreDefaultThemeConfig},
      updated_at: "2026-08-24T10:00:00Z",
    };

    mocks.listBusinesses.mockResolvedValue([business]);
    mocks.request.mockImplementation(async (path: string) => {
      if (path === "/api/businesses/biz-theme-error") return business;
      if (path === "/api/businesses/biz-theme-error/menu") {
        return {current: null, public_code: "theme-error-code", versions: []};
      }
      if (path === "/api/businesses/biz-theme-error/analytics/summary") {
        return {busiest_hour: null, scans_30d: 0, scans_7d: 0, scans_today: 0};
      }
      if (path === "/api/businesses/biz-theme-error/analytics/scans?period=30d") return [];
      if (path === "/api/businesses/biz-theme-error/qr") return [];
      throw new Error(`Unhandled request: ${path}`);
    });
    mocks.fetchDigitalMenu.mockResolvedValue(menu);
    mocks.listMenuCategories.mockResolvedValue([]);
    mocks.listMenuItems.mockResolvedValue([]);
    mocks.updateDigitalMenu.mockRejectedValue(new ApiError(422, "text_color contrast is too low"));

    renderPanel(<BusinessPanel token="owner-token" user={null} />);

    await screen.findByText("Hola, Theme Error 👋");
    fireEvent.click(screen.getByRole("button", {name: "Mi carta"}));
    fireEvent.click(await screen.findByRole("tab", {name: "Diseño"}));
    fireEvent.change(screen.getByLabelText("Color principal"), {target: {value: "#1A332B"}});
    fireEvent.click(screen.getByRole("button", {name: "Guardar diseño"}));

    expect(
      within(await screen.findByRole("alert")).getByText(
        "Esta combinación reduce demasiado la legibilidad. Ajustá fondo, superficie o texto.",
      ),
    ).toBeTruthy();
  });

  it("shows Carta Nambre locked for Essential and does not call digital menu APIs", async () => {
    const business: Business = {
      destination_type: "menu_pdf",
      external_url: null,
      features: {digital_menu: false},
      id: "biz-essential",
      logo_url: null,
      name: "Essential Biz",
      plan_key: "essential",
      slug: "essential-biz",
      status: "active",
    };

    mocks.listBusinesses.mockResolvedValue([business]);
    mocks.request.mockImplementation(async (path: string) => {
      if (path === "/api/businesses/biz-essential") return business;
      if (path === "/api/businesses/biz-essential/menu") {
        return {current: null, public_code: "essential-code", versions: []};
      }
      if (path === "/api/businesses/biz-essential/analytics/summary") {
        return {busiest_hour: null, scans_30d: 0, scans_7d: 0, scans_today: 0};
      }
      if (path === "/api/businesses/biz-essential/analytics/scans?period=30d") return [];
      if (path === "/api/businesses/biz-essential/qr") return [];
      throw new Error(`Unhandled request: ${path}`);
    });

    renderPanel(<BusinessPanel token="owner-token" user={null} />);

    await screen.findByText("Hola, Essential Biz 👋");
    fireEvent.click(screen.getByRole("button", {name: "Mi carta"}));

    expect(await screen.findByTestId("digital-menu-premium-lock")).toBeTruthy();
    expect(screen.getByText("Disponible en Premium.")).toBeTruthy();
    expect(screen.queryByText("Creá tu Carta Nambre")).toBeNull();
    expect(mocks.fetchDigitalMenu).not.toHaveBeenCalled();
    expect(mocks.listMenuCategories).not.toHaveBeenCalled();
    expect(mocks.listMenuItems).not.toHaveBeenCalled();
  });
});
