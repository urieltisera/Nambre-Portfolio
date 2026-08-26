const DEFAULT_DEV_PORT = "3000";

function readConfiguredUrl(name: "SITE_URL" | "FRONTEND_BASE_URL" | "NEXT_PUBLIC_SITE_URL"): string | null {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function getDevelopmentSiteUrl(): string {
  const port = process.env.PORT?.trim() || DEFAULT_DEV_PORT;
  return `http://localhost:${port}`;
}

function isDevelopmentEnvironment(): boolean {
  return process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
}

export function getSiteUrl(): URL {
  const configuredUrl =
    readConfiguredUrl("SITE_URL") ??
    readConfiguredUrl("FRONTEND_BASE_URL") ??
    readConfiguredUrl("NEXT_PUBLIC_SITE_URL");
  if (configuredUrl) {
    return new URL(configuredUrl);
  }

  if (isDevelopmentEnvironment()) {
    return new URL(getDevelopmentSiteUrl());
  }

  throw new Error(
    "Missing site URL configuration. Set SITE_URL (preferred), FRONTEND_BASE_URL, or NEXT_PUBLIC_SITE_URL before rendering server-side URLs.",
  );
}

export function absoluteUrl(path = "/"): string {
  return new URL(path, getSiteUrl()).toString();
}
