"use client";

import React from "react";
import {ArrowRight, LogOut, Moon, Monitor, Sun} from "lucide-react";
import {Business, User, userRoleLabel} from "@/lib/api";
import {ThemePreference, VisualStyle} from "@/lib/appearance-preferences";
import {useAppearance} from "@/components/ui/AppearanceProvider";
import {Badge} from "@/components/ui/Badge";
import {Button} from "@/components/ui/Button";
import {Card} from "@/components/ui/Card";
import {PageHeader} from "@/components/ui/PageHeader";

const themeOptions: Array<{description: string; icon: React.ReactNode; label: string; value: ThemePreference}> = [
  {description: "Siempre con fondo claro y contraste suave.", icon: <Sun size={18} />, label: "Claro", value: "light"},
  {description: "Superficies oscuras diseñadas para legibilidad.", icon: <Moon size={18} />, label: "Oscuro", value: "dark"},
  {description: "Sigue la preferencia del sistema.", icon: <Monitor size={18} />, label: "Sistema", value: "system"},
];

const styleOptions: Array<{description: string; label: string; value: VisualStyle}> = [
  {
    description: "Más aire, menor densidad y una jerarquía más serena.",
    label: "Minimalista",
    value: "minimal",
  },
  {
    description: "Más densidad y acciones un poco más marcadas, sin recargar la vista.",
    label: "Maximalista",
    value: "maximal",
  },
];

export function OwnerSettings({
  business,
  onLogout,
  onNavigateBusiness,
  user,
}: {
  business: Business | null;
  onLogout: () => Promise<void> | void;
  onNavigateBusiness: () => void;
  user: User;
}) {
  const {resolvedTheme, setTheme, setVisualStyle, theme, visualStyle} = useAppearance();

  return (
    <section className="settings-screen">
      <PageHeader
        subtitle="Administrá tu cuenta y preferencias de Nambre."
        title="Configuración"
      />
      <div className="settings-grid">
        <Card className="settings-section">
          <div className="settings-section__header">
            <div>
              <h2>Cuenta</h2>
              <p>Datos disponibles desde la sesión actual.</p>
            </div>
            <Badge tone={user.is_platform_admin ? "warning" : "success"}>
              {userRoleLabel(user)}
            </Badge>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Rol</dt>
              <dd>{userRoleLabel(user)}</dd>
            </div>
            <div>
              <dt>Tema activo</dt>
              <dd>{resolvedTheme === "dark" ? "Oscuro" : "Claro"}</dd>
            </div>
          </dl>
        </Card>

        <Card className="settings-section">
          <div className="settings-section__header">
            <div>
              <h2>Apariencia</h2>
              <p>Los cambios se aplican al instante y se guardan en este navegador.</p>
            </div>
          </div>
          <div className="settings-options">
            <div>
              <h3>Tema</h3>
              <div className="preference-grid" role="radiogroup" aria-label="Tema">
                {themeOptions.map((option) => (
                  <button
                    aria-checked={theme === option.value}
                    className={`preference-card ${theme === option.value ? "is-selected" : ""}`}
                    key={option.value}
                    onClick={() => setTheme(option.value)}
                    role="radio"
                    type="button"
                  >
                    <span className="preference-card__icon">{option.icon}</span>
                    <strong>{option.label}</strong>
                    <p>{option.description}</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h3>Estilo visual</h3>
              <div className="preference-grid" role="radiogroup" aria-label="Estilo visual">
                {styleOptions.map((option) => (
                  <button
                    aria-checked={visualStyle === option.value}
                    className={`preference-card ${visualStyle === option.value ? "is-selected" : ""}`}
                    key={option.value}
                    onClick={() => setVisualStyle(option.value)}
                    role="radio"
                    type="button"
                  >
                    <strong>{option.label}</strong>
                    <p>{option.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card className="settings-section">
          <div className="settings-section__header">
            <div>
              <h2>Negocio</h2>
              <p>Accedé rápido a la configuración visible para tu restaurante.</p>
            </div>
          </div>
          {business ? (
            <div className="settings-business">
              <div>
                <strong>{business.name}</strong>
                <p>{business.slug}</p>
              </div>
              <Button onClick={onNavigateBusiness} variant="secondary">
                Administrar negocio <ArrowRight size={16} />
              </Button>
            </div>
          ) : (
            <p className="muted">Todavía no hay un negocio activo cargado.</p>
          )}
        </Card>

        <Card className="settings-section">
          <div className="settings-section__header">
            <div>
              <h2>Sesión</h2>
              <p>Tu sesión actual sigue validándose contra el backend real.</p>
            </div>
          </div>
          <div className="settings-session">
            <div>
              <strong>{user.email}</strong>
              <p>{userRoleLabel(user)}</p>
            </div>
            <Button onClick={() => void onLogout()} variant="danger">
              <LogOut size={16} /> Cerrar sesión
            </Button>
          </div>
        </Card>
      </div>
    </section>
  );
}
