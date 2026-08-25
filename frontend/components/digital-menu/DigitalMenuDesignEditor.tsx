"use client";

import React, {useEffect, useMemo, useState} from "react";
import type {Business, DigitalMenu, DigitalMenuThemePayload, MenuCategory, MenuItem, PublicDigitalMenuPage} from "@/lib/api";
import {Alert} from "@/components/ui/Alert";
import {Badge} from "@/components/ui/Badge";
import {Button} from "@/components/ui/Button";
import {PublicMenuPage} from "@/components/public-menu/PublicMenuPage";
import {
  getContrastRatio,
  isValidThemeHex,
  menuThemePresets,
  nambreDefaultThemeConfig,
  resolvePublicMenuTheme,
  type MenuThemeConfig,
} from "@/components/public-menu/theme";

const headingFontOptions = [
  {label: "Editorial", value: "editorial"},
  {label: "Modern", value: "modern"},
  {label: "Classic", value: "classic"},
  {label: "Rounded", value: "rounded"},
] as const;

const bodyFontOptions = [
  {label: "Clean", value: "clean"},
  {label: "Humanist", value: "humanist"},
  {label: "Modern", value: "modern"},
] as const;

const cardStyleOptions = [
  {label: "Square", value: "square"},
  {label: "Soft", value: "soft"},
  {label: "Rounded", value: "rounded"},
] as const;

type ThemeField = keyof MenuThemeConfig;

export function DigitalMenuDesignEditor({
  blockingMessage,
  business,
  busy,
  canMutate,
  categories,
  items,
  menu,
  onSave,
}: {
  blockingMessage: string | null;
  business: Business;
  busy: boolean;
  canMutate: boolean;
  categories: MenuCategory[];
  items: MenuItem[];
  menu: DigitalMenu;
  onSave: (theme: DigitalMenuThemePayload) => Promise<void>;
}) {
  const [draftTheme, setDraftTheme] = useState<MenuThemeConfig>(menu.theme ?? nambreDefaultThemeConfig);

  useEffect(() => {
    setDraftTheme(menu.theme ?? nambreDefaultThemeConfig);
  }, [menu.theme]);

  const contrastChecks = useMemo(() => {
    const pairs = [
      {
        label: "Texto sobre fondo",
        ratio: getContrastRatio(draftTheme.text_color, draftTheme.background_color),
      },
      {
        label: "Texto sobre cards",
        ratio: getContrastRatio(draftTheme.text_color, draftTheme.surface_color),
      },
      {
        label: "Texto secundario sobre fondo",
        ratio: getContrastRatio(draftTheme.muted_text_color, draftTheme.background_color),
      },
    ];
    const blocking = pairs.find((entry) => entry.ratio < 2.6);
    const warning = pairs.find((entry) => entry.ratio < 3.2);
    return {
      blocking: blocking ? `${blocking.label}: contraste demasiado bajo.` : "",
      warning:
        !blocking && warning ? `${warning.label}: este color puede dificultar la lectura.` : "",
    };
  }, [draftTheme]);

  const hasInvalidHex = useMemo(
    () =>
      [
        draftTheme.accent_color,
        draftTheme.background_color,
        draftTheme.surface_color,
        draftTheme.text_color,
        draftTheme.muted_text_color,
      ].some((value) => !isValidThemeHex(value)),
    [draftTheme],
  );

  const hasChanges = useMemo(
    () => JSON.stringify(draftTheme) !== JSON.stringify(menu.theme ?? nambreDefaultThemeConfig),
    [draftTheme, menu.theme],
  );

  const previewData = useMemo<PublicDigitalMenuPage>(() => {
    const visibleCategories = categories.map((category) => ({
      description: category.description,
      id: category.id,
      is_visible: category.is_visible,
      items: items
        .filter((item) => item.category_id === category.id)
        .map((item) => ({
          category_id: item.category_id,
          currency: item.currency,
          description: item.description,
          id: item.id,
          image_url: item.image_url,
          is_available: item.is_available,
          is_featured: item.is_featured,
          is_visible: item.is_visible,
          name: item.name,
          position: item.position,
          price: item.price,
        })),
      name: category.name,
      position: category.position,
    }));
    if (visibleCategories.length > 0) {
      return {
        business: {
          id: business.id,
          logo_url: business.logo_url,
          name: business.name,
        },
        categories: visibleCategories,
        menu: {
          ...menu,
          theme: draftTheme,
        },
        theme: draftTheme,
      };
    }
    return {
      business: {
        id: business.id,
        logo_url: business.logo_url,
        name: business.name,
      },
      categories: [
        {
          description: "Vista previa de una categoría móvil.",
          id: "preview-category",
          is_visible: true,
          items: [
            {
              category_id: "preview-category",
              currency: "ARS",
              description: "Con un texto breve para medir legibilidad.",
              id: "preview-item-1",
              image_url: null,
              is_available: true,
              is_featured: true,
              is_visible: true,
              name: "Sándwich de la casa",
              position: 0,
              price: "8900.00",
            },
            {
              category_id: "preview-category",
              currency: "ARS",
              description: "Sin foto, para validar el fallback visual.",
              id: "preview-item-2",
              image_url: null,
              is_available: false,
              is_featured: false,
              is_visible: true,
              name: "Cold brew",
              position: 1,
              price: "4200.00",
            },
          ],
          name: "Preview",
          position: 0,
        },
      ],
      menu: {
        ...menu,
        theme: draftTheme,
      },
      theme: draftTheme,
    };
  }, [business.id, business.logo_url, business.name, categories, draftTheme, items, menu]);

  const saveDisabled =
    busy || !canMutate || hasInvalidHex || Boolean(contrastChecks.blocking) || !hasChanges;

  function updateTheme<Field extends ThemeField>(field: Field, value: MenuThemeConfig[Field]) {
    setDraftTheme((current) => ({...current, [field]: value}));
  }

  function applyPreset(theme: MenuThemeConfig) {
    setDraftTheme(theme);
  }

  async function handleRestoreDefaults() {
    if (!window.confirm("¿Restaurar el diseño Nambre por defecto?")) {
      return;
    }
    setDraftTheme(nambreDefaultThemeConfig);
  }

  return (
    <div className="digital-menu-design-layout">
      <div className="panel-stack">
        <div className="owner-compact-card__topline">
          <div>
            <h2>Diseño</h2>
            <p className="muted">Personalizá colores, tipografía y estilos.</p>
          </div>
          <Badge tone={hasChanges ? "warning" : "success"}>
            {hasChanges ? "Cambios pendientes" : "Sin cambios"}
          </Badge>
        </div>

        {blockingMessage ? <Alert tone="warning">{blockingMessage}</Alert> : null}
        {hasInvalidHex ? <Alert tone="danger">Usá colores hexadecimales válidos, por ejemplo #1F3A2D.</Alert> : null}
        {contrastChecks.blocking ? <Alert tone="danger">{contrastChecks.blocking}</Alert> : null}
        {!contrastChecks.blocking && contrastChecks.warning ? (
          <Alert tone="warning">{contrastChecks.warning}</Alert>
        ) : null}

        <div className="digital-menu-theme-presets">
          {menuThemePresets.map((preset) => (
            <button
              className="digital-menu-theme-preset"
              disabled={!canMutate || busy}
              key={preset.key}
              onClick={() => applyPreset(preset.theme)}
              type="button"
            >
              <span
                aria-hidden="true"
                className="digital-menu-theme-preset__palette"
                style={{
                  "--preset-accent": preset.theme.accent_color,
                  "--preset-bg": preset.theme.background_color,
                  "--preset-surface": preset.theme.surface_color,
                } as React.CSSProperties}
              />
              <strong>{preset.label}</strong>
              <span>{preset.description}</span>
            </button>
          ))}
        </div>

        <div className="digital-menu-theme-grid">
          <ThemeColorField
            disabled={!canMutate || busy}
            label="Color principal"
            value={draftTheme.accent_color}
            onChange={(value) => updateTheme("accent_color", value)}
          />
          <ThemeColorField
            disabled={!canMutate || busy}
            label="Fondo"
            value={draftTheme.background_color}
            onChange={(value) => updateTheme("background_color", value)}
          />
          <ThemeColorField
            disabled={!canMutate || busy}
            label="Superficie / cards"
            value={draftTheme.surface_color}
            onChange={(value) => updateTheme("surface_color", value)}
          />
          <ThemeColorField
            disabled={!canMutate || busy}
            label="Texto principal"
            value={draftTheme.text_color}
            onChange={(value) => updateTheme("text_color", value)}
          />
          <ThemeColorField
            disabled={!canMutate || busy}
            label="Texto secundario"
            value={draftTheme.muted_text_color}
            onChange={(value) => updateTheme("muted_text_color", value)}
          />

          <label className="field">
            <span className="field__label">Tipografía de títulos</span>
            <select
              className="ui-input"
              disabled={!canMutate || busy}
              onChange={(event) => updateTheme("heading_font", event.target.value as MenuThemeConfig["heading_font"])}
              value={draftTheme.heading_font}
            >
              {headingFontOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field__label">Tipografía de cuerpo</span>
            <select
              className="ui-input"
              disabled={!canMutate || busy}
              onChange={(event) => updateTheme("body_font", event.target.value as MenuThemeConfig["body_font"])}
              value={draftTheme.body_font}
            >
              {bodyFontOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field__label">Estilo de cards</span>
            <select
              className="ui-input"
              disabled={!canMutate || busy}
              onChange={(event) => updateTheme("card_style", event.target.value as MenuThemeConfig["card_style"])}
              value={draftTheme.card_style}
            >
              {cardStyleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="digital-menu-theme-actions">
          <Button disabled={saveDisabled} onClick={() => void onSave(draftTheme)}>
            {busy ? "Guardando..." : "Guardar diseño"}
          </Button>
          <Button disabled={busy || !canMutate} onClick={() => void handleRestoreDefaults()} variant="secondary">
            Restaurar diseño Nambre
          </Button>
        </div>
      </div>

      <div className="digital-menu-preview-panel">
        <div className="owner-compact-card__topline">
          <div>
            <h2>Vista previa</h2>
            <p className="muted">Así verán tus clientes la carta antes de publicarla.</p>
          </div>
          <Badge tone="neutral">Mobile</Badge>
        </div>
        <div className="digital-menu-preview-frame">
          <PublicMenuPage
            data={previewData}
            previewMode
            theme={resolvePublicMenuTheme(draftTheme)}
          />
        </div>
      </div>
    </div>
  );
}

function ThemeColorField({
  disabled = false,
  label,
  onChange,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="field digital-menu-theme-color-field">
      <span className="field__label">{label}</span>
      <div className="digital-menu-theme-color-field__controls">
        <input
          aria-label={label}
          className="digital-menu-theme-color-field__picker"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          type="color"
          value={isValidThemeHex(value) ? value : "#000000"}
        />
        <input
          className="ui-input"
          disabled={disabled}
          maxLength={7}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          value={value}
        />
      </div>
    </label>
  );
}
