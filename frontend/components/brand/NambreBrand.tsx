"use client";

import React from "react";
import {useAppearance} from "@/components/ui/AppearanceProvider";
import {cn} from "@/lib/cn";

type NambreBrandProps = {
  className?: string;
  decorative?: boolean;
  mode?: "horizontal" | "mark" | "admin";
};

export function NambreBrand({
  className,
  decorative = false,
  mode = "horizontal",
}: NambreBrandProps) {
  const {resolvedTheme} = useAppearance();
  const isDark = resolvedTheme === "dark";
  const markSrc = isDark ? "/brand/isotype-white.svg" : "/brand/isotype-teal.svg";
  const horizontalSrc = isDark
    ? "/brand/logo-horizontal-dark.svg"
    : "/brand/logo-horizontal-light.svg";
  const alt = decorative ? "" : mode === "admin" ? "Nambre Admin" : "Nambre";

  if (mode === "mark") {
    return (
      <span className={cn("menuflow-brand menuflow-brand--mark", className)}>
        <img
          alt={alt}
          aria-hidden={decorative}
          className="menuflow-brand__asset menuflow-brand__asset--mark"
          src={markSrc}
        />
      </span>
    );
  }

  if (mode === "admin") {
    return (
      <span className={cn("menuflow-brand menuflow-brand--admin", className)}>
        <img
          alt={alt}
          aria-hidden={decorative}
          className="menuflow-brand__asset menuflow-brand__asset--horizontal"
          src={horizontalSrc}
        />
        <span className="menuflow-brand__admin-copy">
          <span>Admin</span>
        </span>
      </span>
    );
  }

  return (
    <span className={cn("menuflow-brand menuflow-brand--horizontal", className)}>
      <img
        alt={alt}
        aria-hidden={decorative}
        className="menuflow-brand__asset menuflow-brand__asset--horizontal"
        src={horizontalSrc}
      />
    </span>
  );
}
