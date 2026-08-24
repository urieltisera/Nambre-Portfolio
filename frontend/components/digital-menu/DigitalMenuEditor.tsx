"use client";

import React, {useEffect, useMemo, useState} from "react";
import {ArrowUpRight, Eye, EyeOff, Pencil, Plus, Rocket, Sparkles, Trash2} from "lucide-react";
import {DigitalMenuDesignEditor} from "@/components/digital-menu/DigitalMenuDesignEditor";
import {Alert} from "@/components/ui/Alert";
import {Badge} from "@/components/ui/Badge";
import {Button} from "@/components/ui/Button";
import {Card} from "@/components/ui/Card";
import {EmptyState} from "@/components/ui/EmptyState";
import {LoadingState} from "@/components/ui/LoadingState";
import {
  Business,
  createDigitalMenu,
  createMenuCategory,
  createMenuItem,
  deleteMenuCategory,
  deleteMenuItem,
  deleteMenuItemImage,
  DigitalMenu,
  fetchDigitalMenuPreview,
  digitalMenuErrorMessage,
  DigitalMenuThemePayload,
  digitalMenuThemeErrorMessage,
  fetchDigitalMenu,
  listMenuCategories,
  listMenuItems,
  MenuCategory,
  MenuItem,
  publishDigitalMenu,
  productImageErrorMessage,
  unpublishDigitalMenu,
  updateDigitalMenu,
  updateMenuCategory,
  updateMenuItem,
  uploadMenuItemImage,
} from "@/lib/api";
import {formatArsPrice} from "@/lib/money";
import {CategoryForm, CategoryFormValues} from "./CategoryForm";
import {MenuItemForm, MenuItemFormValues} from "./MenuItemForm";

type CategoryEditorState =
  | {mode: "create"}
  | {category: MenuCategory; mode: "edit"}
  | null;

type ItemEditorState =
  | {categoryId: string; mode: "create"}
  | {item: MenuItem; mode: "edit"}
  | null;

export function DigitalMenuEditor({
  business,
  canMutate,
  onBusinessRefresh,
  onMenuPresenceChange,
  selectedMode,
  token,
}: {
  business: Business;
  canMutate: boolean;
  onBusinessRefresh: () => Promise<void>;
  onMenuPresenceChange: (exists: boolean) => void;
  selectedMode: "digital_menu" | "external_url" | "menu_pdf";
  token: string | null;
}) {
  const [menu, setMenu] = useState<DigitalMenu | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [categoryEditor, setCategoryEditor] = useState<CategoryEditorState>(null);
  const [itemEditor, setItemEditor] = useState<ItemEditorState>(null);
  const [activeView, setActiveView] = useState<"content" | "design">("content");
  const [publishing, setPublishing] = useState(false);
  const [openingPreview, setOpeningPreview] = useState(false);

  const hasPublication = menu?.has_publication === true || (menu?.published_version ?? 0) > 0;
  const hasUnpublishedChanges =
    menu?.has_unpublished_changes === true ||
    (menu?.draft_revision ?? 0) > (menu?.published_revision ?? 0);
  const canPublish = menu ? !hasPublication || hasUnpublishedChanges : false;

  const itemsByCategory = useMemo(() => {
    const grouped = new Map<string, MenuItem[]>();
    for (const item of items) {
      const bucket = grouped.get(item.category_id) ?? [];
      bucket.push(item);
      grouped.set(item.category_id, bucket);
    }
    return grouped;
  }, [items]);

  async function loadEditorState() {
    setLoading(true);
    setError("");
    try {
      const currentMenu = await fetchDigitalMenu(token, business.id);
      setMenu(currentMenu);
      onMenuPresenceChange(currentMenu !== null);
      if (currentMenu === null) {
        setCategories([]);
        setItems([]);
        return;
      }
      const [nextCategories, nextItems] = await Promise.all([
        listMenuCategories(token, business.id, currentMenu.id),
        listMenuItems(token, business.id, currentMenu.id),
      ]);
      setCategories(nextCategories);
      setItems(nextItems);
    } catch (loadError: unknown) {
      setError(digitalMenuErrorMessage(loadError, "No pudimos cargar tu carta."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEditorState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.id]);

  async function handleCreateMenu() {
    setBusy(true);
    setFeedback("");
    setError("");
    try {
      await createDigitalMenu(token, business.id, {
        is_published: false,
        name: `Carta ${business.name}`,
        template_key: "modern",
      });
      setFeedback("Carta Nambre creada correctamente.");
      await loadEditorState();
      await onBusinessRefresh();
    } catch (createError: unknown) {
      setError(digitalMenuErrorMessage(createError, "No pudimos crear tu Carta Nambre."));
    } finally {
      setBusy(false);
    }
  }

  async function handleThemeSave(theme: DigitalMenuThemePayload) {
    if (!menu) return;
    setBusy(true);
    setFeedback("");
    setError("");
    try {
      const updated = await updateDigitalMenu(token, business.id, menu.id, {theme});
      setMenu(updated);
      setFeedback("Diseño guardado correctamente.");
    } catch (saveError: unknown) {
      setError(digitalMenuThemeErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenPreview() {
    if (!menu) return;
    setOpeningPreview(true);
    setError("");
    try {
      await fetchDigitalMenuPreview(token, business.id, menu.id);
      window.open(
        `/preview/digital-menu?businessId=${business.id}&menuId=${menu.id}`,
        "_blank",
        "noopener,noreferrer",
      );
    } catch (previewError: unknown) {
      setError(digitalMenuErrorMessage(previewError, "No pudimos abrir la vista previa."));
    } finally {
      setOpeningPreview(false);
    }
  }

  async function handlePublish() {
    if (!menu) return;
    setPublishing(true);
    setFeedback("");
    setError("");
    try {
      const result = await publishDigitalMenu(token, business.id, menu.id);
      setMenu(result.menu);
      setFeedback(`Carta publicada. Versión v${result.version}.`);
      await loadEditorState();
      await onBusinessRefresh();
    } catch (publishError: unknown) {
      setError(digitalMenuErrorMessage(publishError, "No pudimos publicar la carta."));
    } finally {
      setPublishing(false);
    }
  }

  async function handleUnpublish() {
    if (!menu) return;
    const confirmed = window.confirm("¿Despublicar la carta pública actual?");
    if (!confirmed) return;
    setBusy(true);
    setFeedback("");
    setError("");
    try {
      const updated = await unpublishDigitalMenu(token, business.id, menu.id);
      setMenu(updated);
      setFeedback("Carta despublicada.");
      await loadEditorState();
      await onBusinessRefresh();
    } catch (unpublishError: unknown) {
      setError(digitalMenuErrorMessage(unpublishError, "No pudimos despublicar la carta."));
    } finally {
      setBusy(false);
    }
  }

  async function handleCategorySubmit(values: CategoryFormValues) {
    if (!menu) return;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      if (categoryEditor?.mode === "edit") {
        await updateMenuCategory(token, business.id, menu.id, categoryEditor.category.id, values);
        setFeedback("Categoría guardada correctamente.");
      } else {
        const nextPosition =
          categories.length > 0 ? Math.max(...categories.map((item) => item.position)) + 1 : 0;
        await createMenuCategory(token, business.id, menu.id, {
          ...values,
          position: nextPosition,
        });
        setFeedback("Categoría creada correctamente.");
      }
      setCategoryEditor(null);
      await loadEditorState();
    } catch (saveError: unknown) {
      setError(digitalMenuErrorMessage(saveError, "No pudimos guardar la categoría."));
    } finally {
      setBusy(false);
    }
  }

  async function handleItemSubmit(values: MenuItemFormValues) {
    if (!menu) return;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const itemPayload = {
        currency: values.currency,
        description: values.description,
        is_available: values.is_available,
        is_featured: values.is_featured,
        is_visible: values.is_visible,
        name: values.name,
        price: values.price,
      };
      let imageError = "";
      if (itemEditor?.mode === "edit") {
        await updateMenuItem(token, business.id, menu.id, itemEditor.item.id, itemPayload);
        try {
          if (values.imageFile) {
            await uploadMenuItemImage(
              token,
              business.id,
              menu.id,
              itemEditor.item.id,
              values.imageFile,
            );
          } else if (values.removeImage && itemEditor.item.image_url) {
            await deleteMenuItemImage(token, business.id, menu.id, itemEditor.item.id);
          }
        } catch (imageUploadError: unknown) {
          imageError = productImageErrorMessage(imageUploadError);
        }
        setFeedback(
          imageError
            ? "Producto guardado, pero la foto no pudo actualizarse."
            : "Producto guardado correctamente.",
        );
      } else {
        const categoryItems = itemsByCategory.get(itemEditor?.categoryId ?? "") ?? [];
        const nextPosition =
          categoryItems.length > 0
            ? Math.max(...categoryItems.map((item) => item.position)) + 1
            : 0;
        const createdItem = await createMenuItem(
          token,
          business.id,
          menu.id,
          itemEditor?.categoryId ?? "",
          {
            ...itemPayload,
            currency: "ARS",
            position: nextPosition,
          },
        );
        if (values.imageFile) {
          try {
            await uploadMenuItemImage(token, business.id, menu.id, createdItem.id, values.imageFile);
          } catch (imageUploadError: unknown) {
            imageError = productImageErrorMessage(imageUploadError);
          }
        }
        setFeedback(
          imageError
            ? "Producto creado, pero la foto no pudo subirse."
            : "Producto creado correctamente.",
        );
      }
      setItemEditor(null);
      await loadEditorState();
      if (imageError) {
        setError(imageError);
      }
    } catch (saveError: unknown) {
      setError(
        digitalMenuErrorMessage(
          saveError,
          "No pudimos guardar el producto. Revisá el precio e intentá nuevamente.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function moveCategory(categoryId: string, direction: -1 | 1) {
    if (!menu) return;
    const index = categories.findIndex((item) => item.id === categoryId);
    const target = categories[index];
    const neighbor = categories[index + direction];
    if (!target || !neighbor) return;
    setBusy(true);
    try {
      await updateMenuCategory(token, business.id, menu.id, target.id, {position: neighbor.position});
      await updateMenuCategory(token, business.id, menu.id, neighbor.id, {position: target.position});
      await loadEditorState();
    } catch (moveError: unknown) {
      setError(digitalMenuErrorMessage(moveError, "No pudimos reordenar la categoría."));
    } finally {
      setBusy(false);
    }
  }

  async function moveItem(itemId: string, direction: -1 | 1) {
    if (!menu) return;
    const item = items.find((entry) => entry.id === itemId);
    if (!item) return;
    const categoryItems = itemsByCategory.get(item.category_id) ?? [];
    const index = categoryItems.findIndex((entry) => entry.id === itemId);
    const neighbor = categoryItems[index + direction];
    if (!neighbor) return;
    setBusy(true);
    try {
      await updateMenuItem(token, business.id, menu.id, item.id, {position: neighbor.position});
      await updateMenuItem(token, business.id, menu.id, neighbor.id, {position: item.position});
      await loadEditorState();
    } catch (moveError: unknown) {
      setError(digitalMenuErrorMessage(moveError, "No pudimos reordenar el producto."));
    } finally {
      setBusy(false);
    }
  }

  async function toggleCategoryVisibility(category: MenuCategory) {
    if (!menu) return;
    setBusy(true);
    try {
      await updateMenuCategory(token, business.id, menu.id, category.id, {
        is_visible: !category.is_visible,
      });
      await loadEditorState();
    } catch (toggleError: unknown) {
      setError(digitalMenuErrorMessage(toggleError, "No pudimos actualizar la categoría."));
    } finally {
      setBusy(false);
    }
  }

  async function toggleItemFlag(
    item: MenuItem,
    payload: Partial<Pick<MenuItem, "is_available" | "is_featured" | "is_visible">>,
    fallback: string,
  ) {
    if (!menu) return;
    setBusy(true);
    try {
      await updateMenuItem(token, business.id, menu.id, item.id, payload);
      await loadEditorState();
    } catch (toggleError: unknown) {
      setError(digitalMenuErrorMessage(toggleError, fallback));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteCategory(category: MenuCategory) {
    if (!menu) return;
    const confirmed = window.confirm(
      `¿Eliminar "${category.name}"? También se eliminarán sus productos.`,
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await deleteMenuCategory(token, business.id, menu.id, category.id);
      setFeedback("Categoría eliminada correctamente.");
      await loadEditorState();
    } catch (deleteError: unknown) {
      setError(digitalMenuErrorMessage(deleteError, "No pudimos eliminar la categoría."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteItem(item: MenuItem) {
    if (!menu) return;
    const confirmed = window.confirm(`¿Eliminar "${item.name}"?`);
    if (!confirmed) return;
    setBusy(true);
    try {
      await deleteMenuItem(token, business.id, menu.id, item.id);
      setFeedback("Producto eliminado correctamente.");
      await loadEditorState();
    } catch (deleteError: unknown) {
      setError(digitalMenuErrorMessage(deleteError, "No pudimos eliminar el producto."));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <LoadingState message="Cargando tu Carta Nambre..." />;
  }

  return (
    <div className="panel-stack">
      <Card className="panel-stack">
        <div className="owner-compact-card__topline">
          <div>
            <h2>Carta Nambre</h2>
            <p className="muted">
              Administrá contenido y estados desde el dashboard. Nambre se ocupa del layout.
            </p>
            {menu ? (
              <p className="muted">
                {hasPublication
                  ? menu.is_published
                    ? `Publicado · v${menu.published_version ?? 0}${hasUnpublishedChanges ? " · Cambios sin publicar" : " · Sin cambios pendientes"}`
                    : `Borrador · Última versión publicada v${menu.published_version ?? 0}`
                  : "Borrador · Nunca publicado"}
              </p>
            ) : null}
          </div>
          <div>
            {menu ? (
              <div className="digital-menu-inline-actions">
                <Button disabled={openingPreview || busy} onClick={() => void handleOpenPreview()} size="sm" variant="secondary">
                  <ArrowUpRight size={16} /> {openingPreview ? "Abriendo..." : "Abrir vista previa"}
                </Button>
                <Button
                  disabled={publishing || busy || !canPublish}
                  onClick={() => void handlePublish()}
                  size="sm"
                >
                  <Rocket size={16} /> {publishing ? "Publicando..." : "Publicar"}
                </Button>
                {hasPublication ? (
                  <Button disabled={busy || !menu.is_published} onClick={() => void handleUnpublish()} size="sm" variant="ghost">
                    Despublicar
                  </Button>
                ) : null}
              </div>
            ) : null}
            <div aria-label="Secciones de Carta Nambre" className="digital-menu-view-switch" role="tablist">
              <button
                aria-selected={activeView === "content"}
                className="digital-menu-view-switch__tab"
                data-active={activeView === "content"}
                onClick={() => setActiveView("content")}
                role="tab"
                type="button"
              >
                Carta
              </button>
              <button
                aria-selected={activeView === "design"}
                className="digital-menu-view-switch__tab"
                data-active={activeView === "design"}
                onClick={() => setActiveView("design")}
                role="tab"
                type="button"
              >
                Diseño
              </button>
            </div>
          </div>
        </div>
        {selectedMode !== "digital_menu" ? (
          <Alert tone="info">
            Podés preparar tu Carta Nambre acá aunque hoy tu QR siga apuntando a otra modalidad.
          </Alert>
        ) : null}
        {feedback ? <Alert tone="success">{feedback}</Alert> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </Card>

      {!menu ? (
        <EmptyState
          action={
            <Button disabled={!canMutate || busy} onClick={() => void handleCreateMenu()}>
              {busy ? "Creando..." : "Crear Carta Nambre"}
            </Button>
          }
          description="Administrá categorías, productos y precios directamente desde Nambre."
          title="Creá tu Carta Nambre"
        />
      ) : activeView === "design" ? (
        <Card className="panel-stack">
          <DigitalMenuDesignEditor
            blockingMessage={
              business.logo_url
                ? null
                : "Si tu negocio todavía no tiene logo, la carta seguirá mostrando el nombre como fallback."
            }
            business={business}
            busy={busy}
            canMutate={canMutate}
            categories={categories}
            items={items}
            menu={menu}
            onSave={handleThemeSave}
          />
        </Card>
      ) : (
        <>
          {categoryEditor ? (
            <Card className="panel-stack">
              <CategoryForm
                busy={busy}
                initialValues={
                  categoryEditor.mode === "edit"
                    ? {
                        description: categoryEditor.category.description ?? "",
                        is_visible: categoryEditor.category.is_visible,
                        name: categoryEditor.category.name,
                      }
                    : undefined
                }
                onCancel={() => setCategoryEditor(null)}
                onSubmit={handleCategorySubmit}
                submitLabel={categoryEditor.mode === "edit" ? "Guardar categoría" : "Crear categoría"}
                title={categoryEditor.mode === "edit" ? "Editar categoría" : "Nueva categoría"}
              />
            </Card>
          ) : null}

          {itemEditor ? (
            <Card className="panel-stack">
              <MenuItemForm
                busy={busy}
                initialValues={
                  itemEditor.mode === "edit"
                    ? {
                        currency: itemEditor.item.currency,
                        description: itemEditor.item.description ?? "",
                        image_url: itemEditor.item.image_url,
                        is_available: itemEditor.item.is_available,
                        is_featured: itemEditor.item.is_featured,
                        is_visible: itemEditor.item.is_visible,
                        name: itemEditor.item.name,
                        price: itemEditor.item.price,
                      }
                    : {
                        currency: "ARS",
                        image_url: null,
                        is_available: true,
                        is_featured: false,
                        is_visible: true,
                      }
                }
                onCancel={() => setItemEditor(null)}
                onSubmit={handleItemSubmit}
                submitLabel={itemEditor.mode === "edit" ? "Guardar producto" : "Crear producto"}
                title={itemEditor.mode === "edit" ? "Editar producto" : "Nuevo producto"}
              />
            </Card>
          ) : null}

          <Card className="panel-stack">
            <div className="owner-compact-card__topline">
              <div>
                <h2>Categorías</h2>
                <p className="muted">
                  {categories.length
                    ? `${categories.length} categoría${categories.length === 1 ? "" : "s"}`
                    : "Tu carta todavía está vacía."}
                </p>
              </div>
              <Button disabled={!canMutate || busy} onClick={() => setCategoryEditor({mode: "create"})}>
                <Plus size={16} /> Nueva categoría
              </Button>
            </div>
            {!categories.length ? (
              <EmptyState
                action={
                  <Button
                    disabled={!canMutate || busy}
                    onClick={() => setCategoryEditor({mode: "create"})}
                  >
                    <Plus size={16} /> Crear categoría
                  </Button>
                }
                description="Creá tu primera categoría para empezar."
                title="Tu carta todavía está vacía."
              />
            ) : (
              <div className="digital-menu-category-list">
                {categories.map((category, index) => {
                  const categoryItems = itemsByCategory.get(category.id) ?? [];
                  return (
                    <Card className="digital-menu-category-card" key={category.id}>
                      <div className="digital-menu-category-header">
                        <div className="digital-menu-category-copy">
                          <strong>{category.name}</strong>
                          <span className="muted">
                            {categoryItems.length} producto{categoryItems.length === 1 ? "" : "s"}
                          </span>
                          {category.description ? <p className="muted">{category.description}</p> : null}
                        </div>
                        <div className="digital-menu-badges">
                          <Badge tone={category.is_visible ? "success" : "warning"}>
                            {category.is_visible ? "Visible" : "Oculta"}
                          </Badge>
                        </div>
                      </div>
                      <div className="digital-menu-inline-actions">
                        <Button
                          aria-label={`Subir ${category.name}`}
                          disabled={busy || index === 0}
                          onClick={() => void moveCategory(category.id, -1)}
                          size="sm"
                          variant="secondary"
                        >
                          ↑
                        </Button>
                        <Button
                          aria-label={`Bajar ${category.name}`}
                          disabled={busy || index === categories.length - 1}
                          onClick={() => void moveCategory(category.id, 1)}
                          size="sm"
                          variant="secondary"
                        >
                          ↓
                        </Button>
                        <Button
                          disabled={busy}
                          onClick={() => setCategoryEditor({category, mode: "edit"})}
                          size="sm"
                          variant="secondary"
                        >
                          <Pencil size={16} /> Editar
                        </Button>
                        <Button
                          disabled={busy}
                          onClick={() => void toggleCategoryVisibility(category)}
                          size="sm"
                          variant="ghost"
                        >
                          {category.is_visible ? <EyeOff size={16} /> : <Eye size={16} />}
                          {category.is_visible ? "Ocultar" : "Mostrar"}
                        </Button>
                        <Button
                          disabled={busy}
                          onClick={() => void handleDeleteCategory(category)}
                          size="sm"
                          variant="danger"
                        >
                          <Trash2 size={16} /> Eliminar
                        </Button>
                      </div>

                      {!categoryItems.length ? (
                        <EmptyState
                          action={
                            <Button
                              disabled={!canMutate || busy}
                              onClick={() => setItemEditor({categoryId: category.id, mode: "create"})}
                              size="sm"
                            >
                              <Plus size={16} /> Agregar producto
                            </Button>
                          }
                          description="Todavía no hay productos en esta categoría."
                          title="Categoría sin productos"
                        />
                      ) : (
                        <div className="digital-menu-item-list">
                          {categoryItems.map((item, itemIndex) => (
                            <div className="digital-menu-item-row" key={item.id}>
                              <div className="digital-menu-item-copy">
                                <strong>{item.name}</strong>
                                <span>{formatArsPrice(item.price)}</span>
                                {item.image_url ? <span className="muted">Con foto</span> : null}
                                {item.description ? <p className="muted">{item.description}</p> : null}
                              </div>
                              <div className="digital-menu-badges">
                                <Badge tone={item.is_visible ? "success" : "warning"}>
                                  {item.is_visible ? (item.is_available ? "Disponible" : "Agotado") : "Oculto"}
                                </Badge>
                                {item.is_featured ? (
                                  <Badge tone="neutral">
                                    <Sparkles size={12} /> Destacado
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="digital-menu-inline-actions">
                                <Button
                                  aria-label={`Subir ${item.name}`}
                                  disabled={busy || itemIndex === 0}
                                  onClick={() => void moveItem(item.id, -1)}
                                  size="sm"
                                  variant="secondary"
                                >
                                  ↑
                                </Button>
                                <Button
                                  aria-label={`Bajar ${item.name}`}
                                  disabled={busy || itemIndex === categoryItems.length - 1}
                                  onClick={() => void moveItem(item.id, 1)}
                                  size="sm"
                                  variant="secondary"
                                >
                                  ↓
                                </Button>
                                <Button
                                  disabled={busy}
                                  onClick={() => setItemEditor({item, mode: "edit"})}
                                  size="sm"
                                  variant="secondary"
                                >
                                  <Pencil size={16} /> Editar
                                </Button>
                                <Button
                                  disabled={busy}
                                  onClick={() =>
                                    void toggleItemFlag(
                                      item,
                                      {is_available: !item.is_available, is_visible: true},
                                      "No pudimos actualizar la disponibilidad.",
                                    )
                                  }
                                  size="sm"
                                  variant="ghost"
                                >
                                  {item.is_available ? "Marcar agotado" : "Marcar disponible"}
                                </Button>
                                <Button
                                  disabled={busy}
                                  onClick={() =>
                                    void toggleItemFlag(
                                      item,
                                      {is_visible: !item.is_visible},
                                      "No pudimos actualizar la visibilidad.",
                                    )
                                  }
                                  size="sm"
                                  variant="ghost"
                                >
                                  {item.is_visible ? "Ocultar" : "Mostrar"}
                                </Button>
                                <Button
                                  disabled={busy}
                                  onClick={() =>
                                    void toggleItemFlag(
                                      item,
                                      {is_featured: !item.is_featured},
                                      "No pudimos actualizar el destacado.",
                                    )
                                  }
                                  size="sm"
                                  variant="ghost"
                                >
                                  {item.is_featured ? "Quitar destacado" : "Destacar"}
                                </Button>
                                <Button
                                  disabled={busy}
                                  onClick={() => void handleDeleteItem(item)}
                                  size="sm"
                                  variant="danger"
                                >
                                  <Trash2 size={16} /> Eliminar
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <Button
                        disabled={!canMutate || busy}
                        onClick={() => setItemEditor({categoryId: category.id, mode: "create"})}
                        size="sm"
                        variant="secondary"
                      >
                        <Plus size={16} /> Agregar producto
                      </Button>
                    </Card>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
