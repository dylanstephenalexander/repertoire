export type ThemeId      = "obsidian" | "serum" | "bubblegum" | "leather";
export type PieceSetId   = "default";
export type SoundThemeId = "default";

// ─── Board style (JS — passed as props to react-chessboard) ──────────────────

export interface BoardStyle {
  lightSquare: string;
  darkSquare:  string;
  premove:     string;
  hint:        string;
  selected:    string;
  legalDest:   string;
  dropTarget:  string;
  arrow:       string;
}

// ─── CSS variable map ─────────────────────────────────────────────────────────

export type CssVars = {
  "--bg-page":           string;
  "--bg-surface":        string;
  "--bg-surface-deep":   string;
  "--bg-raised":         string;
  "--bg-raised-hover":   string;
  "--bg-raised-active":  string;
  "--border-subtle":     string;
  "--border-default":    string;
  "--border-moderate":   string;
  "--border-muted":      string;
  "--text-primary":      string;
  "--text-secondary":    string;
  "--text-muted":        string;
  "--text-dim":          string;
  "--text-dimmer":       string;
  "--text-dimmest":      string;
  "--accent":              string;
  "--accent-hover":        string;
  "--accent-bg":           string;
  "--accent-button":       string;
  "--accent-button-hover": string;
  "--accent-text":         string;
  "--quality-correct-border":     string;
  "--quality-correct-label":      string;
  "--quality-alternative-border": string;
  "--quality-alternative-label":  string;
  "--quality-mistake-border":     string;
  "--quality-mistake-label":      string;
  "--quality-blunder-border":     string;
  "--quality-blunder-label":      string;
  "--quality-draw-border":        string;
  "--quality-draw-label":         string;
  "--quality-checkmate-border":   string;
  "--quality-checkmate-label":    string;
  "--quality-inaccuracy-bg":   string;
  "--quality-inaccuracy-line": string;
  "--quality-mistake-bg":      string;
  "--quality-mistake-line":    string;
  "--quality-blunder-bg":      string;
  "--quality-blunder-line":    string;
  "--quality-mistake-badge":     string;
  "--quality-blunder-badge":     string;
  "--quality-alternative-badge": string;
};

export interface ThemeDef {
  label:   string;
  cssVars: CssVars;
  board:   BoardStyle;
}

// ─── Color utilities ──────────────────────────────────────────────────────────

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** rgba(hex, alpha) → "rgba(r, g, b, alpha)" */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Linearly interpolate between two hex colours. t=0 → a, t=1 → b. */
export function lerp(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** Multiply every channel by factor (>1 lightens, <1 darkens). */
export function scale(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * factor, g * factor, b * factor);
}

/** Relative luminance (0 = black, 1 = white). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ─── Palette ──────────────────────────────────────────────────────────────────
// ~14 hand-picked values per theme. Everything else is derived by buildTheme().

export interface ThemePalette {
  // Surfaces
  bgPage:        string;
  bgSurface:     string;
  bgSurfaceDeep: string;
  bgRaised:      string;

  // Borders — subtle=bgRaised, muted=borderMuted, middle two interpolated
  borderMuted:   string;

  // Text — secondary/muted/dim/dimmer/dimmest derived as rgba steps
  textPrimary:   string;

  // Accent
  accent:        string;
  accentButton:  string;

  // Semantic quality colours
  correct:     string;
  alternative: string;
  mistake:     string;
  blunder:     string;

  // Board squares (design-intentional, not derivable)
  boardLight:  string;
  boardDark:   string;

  // Optional — defaults to borderMuted / lerp(blunder, accent, 0.4)
  draw?:      string;
  checkmate?: string;

  // Escape hatches for tokens the formula can't express
  overrides?:      Partial<CssVars>;
  boardOverrides?: Partial<BoardStyle>;
}

// ─── Build theme from palette ─────────────────────────────────────────────────

export function buildTheme(label: string, p: ThemePalette): ThemeDef {
  const dark = luminance(p.bgPage) < 0.5;
  const mix  = dark ? "#ffffff" : "#000000";

  const drawBase      = p.draw      ?? p.borderMuted;
  const checkmateBase = p.checkmate ?? lerp(p.blunder, p.accent, 0.4);

  /** Derive the five quality token variants from a single base colour. */
  function quality(base: string) {
    return {
      border: scale(base, dark ? 0.52 : 0.82),
      label:  dark ? base : scale(base, 0.76),
      bg:     rgba(base, dark ? 0.20 : 0.13),
      line:   scale(base, 0.90),
      badge:  dark ? base : scale(base, 0.76),
    };
  }

  const q = {
    correct:     quality(p.correct),
    alternative: quality(p.alternative),
    mistake:     quality(p.mistake),
    blunder:     quality(p.blunder),
    draw:        quality(drawBase),
    checkmate:   quality(checkmateBase),
  };

  const cssVars: CssVars = {
    // Surfaces
    "--bg-page":          p.bgPage,
    "--bg-surface":       p.bgSurface,
    "--bg-surface-deep":  p.bgSurfaceDeep,
    "--bg-raised":        p.bgRaised,
    "--bg-raised-hover":  lerp(p.bgRaised, mix, 0.08),
    "--bg-raised-active": lerp(p.bgRaised, mix, 0.14),

    // Borders
    "--border-subtle":   p.bgRaised,
    "--border-default":  lerp(p.bgRaised, p.borderMuted, 0.33),
    "--border-moderate": lerp(p.bgRaised, p.borderMuted, 0.67),
    "--border-muted":    p.borderMuted,

    // Text
    "--text-primary":   p.textPrimary,
    "--text-secondary": rgba(p.textPrimary, 0.85),
    "--text-muted":     rgba(p.textPrimary, 0.65),
    "--text-dim":       rgba(p.textPrimary, 0.50),
    "--text-dimmer":    rgba(p.textPrimary, 0.38),
    "--text-dimmest":   rgba(p.textPrimary, 0.28),

    // Accent
    "--accent":              p.accent,
    "--accent-hover":        lerp(p.accent, mix, 0.25),
    "--accent-bg":           rgba(p.accent, 0.12),
    "--accent-button":       p.accentButton,
    "--accent-button-hover": lerp(p.accentButton, mix, 0.15),
    "--accent-text":         p.accent,

    // Quality — Feedback panel
    "--quality-correct-border":     q.correct.border,
    "--quality-correct-label":      q.correct.label,
    "--quality-alternative-border": q.alternative.border,
    "--quality-alternative-label":  q.alternative.label,
    "--quality-mistake-border":     q.mistake.border,
    "--quality-mistake-label":      q.mistake.label,
    "--quality-blunder-border":     q.blunder.border,
    "--quality-blunder-label":      q.blunder.label,
    "--quality-draw-border":        q.draw.border,
    "--quality-draw-label":         q.draw.label,
    "--quality-checkmate-border":   q.checkmate.border,
    "--quality-checkmate-label":    q.checkmate.label,

    // Quality — GameReview annotation highlights
    "--quality-inaccuracy-bg":   rgba(p.mistake, dark ? 0.15 : 0.10),
    "--quality-inaccuracy-line": scale(p.mistake, 0.90),
    "--quality-mistake-bg":      q.mistake.bg,
    "--quality-mistake-line":    q.mistake.line,
    "--quality-blunder-bg":      q.blunder.bg,
    "--quality-blunder-line":    q.blunder.line,

    // Quality — SessionMoveList badges
    "--quality-mistake-badge":     q.mistake.badge,
    "--quality-blunder-badge":     q.blunder.badge,
    "--quality-alternative-badge": q.alternative.badge,

    ...p.overrides,
  };

  const board: BoardStyle = {
    lightSquare: p.boardLight,
    darkSquare:  p.boardDark,
    premove:     rgba(p.mistake,     0.65),
    hint:        rgba(p.accent,      0.55),
    selected:    rgba(p.accent,      0.40),
    legalDest:   rgba(p.correct,     0.25),
    dropTarget:  rgba(p.accent,      0.80),
    arrow:       rgba(p.accent,      0.70),
    ...p.boardOverrides,
  };

  return { label, cssVars, board };
}

// ─── Theme definitions ────────────────────────────────────────────────────────

export const THEMES: Record<ThemeId, ThemeDef> = {

  obsidian: buildTheme("Obsidian", {
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
  }),

  serum: buildTheme("Serum", {
    bgPage:        "#080808",
    bgSurface:     "#0f0f0f",
    bgSurfaceDeep: "#050505",
    bgRaised:      "#161616",
    borderMuted:   "#2e4428",
    textPrimary:   "#c8ffc0",
    accent:        "#39ff14",
    accentButton:  "#166b10",
    correct:       "#39ff14",
    alternative:   "#40c8ff",
    mistake:       "#ffaa20",
    blunder:       "#ff3030",
    boardLight:    "#a0d040",
    boardDark:     "#282828",
  }),

  bubblegum: buildTheme("Bubblegum", {
    bgPage:        "#fef0f5",
    bgSurface:     "#fff5f8",
    bgSurfaceDeep: "#fff0f4",
    bgRaised:      "#ffe4ef",
    borderMuted:   "#d86898",
    textPrimary:   "#2d0818",
    accent:        "#d42070",
    accentButton:  "#c01860",
    correct:       "#309040",
    alternative:   "#305090",
    mistake:       "#c06000",
    blunder:       "#b01010",
    boardLight:    "#ffd6e8",
    boardDark:     "#e890b8",
  }),

  leather: buildTheme("Leather", {
    bgPage:        "#160e06",
    bgSurface:     "#1e1408",
    bgSurfaceDeep: "#100a04",
    bgRaised:      "#2a1c0c",
    borderMuted:   "#6e4424",
    textPrimary:   "#f5e6c8",
    accent:        "#d4a030",
    accentButton:  "#6e4818",
    correct:       "#60b040",
    alternative:   "#5090c0",
    mistake:       "#d4a030",
    blunder:       "#cc4040",
    boardLight:    "#d4b896",
    boardDark:     "#7c4e2a",
  }),
};

export const PIECE_SETS: Record<PieceSetId, { label: string }> = {
  default: { label: "Default" },
};

export const SOUND_THEMES: Record<SoundThemeId, { label: string }> = {
  default: { label: "Default" },
};
