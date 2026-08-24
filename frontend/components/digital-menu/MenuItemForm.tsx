"use client";

import React, {useEffect, useState} from "react";
import {Button} from "@/components/ui/Button";
import {Input} from "@/components/ui/Input";
import {formatArsPrice} from "@/lib/money";

export type MenuItemFormValues = {
  currency: string;
  description: string;
  is_available: boolean;
  is_featured: boolean;
  is_visible: boolean;
  name: string;
  price: string;
};

export function normalizePriceInput(value: string): string | null {
  const sanitized = value.trim().replace(/\s+/g, "").replace(/\$/g, "");
  if (!sanitized) {
    return null;
  }

  const lastComma = sanitized.lastIndexOf(",");
  const lastDot = sanitized.lastIndexOf(".");
  let normalized = sanitized;

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      normalized = sanitized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = sanitized.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    normalized = sanitized.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = sanitized.replace(/,/g, "");
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }
  const [whole, decimals] = normalized.split(".");
  if (decimals === undefined) {
    return whole;
  }
  return `${whole}.${decimals.padEnd(2, "0")}`;
}

export function MenuItemForm({
  busy = false,
  initialValues,
  onCancel,
  onSubmit,
  submitLabel,
  title,
}: {
  busy?: boolean;
  initialValues?: Partial<MenuItemFormValues>;
  onCancel?: () => void;
  onSubmit: (values: MenuItemFormValues) => Promise<void> | void;
  submitLabel: string;
  title: string;
}) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [price, setPrice] = useState(initialValues?.price ?? "");
  const [currency, setCurrency] = useState(initialValues?.currency ?? "ARS");
  const [isVisible, setIsVisible] = useState(initialValues?.is_visible ?? true);
  const [isAvailable, setIsAvailable] = useState(initialValues?.is_available ?? true);
  const [isFeatured, setIsFeatured] = useState(initialValues?.is_featured ?? false);
  const [priceError, setPriceError] = useState("");

  useEffect(() => {
    setName(initialValues?.name ?? "");
    setDescription(initialValues?.description ?? "");
    setPrice(initialValues?.price ?? "");
    setCurrency(initialValues?.currency ?? "ARS");
    setIsVisible(initialValues?.is_visible ?? true);
    setIsAvailable(initialValues?.is_available ?? true);
    setIsFeatured(initialValues?.is_featured ?? false);
    setPriceError("");
  }, [initialValues]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedPrice = normalizePriceInput(price);
    if (!normalizedPrice) {
      setPriceError("Ingresá un precio válido. Ejemplo: 12500,50");
      return;
    }
    setPriceError("");
    await onSubmit({
      currency: currency.trim().toUpperCase() || "ARS",
      description,
      is_available: isAvailable,
      is_featured: isFeatured,
      is_visible: isVisible,
      name,
      price: normalizedPrice,
    });
  }

  const normalizedPreview = normalizePriceInput(price);

  return (
    <form className="panel-stack" onSubmit={(event) => void handleSubmit(event)}>
      <h3>{title}</h3>
      <Input
        autoComplete="off"
        disabled={busy}
        label="Nombre *"
        onChange={(event) => setName(event.target.value)}
        required
        value={name}
      />
      <label className="field">
        <span className="field__label">Descripción</span>
        <textarea
          className="ui-input ui-textarea"
          disabled={busy}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          value={description}
        />
      </label>
      <div className="digital-menu-form-grid">
        <Input
          disabled={busy}
          hint={priceError || (normalizedPreview ? formatArsPrice(normalizedPreview) : "Ejemplo: 12500,50")}
          label="Precio *"
          onChange={(event) => setPrice(event.target.value)}
          required
          value={price}
        />
        <Input
          disabled={busy}
          label="Moneda"
          maxLength={3}
          onChange={(event) => setCurrency(event.target.value.toUpperCase())}
          value={currency}
        />
      </div>
      <div className="digital-menu-checklist">
        <label className="login-legal__checkbox">
          <input
            checked={isAvailable}
            disabled={busy}
            onChange={(event) => setIsAvailable(event.target.checked)}
            type="checkbox"
          />
          <span>Disponible</span>
        </label>
        <label className="login-legal__checkbox">
          <input
            checked={isVisible}
            disabled={busy}
            onChange={(event) => setIsVisible(event.target.checked)}
            type="checkbox"
          />
          <span>Visible</span>
        </label>
        <label className="login-legal__checkbox">
          <input
            checked={isFeatured}
            disabled={busy}
            onChange={(event) => setIsFeatured(event.target.checked)}
            type="checkbox"
          />
          <span>Destacado</span>
        </label>
      </div>
      <div className="actions">
        <Button disabled={busy || !name.trim() || !price.trim()} type="submit">
          {busy ? "Guardando..." : submitLabel}
        </Button>
        {onCancel ? (
          <Button disabled={busy} onClick={onCancel} type="button" variant="secondary">
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}
