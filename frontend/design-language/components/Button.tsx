import React, {forwardRef} from "react";
import {cn} from "@/lib/cn";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "ghost";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {className, size = "md", variant = "primary", ...props},
  ref,
) {
  return (
    <button
      className={cn("nl-button", `nl-button--${variant}`, `nl-button--${size}`, className)}
      ref={ref}
      {...props}
    />
  );
});
