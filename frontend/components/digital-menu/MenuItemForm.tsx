"use client";

import React, {useEffect, useRef, useState} from "react";
import {Button} from "@/components/ui/Button";
import {Input} from "@/components/ui/Input";
import {formatArsPrice} from "@/lib/money";

const ACCEPTED_PRODUCT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PRODUCT_IMAGE_BYTES = 10 * 1024 * 1024;

export type MenuItemFormValues = {
  currency: string;
  description: string;
  imageFile: File | null;
  image_url: string | null;
  is_available: boolean;
  is_featured: boolean;
  is_visible: boolean;
  name: string;
  price: string;
  removeImage: boolean;
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [price, setPrice] = useState(initialValues?.price ?? "");
  const [currency, setCurrency] = useState(initialValues?.currency ?? "ARS");
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(initialValues?.image_url ?? null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [isVisible, setIsVisible] = useState(initialValues?.is_visible ?? true);
  const [isAvailable, setIsAvailable] = useState(initialValues?.is_available ?? true);
  const [isFeatured, setIsFeatured] = useState(initialValues?.is_featured ?? false);
  const [priceError, setPriceError] = useState("");
  const [imageError, setImageError] = useState("");

  useEffect(() => {
    setName(initialValues?.name ?? "");
    setDescription(initialValues?.description ?? "");
    setPrice(initialValues?.price ?? "");
    setCurrency(initialValues?.currency ?? "ARS");
    setCurrentImageUrl(initialValues?.image_url ?? null);
    setLocalPreviewUrl(null);
    setImageFile(null);
    setRemoveImage(false);
    setIsVisible(initialValues?.is_visible ?? true);
    setIsAvailable(initialValues?.is_available ?? true);
    setIsFeatured(initialValues?.is_featured ?? false);
    setPriceError("");
    setImageError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [initialValues]);

  useEffect(
    () => () => {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    },
    [localPreviewUrl],
  );

  function handlePickImage() {
    fileInputRef.current?.click();
  }

  function handleRestoreImage() {
    setRemoveImage(false);
    setImageError("");
  }

  function handleRemoveImage() {
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
    }
    setLocalPreviewUrl(null);
    setImageFile(null);
    setRemoveImage(Boolean(currentImageUrl));
    setImageError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    if (nextFile === null) {
      return;
    }
    if (!ACCEPTED_PRODUCT_IMAGE_TYPES.includes(nextFile.type)) {
      setImageError("Formato no compatible. Usá JPG, PNG o WebP.");
      event.target.value = "";
      return;
    }
    if (nextFile.size > MAX_PRODUCT_IMAGE_BYTES) {
      setImageError("La imagen supera el tamaño permitido de 10 MB.");
      event.target.value = "";
      return;
    }
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
    }
    setLocalPreviewUrl(URL.createObjectURL(nextFile));
    setImageFile(nextFile);
    setRemoveImage(false);
    setImageError("");
  }

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
      imageFile,
      image_url: currentImageUrl,
      is_available: isAvailable,
      is_featured: isFeatured,
      is_visible: isVisible,
      name,
      price: normalizedPrice,
      removeImage,
    });
  }

  const normalizedPreview = normalizePriceInput(price);
  const previewImageUrl = removeImage ? null : localPreviewUrl ?? currentImageUrl;
  const hasPendingImageChange = imageFile !== null || removeImage;

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
      <div className="digital-menu-image-field">
        <div className="digital-menu-image-field__header">
          <div>
            <strong>Imagen del producto</strong>
            <p className="muted">Opcional. JPG, PNG o WebP hasta 10 MB.</p>
          </div>
          {hasPendingImageChange ? <span className="muted">Se guardará al confirmar.</span> : null}
        </div>
        <div className="digital-menu-image-field__preview">
          {previewImageUrl ? (
            <img
              alt={name.trim() ? `Preview de ${name.trim()}` : "Preview de imagen del producto"}
              className="digital-menu-image-field__image"
              src={previewImageUrl}
            />
          ) : (
            <div className="digital-menu-image-field__empty">Sin foto cargada</div>
          )}
        </div>
        <input
          accept={ACCEPTED_PRODUCT_IMAGE_TYPES.join(",")}
          aria-label="Imagen del producto"
          className="sr-only"
          disabled={busy}
          onChange={handleImageChange}
          ref={fileInputRef}
          type="file"
        />
        <div className="digital-menu-image-field__actions">
          <Button disabled={busy} onClick={handlePickImage} type="button" variant="secondary">
            {previewImageUrl ? "Cambiar imagen" : "Subir imagen"}
          </Button>
          {previewImageUrl ? (
            <Button disabled={busy} onClick={handleRemoveImage} type="button" variant="ghost">
              Eliminar
            </Button>
          ) : null}
          {removeImage && currentImageUrl ? (
            <Button disabled={busy} onClick={handleRestoreImage} type="button" variant="ghost">
              Restaurar imagen
            </Button>
          ) : null}
        </div>
        {imageError ? <span className="field__hint">{imageError}</span> : null}
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
