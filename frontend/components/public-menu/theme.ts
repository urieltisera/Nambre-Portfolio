export type MenuHeadingFontKey = "editorial" | "modern" | "classic" | "rounded";
export type MenuBodyFontKey = "clean" | "humanist" | "modern";
export type MenuCardStyleKey = "square" | "soft" | "rounded";

export type MenuThemeConfig = {
  accent_color: string;
  background_color: string;
  body_font: MenuBodyFontKey;
  card_style: MenuCardStyleKey;
  heading_font: MenuHeadingFontKey;
  muted_text_color: string;
  surface_color: string;
  text_color: string;
};

export type PublicMenuTheme = {
  accent: string;
  accentContrast: string;
  background: string;
  bodyFont: string;
  borderColor: string;
  borderRadius: string;
  headingFont: string;
  mutedText: string;
  navBackground: string;
  shadowColor: string;
  surface: string;
  surfaceAlt: string;
  text: string;
};

export type MenuThemePreset = {
  description: string;
  key: "natural" | "editorial" | "modern";
  label: string;
  theme: MenuThemeConfig;
};

export const nambreDefaultThemeConfig: MenuThemeConfig = {
  accent_color: "#955F32",
  background_color: "#F6F0E8",
  body_font: "clean",
  card_style: "rounded",
  heading_font: "editorial",
  muted_text_color: "#6F6258",
  surface_color: "#FFF7EE",
  text_color: "#241711",
};

export const menuThemePresets: MenuThemePreset[] = [
  {
    key: "natural",
    label: "Nambre Natural",
    description: "Cálido, orgánico y cercano para cocina casera o cafetería.",
    theme: {...nambreDefaultThemeConfig},
  },
  {
    key: "editorial",
    label: "Nambre Editorial",
    description: "Más contraste y una presencia limpia para propuestas elegantes.",
    theme: {
      accent_color: "#111111",
      background_color: "#F7F5F0",
      body_font: "humanist",
      card_style: "square",
      heading_font: "classic",
      muted_text_color: "#5F5A53",
      surface_color: "#FFFFFF",
      text_color: "#101010",
    },
  },
  {
    key: "modern",
    label: "Nambre Modern",
    description: "Oscuro, compacto y contemporáneo para bares y conceptos nocturnos.",
    theme: {
      accent_color: "#C9783D",
      background_color: "#16181C",
      body_font: "modern",
      card_style: "soft",
      heading_font: "modern",
      muted_text_color: "#C2B9AD",
      surface_color: "#242930",
      text_color: "#F4EFE8",
    },
  },
];

export const publicMenuFontFamilies = {
  body: {
    clean: 'var(--font-menu-body-clean), "Segoe UI", sans-serif',
    humanist: 'var(--font-menu-body-humanist), "Segoe UI", sans-serif',
    modern: 'var(--font-menu-body-modern), "Segoe UI", sans-serif',
  },
  heading: {
    classic: 'var(--font-menu-heading-classic), Georgia, serif',
    editorial: 'var(--font-menu-heading-editorial), Georgia, serif',
    modern: 'var(--font-menu-heading-modern), Georgia, serif',
    rounded: 'var(--font-menu-heading-rounded), "Segoe UI", sans-serif',
  },
} satisfies Record<string, Record<string, string>>;

export const publicMenuCardRadii: Record<MenuCardStyleKey, string> = {
  rounded: "26px",
  soft: "16px",
  square: "8px",
};

export const nambreDefaultTheme = resolvePublicMenuTheme(nambreDefaultThemeConfig);

export function resolvePublicMenuTheme(theme?: Partial<MenuThemeConfig> | null): PublicMenuTheme {
  const resolved = {...nambreDefaultThemeConfig, ...theme};
  const surfaceAlt = mixColors(resolved.surface_color, resolved.accent_color, 0.08);
  const shadowBase = isDarkColor(resolved.background_color) ? "#000000" : resolved.text_color;
  return {
    accent: resolved.accent_color,
    accentContrast: getReadableTextColor(resolved.accent_color),
    background: `linear-gradient(180deg, ${resolved.background_color} 0%, ${mixColors(resolved.background_color, resolved.accent_color, 0.06)} 100%)`,
    bodyFont: publicMenuFontFamilies.body[resolved.body_font],
    borderColor: withAlpha(mixColors(resolved.surface_color, resolved.accent_color, 0.42), 0.34),
    borderRadius: publicMenuCardRadii[resolved.card_style],
    headingFont: publicMenuFontFamilies.heading[resolved.heading_font],
    mutedText: resolved.muted_text_color,
    navBackground: withAlpha(resolved.surface_color, isDarkColor(resolved.background_color) ? 0.92 : 0.88),
    shadowColor: withAlpha(shadowBase, isDarkColor(resolved.background_color) ? 0.34 : 0.08),
    surface: withAlpha(resolved.surface_color, isDarkColor(resolved.background_color) ? 0.96 : 0.92),
    surfaceAlt: withAlpha(surfaceAlt, isDarkColor(resolved.background_color) ? 0.98 : 0.94),
    text: resolved.text_color,
  };
}

export function isValidThemeHex(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

export function getContrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: string): number {
  const red = Number.parseInt(color.slice(1, 3), 16) / 255;
  const green = Number.parseInt(color.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(color.slice(5, 7), 16) / 255;
  const channels = [red, green, blue].map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function withAlpha(color: string, alpha: number): string {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function mixColors(first: string, second: string, weight: number): string {
  const channels = [0, 2, 4].map((offset) => {
    const from = Number.parseInt(first.slice(1 + offset, 3 + offset), 16);
    const to = Number.parseInt(second.slice(1 + offset, 3 + offset), 16);
    return Math.round(from * (1 - weight) + to * weight);
  });
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function getReadableTextColor(background: string): string {
  return isDarkColor(background) ? "#FFF9F2" : "#18120F";
}

function isDarkColor(color: string): boolean {
  return getContrastRatio(color, "#FFFFFF") > getContrastRatio(color, "#111111");
}
