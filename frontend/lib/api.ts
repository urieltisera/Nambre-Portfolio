export type Business = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  status: "demo" | "active" | "suspended";
};

export type MenuAsset = {
  id: string;
  original_filename: string;
  file_size: number;
  version: number;
  status: "active" | "archived";
  created_at: string;
};

export type MenuState = {
  current: MenuAsset | null;
  versions: MenuAsset[];
  public_code: string | null;
};

export type QRCode = {
  id: string;
  qr_type: "standard" | "branded" | "artistic";
  asset_url: string;
  status: string;
};

export type Summary = {
  scans_today: number;
  scans_7d: number;
  scans_30d: number;
  busiest_hour: number | null;
};

export type DailyScan = {
  date: string;
  scans: number;
};

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export async function request<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

export async function login(email: string, password: string): Promise<string> {
  const response = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({email, password}),
  });
  if (!response.ok) {
    throw new Error("Credenciales inválidas");
  }
  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

export function assetUrl(path: string): string {
  return `${API}${path}`;
}

