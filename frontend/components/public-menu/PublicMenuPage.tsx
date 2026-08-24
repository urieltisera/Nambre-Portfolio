"use client";

import React, {useEffect, useMemo, useState} from "react";
import type {PublicDigitalMenuPage, PublicMenuCategorySection, PublicMenuItem} from "@/lib/api";
import {CategoryNav} from "./CategoryNav";
import {FeaturedItem} from "./FeaturedItem";
import {MenuItemCard} from "./MenuItemCard";
import {PublicMenuActionBar} from "./PublicMenuActionBar";
import {PublicMenuFooter} from "./PublicMenuFooter";
import {PublicMenuHeader} from "./PublicMenuHeader";
import {resolvePublicMenuTheme, type PublicMenuTheme} from "./theme";

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
  previewMode = false,
  theme,
}: {
  data: PublicDigitalMenuPage;
  previewMode?: boolean;
  theme?: PublicMenuTheme;
}) {
  const resolvedTheme = useMemo(
    () => theme ?? resolvePublicMenuTheme(data.theme ?? data.menu.theme),
    [data.menu.theme, data.theme, theme],
  );
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
      className={`public-menu-shell${previewMode ? " public-menu-shell--preview" : ""}`}
      data-testid={previewMode ? "digital-menu-theme-preview" : undefined}
      style={
        {
          "--public-menu-accent": resolvedTheme.accent,
          "--public-menu-accent-contrast": resolvedTheme.accentContrast,
          "--public-menu-background": resolvedTheme.background,
          "--public-menu-body-font": resolvedTheme.bodyFont,
          "--public-menu-border": resolvedTheme.borderColor,
          "--public-menu-heading-font": resolvedTheme.headingFont,
          "--public-menu-muted": resolvedTheme.mutedText,
          "--public-menu-nav": resolvedTheme.navBackground,
          "--public-menu-radius": resolvedTheme.borderRadius,
          "--public-menu-shadow": resolvedTheme.shadowColor,
          "--public-menu-surface": resolvedTheme.surface,
          "--public-menu-surface-alt": resolvedTheme.surfaceAlt,
          "--public-menu-text": resolvedTheme.text,
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
      {!previewMode ? <PublicMenuActionBar /> : null}
    </main>
  );
}
