export type ThemePreference = "light" | "dark" | "system";
export type VisualStyle = "minimal" | "maximal";

export type AppearancePreferenceState = {
  theme: ThemePreference;
  visualStyle: VisualStyle;
};

export const LEGACY_STORAGE_KEY = "menuflow.appearance";
const STORAGE_KEY_PREFIX = "menuflow:appearance:";

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
  keyForUser(userId: string): string {
    return `${STORAGE_KEY_PREFIX}${userId}`;
  },
  load(userId?: string | null): AppearancePreferenceState {
    if (typeof window === "undefined") return defaults;
    if (!userId) return defaults;
    try {
      const raw = window.localStorage.getItem(this.keyForUser(userId));
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
  save(userId: string | null | undefined, preferences: AppearancePreferenceState): void {
    if (typeof window === "undefined") return;
    if (!userId) return;
    window.localStorage.setItem(this.keyForUser(userId), JSON.stringify(preferences));
  },
};
