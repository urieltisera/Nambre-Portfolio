"use client";

import React, {useEffect, useRef, useState} from "react";
import {Button} from "@/components/ui/Button";
import {Input} from "@/components/ui/Input";
import {formatArsPrice} from "@/lib/money";

const ACCEPTED_PRODUCT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PRODUCT_IMAGE_BYTES = 10 * 1024 * 1024;

export type MenuItemFormValues = {
  categoryId: string;
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
  categoryOptions = [],
  categoryLocked = false,
  initialValues,
  onCancel,
  onSubmit,
  selectedCategoryId,
  submitLabel,
  title,
}: {
  busy?: boolean;
  categoryLocked?: boolean;
  categoryOptions?: Array<{id: string; name: string}>;
  initialValues?: Partial<MenuItemFormValues>;
  onCancel?: () => void;
  onSubmit: (values: MenuItemFormValues) => Promise<void> | void;
  selectedCategoryId?: string;
  submitLabel: string;
  title: string;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const initialCategoryId =
    initialValues?.categoryId ?? selectedCategoryId ?? (categoryLocked ? categoryOptions[0]?.id ?? "" : "");
  const initialName = initialValues?.name ?? "";
  const initialDescription = initialValues?.description ?? "";
  const initialPrice = initialValues?.price ?? "";
  const initialCurrency = initialValues?.currency ?? "ARS";
  const initialImageUrl = initialValues?.image_url ?? null;
  const initialIsVisible = initialValues?.is_visible ?? true;
  const initialIsAvailable = initialValues?.is_available ?? true;
  const initialIsFeatured = initialValues?.is_featured ?? false;
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [price, setPrice] = useState(initialPrice);
  const [currency, setCurrency] = useState(initialCurrency);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(initialImageUrl);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [isVisible, setIsVisible] = useState(initialIsVisible);
  const [isAvailable, setIsAvailable] = useState(initialIsAvailable);
  const [isFeatured, setIsFeatured] = useState(initialIsFeatured);
  const [categoryError, setCategoryError] = useState("");
  const [priceError, setPriceError] = useState("");
  const [imageError, setImageError] = useState("");

  useEffect(() => {
    setCategoryId(initialCategoryId);
    setName(initialName);
    setDescription(initialDescription);
    setPrice(initialPrice);
    setCurrency(initialCurrency);
    setCurrentImageUrl(initialImageUrl);
    setLocalPreviewUrl(null);
    setImageFile(null);
    setRemoveImage(false);
    setIsVisible(initialIsVisible);
    setIsAvailable(initialIsAvailable);
    setIsFeatured(initialIsFeatured);
    setCategoryError("");
    setPriceError("");
    setImageError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [
    initialCategoryId,
    initialCurrency,
    initialDescription,
    initialImageUrl,
    initialIsAvailable,
    initialIsFeatured,
    initialIsVisible,
    initialName,
    initialPrice,
  ]);

  useEffect(
    () => () => {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    },
    [localPreviewUrl],
  );

  useEffect(() => {
    if (!categoryId) {
      return;
    }
    const categoryStillExists = categoryOptions.some((category) => category.id === categoryId);
    if (categoryStillExists) {
      return;
    }
    setCategoryId(categoryLocked ? categoryOptions[0]?.id ?? "" : "");
    setCategoryError("La categoría elegida ya no está disponible. Elegí otra para continuar.");
  }, [categoryId, categoryLocked, categoryOptions]);

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
    const categoryStillExists = categoryOptions.length === 0 || categoryOptions.some((category) => category.id === categoryId);
    if (!categoryId || !categoryStillExists) {
      setCategoryError(
        categoryStillExists ? "Elegí una categoría para crear el producto." : "La categoría elegida ya no está disponible. Elegí otra para continuar.",
      );
      return;
    }
    setCategoryError("");
    const normalizedPrice = normalizePriceInput(price);
    if (!normalizedPrice) {
      setPriceError("Ingresá un precio válido. Ejemplo: 12500,50");
      return;
    }
    setPriceError("");
    await onSubmit({
      categoryId,
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
  const imageStatus = removeImage
    ? "La imagen se eliminará al guardar."
    : imageFile
      ? busy
        ? "Subiendo imagen..."
        : "Imagen seleccionada. Se guardará al confirmar."
      : currentImageUrl
        ? "Imagen guardada."
        : "Sin foto cargada";

  return (
    <form className="panel-stack" onSubmit={(event) => void handleSubmit(event)}>
      <h3>{title}</h3>
      {categoryOptions.length > 0 ? (
        <label className="field">
          <span className="field__label">Categoría *</span>
          <select
            className="ui-input"
            disabled={busy || categoryLocked}
            onChange={(event) => {
              setCategoryId(event.target.value);
              setCategoryError("");
            }}
            value={categoryId}
          >
            {!categoryLocked ? <option value="">Elegí una categoría</option> : null}
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {categoryError ? <span className="field__hint">{categoryError}</span> : null}
        </label>
      ) : null}
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
          className="digital-menu-form-grid__price"
          disabled={busy}
          hint={priceError || (normalizedPreview ? formatArsPrice(normalizedPreview) : "Ejemplo: 12500,50")}
          label="Precio *"
          onChange={(event) => setPrice(event.target.value)}
          required
          value={price}
        />
        <Input
          className="digital-menu-form-grid__currency"
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
          {hasPendingImageChange ? <span className="muted">{busy ? "Procesando..." : "Lista para guardar"}</span> : null}
        </div>
        <div className="digital-menu-image-field__preview">
          {previewImageUrl ? (
            <img
              alt={name.trim() ? `Preview de ${name.trim()}` : "Preview de imagen del producto"}
              className="digital-menu-image-field__image"
              src={previewImageUrl}
            />
          ) : (
            <div className="digital-menu-image-field__empty">{imageStatus}</div>
          )}
        </div>
        {previewImageUrl ? (
          <p aria-live="polite" className="digital-menu-image-field__status muted">
            {imageStatus}
          </p>
        ) : null}
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
