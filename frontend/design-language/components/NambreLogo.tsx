import Image from "next/image";
import React from "react";
import {cn} from "@/lib/cn";

const LOGO_SOURCES = {
  currentColor: "/brand/isotype-currentColor.svg",
  teal: "/brand/isotype-teal.svg",
  white: "/brand/isotype-white.svg",
} as const;

type NambreLogoProps = Omit<React.ComponentPropsWithoutRef<"span">, "children"> & {
  decorative?: boolean;
  label?: string;
  size?: "sm" | "md" | "lg";
  variant?: keyof typeof LOGO_SOURCES;
};

export function NambreLogo({
  className,
  decorative = false,
  label = "Nambre",
  size = "md",
  variant = "teal",
  ...props
}: NambreLogoProps) {
  return (
    <span
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
      className={cn("nl-logo", `nl-logo--${size}`, className)}
      role={decorative ? undefined : "img"}
      {...props}
    >
      <Image
        alt=""
        aria-hidden="true"
        className="nl-logo__asset"
        height={64}
        priority={false}
        src={LOGO_SOURCES[variant]}
        width={64}
      />
    </span>
  );
}
