import { describe, it, expect } from "vitest";
import {
  hexToRgb,
  rgbToHex,
  rgba,
  lerp,
  scale,
  luminance,
  buildTheme,
  THEMES,
  type ThemePalette,
  type CssVars,
} from "./themes";

// ─── Color utilities ──────────────────────────────────────────────────────────

describe("hexToRgb", () => {
  it("parses a 6-digit hex colour", () => {
    expect(hexToRgb("#ff8040")).toEqual([255, 128, 64]);
  });
  it("parses black and white", () => {
    expect(hexToRgb("#000000")).toEqual([0, 0, 0]);
    expect(hexToRgb("#ffffff")).toEqual([255, 255, 255]);
  });
});

describe("rgbToHex", () => {
  it("round-trips with hexToRgb", () => {
    const original = "#3a7bc8";
    const [r, g, b] = hexToRgb(original);
    expect(rgbToHex(r, g, b)).toBe(original);
  });
  it("clamps values outside 0-255", () => {
    expect(rgbToHex(-10, 300, 128)).toBe("#00ff80");
  });
});

describe("rgba", () => {
  it("produces correct rgba string", () => {
    expect(rgba("#ff0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
  });
  it("handles zero alpha", () => {
    expect(rgba("#000000", 0)).toBe("rgba(0, 0, 0, 0)");
  });
});

describe("lerp", () => {
  it("returns a at t=0", () => {
    expect(lerp("#000000", "#ffffff", 0)).toBe("#000000");
  });
  it("returns b at t=1", () => {
    expect(lerp("#000000", "#ffffff", 1)).toBe("#ffffff");
  });
  it("returns midpoint at t=0.5", () => {
    expect(lerp("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});

describe("scale", () => {
  it("halves each channel at factor 0.5", () => {
    expect(scale("#ff8040", 0.5)).toBe("#804020");
  });
  it("clamps to #ffffff at factor > 1", () => {
    expect(scale("#ffffff", 2)).toBe("#ffffff");
  });
  it("returns black at factor 0", () => {
    expect(scale("#abcdef", 0)).toBe("#000000");
  });
});

describe("luminance", () => {
  it("returns 0 for black", () => {
    expect(luminance("#000000")).toBe(0);
  });
  it("returns 1 for white", () => {
    expect(luminance("#ffffff")).toBeCloseTo(1);
  });
  it("correctly identifies dark colours", () => {
    expect(luminance("#121212")).toBeLessThan(0.5);
  });
  it("correctly identifies light colours", () => {
    expect(luminance("#fef0f5")).toBeGreaterThan(0.5);
  });
});

// ─── buildTheme ───────────────────────────────────────────────────────────────

const MINIMAL_PALETTE: ThemePalette = {
  bgPage:        "#121212",
  bgSurface:     "#1e1e1e",
  bgSurfaceDeep: "#111111",
  bgRaised:      "#2a2a2a",
  borderMuted:   "#555555",
  textPrimary:   "#e0e0e0",
  accent:        "#7faaff",
  accentButton:  "#2a5298",
  correct:       "#5ab85a",
  alternative:   "#6699dd",
  mistake:       "#e0a020",
  blunder:       "#cc3333",
  boardLight:    "#f0d9b5",
  boardDark:     "#b58863",
};

describe("buildTheme", () => {
  it("sets the label", () => {
    const theme = buildTheme("TestTheme", MINIMAL_PALETTE);
    expect(theme.label).toBe("TestTheme");
  });

  it("produces a ThemeDef with all required CssVars keys", () => {
    const theme = buildTheme("T", MINIMAL_PALETTE);
    const requiredKeys: (keyof CssVars)[] = [
      "--bg-page", "--bg-surface", "--bg-surface-deep", "--bg-raised",
      "--bg-raised-hover", "--bg-raised-active",
      "--border-subtle", "--border-default", "--border-moderate", "--border-muted",
      "--text-primary", "--text-secondary", "--text-muted", "--text-dim",
      "--text-dimmer", "--text-dimmest",
      "--accent", "--accent-hover", "--accent-bg",
      "--accent-button", "--accent-button-hover", "--accent-text",
      "--quality-correct-border", "--quality-correct-label",
      "--quality-alternative-border", "--quality-alternative-label",
      "--quality-mistake-border", "--quality-mistake-label",
      "--quality-blunder-border", "--quality-blunder-label",
      "--quality-draw-border", "--quality-draw-label",
      "--quality-checkmate-border", "--quality-checkmate-label",
      "--quality-inaccuracy-bg", "--quality-inaccuracy-line",
      "--quality-mistake-bg", "--quality-mistake-line",
      "--quality-blunder-bg", "--quality-blunder-line",
      "--quality-mistake-badge", "--quality-blunder-badge", "--quality-alternative-badge",
    ];
    for (const key of requiredKeys) {
      expect(theme.cssVars).toHaveProperty(key);
    }
  });

  it("produces a BoardStyle with all required keys", () => {
    const theme = buildTheme("T", MINIMAL_PALETTE);
    const keys = ["lightSquare", "darkSquare", "premove", "hint", "selected", "legalDest", "dropTarget", "arrow"];
    for (const key of keys) {
      expect(theme.board).toHaveProperty(key);
    }
  });

  it("passes bgPage and bgRaised through directly", () => {
    const theme = buildTheme("T", MINIMAL_PALETTE);
    expect(theme.cssVars["--bg-page"]).toBe("#121212");
    expect(theme.cssVars["--bg-raised"]).toBe("#2a2a2a");
    expect(theme.cssVars["--border-subtle"]).toBe("#2a2a2a");
  });

  it("passes board square colours through directly", () => {
    const theme = buildTheme("T", MINIMAL_PALETTE);
    expect(theme.board.lightSquare).toBe("#f0d9b5");
    expect(theme.board.darkSquare).toBe("#b58863");
  });

  it("derives raised hover/active states toward white on a dark theme", () => {
    const theme = buildTheme("T", MINIMAL_PALETTE); // dark theme
    const base   = hexToRgb("#2a2a2a")[0]; // 42
    const hover  = hexToRgb(theme.cssVars["--bg-raised-hover"])[0];
    const active = hexToRgb(theme.cssVars["--bg-raised-active"])[0];
    expect(hover).toBeGreaterThan(base);
    expect(active).toBeGreaterThan(hover);
  });

  it("derives raised hover/active states toward black on a light theme", () => {
    const light = buildTheme("T", { ...MINIMAL_PALETTE, bgPage: "#fef0f5", bgRaised: "#ffe4ef" });
    const base   = hexToRgb("#ffe4ef")[1]; // green channel
    const hover  = hexToRgb(light.cssVars["--bg-raised-hover"])[1];
    const active = hexToRgb(light.cssVars["--bg-raised-active"])[1];
    expect(hover).toBeLessThan(base);
    expect(active).toBeLessThan(hover);
  });

  it("border tokens step between bgRaised and borderMuted", () => {
    const theme = buildTheme("T", MINIMAL_PALETTE);
    const raised  = hexToRgb("#2a2a2a")[0]; // 42
    const muted   = hexToRgb("#555555")[0]; // 85
    const def     = hexToRgb(theme.cssVars["--border-default"])[0];
    const mod     = hexToRgb(theme.cssVars["--border-moderate"])[0];
    expect(def).toBeGreaterThan(raised);
    expect(mod).toBeGreaterThan(def);
    expect(hexToRgb(theme.cssVars["--border-muted"])[0]).toBe(muted);
  });

  it("text tokens are rgba strings derived from textPrimary", () => {
    const theme = buildTheme("T", MINIMAL_PALETTE);
    expect(theme.cssVars["--text-secondary"]).toMatch(/^rgba\(224, 224, 224,/);
    expect(theme.cssVars["--text-dimmest"]).toMatch(/^rgba\(224, 224, 224,/);
  });

  it("text opacity decreases from secondary to dimmest", () => {
    const theme = buildTheme("T", MINIMAL_PALETTE);
    const alpha = (v: string) => parseFloat(v.match(/[\d.]+\)$/)![0]);
    expect(alpha(theme.cssVars["--text-secondary"])).toBeGreaterThan(alpha(theme.cssVars["--text-muted"]));
    expect(alpha(theme.cssVars["--text-muted"])).toBeGreaterThan(alpha(theme.cssVars["--text-dim"]));
    expect(alpha(theme.cssVars["--text-dim"])).toBeGreaterThan(alpha(theme.cssVars["--text-dimmest"]));
  });

  it("quality label on a dark theme equals the base colour", () => {
    const theme = buildTheme("T", MINIMAL_PALETTE);
    expect(theme.cssVars["--quality-mistake-label"]).toBe("#e0a020");
  });

  it("quality border on a dark theme is darker than the base colour", () => {
    const theme = buildTheme("T", MINIMAL_PALETTE);
    const base   = hexToRgb("#e0a020")[0]; // 224
    const border = hexToRgb(theme.cssVars["--quality-mistake-border"])[0];
    expect(border).toBeLessThan(base);
  });

  it("quality bg tokens are rgba strings", () => {
    const theme = buildTheme("T", MINIMAL_PALETTE);
    expect(theme.cssVars["--quality-mistake-bg"]).toMatch(/^rgba/);
    expect(theme.cssVars["--quality-blunder-bg"]).toMatch(/^rgba/);
  });

  it("board highlight colours are rgba strings derived from palette", () => {
    const theme = buildTheme("T", MINIMAL_PALETTE);
    expect(theme.board.hint).toMatch(/^rgba\(127, 170, 255,/);   // accent
    expect(theme.board.premove).toMatch(/^rgba\(224, 160, 32,/); // mistake
    expect(theme.board.legalDest).toMatch(/^rgba\(90, 184, 90,/); // correct
  });

  it("uses optional draw colour when provided", () => {
    const theme = buildTheme("T", { ...MINIMAL_PALETTE, draw: "#888888" });
    // draw label on dark theme = base colour
    expect(theme.cssVars["--quality-draw-label"]).toBe("#888888");
  });

  it("falls back to borderMuted for draw when not provided", () => {
    const theme = buildTheme("T", MINIMAL_PALETTE);
    // borderMuted label scaled by 1.0 on dark theme
    expect(theme.cssVars["--quality-draw-label"]).toBe("#555555");
  });

  it("overrides are applied on top of derived values", () => {
    const theme = buildTheme("T", {
      ...MINIMAL_PALETTE,
      overrides: { "--bg-page": "#abcdef" },
    });
    expect(theme.cssVars["--bg-page"]).toBe("#abcdef");
  });

  it("boardOverrides replace derived board values", () => {
    const theme = buildTheme("T", {
      ...MINIMAL_PALETTE,
      boardOverrides: { selected: "rgba(255, 255, 0, 0.40)" },
    });
    expect(theme.board.selected).toBe("rgba(255, 255, 0, 0.40)");
  });
});

// ─── THEMES record ────────────────────────────────────────────────────────────

describe("THEMES", () => {
  const themeIds = ["obsidian", "serum", "bubblegum", "leather"] as const;

  it.each(themeIds)("%s has a non-empty label", (id) => {
    expect(THEMES[id].label.length).toBeGreaterThan(0);
  });

  it.each(themeIds)("%s has all CssVars keys defined", (id) => {
    const vars = THEMES[id].cssVars;
    expect(Object.keys(vars).length).toBeGreaterThanOrEqual(43);
    for (const v of Object.values(vars)) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
  });

  it.each(themeIds)("%s has all BoardStyle keys defined", (id) => {
    const board = THEMES[id].board;
    for (const v of Object.values(board)) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
  });

  it("bubblegum is a light theme (bg-page is light)", () => {
    expect(luminance(THEMES.bubblegum.cssVars["--bg-page"])).toBeGreaterThan(0.5);
  });

  it("obsidian, serum, leather are dark themes", () => {
    for (const id of ["obsidian", "serum", "leather"] as const) {
      expect(luminance(THEMES[id].cssVars["--bg-page"])).toBeLessThan(0.5);
    }
  });
});
