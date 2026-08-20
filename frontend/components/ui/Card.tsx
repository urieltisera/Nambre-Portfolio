import React from "react";
import {cn} from "@/lib/cn";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: "default" | "secondary" | "danger";
};

export function Card({children, className, tone = "default", ...props}: CardProps) {
  return (
    <div className={cn("ui-card", `ui-card--${tone}`, className)} {...props}>
      {children}
    </div>
  );
}
