"use client";

import React from "react";

export type PublicMenuNavSection = {
  id: string;
  label: string;
};

export function CategoryNav({
  activeSection,
  sections,
  onSelect,
}: {
  activeSection: string;
  sections: PublicMenuNavSection[];
  onSelect: (sectionId: string) => void;
}) {
  return (
    <nav aria-label="Categorías del menú" className="public-menu-category-nav">
      <div className="public-menu-category-nav__track">
        {sections.map((section) => (
          <button
            aria-pressed={activeSection === section.id}
            className="public-menu-category-nav__chip"
            data-active={activeSection === section.id}
            key={section.id}
            onClick={() => onSelect(section.id)}
            type="button"
          >
            {section.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
