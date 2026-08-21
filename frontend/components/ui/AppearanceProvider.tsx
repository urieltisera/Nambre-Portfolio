"use client";

import React, {createContext, useContext, useEffect, useMemo, useState} from "react";
import {
  appearancePreferences,
  AppearancePreferenceState,
  ThemePreference,
  VisualStyle,
} from "@/lib/appearance-preferences";

type ResolvedTheme = "light" | "dark";

type AppearanceContextValue = AppearancePreferenceState & {
  resolvedTheme: ResolvedTheme;
  setTheme: (value: ThemePreference) => void;
  setVisualStyle: (value: VisualStyle) => void;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function AppearanceProvider({
  children,
  userId = null,
}: {
  children: React.ReactNode;
  userId?: string | null;
}) {
  const [theme, setTheme] = useState<ThemePreference>(appearancePreferences.defaults.theme);
  const [visualStyle, setVisualStyle] = useState<VisualStyle>(
    appearancePreferences.defaults.visualStyle,
  );
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = appearancePreferences.load(userId);
    setTheme(stored.theme);
    setVisualStyle(stored.visualStyle);
    setResolvedTheme(stored.theme === "system" ? getSystemTheme() : stored.theme);
    setHydrated(true);
  }, [userId]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => {
      setResolvedTheme(theme === "system" ? (media.matches ? "dark" : "light") : theme);
    };
    syncSystemTheme();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", syncSystemTheme);
      return () => media.removeEventListener("change", syncSystemTheme);
    }
    media.addListener(syncSystemTheme);
    return () => media.removeListener(syncSystemTheme);
  }, [theme]);

  useEffect(() => {
    const nextTheme = theme === "system" ? getSystemTheme() : theme;
    setResolvedTheme(nextTheme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.themePreference = theme;
    document.documentElement.dataset.visualStyle = visualStyle;
    if (!hydrated) return;
    appearancePreferences.save(userId, {theme, visualStyle});
  }, [hydrated, resolvedTheme, theme, userId, visualStyle]);

  const value = useMemo(
    () => ({
      resolvedTheme,
      setTheme,
      setVisualStyle,
      theme,
      visualStyle,
    }),
    [resolvedTheme, theme, visualStyle],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const value = useContext(AppearanceContext);
  if (value === null) {
    throw new Error("useAppearance must be used inside AppearanceProvider");
  }
  return value;
}
