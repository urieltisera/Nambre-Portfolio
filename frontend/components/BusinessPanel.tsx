"use client";

import React from "react";
import {BarChart3, FileUp, QrCode, RotateCcw} from "lucide-react";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {
  assetUrl,
  canOperateBusiness,
  businessStatusLabel,
  formatPeakHour,
  listBusinesses,
  Business,
  DailyScan,
  downloadQrAsset,
  fetchQrAssetBlob,
  MenuState,
  QRCode as QR,
  qrPreviewErrorMessage,
  request,
  Summary,
  uploadErrorMessage,
} from "@/lib/api";

type View = "dashboard" | "menu" | "qr" | "analytics";
type QrGroupKey = "standard" | "branded";

export type QrAssetGroup = {
  key: QrGroupKey;
  title: string;
  description: string;
  previewAsset: QR | null;
  pngAsset: QR | null;
  svgAsset: QR | null;
};

export function BusinessPanel({
  token,
  isPlatformAdmin = false,
}: {
  token: string;
  isPlatformAdmin?: boolean;
}) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [series, setSeries] = useState<DailyScan[]>([]);
  const [qr, setQr] = useState<QR[]>([]);
  const [view, setView] = useState<View>("dashboard");
  const [error, setError] = useState("");
  const [selectedPdf, setSelectedPdf] = useState<File | null>(null);
  const [selectedLogo, setSelectedLogo] = useState<File | null>(null);
  const [uploadingMenu, setUploadingMenu] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [generatingQr, setGeneratingQr] = useState(false);
  const [menuMessage, setMenuMessage] = useState("");
  const [logoMessage, setLogoMessage] = useState("");
  const [qrDownloadError, setQrDownloadError] = useState("");
  const [qrPreviewVersion, setQrPreviewVersion] = useState(0);

  const businessId = business?.id;
  const isSuspended = business?.status === "suspended";

  const loadBusinesses = useCallback(async () => {
    const items = await listBusinesses(token, isPlatformAdmin);
    setBusinesses(items);
    setBusiness((current) => items.find((item) => item.id === current?.id) ?? items[0] ?? null);
  }, [isPlatformAdmin, token]);

  useEffect(() => {
    loadBusinesses()
      .then(() => setError(""))
      .catch(() => setError("Usá el seed o seleccioná un negocio desde un usuario con membership."));
  }, [loadBusinesses]);

  const refresh = useCallback(async () => {
    if (!businessId) return;
    const [businessState, menuState, analyticsSummary, scanSeries, qrCodes] = await Promise.all([
      request<Business>(`/api/businesses/${businessId}`, token),
      request<MenuState>(`/api/businesses/${businessId}/menu`, token),
      request<Summary>(`/api/businesses/${businessId}/analytics/summary`, token),
      request<DailyScan[]>(`/api/businesses/${businessId}/analytics/scans?period=7d`, token),
      request<QR[]>(`/api/businesses/${businessId}/qr`, token),
    ]);
    setBusiness(businessState);
    setBusinesses((current) =>
      current.map((item) => (item.id === businessState.id ? businessState : item)),
    );
    setMenu(menuState);
    setSummary(analyticsSummary);
    setSeries(scanSeries);
    setQr(qrCodes);
  }, [businessId, token]);

  useEffect(() => {
    if (!businessId) return;
    void refresh();
  }, [businessId, refresh]);

  useEffect(() => {
    function syncFreshState() {
      void loadBusinesses().catch(() => undefined);
      void refresh().catch(() => undefined);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        syncFreshState();
      }
    }

    window.addEventListener("focus", syncFreshState);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", syncFreshState);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadBusinesses, refresh]);

  async function upload() {
    if (!selectedPdf || !businessId) return;
    setUploadingMenu(true);
    setMenuMessage("");
    const body = new FormData();
    body.append("file", selectedPdf);
    try {
      await request<MenuState>(`/api/businesses/${businessId}/menu/replace`, token, {
        method: "POST",
        body,
      });
      setSelectedPdf(null);
      setMenuMessage("Carta guardada correctamente.");
      await refresh();
    } catch (error: unknown) {
      setMenuMessage(uploadErrorMessage("menu", error));
      await refresh();
    } finally {
      setUploadingMenu(false);
    }
  }

  async function uploadLogo() {
    if (!selectedLogo || !businessId) return;
    setUploadingLogo(true);
    setLogoMessage("");
    const body = new FormData();
    body.append("file", selectedLogo);
    try {
      const updated = await request<Business>(`/api/businesses/${businessId}/logo`, token, {
        method: "POST",
        body,
      });
      setBusiness(updated);
      setBusinesses((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedLogo(null);
      setLogoMessage("Logo guardado correctamente.");
      await refresh();
    } catch (error: unknown) {
      setLogoMessage(uploadErrorMessage("logo", error));
      await refresh();
    } finally {
      setUploadingLogo(false);
    }
  }

  async function rollback(id: string) {
    if (!businessId) return;
    const confirmed = window.confirm(
      "¿Querés volver a usar esta carta como versión activa? El QR seguirá siendo el mismo.",
    );
    if (!confirmed) return;
    try {
      await request<MenuState>(`/api/businesses/${businessId}/menu/rollback`, token, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({menu_asset_id: id}),
      });
    } finally {
      await refresh();
    }
  }

  async function generateQr() {
    if (!businessId) return;
    setGeneratingQr(true);
    try {
      setQr(await request<QR[]>(`/api/businesses/${businessId}/qr/generate`, token, {method: "POST"}));
      setQrPreviewVersion((current) => current + 1);
    } catch {
      setQrDownloadError("Este negocio está suspendido. Reactivalo desde Admin para volver a operar.");
      await refresh();
    } finally {
      setGeneratingQr(false);
    }
  }

  const lastUpdate = useMemo(() => {
    if (!menu?.current) return "Sin carta";
    return new Date(menu.current.created_at).toLocaleDateString("es-AR");
  }, [menu]);

  const qrGroups = useMemo(() => groupQrAssets(qr), [qr]);
  const canMutate = business ? canOperateBusiness(business.status) : false;

  if (error) return <main className="shell"><p className="error">{error}</p></main>;
  if (!business) return <main className="shell"><p>Cargando...</p></main>;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>{business.name.toUpperCase()}</h1>
          <p className="muted">
            Estado: {businessStatusLabel(business.status)} · Carta: {menu?.current ? "● Publicada" : "Pendiente"} · Última actualización: {lastUpdate}
          </p>
        </div>
        <select value={business.id} onChange={(event) => setBusiness(businesses.find((item) => item.id === event.target.value) ?? null)}>
          {businesses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </header>

      {isSuspended ? (
        <section className="panel suspended-panel" data-testid="suspended-panel">
          <strong>Negocio suspendido</strong>
          <p className="muted">
            El contenido histórico sigue visible, pero las acciones de publicación quedan bloqueadas hasta que un admin lo reactive.
          </p>
        </section>
      ) : null}

      <nav className="tabs">
        {(["dashboard", "menu", "qr", "analytics"] as View[]).map((item) => (
          <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>
            {item === "menu" ? "Mi carta" : item === "qr" ? "Mi QR" : item === "analytics" ? "Estadísticas" : "Dashboard"}
          </button>
        ))}
      </nav>

      {view === "dashboard" ? (
        <section className="grid">
          <div className="metrics">
            <Metric label="Escaneos hoy" value={summary?.scans_today ?? 0} />
            <Metric label="Últimos 7 días" value={summary?.scans_7d ?? 0} />
            <Metric label="Últimos 30 días" value={summary?.scans_30d ?? 0} />
          </div>
          <div className="actions">
            <button onClick={() => setView("menu")}><FileUp size={18} /> Reemplazar carta</button>
            <button onClick={() => setView("qr")}><QrCode size={18} /> Descargar QR</button>
            <button onClick={() => setView("analytics")}><BarChart3 size={18} /> Ver estadísticas</button>
          </div>
        </section>
      ) : null}

      {view === "menu" ? (
        <section className="grid two">
          <div className="panel grid">
            <h2>Mi carta</h2>
            <p>{menu?.current?.original_filename ?? "No hay PDF publicado"}</p>
            <label className="muted">Logo</label>
            <input disabled={!canMutate} type="file" accept="image/png,image/jpeg" onChange={(event) => setSelectedLogo(event.target.files?.[0] ?? null)} />
            <p className="muted">{selectedLogo?.name ?? "Ningún logo seleccionado"}</p>
            {business.logo_url ? (
              <div className="asset-preview">
                <img
                  alt={`Logo de ${business.name}`}
                  className="logo-preview"
                  src={assetUrl(`${business.logo_url}?t=${encodeURIComponent(business.updated_at ?? Date.now().toString())}`)}
                />
              </div>
            ) : null}
            <button disabled={!canMutate || !selectedLogo || uploadingLogo} onClick={uploadLogo}>
              {uploadingLogo ? "Guardando..." : "Guardar logo"}
            </button>
            {logoMessage ? <p className={logoMessage.includes("correctamente") ? "muted" : "error"}>{logoMessage}</p> : null}
            <label className="muted">PDF</label>
            <input disabled={!canMutate} type="file" accept="application/pdf" onChange={(event) => setSelectedPdf(event.target.files?.[0] ?? null)} />
            <p className="muted">{selectedPdf?.name ?? "Ningún PDF seleccionado"}</p>
            <button disabled={!canMutate || !selectedPdf || uploadingMenu} onClick={upload}>
              {uploadingMenu ? "Guardando..." : menu?.current ? "Reemplazar carta" : "Guardar carta"}
            </button>
            {menuMessage ? <p className={menuMessage.includes("correctamente") ? "muted" : "error"}>{menuMessage}</p> : null}
          </div>
          <div className="panel grid">
            <h2>Versiones</h2>
            {menu?.versions.map((asset) => (
              <div className="card actions" key={asset.id}>
                <span>
                  v{asset.version} · {asset.original_filename} · {asset.status === "active" ? "Carta actual" : "Versión anterior"}
                </span>
                {asset.status === "archived" ? (
                  <button className="secondary" disabled={!canMutate} onClick={() => rollback(asset.id)}>
                    <RotateCcw size={16} /> Restaurar esta versión
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {view === "qr" ? (
        <QrSection
          canGenerate={canMutate}
          downloadError={qrDownloadError}
          generatingQr={generatingQr}
          groups={qrGroups}
          onDownloadError={setQrDownloadError}
          onGenerateQr={generateQr}
          previewVersion={qrPreviewVersion}
          publicCode={menu?.public_code ?? null}
          token={token}
        />
      ) : null}

      {view === "analytics" ? (
        <section className="grid">
          <div className="metrics">
            <Metric label="Hoy" value={summary?.scans_today ?? 0} />
            <Metric label="7 días" value={summary?.scans_7d ?? 0} />
            <Metric label="Hora pico" value={formatPeakHour(summary?.busiest_hour ?? null)} />
          </div>
          <div className="panel grid">
            {series.map((item) => <div key={item.date}>{item.date}: {item.scans}</div>)}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function Metric({label, value}: {label: string; value: number | string}) {
  return <div className="card metric"><span>{label}</span><strong>{value}</strong></div>;
}

export function groupQrAssets(qr: QR[]): QrAssetGroup[] {
  const groups: Record<QrGroupKey, QrAssetGroup> = {
    standard: {
      key: "standard",
      title: "QR estándar",
      description: "Versión estándar del QR.",
      previewAsset: null,
      pngAsset: null,
      svgAsset: null,
    },
    branded: {
      key: "branded",
      title: "QR con logo",
      description: "Preview del QR con el logo integrado en el centro.",
      previewAsset: null,
      pngAsset: null,
      svgAsset: null,
    },
  };

  for (const item of qr) {
    if (item.qr_type !== "standard" && item.qr_type !== "branded") continue;
    if (item.asset_url.endsWith(".png")) {
      groups[item.qr_type].pngAsset = item;
      groups[item.qr_type].previewAsset = item;
    }
    if (item.asset_url.endsWith(".svg")) {
      groups[item.qr_type].svgAsset = item;
    }
  }

  return [groups.standard, groups.branded];
}

type QrSectionProps = {
  canGenerate: boolean;
  publicCode: string | null;
  token: string;
  groups: QrAssetGroup[];
  generatingQr: boolean;
  downloadError: string;
  onGenerateQr: () => Promise<void>;
  onDownloadError: (message: string) => void;
  previewVersion: number;
  loadPreview?: (path: string, token: string) => Promise<Blob>;
  downloadAsset?: (path: string, token: string) => Promise<void>;
};

export function QrSection({
  canGenerate,
  publicCode,
  token,
  groups,
  generatingQr,
  downloadError,
  onGenerateQr,
  onDownloadError,
  previewVersion,
  loadPreview,
  downloadAsset,
}: QrSectionProps) {
  return (
    <section className="panel grid">
      <h2>Mi QR</h2>
      <p className="muted">
        {publicCode ? `/r/${publicCode}` : "Subí una carta para crear el link dinámico."}
      </p>
      <button disabled={!canGenerate || generatingQr} onClick={() => void onGenerateQr()}>
        <QrCode size={18} /> {generatingQr ? "Generando..." : "Generar QR"}
      </button>
      {!canGenerate ? (
        <p className="muted">Este negocio está suspendido. Reactivalo desde Admin para volver a operar.</p>
      ) : !groups.some((group) => group.pngAsset || group.svgAsset) && !publicCode ? (
        <p className="muted">Subí una carta y activá el negocio para generar QR.</p>
      ) : null}
      {downloadError ? <p className="error">{downloadError}</p> : null}
      <div className="grid two">
        {groups.map((group) => (
          <QrPreviewCard
            downloadAsset={downloadAsset}
            group={group}
            key={group.key}
            loadPreview={loadPreview}
            onDownloadError={onDownloadError}
            previewVersion={previewVersion}
            token={token}
          />
        ))}
      </div>
    </section>
  );
}

type QrPreviewCardProps = {
  group: QrAssetGroup;
  token: string;
  onDownloadError: (message: string) => void;
  previewVersion: number;
  loadPreview?: (path: string, token: string) => Promise<Blob>;
  downloadAsset?: (path: string, token: string) => Promise<void>;
};

export function QrPreviewCard({
  group,
  token,
  onDownloadError,
  previewVersion,
  loadPreview = fetchQrAssetBlob,
  downloadAsset = downloadQrAsset,
}: QrPreviewCardProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      setPreviewUrl(null);
      if (!group.previewAsset) {
        setPreviewError("");
        setPreviewLoading(false);
        return;
      }
      setPreviewLoading(true);
      setPreviewError("");
      try {
        const blob = await loadPreview(group.previewAsset.asset_url, token);
        if (!active) return;
        const objectUrl = URL.createObjectURL(blob);
        previewUrlRef.current = objectUrl;
        setPreviewUrl(objectUrl);
      } catch (error: unknown) {
        if (!active) return;
        setPreviewUrl(null);
        setPreviewError(qrPreviewErrorMessage(error));
      } finally {
        if (active) {
          setPreviewLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, [group.previewAsset, loadPreview, previewVersion, token]);

  async function handleDownload(path: string | null) {
    if (!path) return;
    onDownloadError("");
    try {
      await downloadAsset(path, token);
    } catch {
      onDownloadError("No se pudo descargar el QR. Volvé a iniciar sesión e intentá nuevamente.");
    }
  }

  return (
    <div className="card grid" data-testid={`qr-card-${group.key}`}>
      <strong>{group.title}</strong>
      <p className="muted">{group.description}</p>
      <div className="asset-preview qr-preview" data-testid={`qr-preview-${group.key}`}>
        {previewLoading ? <p className="muted">Cargando vista previa...</p> : null}
        {!previewLoading && previewError ? <p className="error">{previewError}</p> : null}
        {!previewLoading && !previewError && previewUrl ? (
          <img
            alt={`Preview ${group.title}`}
            src={previewUrl}
          />
        ) : null}
        {!previewLoading && !previewError && !previewUrl ? (
          <p className="muted">Generá el QR para ver la vista previa.</p>
        ) : null}
      </div>
      <div className="actions">
        <button
          disabled={!group.pngAsset}
          onClick={() => void handleDownload(group.pngAsset?.asset_url ?? null)}
        >
          Descargar PNG
        </button>
        <button
          className="secondary"
          disabled={!group.svgAsset}
          onClick={() => void handleDownload(group.svgAsset?.asset_url ?? null)}
        >
          Descargar SVG
        </button>
      </div>
    </div>
  );
}
