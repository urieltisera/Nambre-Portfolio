import React from "react";

export function LoadingState({
  message = "Cargando...",
  title = "Estamos preparando todo",
}: {
  message?: string;
  title?: string;
}) {
  return (
    <div className="state-card" role="status">
      <div className="state-card__spinner" />
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  );
}
