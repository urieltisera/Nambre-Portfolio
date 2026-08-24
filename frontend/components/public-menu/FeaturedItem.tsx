/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import {Badge} from "@/components/ui/Badge";
import {formatArsPrice} from "@/lib/money";
import type {PublicMenuItem} from "@/lib/api";

export function FeaturedItem({
  item,
}: {
  item: PublicMenuItem;
}) {
  return (
    <article className={`public-menu-featured-card${item.is_available ? "" : " public-menu-item-card--sold-out"}`}>
      {item.image_url ? (
        <img
          alt={item.name}
          className="public-menu-featured-card__image"
          decoding="async"
          loading="lazy"
          src={item.image_url}
        />
      ) : null}
      <div className="public-menu-featured-card__body">
        <div className="public-menu-item-card__topline">
          <Badge tone="warning">Destacado</Badge>
          {!item.is_available ? <Badge tone="danger">Agotado</Badge> : null}
        </div>
        <h3>{item.name}</h3>
        {item.description ? <p>{item.description}</p> : null}
        <strong>{formatArsPrice(item.price)}</strong>
      </div>
    </article>
  );
}
