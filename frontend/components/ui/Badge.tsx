import React from "react";
import {cn} from "@/lib/cn";

export function Badge({
  children,
  className,
  tone = "neutral",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return <span className={cn("ui-badge", `ui-badge--${tone}`, className)}>{children}</span>;
}
