import {afterEach, describe, expect, it, vi} from "vitest";
import {
  ApiError,
  canAccessAdmin,
  canOperateBusiness,
  formatPeakHour,
  qrPreviewErrorMessage,
  slugifyBusinessName,
  uploadErrorMessage,
} from "../lib/api";

const CONFIGURED_API_BASE = "http://example.test:8000";

async function loadApiModule(apiBase = CONFIGURED_API_BASE) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", apiBase);
  return import("../lib/api");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("frontend smoke", () => {
  it("keeps the MenuFlow promise explicit", () => {
    expect("Un solo QR para siempre").toContain("QR");
  });

  it("builds backend asset urls from the configured API base", async () => {
    const {assetUrl} = await loadApiModule();

    expect(assetUrl("/api/businesses/biz/qr-assets/standard.png")).toBe(
      `${CONFIGURED_API_BASE}/api/businesses/biz/qr-assets/standard.png`,
    );
  });

  it("only grants admin navigation to platform admins", () => {
    expect(canAccessAdmin(null)).toBe(false);
    expect(canAccessAdmin({id: "1", email: "owner@example.com", is_platform_admin: false})).toBe(false);
    expect(canAccessAdmin({id: "2", email: "admin@example.com", is_platform_admin: true})).toBe(true);
  });

  it("formats the suspended policy, slug helper and peak hour consistently", () => {
    expect(canOperateBusiness("active")).toBe(true);
    expect(canOperateBusiness("demo")).toBe(true);
    expect(canOperateBusiness("suspended")).toBe(false);
    expect(slugifyBusinessName("Cafe Norte")).toBe("cafe-norte");
    expect(slugifyBusinessName("Hamburguesería X")).toBe("hamburgueseria-x");
    expect(formatPeakHour(5)).toBe("05:00");
    expect(formatPeakHour(18)).toBe("18:00");
    expect(formatPeakHour(null)).toBe("—");
  });

  it("downloads QR assets with a bearer token and no query token", async () => {
    const {downloadQrAsset} = await loadApiModule();
    const click = vi.fn();
    const remove = vi.fn();
    const appendChild = vi.fn();
    const createObjectURL = vi.fn(() => "blob:qr");
    const revokeObjectURL = vi.fn();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(["qr"]),
    }));

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("document", {
      body: {appendChild},
      createElement: vi.fn(() => ({click, remove})),
    });
    vi.stubGlobal("URL", {createObjectURL, revokeObjectURL});

    await downloadQrAsset("/api/businesses/biz/qr-assets/standard.png", "abc123");

    const [requestedUrl, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];

    expect(fetchMock).toHaveBeenCalledWith(
      `${CONFIGURED_API_BASE}/api/businesses/biz/qr-assets/standard.png`,
      {cache: "no-store", headers: {Authorization: "Bearer abc123"}},
    );
    expect(requestedUrl).toBe(`${CONFIGURED_API_BASE}/api/businesses/biz/qr-assets/standard.png`);
    expect(requestedUrl).not.toContain("?");
    expect(requestInit).toEqual({
      cache: "no-store",
      headers: {Authorization: "Bearer abc123"},
    });
    expect(appendChild).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:qr");
  });

  it("loads QR preview assets with an authenticated request", async () => {
    const {fetchQrAssetBlob} = await loadApiModule();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(["png"]),
    }));

    vi.stubGlobal("fetch", fetchMock);

    const blob = await fetchQrAssetBlob("/api/businesses/biz/qr-assets/branded.png", "abc123");
    const [requestedUrl, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];

    expect(blob).toBeInstanceOf(Blob);
    expect(fetchMock).toHaveBeenCalledWith(
      `${CONFIGURED_API_BASE}/api/businesses/biz/qr-assets/branded.png`,
      {cache: "no-store", headers: {Authorization: "Bearer abc123"}},
    );
    expect(requestedUrl).toBe(`${CONFIGURED_API_BASE}/api/businesses/biz/qr-assets/branded.png`);
    expect(requestedUrl).not.toContain("?");
    expect(requestInit).toEqual({
      cache: "no-store",
      headers: {Authorization: "Bearer abc123"},
    });
  });

  it("maps upload errors to safe user-facing messages", () => {
    expect(uploadErrorMessage("menu", new ApiError(400, "Only PDF uploads are allowed"))).toBe(
      "El archivo debe ser un PDF válido.",
    );
    expect(uploadErrorMessage("logo", new ApiError(413, "Logo too large"))).toBe(
      "El logo supera el tamaño máximo permitido.",
    );
    expect(uploadErrorMessage("logo", new ApiError(403, "Forbidden"))).toBe(
      "No tenés permisos para modificar este negocio.",
    );
    expect(uploadErrorMessage("menu", new ApiError(403, "Business is suspended"))).toContain(
      "suspendido",
    );
    expect(uploadErrorMessage("menu", new TypeError("Failed to fetch"))).toContain("conectar");
  });

  it("maps preview errors to safe user-facing messages", () => {
    expect(qrPreviewErrorMessage(new ApiError(401, "Unauthorized"))).toBe(
      "No se pudo cargar la vista previa del QR con la sesión actual.",
    );
    expect(qrPreviewErrorMessage(new TypeError("Failed to fetch"))).toContain("conexión");
  });
});
