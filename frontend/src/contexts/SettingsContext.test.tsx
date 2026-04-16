import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, renderHook, act } from "@testing-library/react";
import React from "react";
import { SettingsProvider, useSettingsContext } from "./SettingsContext";
import { THEMES } from "../themes";

// ─── localStorage stub ────────────────────────────────────────────────────────

const store: Record<string, string> = {};
beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  vi.spyOn(Storage.prototype, "getItem").mockImplementation((k) => store[k] ?? null);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation((k, v) => { store[k] = String(v); });
});

function getCssVar(name: string) {
  return document.documentElement.style.getPropertyValue(name);
}

beforeEach(() => {
  // Clear any CSS vars written by previous tests
  document.documentElement.removeAttribute("style");
});

// ─── Wrapper ──────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  return <SettingsProvider>{children}</SettingsProvider>;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SettingsProvider", () => {
  it("applies obsidian CSS vars on first mount with no stored settings", () => {
    renderHook(() => useSettingsContext(), { wrapper });
    expect(getCssVar("--bg-page")).toBe(THEMES.obsidian.cssVars["--bg-page"]);
  });

  it("applies stored theme CSS vars on mount when localStorage has a saved theme", () => {
    store["repertoire:settings"] = JSON.stringify({ uiTheme: "serum" });
    renderHook(() => useSettingsContext(), { wrapper });
    expect(getCssVar("--bg-page")).toBe(THEMES.serum.cssVars["--bg-page"]);
  });

  it("re-applies CSS vars when uiTheme is changed via update()", () => {
    const { result } = renderHook(() => useSettingsContext(), { wrapper });

    act(() => {
      result.current.update("uiTheme", "leather");
    });

    expect(getCssVar("--bg-page")).toBe(THEMES.leather.cssVars["--bg-page"]);
  });

  it("persists updated settings to localStorage", () => {
    const { result } = renderHook(() => useSettingsContext(), { wrapper });

    act(() => {
      result.current.update("evalBarVisible", false);
    });

    const saved = JSON.parse(store["repertoire:settings"]);
    expect(saved.evalBarVisible).toBe(false);
  });

  it("returns correct boardStyle for the active boardStyle theme", () => {
    store["repertoire:settings"] = JSON.stringify({ boardStyle: "bubblegum" });
    const { result } = renderHook(() => useSettingsContext(), { wrapper });
    expect(result.current.boardStyle).toEqual(THEMES.bubblegum.board);
  });

  it("boardStyle updates when boardStyle setting changes", () => {
    const { result } = renderHook(() => useSettingsContext(), { wrapper });
    expect(result.current.boardStyle).toEqual(THEMES.obsidian.board);

    act(() => {
      result.current.update("boardStyle", "serum");
    });

    expect(result.current.boardStyle).toEqual(THEMES.serum.board);
  });

  it("falls back to defaults for unrecognised stored values", () => {
    store["repertoire:settings"] = JSON.stringify({
      uiTheme: "not-a-theme",
      evalBarVisible: "yes",
      notationMode: "gibberish",
    });
    const { result } = renderHook(() => useSettingsContext(), { wrapper });
    expect(result.current.settings.uiTheme).toBe("obsidian");
    expect(result.current.settings.evalBarVisible).toBe(true);
    expect(result.current.settings.notationMode).toBe("readable");
  });

  it("falls back to defaults when localStorage contains invalid JSON", () => {
    store["repertoire:settings"] = "{ broken json";
    const { result } = renderHook(() => useSettingsContext(), { wrapper });
    expect(result.current.settings.uiTheme).toBe("obsidian");
  });
});

describe("useSettingsContext", () => {
  it("throws when called outside SettingsProvider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      renderHook(() => useSettingsContext())
    ).toThrow("useSettingsContext must be used inside <SettingsProvider>");
    consoleError.mockRestore();
  });
});
