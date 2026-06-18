"use client";

import * as React from "react";
import {
  ADMIN_THEME_DEFAULT,
  ADMIN_THEME_STORAGE_KEY,
  parseStoredAdminTheme,
  resolveAdminTheme,
  type AdminThemePreference,
  type AdminThemeResolved,
} from "@/lib/admin/admin-theme";

type AdminThemeContextValue = {
  preference: AdminThemePreference;
  resolved: AdminThemeResolved;
  setPreference: (next: AdminThemePreference) => void;
};

const AdminThemeContext = React.createContext<AdminThemeContextValue | null>(null);

function readSystemPrefersDark(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function AdminThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = React.useState<AdminThemePreference>(ADMIN_THEME_DEFAULT);
  const [resolved, setResolved] = React.useState<AdminThemeResolved>(ADMIN_THEME_DEFAULT);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    const stored = parseStoredAdminTheme(localStorage.getItem(ADMIN_THEME_STORAGE_KEY));
    setPreferenceState(stored);
    setResolved(resolveAdminTheme(stored, readSystemPrefersDark()));
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    setResolved(resolveAdminTheme(preference, readSystemPrefersDark()));
    if (preference !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      setResolved(resolveAdminTheme("system", mq.matches));
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference, hydrated]);

  const setPreference = React.useCallback((next: AdminThemePreference) => {
    setPreferenceState(next);
    localStorage.setItem(ADMIN_THEME_STORAGE_KEY, next);
    setResolved(resolveAdminTheme(next, readSystemPrefersDark()));
  }, []);

  const value = React.useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return (
    <AdminThemeContext.Provider value={value}>
      <div
        data-admin-theme={resolved}
        className="min-h-screen bg-admin-canvas text-admin-primary antialiased"
        suppressHydrationWarning
      >
        {children}
      </div>
    </AdminThemeContext.Provider>
  );
}

export function useAdminTheme(): AdminThemeContextValue {
  const ctx = React.useContext(AdminThemeContext);
  if (!ctx) {
    throw new Error("useAdminTheme must be used within AdminThemeProvider");
  }
  return ctx;
}
