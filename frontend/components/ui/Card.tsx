import React, {forwardRef} from "react";
import {cn} from "@/lib/cn";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: "default" | "secondary" | "danger";
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  {children, className, tone = "default", ...props},
  ref,
) {
  return (
    <div className={cn("ui-card", `ui-card--${tone}`, className)} ref={ref} {...props}>
      {children}
    </div>
  );
});
