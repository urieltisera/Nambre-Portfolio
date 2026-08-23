import React from "react";
import { vi } from "vitest";

vi.mock("next/image", () => ({
  default: ({ alt, priority, src, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => {
    void priority;
    return React.createElement("img", {
      alt,
      src,
      ...props,
    });
  },
}));

vi.mock("next/font/google", () => ({
  Inter: () => ({
    className: "font-inter",
    style: { fontFamily: "Inter" },
    variable: "--font-sans",
  }),
}));
