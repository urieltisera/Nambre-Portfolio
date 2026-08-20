import React from "react";

export function EmptyState({
  action,
  description,
  title,
}: {
  action?: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className="state-card">
      <strong>{title}</strong>
      <p>{description}</p>
      {action ? <div className="state-card__action">{action}</div> : null}
    </div>
  );
}
