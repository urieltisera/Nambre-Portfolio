import { afterEach, describe, expect, it, vi } from "vitest";

async function loadSiteModule() {
  vi.resetModules();
  return import("../lib/site");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("site url resolution", () => {
  it("uses SITE_URL when configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_URL", "https://menus.nambre.test");
    vi.stubEnv("FRONTEND_BASE_URL", "https://frontend-base.nambre.test");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://public.nambre.test");

    const { getSiteUrl } = await loadSiteModule();

    expect(getSiteUrl().toString()).toBe("https://menus.nambre.test/");
  });

  it("uses FRONTEND_BASE_URL when SITE_URL is absent", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FRONTEND_BASE_URL", "https://frontend-base.nambre.test");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://public.nambre.test");

    const { getSiteUrl } = await loadSiteModule();

    expect(getSiteUrl().toString()).toBe("https://frontend-base.nambre.test/");
  });

  it("builds absolute api urls from the configured origin", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://public.nambre.test");

    const { absoluteUrl } = await loadSiteModule();

    expect(absoluteUrl("/api/public/digital-menus/demo")).toBe(
      "https://public.nambre.test/api/public/digital-menus/demo",
    );
  });

  it("falls back to the development port when configuration is absent", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PORT", "3001");

    const { getSiteUrl, absoluteUrl } = await loadSiteModule();

    expect(getSiteUrl().toString()).toBe("http://localhost:3001/");
    expect(absoluteUrl("/api/health")).toBe("http://localhost:3001/api/health");
  });

  it("fails clearly outside development when the site url is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const { getSiteUrl } = await loadSiteModule();

    expect(() => getSiteUrl()).toThrowError(
      "Missing site URL configuration. Set SITE_URL (preferred), FRONTEND_BASE_URL, or NEXT_PUBLIC_SITE_URL before rendering server-side URLs.",
    );
  });
});
