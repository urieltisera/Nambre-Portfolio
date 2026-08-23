export type Business = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  status: "demo" | "active" | "suspended";
  created_at?: string;
  updated_at?: string;
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

export type User = {
  id: string;
  email: string;
  is_platform_admin: boolean;
};

export type LegalDocumentType =
  | "terms"
  | "privacy"
  | "acceptable_use"
  | "cookies_analytics"
  | "ai_policy";

export type LegalDocumentStatus = {
  document_type: LegalDocumentType;
  current_version: string;
  accepted_version: string | null;
  accepted_at: string | null;
  is_current: boolean;
};

export type LegalStatus = {
  documents: LegalDocumentStatus[];
  pending_documents: LegalDocumentType[];
  requires_acceptance: boolean;
};

type LoginResponse = {
  access_token: string;
};

type MessageResponse = {
  message: string;
};

type LoginLegalErrorDetail = {
  code?: string;
  legal_status?: LegalStatus;
  message?: string;
};

export type BusinessStatusAction = {
  label: "Activar" | "Suspender" | "Reactivar";
  nextStatus: Business["status"];
};

const API = "";

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

export class LegalAcceptanceRequiredError extends Error {
  legalStatus: LegalStatus;

  constructor(legalStatus: LegalStatus) {
    super("Antes de ingresar, necesitás aceptar la versión legal vigente de Nambre.");
    this.legalStatus = legalStatus;
  }
}

export async function request<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new ApiError(response.status, await readErrorDetail(response));
  }
  return response.json() as Promise<T>;
}

export async function login(
  email: string,
  password: string,
  options?: {acceptLegal?: boolean},
): Promise<string> {
  const response = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({accept_legal: options?.acceptLegal ?? false, email, password}),
  });
  if (!response.ok) {
    if (response.status === 403) {
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = (await response.json()) as {detail?: LoginLegalErrorDetail};
        if (
          data.detail?.code === "legal_acceptance_required" &&
          data.detail.legal_status !== undefined
        ) {
          throw new LegalAcceptanceRequiredError(data.detail.legal_status);
        }
      }
    }
    if (response.status === 401) {
      throw new Error("El email o la contraseña no son correctos.");
    }
    throw new Error("No se pudo iniciar sesión.");
  }
  const data = (await response.json()) as LoginResponse;
  return data.access_token;
}

export async function logout(token: string): Promise<void> {
  await fetch(`${API}/auth/logout`, {
    headers: {Authorization: `Bearer ${token}`},
    method: "POST",
  });
}

export async function requestPasswordReset(email: string): Promise<string> {
  const response = await fetch(`${API}/auth/password-reset/request`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({email}),
  });
  if (!response.ok) {
    throw new Error("No se pudo procesar la solicitud de recuperación.");
  }
  const data = (await response.json()) as MessageResponse;
  return data.message;
}

export async function confirmPasswordReset(token: string, newPassword: string): Promise<string> {
  const response = await fetch(`${API}/auth/password-reset/confirm`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({token, new_password: newPassword}),
  });
  if (!response.ok) {
    if (response.status === 400) {
      const detail = await readErrorDetail(response);
      if (detail === "Invalid or expired password reset token") {
        throw new Error("El enlace es inválido, expiró o ya fue utilizado.");
      }
      throw new Error(detail);
    }
    throw new Error("No se pudo actualizar la contraseña.");
  }
  const data = (await response.json()) as MessageResponse;
  return data.message;
}

export async function changePassword(
  token: string,
  currentPassword: string,
  newPassword: string,
): Promise<string> {
  const response = await fetch(`${API}/auth/change-password`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
  if (!response.ok) {
    const detail = await readErrorDetail(response);
    if (response.status === 401) {
      throw new Error("La contraseña actual no es correcta.");
    }
    throw new Error(detail || "No se pudo cambiar la contraseña.");
  }
  const data = (await response.json()) as LoginResponse;
  return data.access_token;
}

export function assetUrl(path: string): string {
  return `${API}${path}`;
}

export function canAccessAdmin(user: User | null): boolean {
  return user?.is_platform_admin === true;
}

export function userRoleLabel(user: User): "Platform Admin" | "Owner" {
  return user.is_platform_admin ? "Platform Admin" : "Owner";
}

export function businessStatusLabel(status: Business["status"]): "Activo" | "Demo" | "Suspendido" {
  if (status === "active") return "Activo";
  if (status === "suspended") return "Suspendido";
  return "Demo";
}

export function canOperateBusiness(status: Business["status"]): boolean {
  return status !== "suspended";
}

export function adminBusinessActions(status: Business["status"]): BusinessStatusAction[] {
  if (status === "demo") {
    return [
      {label: "Activar", nextStatus: "active"},
      {label: "Suspender", nextStatus: "suspended"},
    ];
  }
  if (status === "active") {
    return [{label: "Suspender", nextStatus: "suspended"}];
  }
  return [{label: "Reactivar", nextStatus: "active"}];
}

export async function listBusinesses(token: string, isPlatformAdmin = false): Promise<Business[]> {
  return request<Business[]>(isPlatformAdmin ? "/admin/businesses" : "/api/me/businesses", token);
}

export function formatPeakHour(hour: number | null): string {
  if (hour === null) return "—";
  return `${hour.toString().padStart(2, "0")}:00`;
}

export function slugifyBusinessName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function currentUser(token: string): Promise<User> {
  return request<User>("/api/me", token);
}

export async function currentLegalStatus(token: string): Promise<LegalStatus> {
  return request<LegalStatus>("/api/legal/status", token);
}

export async function acceptCurrentLegalDocuments(token: string): Promise<LegalStatus> {
  return request<LegalStatus>("/api/legal/accept", token, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({acceptance_method: "ui_checkbox"}),
  });
}

export async function fetchQrAssetBlob(path: string, token: string): Promise<Blob> {
  const response = await fetch(assetUrl(path), {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new ApiError(response.status, await readErrorDetail(response));
  }
  return response.blob();
}

export async function downloadQrAsset(path: string, token: string): Promise<void> {
  const blob = await fetchQrAssetBlob(path, token);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = path.split("/").pop() ?? "qr";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export function uploadErrorMessage(kind: "menu" | "logo", error: unknown): string {
  const noun = kind === "menu" ? "la carta" : "el logo";
  if (error instanceof TypeError) {
    return `No se pudo conectar con el servidor para guardar ${noun}.`;
  }
  if (error instanceof ApiError) {
    if (error.status === 400 || error.status === 413) {
      return mapBackendDetail(kind, error.detail);
    }
    if (error.status === 403) {
      if (error.detail === "Business is suspended") {
        return "Este negocio está suspendido. Reactivalo desde Admin para volver a operar.";
      }
      return "No tenés permisos para modificar este negocio.";
    }
    if (error.status === 404) {
      return "El negocio ya no está disponible.";
    }
  }
  return `Ocurrió un error inesperado al guardar ${noun}.`;
}

export function createBusinessErrorMessage(error: unknown): string {
  if (error instanceof TypeError) {
    return "No se pudo conectar con el servidor para crear el negocio.";
  }
  if (error instanceof ApiError) {
    if (error.detail === "Slug already exists") return "El slug ya existe. Elegí otro.";
    return error.detail;
  }
  return "No se pudo crear el negocio.";
}

export function qrPreviewErrorMessage(error: unknown): string {
  if (error instanceof TypeError) {
    return "No se pudo cargar la vista previa del QR por un problema de conexión.";
  }
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return "No se pudo cargar la vista previa del QR con la sesión actual.";
  }
  return "No se pudo cargar la vista previa del QR.";
}

async function readErrorDetail(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const data = (await response.json()) as { detail?: unknown; error?: unknown };
    const detail = typeof data.detail === "string" ? data.detail : typeof data.error === "string" ? data.error : "";
    return detail || `Request failed with status ${response.status}`;
  }
  const text = await response.text();
  return text || `Request failed with status ${response.status}`;
}

function mapBackendDetail(kind: "menu" | "logo", detail: string): string {
  if (kind === "menu") {
    if (detail === "Only PDF uploads are allowed") return "El archivo debe ser un PDF válido.";
    if (detail === "PDF too large") return "La carta supera el tamaño máximo permitido.";
  }
  if (kind === "logo") {
    if (detail === "Only PNG or JPEG logos are allowed") {
      return "El logo debe estar en formato PNG o JPG.";
    }
    if (detail === "Logo too large") return "El logo supera el tamaño máximo permitido.";
    if (detail === "Logo file is empty") return "El archivo del logo está vacío.";
  }
  return detail;
}
