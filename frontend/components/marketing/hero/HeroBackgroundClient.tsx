"use client";

import dynamic from "next/dynamic";
import React from "react";

const GradientWaves = dynamic(() => import("./GradientWaves").then((mod) => mod.GradientWaves), {
  loading: () => null,
  ssr: false,
});

export function HeroBackgroundClient() {
  return (
    <div aria-hidden="true" className="marketing-hero__enhancement" data-testid="hero-webgl-boundary">
      <div className="marketing-hero__fallback-layer" data-testid="hero-css-fallback" />
      <GradientWaves />
    </div>
  );
}
