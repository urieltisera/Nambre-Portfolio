export type Business = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  destination_type?: "menu_pdf" | "external_url" | "digital_menu" | "promo" | "landing_page";
  external_url?: string | null;
  status: "demo" | "active" | "suspended";
  created_at?: string;
  updated_at?: string;
};

export type BusinessDestination = "menu_pdf" | "external_url";

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

export type InvitationResponse = {
  business_id: string;
  email: string;
  message: string;
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

function buildAuthHeaders(
  headers?: HeadersInit,
  token?: string | null,
): Headers {
  const nextHeaders = new Headers(headers ?? undefined);
  if (token) {
    nextHeaders.set("Authorization", `Bearer ${token}`);
  }
  return nextHeaders;
}

export async function request<T>(
  path: string,
  token?: string | null,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    credentials: "include",
    headers: buildAuthHeaders(init.headers, token),
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
    credentials: "include",
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

export async function logout(token?: string | null): Promise<void> {
  await fetch(`${API}/auth/logout`, {
    credentials: "include",
    headers: buildAuthHeaders(undefined, token),
    method: "POST",
  });
}

export async function requestPasswordReset(email: string): Promise<string> {
  const response = await fetch(`${API}/auth/password-reset/request`, {
    credentials: "include",
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
    credentials: "include",
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

export async function acceptInvitation(
  token: string,
  newPassword: string,
  acceptLegal: boolean,
): Promise<string> {
  const response = await fetch(`${API}/auth/invitations/accept`, {
    credentials: "include",
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      token,
      new_password: newPassword,
      accept_legal: acceptLegal,
    }),
  });
  if (!response.ok) {
    if (response.status === 400) {
      const detail = await readErrorDetail(response);
      if (
        detail === "Invitation expired" ||
        detail === "Invitation already used" ||
        detail === "Invalid invitation token"
      ) {
        throw new Error(
          "La invitación es inválida, expiró o ya fue utilizada. Pedile a tu admin una nueva invitación.",
        );
      }
      if (detail === "Legal acceptance is required") {
        throw new Error("Necesitás aceptar los documentos legales vigentes para activar la cuenta.");
      }
      throw new Error(detail);
    }
    throw new Error("No se pudo activar la cuenta.");
  }
  const data = (await response.json()) as MessageResponse;
  return data.message;
}

export async function changePassword(
  token: string | null | undefined,
  currentPassword: string,
  newPassword: string,
): Promise<string> {
  const response = await fetch(`${API}/auth/change-password`, {
    credentials: "include",
    method: "POST",
    headers: buildAuthHeaders({"Content-Type": "application/json"}, token),
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

export async function listBusinesses(
  token?: string | null,
  isPlatformAdmin = false,
): Promise<Business[]> {
  return request<Business[]>(isPlatformAdmin ? "/admin/businesses" : "/api/me/businesses", token);
}

export async function inviteClient(
  token: string | null | undefined,
  businessName: string,
  email: string,
): Promise<InvitationResponse> {
  return request<InvitationResponse>("/admin/invitations", token, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({business_name: businessName, email}),
  });
}

export async function updateBusinessDestination(
  token: string | null | undefined,
  businessId: string,
  payload: {destination_type: BusinessDestination; external_url?: string | null},
  isPlatformAdmin = false,
): Promise<Business> {
  return request<Business>(
    `${isPlatformAdmin ? "/admin" : "/api"}/businesses/${businessId}`,
    token,
    {
      method: "PATCH",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(payload),
    },
  );
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

export async function currentUser(token?: string | null): Promise<User> {
  return request<User>("/api/me", token);
}

export async function currentLegalStatus(token?: string | null): Promise<LegalStatus> {
  return request<LegalStatus>("/api/legal/status", token);
}

export async function acceptCurrentLegalDocuments(token?: string | null): Promise<LegalStatus> {
  return request<LegalStatus>("/api/legal/accept", token, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({acceptance_method: "ui_checkbox"}),
  });
}

export async function fetchQrAssetBlob(path: string, token?: string | null): Promise<Blob> {
  const response = await fetch(assetUrl(path), {
    cache: "no-store",
    credentials: "include",
    headers: buildAuthHeaders(undefined, token),
  });
  if (!response.ok) {
    throw new ApiError(response.status, await readErrorDetail(response));
  }
  return response.blob();
}

export async function downloadQrAsset(path: string, token?: string | null): Promise<void> {
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

export function inviteClientErrorMessage(error: unknown): string {
  if (error instanceof TypeError) {
    return "No se pudo conectar con el servidor para enviar la invitación.";
  }
  if (error instanceof ApiError) {
    if (error.detail === "Business already exists") {
      return "Ya existe un negocio con ese nombre. Elegí otro nombre para evitar duplicados.";
    }
    if (error.detail === "User email already exists with an active account") {
      return "Ese email ya tiene una cuenta activa. Este flujo no reemplaza credenciales existentes.";
    }
    if (error.detail === "There is already a pending invitation for this email") {
      return "Ese email ya tiene una invitación pendiente.";
    }
    if (error.detail === "SMTP invitation delivery is not configured") {
      return "El envío de invitaciones por email no está configurado.";
    }
    if (error.detail === "Invitation email delivery failed") {
      return "No se pudo enviar la invitación por email.";
    }
    return error.detail;
  }
  return "No se pudo enviar la invitación.";
}

export function businessDestinationLabel(destinationType: Business["destination_type"]): string {
  return destinationType === "external_url" ? "Carta externa" : "Carta en Nambre";
}

export function businessDestinationErrorMessage(error: unknown): string {
  if (error instanceof TypeError) {
    return "No se pudo conectar con el servidor para guardar el destino de la carta.";
  }
  if (error instanceof ApiError) {
    if (error.detail === "External URL is required") {
      return "Ingresá la URL de tu carta para usar un enlace externo.";
    }
    if (error.detail === "External URL is invalid") {
      return "La URL de la carta debe empezar con http:// o https:// y ser válida.";
    }
    if (error.detail === "Business is suspended") {
      return "Este negocio está suspendido. Reactivalo desde Admin para volver a operar.";
    }
    return error.detail;
  }
  return "No se pudo guardar el destino de la carta.";
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
