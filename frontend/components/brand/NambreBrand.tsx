"use client";

import React from "react";
import Image from "next/image";
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
        <Image
          alt={alt}
          aria-hidden={decorative}
          className="menuflow-brand__asset menuflow-brand__asset--mark"
          height={96}
          priority
          src={markSrc}
          width={82}
        />
      </span>
    );
  }

  if (mode === "admin") {
    return (
      <span className={cn("menuflow-brand menuflow-brand--admin", className)}>
        <Image
          alt={alt}
          aria-hidden={decorative}
          className="menuflow-brand__asset menuflow-brand__asset--horizontal"
          height={128}
          priority
          src={horizontalSrc}
          width={323}
        />
        <span className="menuflow-brand__admin-copy">
          <span>Admin</span>
        </span>
      </span>
    );
  }

  return (
    <span className={cn("menuflow-brand menuflow-brand--horizontal", className)}>
      <Image
        alt={alt}
        aria-hidden={decorative}
        className="menuflow-brand__asset menuflow-brand__asset--horizontal"
        height={128}
        priority
        src={horizontalSrc}
        width={323}
      />
    </span>
  );
}
