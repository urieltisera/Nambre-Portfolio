"use client";

import React from "react";
import {
  BarChart3,
  ChevronDown,
  FileUp,
  LayoutDashboard,
  LogOut,
  QrCode,
  RotateCcw,
  Settings,
  Shield,
  Store,
} from "lucide-react";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {DigitalMenuEditor} from "@/components/digital-menu/DigitalMenuEditor";
import {MenuDestinationSelector} from "@/components/digital-menu/MenuDestinationSelector";
import {ActivityChart} from "@/components/owner/ActivityChart";
import {OwnerAppShell} from "@/components/owner/OwnerAppShell";
import {OwnerSettings} from "@/components/owner/OwnerSettings";
import {Alert} from "@/components/ui/Alert";
import {useAppearance} from "@/components/ui/AppearanceProvider";
import {Badge} from "@/components/ui/Badge";
import {Button} from "@/components/ui/Button";
import {Card} from "@/components/ui/Card";
import {EmptyState} from "@/components/ui/EmptyState";
import {LoadingState} from "@/components/ui/LoadingState";
import {PageHeader} from "@/components/ui/PageHeader";
import {AnalyticsWindow, sliceDailySeries, toActivityPoints} from "@/lib/analytics";
import {
  assetUrl,
  businessDestinationErrorMessage,
  businessHasFeature,
  businessDestinationLabel,
  canOperateBusiness,
  businessStatusLabel,
  BusinessDestination,
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
  updateBusinessDestination,
  uploadErrorMessage,
  User,
} from "@/lib/api";

type View = "dashboard" | "menu" | "qr" | "analytics" | "business" | "settings";
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
  onLogout = async () => undefined,
  onOpenAdmin,
  onSessionRefresh,
  user = null,
}: {
  token: string | null;
  isPlatformAdmin?: boolean;
  onLogout?: () => Promise<void> | void;
  onOpenAdmin?: () => void;
  onSessionRefresh?: (token: string | null) => Promise<void> | void;
  user?: User | null;
}) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [series, setSeries] = useState<DailyScan[]>([]);
  const [qr, setQr] = useState<QR[]>([]);
  const [analyticsWindow, setAnalyticsWindow] = useState<AnalyticsWindow>(7);
  const [view, setView] = useState<View>("dashboard");
  const [error, setError] = useState("");
  const [selectedPdf, setSelectedPdf] = useState<File | null>(null);
  const [selectedMenuLogo, setSelectedMenuLogo] = useState<File | null>(null);
  const [selectedQrLogo, setSelectedQrLogo] = useState<File | null>(null);
  const [uploadingMenu, setUploadingMenu] = useState(false);
  const [uploadingMenuLogo, setUploadingMenuLogo] = useState(false);
  const [uploadingQrLogo, setUploadingQrLogo] = useState(false);
  const [savingDestination, setSavingDestination] = useState(false);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [generatingQr, setGeneratingQr] = useState(false);
  const [menuMessage, setMenuMessage] = useState("");
  const [identityMessage, setIdentityMessage] = useState("");
  const [destinationMessage, setDestinationMessage] = useState("");
  const [destinationTypeDraft, setDestinationTypeDraft] = useState<BusinessDestination>("menu_pdf");
  const [externalUrlDraft, setExternalUrlDraft] = useState("");
  const [businessNameDraft, setBusinessNameDraft] = useState("");
  const [useMenuLogoForQrDraft, setUseMenuLogoForQrDraft] = useState(true);
  const [hasDigitalMenu, setHasDigitalMenu] = useState(false);
  const [qrDownloadError, setQrDownloadError] = useState("");
  const [qrPreviewVersion, setQrPreviewVersion] = useState(0);
  const loadBusinessesRequestRef = useRef<Promise<void> | null>(null);
  const refreshRequestRef = useRef<Promise<void> | null>(null);
  const refreshRequestBusinessIdRef = useRef<string | null>(null);
  const lastFreshSyncAtRef = useRef(0);
  const {visualStyle} = useAppearance();

  const businessId = business?.id;
  const isSuspended = business?.status === "suspended";
  const canMutate = business ? canOperateBusiness(business.status) : false;
  const isMinimal = visualStyle === "minimal";
  const canUseDigitalMenu = businessHasFeature(business, "digital_menu");

  const loadBusinesses = useCallback(async () => {
    if (loadBusinessesRequestRef.current) {
      return loadBusinessesRequestRef.current;
    }
    const requestPromise = (async () => {
      const items = await listBusinesses(token, isPlatformAdmin);
      setBusinesses(items);
      setBusiness(
        (current) => items.find((item) => item.id === current?.id) ?? items[0] ?? null,
      );
    })();
    loadBusinessesRequestRef.current = requestPromise;
    void requestPromise.finally(() => {
      if (loadBusinessesRequestRef.current === requestPromise) {
        loadBusinessesRequestRef.current = null;
      }
    });
    return requestPromise;
  }, [isPlatformAdmin, token]);

  useEffect(() => {
    loadBusinesses()
      .then(() => setError(""))
      .catch(() => setError("Usá el seed o seleccioná un negocio desde un usuario con membership."));
  }, [loadBusinesses]);

  const refresh = useCallback(async (options?: {force?: boolean}) => {
    if (!businessId) return;
    const force = options?.force ?? false;
    if (
      !force &&
      refreshRequestRef.current &&
      refreshRequestBusinessIdRef.current === businessId
    ) {
      return refreshRequestRef.current;
    }
    if (
      force &&
      refreshRequestRef.current &&
      refreshRequestBusinessIdRef.current === businessId
    ) {
      try {
        await refreshRequestRef.current;
      } catch {
        // Fall through and request a fresh snapshot after a failed in-flight load.
      }
    }
    const requestPromise = (async () => {
      const [businessState, menuState, analyticsSummary, scanSeries, qrCodes] =
        await Promise.all([
          request<Business>(`/api/businesses/${businessId}`, token),
          request<MenuState>(`/api/businesses/${businessId}/menu`, token),
          request<Summary>(`/api/businesses/${businessId}/analytics/summary`, token),
          request<DailyScan[]>(
            `/api/businesses/${businessId}/analytics/scans?period=30d`,
            token,
          ),
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
    })();
    refreshRequestRef.current = requestPromise;
    refreshRequestBusinessIdRef.current = businessId;
    void requestPromise.finally(() => {
      if (refreshRequestRef.current === requestPromise) {
        refreshRequestRef.current = null;
        refreshRequestBusinessIdRef.current = null;
      }
    });
    return requestPromise;
  }, [businessId, token]);

  useEffect(() => {
    if (!businessId) return;
    void refresh();
  }, [businessId, refresh]);

  useEffect(() => {
    const nextDestination =
      business?.destination_type === "external_url" ||
      (business?.destination_type === "digital_menu" && canUseDigitalMenu)
        ? business.destination_type
        : "menu_pdf";
    setDestinationTypeDraft(nextDestination);
    setExternalUrlDraft(business?.external_url ?? "");
    setDestinationMessage("");
    setBusinessNameDraft(business?.name ?? "");
    setUseMenuLogoForQrDraft(business?.use_menu_logo_for_qr ?? true);
    setIdentityMessage("");
  }, [business?.destination_type, business?.external_url, business?.id, business?.name, business?.use_menu_logo_for_qr, canUseDigitalMenu]);

  useEffect(() => {
    function syncFreshState() {
      const now = performance.now();
      if (now - lastFreshSyncAtRef.current < 500) {
        return;
      }
      lastFreshSyncAtRef.current = now;
      void Promise.all([loadBusinesses(), refresh()]).catch(() => undefined);
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
      await refresh({force: true});
    } catch (uploadError: unknown) {
      setMenuMessage(uploadErrorMessage("menu", uploadError));
      await refresh({force: true});
    } finally {
      setUploadingMenu(false);
    }
  }

  async function uploadIdentityLogo(target: "menu" | "qr") {
    const selectedFile = target === "menu" ? selectedMenuLogo : selectedQrLogo;
    if (!selectedFile || !businessId) return;
    if (target === "menu") {
      setUploadingMenuLogo(true);
    } else {
      setUploadingQrLogo(true);
    }
    setIdentityMessage("");
    const body = new FormData();
    body.append("file", selectedFile);
    try {
      const updated = await request<Business>(
        `/api/businesses/${businessId}/${target === "menu" ? "logo" : "qr-logo"}`,
        token,
        {
          method: "POST",
          body,
        },
      );
      setBusiness(updated);
      setBusinesses((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (target === "menu") {
        setSelectedMenuLogo(null);
      } else {
        setSelectedQrLogo(null);
      }
      setIdentityMessage(target === "menu" ? "Logo de carta guardado correctamente." : "Logo de QR guardado correctamente.");
      await refresh({force: true});
    } catch (uploadError: unknown) {
      setIdentityMessage(uploadErrorMessage("logo", uploadError));
      await refresh({force: true});
    } finally {
      if (target === "menu") {
        setUploadingMenuLogo(false);
      } else {
        setUploadingQrLogo(false);
      }
    }
  }

  async function deleteIdentityLogo(target: "menu" | "qr") {
    if (!businessId) return;
    const confirmed = window.confirm(
      target === "menu"
        ? "¿Eliminar el logo de carta?"
        : "¿Eliminar el logo de QR?",
    );
    if (!confirmed) return;
    setIdentityMessage("");
    try {
      const updated = await request<Business>(
        `/api/businesses/${businessId}/${target === "menu" ? "logo" : "qr-logo"}`,
        token,
        {
          method: "DELETE",
        },
      );
      setBusiness(updated);
      setBusinesses((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setIdentityMessage(target === "menu" ? "Logo de carta eliminado." : "Logo de QR eliminado.");
      await refresh({force: true});
    } catch (deleteError: unknown) {
      setIdentityMessage(uploadErrorMessage("logo", deleteError));
      await refresh({force: true});
    }
  }

  async function saveIdentity() {
    if (!businessId) return;
    setSavingIdentity(true);
    setIdentityMessage("");
    try {
      const updated = await request<Business>(`/api/businesses/${businessId}`, token, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          name: businessNameDraft,
          use_menu_logo_for_qr: useMenuLogoForQrDraft,
        }),
      });
      setBusiness(updated);
      setBusinesses((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setIdentityMessage("Identidad guardada correctamente.");
      await refresh({force: true});
    } catch (saveError: unknown) {
      setIdentityMessage(saveError instanceof Error ? saveError.message : "No pudimos guardar la identidad.");
      await refresh({force: true});
    } finally {
      setSavingIdentity(false);
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
      await refresh({force: true});
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

  async function saveDestination() {
    if (!businessId) return;
    setSavingDestination(true);
    setDestinationMessage("");
    try {
      const updated = await updateBusinessDestination(
        token,
        businessId,
        {
          destination_type: destinationTypeDraft,
          external_url:
            destinationTypeDraft === "external_url" ? externalUrlDraft : undefined,
        },
        isPlatformAdmin,
      );
      setBusiness(updated);
      setBusinesses((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setDestinationMessage("Destino guardado correctamente.");
      await refresh({force: true});
    } catch (error: unknown) {
      setDestinationMessage(businessDestinationErrorMessage(error));
    } finally {
      setSavingDestination(false);
    }
  }

  const lastUpdate = useMemo(() => {
    if (!menu?.current) return "Sin carta";
    return new Date(menu.current.created_at).toLocaleDateString("es-AR");
  }, [menu]);

  function openCurrentExternalUrl() {
    window.open(business?.external_url ?? "", "_blank", "noopener,noreferrer");
  }

  const qrGroups = useMemo(() => groupQrAssets(qr), [qr]);
  const recentActivity = useMemo(() => sliceDailySeries(series, 7), [series]);
  const selectedActivity = useMemo(
    () => sliceDailySeries(series, analyticsWindow),
    [analyticsWindow, series],
  );
  const recentActivityPoints = useMemo(() => toActivityPoints(recentActivity), [recentActivity]);
  const selectedActivityPoints = useMemo(
    () => toActivityPoints(selectedActivity),
    [selectedActivity],
  );

  const navigationItems = useMemo(
    () => [
      {icon: <LayoutDashboard size={18} />, key: "dashboard", label: "Inicio"},
      {icon: <FileUp size={18} />, key: "menu", label: "Mi carta"},
      {icon: <QrCode size={18} />, key: "qr", label: "Mi QR"},
      {icon: <BarChart3 size={18} />, key: "analytics", label: "Estadísticas"},
      {icon: <Store size={18} />, key: "business", label: "Mi negocio"},
      {icon: <Settings size={18} />, key: "settings", label: "Configuración"},
    ],
    [],
  );

  const sidebarBottom = (collapsed: boolean) => (
    collapsed ? (
      <Button
        aria-label="Cerrar sesión"
        className="sidebar-summary__logout"
        data-tooltip="Cerrar sesión"
        onClick={() => void onLogout()}
        title="Cerrar sesión"
        variant="secondary"
      >
        <LogOut size={18} />
      </Button>
    ) : (
      <div className="sidebar-summary">
        {business ? (
          <>
            <div>
              <strong>{business.name}</strong>
              <p>{businessStatusLabel(business.status)}</p>
            </div>
            <Badge tone={statusTone(business.status)}>{businessStatusLabel(business.status)}</Badge>
          </>
        ) : (
          <p className="muted">Sin negocio activo</p>
        )}
        <Button onClick={() => void onLogout()} variant="secondary">
          Cerrar sesión
        </Button>
      </div>
    )
  );

  const desktopUtility = (
    <div className="shell-toolbar">
      {businesses.length > 1 ? (
        <label className="business-switcher">
          <span>Negocio actual</span>
          <span className="business-switcher__field">
            <select
              aria-label="Seleccionar negocio"
              value={business?.id ?? ""}
              onChange={(event) =>
                setBusiness(businesses.find((item) => item.id === event.target.value) ?? null)
              }
            >
              {businesses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <ChevronDown size={16} />
          </span>
        </label>
      ) : null}
      {onOpenAdmin ? (
        <Button onClick={onOpenAdmin} variant="ghost">
          <Shield size={16} /> Ir a Admin
        </Button>
      ) : null}
    </div>
  );

  if (error) {
    return (
      <main className="page-frame">
        <Alert tone="danger">{error}</Alert>
      </main>
    );
  }

  if (!business && businesses.length === 0) {
    return (
      <main className="page-frame">
        <LoadingState message="Buscamos tu negocio y la configuración actual." />
      </main>
    );
  }

  if (!business) {
    return (
      <main className="page-frame">
        <EmptyState
          description="Iniciá sesión con un usuario que tenga membership o cargá datos de seed."
          title="No encontramos un negocio disponible"
        />
      </main>
    );
  }

  return (
    <OwnerAppShell
      activeView={view}
      bottomContent={sidebarBottom}
      desktopUtility={desktopUtility}
      items={navigationItems}
      mobileTitle={business.name}
      onNavigate={(next) => setView(next as View)}
      title="Nambre"
    >
      {isSuspended ? (
        <div data-testid="suspended-panel">
          <Alert className="owner-alert" tone="warning" title="Negocio suspendido">
            El contenido histórico sigue visible, pero las acciones de publicación quedan
            bloqueadas hasta que un admin lo reactive.
          </Alert>
        </div>
      ) : null}
      {view === "dashboard" ? (
        isMinimal ? (
          <section
            className="owner-view owner-view--dashboard owner-view--minimal"
            data-testid="dashboard-layout-minimal"
          >
            <PageHeader
              subtitle="Gestioná tu carta y seguí la actividad del negocio."
              title={business.name}
            />
            <div className="compact-metric-strip">
              <MetricCard
                helper="Hoy"
                label="Visualizaciones"
                value={summary?.scans_today ?? 0}
              />
              <MetricCard helper="7 días" label="Actividad" value={summary?.scans_7d ?? 0} />
              <MetricCard
                helper="Hora pico"
                label="Mejor horario"
                value={formatPeakHour(summary?.busiest_hour ?? null)}
              />
            </div>
            <Card className="panel-stack owner-compact-card">
              <div className="owner-compact-card__topline">
                <Badge tone={statusTone(business.status)}>
                  {businessStatusLabel(business.status)}
                </Badge>
                <span className="muted">
                  Carta {menu?.current ? "publicada" : "pendiente"} · {lastUpdate}
                </span>
              </div>
              <div className="compact-action-row">
                <Button onClick={() => setView("menu")} size="sm">
                  <FileUp size={16} /> Actualizar carta
                </Button>
                <Button onClick={() => setView("qr")} size="sm" variant="secondary">
                  <QrCode size={16} /> Mi QR
                </Button>
                <Button onClick={() => setView("analytics")} size="sm" variant="ghost">
                  <BarChart3 size={16} /> Estadísticas
                </Button>
              </div>
            </Card>
          </section>
        ) : (
          <section
            className="owner-view owner-view--dashboard owner-view--maximal"
            data-testid="dashboard-layout-maximal"
          >
            <PageHeader
              subtitle="Gestioná tu carta y seguí la actividad del negocio."
              title={business.name}
            />
            <div className="metric-grid">
              <MetricCard
                helper={new Date().toLocaleDateString("es-AR")}
                label="Visualizaciones hoy"
                value={summary?.scans_today ?? 0}
              />
              <MetricCard
                helper="Actividad real reciente"
                label="Últimos 7 días"
                value={summary?.scans_7d ?? 0}
              />
              <MetricCard
                helper="Ventana completa disponible"
                label="Últimos 30 días"
                value={summary?.scans_30d ?? 0}
              />
              <MetricCard
                helper="Últimos 30 días"
                label="Hora pico"
                value={formatPeakHour(summary?.busiest_hour ?? null)}
              />
            </div>
            <div className="content-grid">
              <Card className="panel-stack">
                <h2>Resumen rápido</h2>
                <p className="muted">
                  Estado: {businessStatusLabel(business.status)} · Carta:{" "}
                  {menu?.current ? "Publicada" : "Pendiente"} · Última actualización: {lastUpdate}
                </p>
                <ActivityChart
                  contained={false}
                  description="Actividad reciente de los últimos 7 días."
                  emptyDescription="Todavía no hay actividad de escaneos para mostrar."
                  emptyTitle="Sin actividad reciente"
                  points={recentActivityPoints}
                  title="Actividad reciente"
                  variant="compact"
                />
              </Card>
              <Card className="panel-stack">
                <h2>Acciones rápidas</h2>
                <p className="muted visual-detail">
                  Los accesos directos siguen usando la operación real del negocio.
                </p>
                <Button onClick={() => setView("menu")}>
                  <FileUp size={18} /> Actualizar carta
                </Button>
                <Button onClick={() => setView("qr")} variant="secondary">
                  <QrCode size={18} /> Ver mi QR
                </Button>
                <Button onClick={() => setView("analytics")} variant="secondary">
                  <BarChart3 size={18} /> Ver estadísticas
                </Button>
              </Card>
            </div>
          </section>
        )
      ) : null}

      {view === "menu" ? (
        <section
          className={`owner-view ${isMinimal ? "owner-view--minimal" : "owner-view--maximal"}`}
          data-testid={isMinimal ? "menu-layout-minimal" : "menu-layout-maximal"}
        >
          <PageHeader
            subtitle="Elegí la modalidad de tu carta y gestioná el contenido desde un solo lugar."
            title="Mi carta"
          />
          <MenuDestinationSelector
            business={business}
            canActivateDigitalMenu={hasDigitalMenu}
            canUseDigitalMenu={canUseDigitalMenu}
            canMutate={canMutate}
            externalUrl={externalUrlDraft}
            message={destinationMessage}
            onExternalUrlChange={setExternalUrlDraft}
            onOpenExternalUrl={openCurrentExternalUrl}
            onSave={saveDestination}
            onValueChange={setDestinationTypeDraft}
            saving={savingDestination}
            value={destinationTypeDraft}
          />

          {destinationTypeDraft === "digital_menu" && canUseDigitalMenu ? (
            <DigitalMenuEditor
              business={business}
              canMutate={canMutate}
              onBusinessRefresh={() => refresh({force: true})}
              onMenuPresenceChange={setHasDigitalMenu}
              selectedMode={destinationTypeDraft}
              token={token}
            />
          ) : null}

          {destinationTypeDraft === "menu_pdf" ? (
            <>
              <Card className="panel-stack owner-compact-card">
                <div className="owner-compact-card__topline">
                  <Badge tone={menu?.current ? "success" : "warning"}>
                    {menu?.current ? "Publicada" : "Pendiente"}
                  </Badge>
                  <span className="muted">Última actualización: {lastUpdate}</span>
                </div>
                <strong>{menu?.current?.original_filename ?? "No hay PDF publicado"}</strong>
                <p className="muted">
                  Tu QR no cambia cuando actualizás la carta. Podés reemplazar el PDF sin
                  reimprimir.
                </p>
              </Card>
              <div className="content-grid">
                <Card className="panel-stack">
                  <h2>Actualizar PDF</h2>
                  <label className="field">
                    <span className="field__label">PDF</span>
                    <input
                      accept="application/pdf"
                      className="ui-input"
                      disabled={!canMutate}
                      onChange={(event) => setSelectedPdf(event.target.files?.[0] ?? null)}
                      type="file"
                    />
                  </label>
                  <p className="muted">{selectedPdf?.name ?? "Ningún PDF seleccionado"}</p>
                  <Button disabled={!canMutate || !selectedPdf || uploadingMenu} onClick={upload}>
                    {uploadingMenu
                      ? "Guardando..."
                      : menu?.current
                        ? "Reemplazar carta"
                        : "Guardar carta"}
                  </Button>
                  {menuMessage ? (
                    <Alert tone={menuMessage.includes("correctamente") ? "success" : "danger"}>
                      {menuMessage}
                    </Alert>
                  ) : null}
                </Card>
                <Card className="panel-stack">
                  <h2>Identidad del negocio</h2>
                  <p className="muted">
                    El nombre comercial y los logos ahora viven en <strong>Configuración → Negocio → Identidad</strong>.
                  </p>
                  <div className="actions">
                    <Button onClick={() => setView("settings")}>Ir a Configuración</Button>
                    <Button onClick={() => setView("business")} variant="secondary">
                      Abrir Identidad
                    </Button>
                  </div>
                </Card>
              </div>
              <Card className="panel-stack">
                <h2>Versiones publicadas</h2>
                <div className="stack-list">
                  {menu?.versions.length ? (
                    menu.versions.map((asset) => (
                      <div className="list-row list-row--actions" key={asset.id}>
                        <div>
                          <strong>
                            v{asset.version} · {asset.original_filename}
                          </strong>
                          <p className="muted">
                            {asset.status === "active" ? "Carta actual" : "Versión anterior"}
                          </p>
                        </div>
                        {asset.status === "archived" ? (
                          <Button
                            disabled={!canMutate}
                            onClick={() => void rollback(asset.id)}
                            variant="secondary"
                          >
                            <RotateCcw size={16} /> Restaurar esta versión
                          </Button>
                        ) : (
                          <Badge tone="success">Activa</Badge>
                        )}
                      </div>
                    ))
                  ) : (
                    <EmptyState
                      description="Subí tu primer PDF para comenzar a usar Nambre."
                      title="Todavía no subiste una carta"
                    />
                  )}
                </div>
              </Card>
            </>
          ) : null}

          {destinationTypeDraft === "external_url" ? (
            <Card className="panel-stack">
              <h2>Carta digital propia</h2>
              <p className="muted">
                Cuando guardes esta modalidad, tu QR seguirá siendo el mismo pero redirigirá a la
                URL externa que configures arriba.
              </p>
              <Alert tone="info">
                Usá esta opción si tu negocio ya tiene una carta web fuera de Nambre.
              </Alert>
            </Card>
          ) : null}
        </section>
      ) : null}

      {view === "qr" ? (
        <section className="owner-view">
          <PageHeader subtitle="El mismo QR, aunque cambies tu carta." title="Mi QR" />
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
        </section>
      ) : null}

      {view === "analytics" ? (
        <section className="owner-view">
          <PageHeader
            subtitle="Conocé cómo tus clientes utilizan tu carta."
            title="Estadísticas"
          />
          <div className="metric-grid">
            <MetricCard helper="Visitas del día" label="Hoy" value={summary?.scans_today ?? 0} />
            <MetricCard helper="Ventana corta" label="7 días" value={summary?.scans_7d ?? 0} />
            <MetricCard helper="Ventana completa" label="30 días" value={summary?.scans_30d ?? 0} />
            <MetricCard helper="Últimos 30 días" label="Hora pico" value={formatPeakHour(summary?.busiest_hour ?? null)} />
          </div>
          <ActivityChart
            description="Serie diaria real derivada del backend actual."
            emptyDescription="No hay suficiente actividad todavía para mostrar una serie."
            emptyTitle="Sin datos de analytics"
            onWindowChange={setAnalyticsWindow}
            points={selectedActivityPoints}
            title="Visualizaciones por día"
            window={analyticsWindow}
          />
        </section>
      ) : null}

      {view === "business" ? (
        <section className="owner-view">
          <PageHeader
            subtitle="Configuración → Negocio → Identidad. Separada de la modalidad de carta."
            title="Negocio"
          />
          <div className="content-grid">
            <Card className="panel-stack">
              <h2>Resumen del negocio</h2>
              <div className="detail-list">
                <div>
                  <dt>Nombre</dt>
                  <dd>{business.name}</dd>
                </div>
                <div>
                  <dt>Slug</dt>
                  <dd>{business.slug}</dd>
                </div>
                <div>
                  <dt>Estado</dt>
                  <dd>{businessStatusLabel(business.status)}</dd>
                </div>
                <div>
                  <dt>Destino actual</dt>
                  <dd>{businessDestinationLabel(business.destination_type ?? "menu_pdf")}</dd>
                </div>
              </div>
            </Card>
            <Card className="panel-stack">
              <h2>Identidad</h2>
              <label className="field">
                <span className="field__label">Nombre comercial</span>
                <input
                  className="ui-input"
                  disabled={!canMutate || savingIdentity}
                  onChange={(event) => setBusinessNameDraft(event.target.value)}
                  value={businessNameDraft}
                />
              </label>
              <div className="identity-grid">
                <div className="identity-card">
                  <h3>Logo de carta</h3>
                  <p className="muted">Se utiliza en la carta pública Nambre.</p>
                  <label className="field">
                    <span className="field__label">Archivo</span>
                    <input
                      accept="image/png,image/jpeg,image/webp"
                      className="ui-input"
                      disabled={!canMutate || uploadingMenuLogo}
                      onChange={(event) => setSelectedMenuLogo(event.target.files?.[0] ?? null)}
                      type="file"
                    />
                  </label>
                  <p className="muted">{selectedMenuLogo?.name ?? "Ningún logo seleccionado"}</p>
                  <p className="field__hint">
                    PNG, JPG o WebP recomendado. Mejor con fondo transparente, formato horizontal o cuadrado y buena resolución.
                  </p>
                  <LogoPreview
                    emptyDescription="Todavía no configuraste un logo para la carta."
                    title={`Vista en carta de ${business.name}`}
                    url={business.menu_logo_url ?? business.logo_url}
                  />
                  <div className="actions">
                    <Button disabled={!canMutate || !selectedMenuLogo || uploadingMenuLogo} onClick={() => void uploadIdentityLogo("menu")}>
                      {uploadingMenuLogo ? "Guardando..." : "Guardar logo de carta"}
                    </Button>
                    <Button disabled={!canMutate || !(business.menu_logo_url ?? business.logo_url)} onClick={() => void deleteIdentityLogo("menu")} variant="secondary">
                      Eliminar
                    </Button>
                  </div>
                </div>

                <div className="identity-card">
                  <h3>Logo de QR</h3>
                  <p className="muted">Se utiliza en el QR cuando corresponda.</p>
                  <label className="login-legal__checkbox">
                    <input
                      checked={useMenuLogoForQrDraft}
                      disabled={!canMutate || savingIdentity}
                      onChange={(event) => setUseMenuLogoForQrDraft(event.target.checked)}
                      type="checkbox"
                    />
                    <span>Usar el logo de carta también para el QR</span>
                  </label>
                  {!useMenuLogoForQrDraft ? (
                    <>
                      <label className="field">
                        <span className="field__label">Archivo</span>
                        <input
                          accept="image/png,image/jpeg,image/webp"
                          className="ui-input"
                          disabled={!canMutate || uploadingQrLogo}
                          onChange={(event) => setSelectedQrLogo(event.target.files?.[0] ?? null)}
                          type="file"
                        />
                      </label>
                      <p className="muted">{selectedQrLogo?.name ?? "Ningún logo seleccionado"}</p>
                    </>
                  ) : null}
                  <p className="field__hint">
                    Recomendado 1:1. Si el archivo es muy horizontal puede verse pequeño dentro del QR, pero no se va a deformar.
                  </p>
                  <LogoPreview
                    emptyDescription="El QR usará el logo de carta hasta que cargues uno específico."
                    title={`Vista en QR de ${business.name}`}
                    url={useMenuLogoForQrDraft ? business.menu_logo_url ?? business.logo_url : business.qr_logo_url ?? business.menu_logo_url ?? business.logo_url}
                  />
                  {!useMenuLogoForQrDraft ? (
                    <div className="actions">
                      <Button disabled={!canMutate || !selectedQrLogo || uploadingQrLogo} onClick={() => void uploadIdentityLogo("qr")}>
                        {uploadingQrLogo ? "Guardando..." : "Guardar logo de QR"}
                      </Button>
                      <Button disabled={!canMutate || !business.qr_logo_url} onClick={() => void deleteIdentityLogo("qr")} variant="secondary">
                        Eliminar
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="actions">
                <Button disabled={!canMutate || savingIdentity || !businessNameDraft.trim()} onClick={() => void saveIdentity()}>
                  {savingIdentity ? "Guardando..." : "Guardar identidad"}
                </Button>
                <Button onClick={() => setView("menu")} variant="secondary">
                  Ir a Mi carta
                </Button>
                <Button
                  disabled={(business.destination_type ?? "menu_pdf") !== "external_url" || !business.external_url}
                  onClick={openCurrentExternalUrl}
                  variant="secondary"
                >
                  Abrir/probar enlace actual
                </Button>
              </div>
              {identityMessage ? (
                <Alert tone={identityMessage.includes("correctamente") || identityMessage.includes("eliminado") ? "success" : "danger"}>
                  {identityMessage}
                </Alert>
              ) : null}
            </Card>
          </div>
        </section>
      ) : null}

      {view === "settings" && user ? (
        <OwnerSettings
          business={business}
          onLogout={onLogout}
          onNavigateBusiness={() => setView("business")}
          onSessionRefresh={onSessionRefresh}
          token={token}
          user={user}
        />
      ) : null}
    </OwnerAppShell>
  );
}

function MetricCard({
  helper,
  label,
  value,
}: {
  helper?: string;
  label: string;
  value: number | string;
}) {
  return (
    <Card className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <small className="metric-card__helper">{helper}</small> : null}
    </Card>
  );
}

function LogoPreview({
  emptyDescription,
  title,
  url,
}: {
  emptyDescription: string;
  title: string;
  url: string | null | undefined;
}) {
  if (!url) {
    return <EmptyState description={emptyDescription} title={title} />;
  }

  return (
    <div className="asset-preview identity-preview">
      <img
        alt={title}
        className="logo-preview"
        src={assetUrl(`${url}?t=${encodeURIComponent(Date.now().toString())}`)}
      />
    </div>
  );
}

function statusTone(status: Business["status"]): "success" | "warning" | "danger" {
  if (status === "active") return "success";
  if (status === "demo") return "warning";
  return "danger";
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
  token: string | null;
  groups: QrAssetGroup[];
  generatingQr: boolean;
  downloadError: string;
  onGenerateQr: () => Promise<void>;
  onDownloadError: (message: string) => void;
  previewVersion: number;
  loadPreview?: (path: string, token?: string | null) => Promise<Blob>;
  downloadAsset?: (path: string, token?: string | null) => Promise<void>;
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
    <section className="panel-stack">
      <Card className="panel-stack">
        <h2>Tu QR permanente</h2>
        <p className="muted">
          {publicCode ? `/r/${publicCode}` : "Subí una carta para crear el link dinámico."}
        </p>
        <Button disabled={!canGenerate || generatingQr} onClick={() => void onGenerateQr()}>
          <QrCode size={18} /> {generatingQr ? "Generando..." : "Generar QR"}
        </Button>
        {!canGenerate ? (
          <p className="muted">Este negocio está suspendido. Reactivalo desde Admin para volver a operar.</p>
        ) : !groups.some((group) => group.pngAsset || group.svgAsset) && !publicCode ? (
          <p className="muted">Subí una carta y activá el negocio para generar QR.</p>
        ) : null}
        {downloadError ? <Alert tone="danger">{downloadError}</Alert> : null}
      </Card>
      <div className="content-grid">
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
  token: string | null;
  onDownloadError: (message: string) => void;
  previewVersion: number;
  loadPreview?: (path: string, token?: string | null) => Promise<Blob>;
  downloadAsset?: (path: string, token?: string | null) => Promise<void>;
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
    <Card className="panel-stack" data-testid={`qr-card-${group.key}`}>
      <strong>{group.title}</strong>
      <p className="muted">{group.description}</p>
      <div className="asset-preview qr-preview" data-testid={`qr-preview-${group.key}`}>
        {previewLoading ? <p className="muted">Cargando vista previa...</p> : null}
        {!previewLoading && previewError ? <p className="error">{previewError}</p> : null}
        {!previewLoading && !previewError && previewUrl ? (
          <img alt={`Preview ${group.title}`} src={previewUrl} />
        ) : null}
        {!previewLoading && !previewError && !previewUrl ? (
          <p className="muted">Generá el QR para ver la vista previa.</p>
        ) : null}
      </div>
      <div className="actions">
        <Button
          disabled={!group.pngAsset}
          onClick={() => void handleDownload(group.pngAsset?.asset_url ?? null)}
          variant="secondary"
        >
          Descargar PNG
        </Button>
        <Button
          disabled={!group.svgAsset}
          onClick={() => void handleDownload(group.svgAsset?.asset_url ?? null)}
          variant="ghost"
        >
          Descargar SVG
        </Button>
      </div>
    </Card>
  );
}
