"use client";

import Link from "next/link";
import React from "react";

export function PublicMenuState({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <main className="public-menu-state">
      <div className="public-menu-state__card">
        <p className="public-menu-header__eyebrow">Carta Nambre</p>
        <h1>{title}</h1>
        <p>{description}</p>
        <Link href="/">Powered by Nambre</Link>
      </div>
    </main>
  );
}
