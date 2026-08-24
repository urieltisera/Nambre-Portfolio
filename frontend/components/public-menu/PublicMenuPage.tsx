"use client";

import React, {useEffect, useMemo, useState} from "react";
import type {PublicDigitalMenuPage, PublicMenuCategorySection, PublicMenuItem} from "@/lib/api";
import {CategoryNav} from "./CategoryNav";
import {FeaturedItem} from "./FeaturedItem";
import {MenuItemCard} from "./MenuItemCard";
import {PublicMenuActionBar} from "./PublicMenuActionBar";
import {PublicMenuFooter} from "./PublicMenuFooter";
import {PublicMenuHeader} from "./PublicMenuHeader";
import {nambreDefaultTheme, type PublicMenuTheme} from "./theme";

type FeaturedEntry = {
  categoryId: string;
  item: PublicMenuItem;
};

function normalizeCategories(categories: PublicMenuCategorySection[]): PublicMenuCategorySection[] {
  return categories
    .filter((category) => category.is_visible)
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => item.is_visible),
    }))
    .filter((category) => category.items.length > 0);
}

export function PublicMenuPage({
  data,
  theme = nambreDefaultTheme,
}: {
  data: PublicDigitalMenuPage;
  theme?: PublicMenuTheme;
}) {
  const categories = useMemo(() => normalizeCategories(data.categories), [data.categories]);
  const featuredItems = useMemo<FeaturedEntry[]>(
    () =>
      categories.flatMap((category) =>
        category.items
          .filter((item) => item.is_featured)
          .map((item) => ({categoryId: category.id, item})),
      ),
    [categories],
  );
  const sections = useMemo(
    () => [
      ...(featuredItems.length > 0 ? [{id: "featured", label: "Recomendados"}] : []),
      ...categories.map((category) => ({id: `category-${category.id}`, label: category.name})),
    ],
    [categories, featuredItems.length],
  );
  const [activeSection, setActiveSection] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    setActiveSection(sections[0]?.id ?? "");
  }, [sections]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || sections.length === 0) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        if (visible?.target instanceof HTMLElement) {
          setActiveSection(visible.target.id);
        }
      },
      {rootMargin: "-25% 0px -55% 0px", threshold: [0.2, 0.45, 0.7]},
    );
    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (element) {
        observer.observe(element);
      }
    }
    return () => observer.disconnect();
  }, [sections]);

  function handleSelectSection(sectionId: string) {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({behavior: "smooth", block: "start"});
  }

  return (
    <main
      className="public-menu-shell"
      style={
        {
          "--public-menu-accent": theme.accent,
          "--public-menu-background": theme.background,
          "--public-menu-body-font": theme.bodyFont,
          "--public-menu-heading-font": theme.headingFont,
          "--public-menu-muted": theme.mutedText,
          "--public-menu-radius": theme.borderRadius,
          "--public-menu-surface": theme.surface,
          "--public-menu-surface-alt": theme.surfaceAlt,
          "--public-menu-text": theme.text,
        } as React.CSSProperties
      }
    >
      <div className="public-menu-shell__inner">
        <PublicMenuHeader business={data.business} menu={data.menu} />
        <CategoryNav activeSection={activeSection} onSelect={handleSelectSection} sections={sections} />

        {featuredItems.length > 0 ? (
          <section className="public-menu-section" id="featured">
            <div className="public-menu-section__heading">
              <p className="public-menu-header__eyebrow">Selección de la casa</p>
              <h2>Recomendados</h2>
            </div>
            <div className="public-menu-featured-grid">
              {featuredItems.map(({categoryId, item}) => (
                <FeaturedItem item={item} key={`${categoryId}-${item.id}`} />
              ))}
            </div>
          </section>
        ) : null}

        {categories.map((category) => (
          <section className="public-menu-section" id={`category-${category.id}`} key={category.id}>
            <div className="public-menu-section__heading">
              <h2>{category.name}</h2>
              {category.description ? <p>{category.description}</p> : null}
            </div>
            <div className="public-menu-items-grid">
              {category.items.map((item) => (
                <MenuItemCard item={item} key={item.id} />
              ))}
            </div>
          </section>
        ))}

        <PublicMenuFooter />
      </div>
      <PublicMenuActionBar />
    </main>
  );
}
