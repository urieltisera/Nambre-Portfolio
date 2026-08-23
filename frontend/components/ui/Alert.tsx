import React from "react";
import {cn} from "@/lib/cn";

export function Alert({
  children,
  className,
  title,
  tone = "info",
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  tone?: "info" | "success" | "warning" | "danger";
}) {
  return (
    <div
      aria-live={tone === "danger" ? "assertive" : "polite"}
      className={cn("ui-alert", `ui-alert--${tone}`, className)}
      role={tone === "danger" ? "alert" : "status"}
    >
      {title ? <strong className="ui-alert__title">{title}</strong> : null}
      <div>{children}</div>
    </div>
  );
}
