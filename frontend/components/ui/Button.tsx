import React, {forwardRef} from "react";
import {cn} from "@/lib/cn";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {children, className, size = "md", variant = "primary", ...props},
  ref,
) {
  return (
    <button
      className={cn("ui-button", `ui-button--${variant}`, `ui-button--${size}`, className)}
      ref={ref}
      {...props}
    >
      {children}
    </button>
  );
});
