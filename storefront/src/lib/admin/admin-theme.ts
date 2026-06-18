export const ADMIN_THEME_STORAGE_KEY = "gc-admin-theme";
export const ADMIN_THEME_DEFAULT = "dark" as const;

export type AdminThemePreference = "dark" | "light" | "system";
export type AdminThemeResolved = "dark" | "light";

export function parseStoredAdminTheme(raw: string | null): AdminThemePreference {
  if (raw === "dark" || raw === "light" || raw === "system") return raw;
  return ADMIN_THEME_DEFAULT;
}

export function resolveAdminTheme(
  preference: AdminThemePreference,
  systemPrefersDark: boolean,
): AdminThemeResolved {
  if (preference === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  return preference;
}

export function systemPrefersDarkFromMediaQuery(matches: boolean | undefined): boolean {
  return matches ?? true;
}
