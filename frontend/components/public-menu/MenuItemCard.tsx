/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import {Badge} from "@/components/ui/Badge";
import {formatArsPrice} from "@/lib/money";
import type {PublicMenuItem} from "@/lib/api";

export function MenuItemCard({
  item,
}: {
  item: PublicMenuItem;
}) {
  const className = [
    "public-menu-item-card",
    item.image_url ? "public-menu-item-card--with-image" : "public-menu-item-card--text-only",
    item.is_available ? "" : " public-menu-item-card--sold-out",
  ]
    .join(" ")
    .trim();

  return (
    <article className={className}>
      {item.image_url ? (
        <img
          alt={item.name}
          className="public-menu-item-card__image"
          decoding="async"
          loading="lazy"
          src={item.image_url}
        />
      ) : null}
      <div className="public-menu-item-card__content">
        <div className="public-menu-item-card__topline">
          {item.is_featured ? <Badge tone="warning">Destacado</Badge> : <span />}
          {!item.is_available ? <Badge tone="danger">Agotado</Badge> : null}
        </div>
        <h3>{item.name}</h3>
        {item.description ? <p>{item.description}</p> : null}
        <strong>{formatArsPrice(item.price)}</strong>
      </div>
    </article>
  );
}
