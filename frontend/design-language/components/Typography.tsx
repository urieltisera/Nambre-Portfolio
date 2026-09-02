import React from "react";
import {cn} from "@/lib/cn";

type DisplayProps = React.HTMLAttributes<HTMLHeadingElement> & {
  as?: "h1" | "h2";
};

type HeadingProps = React.HTMLAttributes<HTMLHeadingElement> & {
  as?: "h2" | "h3" | "h4";
};

type TextProps = React.HTMLAttributes<HTMLParagraphElement> & {
  size?: "sm" | "md" | "lg";
};

type EyebrowProps = React.HTMLAttributes<HTMLElement> & {
  as?: "p" | "span";
};

export function Display({as: Component = "h1", className, ...props}: DisplayProps) {
  return <Component className={cn("nl-display", className)} {...props} />;
}

export function Heading({as: Component = "h2", className, ...props}: HeadingProps) {
  return <Component className={cn("nl-heading", className)} {...props} />;
}

export function Text({className, size = "md", ...props}: TextProps) {
  return <p className={cn("nl-text", `nl-text--${size}`, className)} {...props} />;
}

export function Eyebrow({as: Component = "p", className, ...props}: EyebrowProps) {
  return <Component className={cn("nl-eyebrow", className)} {...props} />;
}
