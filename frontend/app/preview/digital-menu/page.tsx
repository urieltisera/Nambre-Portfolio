import React, {Suspense} from "react";
import {LoadingState} from "@/components/ui/LoadingState";
import {PreviewClient} from "./PreviewClient";

export const dynamic = "force-dynamic";

export default async function DigitalMenuPreviewRoute({
  searchParams,
}: {
  searchParams?: Promise<{businessId?: string; menuId?: string}>;
}) {
  const params = searchParams ? await searchParams : undefined;

  return (
    <Suspense fallback={<LoadingState message="Cargando vista previa de la carta..." title="Vista previa" />}>
      <PreviewClient businessId={params?.businessId ?? null} menuId={params?.menuId ?? null} />
    </Suspense>
  );
}
