export type PublicMenuTheme = {
  accent: string;
  background: string;
  bodyFont: string;
  borderRadius: string;
  headingFont: string;
  mutedText: string;
  surface: string;
  surfaceAlt: string;
  text: string;
};

export const nambreDefaultTheme: PublicMenuTheme = {
  accent: "#955f32",
  background: "linear-gradient(180deg, #f6f0e8 0%, #efe4d6 100%)",
  bodyFont: '"Manrope", "Segoe UI", sans-serif',
  borderRadius: "24px",
  headingFont: '"Cormorant Garamond", Georgia, serif',
  mutedText: "#6f6258",
  surface: "rgba(255, 250, 244, 0.9)",
  surfaceAlt: "rgba(246, 236, 224, 0.92)",
  text: "#241711",
};
