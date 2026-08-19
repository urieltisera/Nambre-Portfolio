import {afterEach, describe, expect, it, vi} from "vitest";
import {assetUrl, canAccessAdmin, downloadQrAsset} from "../lib/api";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("frontend smoke", () => {
  it("keeps the MenuFlow promise explicit", () => {
    expect("Un solo QR para siempre").toContain("QR");
  });

  it("builds backend asset urls from the configured API base", () => {
    expect(assetUrl("/api/businesses/biz/qr-assets/standard.png")).toBe(
      "http://localhost:8000/api/businesses/biz/qr-assets/standard.png",
    );
  });

  it("only grants admin navigation to platform admins", () => {
    expect(canAccessAdmin(null)).toBe(false);
    expect(canAccessAdmin({id: "1", email: "owner@example.com", is_platform_admin: false})).toBe(false);
    expect(canAccessAdmin({id: "2", email: "admin@example.com", is_platform_admin: true})).toBe(true);
  });

  it("downloads QR assets with a bearer token and no query token", async () => {
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

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/businesses/biz/qr-assets/standard.png",
      {headers: {Authorization: "Bearer abc123"}},
    );
    expect(appendChild).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:qr");
  });
});
