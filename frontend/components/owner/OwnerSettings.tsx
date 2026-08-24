"use client";

import React, {useMemo, useState} from "react";
import {ArrowRight, LogOut, Moon, Monitor, Sun} from "lucide-react";
import {Business, User, businessPlanLabel, changePassword, userRoleLabel} from "@/lib/api";
import {ThemePreference, VisualStyle} from "@/lib/appearance-preferences";
import {useAppearance} from "@/components/ui/AppearanceProvider";
import {Alert} from "@/components/ui/Alert";
import {Badge} from "@/components/ui/Badge";
import {Button} from "@/components/ui/Button";
import {Card} from "@/components/ui/Card";
import {PageHeader} from "@/components/ui/PageHeader";
import {Input} from "@/components/ui/Input";

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
  onSessionRefresh,
  token,
  user,
}: {
  business: Business | null;
  onLogout: () => Promise<void> | void;
  onNavigateBusiness: () => void;
  onSessionRefresh?: (token: string | null) => Promise<void> | void;
  token: string | null;
  user: User;
}) {
  const {resolvedTheme, setTheme, setVisualStyle, theme, visualStyle} = useAppearance();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const mismatch = useMemo(
    () => confirmPassword.length > 0 && newPassword !== confirmPassword,
    [confirmPassword, newPassword],
  );

  async function submitPasswordChange(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordError("La confirmación no coincide con la nueva contraseña.");
      return;
    }
    setChangingPassword(true);
    setPasswordError("");
    setPasswordMessage("");
    try {
      const nextToken = await changePassword(token, currentPassword, newPassword);
      await onSessionRefresh?.(nextToken);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage(
        "La contraseña fue actualizada y esta sesión ya usa la credencial nueva.",
      );
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "No se pudo cambiar la contraseña.");
    } finally {
      setChangingPassword(false);
    }
  }

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
            {business ? (
              <div>
                <dt>Plan</dt>
                <dd>{businessPlanLabel(business.plan_key)}</dd>
              </div>
            ) : null}
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
              <h2>Seguridad</h2>
              <p>Administrá tu contraseña y el acceso a tu cuenta.</p>
            </div>
          </div>
          <form className="settings-password" onSubmit={submitPasswordChange}>
            <Input
              autoComplete="current-password"
              disabled={changingPassword}
              label="Contraseña actual"
              onChange={(event) => setCurrentPassword(event.target.value)}
              type="password"
              value={currentPassword}
            />
            <Input
              autoComplete="new-password"
              disabled={changingPassword}
              label="Nueva contraseña"
              onChange={(event) => setNewPassword(event.target.value)}
              type="password"
              value={newPassword}
            />
            <Input
              autoComplete="new-password"
              disabled={changingPassword}
              label="Confirmar nueva contraseña"
              onChange={(event) => setConfirmPassword(event.target.value)}
              type="password"
              value={confirmPassword}
            />
            {mismatch ? (
              <Alert tone="danger">La confirmación no coincide con la nueva contraseña.</Alert>
            ) : null}
            {passwordMessage ? <Alert tone="success">{passwordMessage}</Alert> : null}
            {passwordError ? <Alert tone="danger">{passwordError}</Alert> : null}
            <Button
              disabled={
                changingPassword ||
                !currentPassword.trim() ||
                !newPassword.trim() ||
                !confirmPassword.trim() ||
                mismatch
              }
              type="submit"
            >
              {changingPassword ? "Guardando..." : "Guardar nueva contraseña"}
            </Button>
            <div className="settings-session">
              <Button onClick={() => void onLogout()} variant="danger">
                <LogOut size={16} /> Cerrar sesión
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </section>
  );
}
