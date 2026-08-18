"use client";

import {BarChart3, FileUp, QrCode, RotateCcw} from "lucide-react";
import {useCallback, useEffect, useMemo, useState} from "react";
import {assetUrl, Business, DailyScan, MenuState, QRCode as QR, request, Summary} from "@/lib/api";

type View = "dashboard" | "menu" | "qr" | "analytics";

export function BusinessPanel({token}: {token: string}) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [series, setSeries] = useState<DailyScan[]>([]);
  const [qr, setQr] = useState<QR[]>([]);
  const [view, setView] = useState<View>("dashboard");
  const [error, setError] = useState("");

  const businessId = business?.id;

  useEffect(() => {
    request<Business[]>("/api/me/businesses", token)
      .then((items) => {
        setBusinesses(items);
        setBusiness(items[0] ?? null);
      })
      .catch(() => setError("Usá el seed o seleccioná un negocio desde un usuario con membership."));
  }, [token]);

  const refresh = useCallback(async () => {
    if (!businessId) return;
    const [menuState, analyticsSummary, scanSeries, qrCodes] = await Promise.all([
      request<MenuState>(`/api/businesses/${businessId}/menu`, token),
      request<Summary>(`/api/businesses/${businessId}/analytics/summary`, token),
      request<DailyScan[]>(`/api/businesses/${businessId}/analytics/scans?period=7d`, token),
      request<QR[]>(`/api/businesses/${businessId}/qr`, token),
    ]);
    setMenu(menuState);
    setSummary(analyticsSummary);
    setSeries(scanSeries);
    setQr(qrCodes);
  }, [businessId, token]);

  useEffect(() => {
    if (!businessId) return;
    void refresh();
  }, [businessId, refresh]);

  async function upload(file: File | null) {
    if (!file || !businessId) return;
    const body = new FormData();
    body.append("file", file);
    await request<MenuState>(`/api/businesses/${businessId}/menu/replace`, token, {
      method: "POST",
      body,
    });
    await refresh();
  }

  async function uploadLogo(file: File | null) {
    if (!file || !businessId) return;
    const body = new FormData();
    body.append("file", file);
    setBusiness(await request<Business>(`/api/businesses/${businessId}/logo`, token, {
      method: "POST",
      body,
    }));
  }

  async function rollback(id: string) {
    if (!businessId) return;
    await request<MenuState>(`/api/businesses/${businessId}/menu/rollback`, token, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({menu_asset_id: id}),
    });
    await refresh();
  }

  async function generateQr() {
    if (!businessId) return;
    setQr(await request<QR[]>(`/api/businesses/${businessId}/qr/generate`, token, {method: "POST"}));
  }

  const lastUpdate = useMemo(() => {
    if (!menu?.current) return "Sin carta";
    return new Date(menu.current.created_at).toLocaleDateString("es-AR");
  }, [menu]);

  if (error) return <main className="shell"><p className="error">{error}</p></main>;
  if (!business) return <main className="shell"><p>Cargando...</p></main>;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>{business.name.toUpperCase()}</h1>
          <p className="muted">Carta: {menu?.current ? "● Publicada" : "Pendiente"} · Última actualización: {lastUpdate}</p>
        </div>
        <select value={business.id} onChange={(event) => setBusiness(businesses.find((item) => item.id === event.target.value) ?? null)}>
          {businesses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </header>

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
            <input type="file" accept="image/png,image/jpeg" onChange={(event) => uploadLogo(event.target.files?.[0] ?? null)} />
            <label className="muted">PDF</label>
            <input type="file" accept="application/pdf" onChange={(event) => upload(event.target.files?.[0] ?? null)} />
          </div>
          <div className="panel grid">
            <h2>Versiones</h2>
            {menu?.versions.map((asset) => (
              <div className="card actions" key={asset.id}>
                <span>v{asset.version} · {asset.original_filename} · {asset.status}</span>
                {asset.status === "archived" ? <button className="secondary" onClick={() => rollback(asset.id)}><RotateCcw size={16} /> Rollback</button> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {view === "qr" ? (
        <section className="panel grid">
          <h2>Mi QR</h2>
          <p className="muted">{menu?.public_code ? `/r/${menu.public_code}` : "Subí una carta para crear el link dinámico."}</p>
          <button onClick={generateQr}><QrCode size={18} /> Generar QR</button>
          <div className="grid two">
            {qr.map((item) => <a className="card" key={item.id} href={assetUrl(item.asset_url)}>{item.qr_type} · descargar</a>)}
          </div>
        </section>
      ) : null}

      {view === "analytics" ? (
        <section className="grid">
          <div className="metrics">
            <Metric label="Hoy" value={summary?.scans_today ?? 0} />
            <Metric label="7 días" value={summary?.scans_7d ?? 0} />
            <Metric label="Hora pico" value={summary?.busiest_hour ?? "-"} />
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
