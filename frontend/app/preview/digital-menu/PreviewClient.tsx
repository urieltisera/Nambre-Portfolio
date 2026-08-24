"use client";

import React, {useEffect, useState} from "react";
import {PublicMenuPage} from "@/components/public-menu/PublicMenuPage";
import {PublicMenuState} from "@/components/public-menu/PublicMenuState";
import {LoadingState} from "@/components/ui/LoadingState";
import {ApiError, fetchDigitalMenuPreview, type PublicDigitalMenuPage} from "@/lib/api";

export function PreviewClient({
  businessId,
  menuId,
}: {
  businessId: string | null;
  menuId: string | null;
}) {
  const [data, setData] = useState<PublicDigitalMenuPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadPreview() {
      if (!businessId || !menuId) {
        setError("Falta información para abrir la vista previa.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const preview = await fetchDigitalMenuPreview(null, businessId, menuId);
        if (!cancelled) {
          setData(preview);
        }
      } catch (previewError: unknown) {
        if (cancelled) return;
        if (previewError instanceof ApiError && (previewError.status === 401 || previewError.status === 403)) {
          setError("No tenés acceso a esta vista previa.");
        } else {
          setError("No pudimos cargar la vista previa.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [businessId, menuId]);

  if (loading) {
    return <LoadingState message="Cargando vista previa de la carta..." title="Vista previa" />;
  }

  if (!data) {
    return (
      <PublicMenuState
        description={error || "No se pudo abrir la vista previa."}
        title="Vista previa no disponible"
      />
    );
  }

  return <PublicMenuPage data={data} />;
}
