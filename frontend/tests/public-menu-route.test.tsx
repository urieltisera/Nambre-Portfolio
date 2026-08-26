import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

async function loadRouteModule() {
  vi.resetModules();
  vi.doMock("@/components/public-menu/PublicMenuPage", () => ({
    PublicMenuPage: ({ data }: { data: { business: { name: string } } }) =>
      React.createElement("div", null, `PUBLIC:${data.business.name}`),
  }));
  vi.doMock("@/components/public-menu/PublicMenuState", () => ({
    PublicMenuState: ({ title }: { title: string }) => React.createElement("div", null, title),
  }));

  return import("../app/m/[publicCode]/page");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.doUnmock("@/components/public-menu/PublicMenuPage");
  vi.doUnmock("@/components/public-menu/PublicMenuState");
});

describe("/m/[publicCode]", () => {
  it("fetches the public menu through the configured site origin", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_URL", "https://menus.nambre.test");
    vi.stubGlobal("React", React);

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        business: { name: "Cafe Nambre" },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const routeModule = await loadRouteModule();
    const element = await routeModule.default({
      params: Promise.resolve({ publicCode: "abc123" }),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://menus.nambre.test/api/public/digital-menus/abc123",
      { cache: "no-store" },
    );
    expect(renderToStaticMarkup(element)).toContain("PUBLIC:Cafe Nambre");
  });

  it("keeps metadata generation working for public menus", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://public.nambre.test");

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        business: { name: "Bistro Sur" },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const routeModule = await loadRouteModule();
    const metadata = await routeModule.generateMetadata({
      params: Promise.resolve({ publicCode: "menu-77" }),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://public.nambre.test/api/public/digital-menus/menu-77",
      { cache: "no-store" },
    );
    expect(metadata).toMatchObject({
      description: "Explorá la carta digital de Bistro Sur desde Nambre.",
      title: "Bistro Sur | Nambre",
    });
  });
});
