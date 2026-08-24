/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import type {PublicBusinessSummary, DigitalMenu} from "@/lib/api";

export function PublicMenuHeader({
  business,
  menu,
}: {
  business: PublicBusinessSummary;
  menu: DigitalMenu;
}) {
  const showMenuLabel = menu.name.trim().toLowerCase() !== business.name.trim().toLowerCase();

  return (
    <header className="public-menu-header">
      <div className="public-menu-header__brand">
        {business.logo_url ? (
          <img
            alt={`Logo de ${business.name}`}
            className="public-menu-header__logo"
            src={business.logo_url}
          />
        ) : (
          <div aria-hidden="true" className="public-menu-header__logo public-menu-header__logo--fallback">
            {business.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div>
          <p className="public-menu-header__eyebrow">Carta Nambre</p>
          <h1>{business.name}</h1>
          {showMenuLabel ? <p className="public-menu-header__subtitle">{menu.name}</p> : null}
          <p className="public-menu-header__meta">Diseñada para una lectura cómoda desde el celular.</p>
        </div>
      </div>
    </header>
  );
}
