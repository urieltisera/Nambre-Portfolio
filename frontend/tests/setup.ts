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
  Inter: ({variable}: {variable?: string} = {}) => ({
    className: "font-inter",
    style: { fontFamily: "Inter" },
    variable: variable ?? "--font-sans",
  }),
  Cormorant_Garamond: ({variable}: {variable?: string} = {}) => ({
    className: "font-cormorant",
    style: { fontFamily: "Cormorant Garamond" },
    variable: variable ?? "--font-menu-heading-editorial",
  }),
  DM_Sans: ({variable}: {variable?: string} = {}) => ({
    className: "font-dm-sans",
    style: { fontFamily: "DM Sans" },
    variable: variable ?? "--font-menu-body-modern",
  }),
  Fraunces: ({variable}: {variable?: string} = {}) => ({
    className: "font-fraunces",
    style: { fontFamily: "Fraunces" },
    variable: variable ?? "--font-menu-heading-modern",
  }),
  Lora: ({variable}: {variable?: string} = {}) => ({
    className: "font-lora",
    style: { fontFamily: "Lora" },
    variable: variable ?? "--font-menu-heading-classic",
  }),
  Manrope: ({variable}: {variable?: string} = {}) => ({
    className: "font-manrope",
    style: { fontFamily: "Manrope" },
    variable: variable ?? "--font-menu-body-clean",
  }),
  Nunito: ({variable}: {variable?: string} = {}) => ({
    className: "font-nunito",
    style: { fontFamily: "Nunito" },
    variable: variable ?? "--font-menu-heading-rounded",
  }),
}));
