import React from "react";
import {cn} from "@/lib/cn";

type ContainerProps = React.HTMLAttributes<HTMLElement> & {
  as?: "div" | "main" | "section";
  size?: "readable" | "marketing" | "product";
};

export function Container({
  as: Component = "div",
  className,
  size = "marketing",
  ...props
}: ContainerProps) {
  return <Component className={cn("nl-container", `nl-container--${size}`, className)} {...props} />;
}
