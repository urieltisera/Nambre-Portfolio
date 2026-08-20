export type ThemePreference = "light" | "dark" | "system";
export type VisualStyle = "minimal" | "maximal";

export type AppearancePreferenceState = {
  theme: ThemePreference;
  visualStyle: VisualStyle;
};

const STORAGE_KEY = "menuflow.appearance";

const defaults: AppearancePreferenceState = {
  theme: "system",
  visualStyle: "minimal",
};

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function isVisualStyle(value: unknown): value is VisualStyle {
  return value === "minimal" || value === "maximal";
}

export const appearancePreferences = {
  defaults,
  load(): AppearancePreferenceState {
    if (typeof window === "undefined") return defaults;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw) as Partial<AppearancePreferenceState>;
      return {
        theme: isThemePreference(parsed.theme) ? parsed.theme : defaults.theme,
        visualStyle: isVisualStyle(parsed.visualStyle) ? parsed.visualStyle : defaults.visualStyle,
      };
    } catch {
      return defaults;
    }
  },
  save(preferences: AppearancePreferenceState): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  },
};
