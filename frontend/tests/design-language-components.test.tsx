// @vitest-environment jsdom

import {cleanup, render, screen} from "@testing-library/react";
import React from "react";
import {afterEach, describe, expect, it} from "vitest";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {Button, Container, Display, Eyebrow, Heading, NambreLogo, Text} from "@/design-language/components";

const componentStyles = readFileSync(
  join(process.cwd(), "design-language", "components", "styles.css"),
  "utf8",
);

afterEach(() => {
  cleanup();
});

describe("Nambre design language shared primitives", () => {
  it("renders the official Nambre isotype asset with accessible labeling", () => {
    render(<NambreLogo className="brand-mark" label="Nambre symbol" variant="currentColor" />);

    const logo = screen.getByRole("img", {name: "Nambre symbol"});
    const image = logo.querySelector("img");

    expect(Array.from(logo.classList)).toEqual(expect.arrayContaining(["nl-logo", "nl-logo--md", "brand-mark"]));
    expect(image?.getAttribute("src")).toBe("/brand/isotype-currentColor.svg");
    expect(image?.getAttribute("alt")).toBe("");
  });

  it("supports decorative logo rendering without exposing duplicate assistive text", () => {
    const {container} = render(<NambreLogo decorative size="lg" variant="white" />);

    expect(screen.queryByRole("img")).toBeNull();
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/brand/isotype-white.svg");
  });

  it("renders containers with responsive size variants and custom class names", () => {
    render(
      <Container as="main" className="surface" size="readable">
        Content
      </Container>,
    );

    expect(Array.from(screen.getByRole("main").classList)).toEqual(
      expect.arrayContaining(["nl-container", "nl-container--readable", "surface"]),
    );
  });

  it("renders typography primitives with stable semantic defaults and variants", () => {
    render(
      <>
        <Display>Display</Display>
        <Heading as="h3">Heading</Heading>
        <Text className="intro" size="lg">
          Body
        </Text>
        <Eyebrow as="span">Eyebrow</Eyebrow>
      </>,
    );

    expect(screen.getByRole("heading", {level: 1, name: "Display"}).classList.contains("nl-display")).toBe(true);
    expect(screen.getByRole("heading", {level: 3, name: "Heading"}).classList.contains("nl-heading")).toBe(true);
    expect(Array.from(screen.getByText("Body").classList)).toEqual(
      expect.arrayContaining(["nl-text", "nl-text--lg", "intro"]),
    );
    expect(screen.getByText("Eyebrow").classList.contains("nl-eyebrow")).toBe(true);
  });

  it("renders shared buttons with limited variants, disabled state and className support", () => {
    render(
      <Button className="cta" disabled variant="secondary">
        Continue
      </Button>,
    );

    const button = screen.getByRole("button", {name: "Continue"});

    expect(Array.from(button.classList)).toEqual(
      expect.arrayContaining(["nl-button", "nl-button--secondary", "nl-button--md", "cta"]),
    );
    expect(button).toHaveProperty("disabled", true);
  });

  it("keeps primitive styles anchored to --nl-* tokens", () => {
    expect(componentStyles).toContain("var(--nl-container-marketing)");
    expect(componentStyles).toContain("var(--nl-font-brand-display)");
    expect(componentStyles).toContain("var(--nl-color-product-primary)");
    expect(componentStyles).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
