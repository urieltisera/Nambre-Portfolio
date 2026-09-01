import {readFileSync} from "node:fs";
import {join} from "node:path";
import {describe, expect, it} from "vitest";

const tokensCss = readFileSync(join(process.cwd(), "design-language", "tokens.css"), "utf8");
const globalsCss = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

const tokenDeclarations = Array.from(tokensCss.matchAll(/--([a-z0-9-]+)\s*:/gi)).map((match) => `--${match[1]}`);

describe("Nambre design language tokens", () => {
  it("loads the additive token layer before legacy globals", () => {
    expect(globalsCss.startsWith('@import "../design-language/tokens.css";')).toBe(true);
  });

  it("keeps the token layer namespaced to --nl-*", () => {
    expect(tokenDeclarations.length).toBeGreaterThan(0);
    expect(tokenDeclarations.every((token) => token.startsWith("--nl-"))).toBe(true);
  });

  it("anchors brand values to sources already represented in code", () => {
    expect(tokensCss).toContain("--nl-color-brand-isotype: #0B4A47;");
    expect(tokensCss).toContain("--nl-color-customer-public-menu-accent: #955F32;");
    expect(tokensCss).toContain("--nl-font-brand-display: \"Montserrat\", var(--nl-font-sans);");
  });

  it("uses controlled aliases where product tokens remain the source of truth", () => {
    expect(tokensCss).toContain("--nl-color-product-primary: var(--primary);");
    expect(tokensCss).toContain("--nl-color-background: var(--background);");
    expect(tokensCss).toContain("--nl-radius-md: var(--radius-md);");
    expect(tokensCss).toContain("--nl-shadow-md: var(--shadow-md);");
    expect(tokensCss).toContain("--nl-container-product: var(--page-max-width);");
  });
});
