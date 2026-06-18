import { describe, expect, it } from "vitest";
import {
  ADMIN_THEME_DEFAULT,
  ADMIN_THEME_STORAGE_KEY,
  parseStoredAdminTheme,
  resolveAdminTheme,
} from "./admin-theme";

describe("admin-theme", () => {
  it("defaults to dark", () => {
    expect(ADMIN_THEME_DEFAULT).toBe("dark");
    expect(parseStoredAdminTheme(null)).toBe("dark");
    expect(parseStoredAdminTheme("")).toBe("dark");
    expect(parseStoredAdminTheme("not-a-theme")).toBe("dark");
  });

  it("uses localStorage key gc-admin-theme", () => {
    expect(ADMIN_THEME_STORAGE_KEY).toBe("gc-admin-theme");
  });

  it("resolves dark preference to dark theme", () => {
    expect(resolveAdminTheme("dark", false)).toBe("dark");
    expect(resolveAdminTheme("dark", true)).toBe("dark");
  });

  it("resolves light preference to light theme", () => {
    expect(resolveAdminTheme("light", true)).toBe("light");
    expect(resolveAdminTheme("light", false)).toBe("light");
  });

  it("resolves system preference from prefers-color-scheme", () => {
    expect(resolveAdminTheme("system", true)).toBe("dark");
    expect(resolveAdminTheme("system", false)).toBe("light");
  });

  it("parses stored theme values", () => {
    expect(parseStoredAdminTheme("light")).toBe("light");
    expect(parseStoredAdminTheme("system")).toBe("system");
    expect(parseStoredAdminTheme("dark")).toBe("dark");
  });
});
