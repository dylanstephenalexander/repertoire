export type ThemeId     = "obsidian" | "serum" | "bubblegum" | "leather";
export type PieceSetId  = "default";
export type SoundThemeId = "default";

// ─── Board style (JS — passed as props to react-chessboard) ──────────────────

export interface BoardStyle {
  lightSquare: string;
  darkSquare:  string;
  premove:     string;   // rgba — pre-move highlighted squares
  hint:        string;   // rgba — hint square highlight
  selected:    string;   // rgba — selected piece square
  legalDest:   string;   // rgba — legal move destination
  dropTarget:  string;   // rgba — drag-over outline
  arrow:       string;   // rgba — hint arrow
}

// ─── CSS variable map ─────────────────────────────────────────────────────────
// All keys must be present on every theme. applyTheme() writes these directly
// to document.documentElement.style so themes.ts is the single source of truth.

export type CssVars = {
  // Surfaces
  "--bg-page":           string;
  "--bg-surface":        string;
  "--bg-surface-deep":   string;
  "--bg-raised":         string;
  "--bg-raised-hover":   string;
  "--bg-raised-active":  string;
  // Borders
  "--border-subtle":     string;
  "--border-default":    string;
  "--border-moderate":   string;
  "--border-muted":      string;
  // Text
  "--text-primary":      string;
  "--text-secondary":    string;
  "--text-muted":        string;
  "--text-dim":          string;
  "--text-dimmer":       string;
  "--text-dimmest":      string;
  // Accent
  "--accent":              string;
  "--accent-hover":        string;
  "--accent-bg":           string;
  "--accent-button":       string;
  "--accent-button-hover": string;
  "--accent-text":         string;
  // Quality — Feedback panel (border + label)
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
  // Quality — GameReview annotation highlights
  "--quality-inaccuracy-bg":   string;
  "--quality-inaccuracy-line": string;
  "--quality-mistake-bg":      string;
  "--quality-mistake-line":    string;
  "--quality-blunder-bg":      string;
  "--quality-blunder-line":    string;
  // Quality — SessionMoveList badge text
  "--quality-mistake-badge":     string;
  "--quality-blunder-badge":     string;
  "--quality-alternative-badge": string;
};

export interface ThemeDef {
  label:   string;
  cssVars: CssVars;
  board:   BoardStyle;
}

// ─── Theme definitions ────────────────────────────────────────────────────────

export const THEMES: Record<ThemeId, ThemeDef> = {

  // ── Obsidian ──────────────────────────────────────────────────────────────
  obsidian: {
    label: "Obsidian",
    cssVars: {
      "--bg-page":          "#121212",
      "--bg-surface":       "#1e1e1e",
      "--bg-surface-deep":  "#111111",
      "--bg-raised":        "#2a2a2a",
      "--bg-raised-hover":  "#333333",
      "--bg-raised-active": "#383838",

      "--border-subtle":   "#2a2a2a",
      "--border-default":  "#333333",
      "--border-moderate": "#444444",
      "--border-muted":    "#555555",

      "--text-primary":   "#e0e0e0",
      "--text-secondary": "#cccccc",
      "--text-muted":     "#aaaaaa",
      "--text-dim":       "#888888",
      "--text-dimmer":    "#666666",
      "--text-dimmest":   "#555555",

      "--accent":              "#7faaff",
      "--accent-hover":        "#aac8ff",
      "--accent-bg":           "#1c2d40",
      "--accent-button":       "#2a5298",
      "--accent-button-hover": "#3a6bc0",
      "--accent-text":         "#64b4ff",

      "--quality-correct-border":     "#2d6a2d",
      "--quality-correct-label":      "#6abf6a",
      "--quality-alternative-border": "#4a6fa5",
      "--quality-alternative-label":  "#7aaae0",
      "--quality-mistake-border":     "#8a6000",
      "--quality-mistake-label":      "#f0b030",
      "--quality-blunder-border":     "#7a1a1a",
      "--quality-blunder-label":      "#e05555",
      "--quality-draw-border":        "#555555",
      "--quality-draw-label":         "#aaaaaa",
      "--quality-checkmate-border":   "#4a2080",
      "--quality-checkmate-label":    "#b07fff",

      "--quality-inaccuracy-bg":   "rgba(220, 180, 0,   0.15)",
      "--quality-inaccuracy-line": "#dcb400",
      "--quality-mistake-bg":      "rgba(220, 100, 0,   0.20)",
      "--quality-mistake-line":    "#e06400",
      "--quality-blunder-bg":      "rgba(200, 40,  40,  0.25)",
      "--quality-blunder-line":    "#c82828",

      "--quality-mistake-badge":     "#e08040",
      "--quality-blunder-badge":     "#e05050",
      "--quality-alternative-badge": "#80c080",
    },
    board: {
      lightSquare: "#f0d9b5",
      darkSquare:  "#b58863",
      premove:     "rgba(220, 50,  50,  0.65)",
      hint:        "rgba(100, 180, 255, 0.55)",
      selected:    "rgba(255, 255, 0,   0.40)",
      legalDest:   "rgba(0,   200, 0,   0.25)",
      dropTarget:  "rgba(100, 180, 255, 0.80)",
      arrow:       "rgba(100, 180, 255, 0.70)",
    },
  },

  // ── Serum ─────────────────────────────────────────────────────────────────
  serum: {
    label: "Serum",
    cssVars: {
      "--bg-page":          "#080808",
      "--bg-surface":       "#0f0f0f",
      "--bg-surface-deep":  "#050505",
      "--bg-raised":        "#161616",
      "--bg-raised-hover":  "#1e1e1e",
      "--bg-raised-active": "#242424",

      "--border-subtle":   "#161616",
      "--border-default":  "#1e2e1a",
      "--border-moderate": "#253820",
      "--border-muted":    "#2e4428",

      "--text-primary":   "#c8ffc0",
      "--text-secondary": "#9ee890",
      "--text-muted":     "#6ab860",
      "--text-dim":       "#488040",
      "--text-dimmer":    "#305c28",
      "--text-dimmest":   "#244020",

      "--accent":              "#39ff14",
      "--accent-hover":        "#7fff50",
      "--accent-bg":           "#0a1e07",
      "--accent-button":       "#166b10",
      "--accent-button-hover": "#1e8a16",
      "--accent-text":         "#39ff14",

      "--quality-correct-border":     "#1a4d0a",
      "--quality-correct-label":      "#39ff14",
      "--quality-alternative-border": "#1a3d4a",
      "--quality-alternative-label":  "#40c8ff",
      "--quality-mistake-border":     "#4a3000",
      "--quality-mistake-label":      "#ffaa20",
      "--quality-blunder-border":     "#4a0a0a",
      "--quality-blunder-label":      "#ff3030",
      "--quality-draw-border":        "#2e4428",
      "--quality-draw-label":         "#6ab860",
      "--quality-checkmate-border":   "#2a0a4a",
      "--quality-checkmate-label":    "#b050ff",

      "--quality-inaccuracy-bg":   "rgba(200, 160, 0,   0.20)",
      "--quality-inaccuracy-line": "#c8a000",
      "--quality-mistake-bg":      "rgba(200, 80,  0,   0.25)",
      "--quality-mistake-line":    "#c86000",
      "--quality-blunder-bg":      "rgba(180, 20,  20,  0.30)",
      "--quality-blunder-line":    "#b41414",

      "--quality-mistake-badge":     "#ffaa20",
      "--quality-blunder-badge":     "#ff3030",
      "--quality-alternative-badge": "#39ff14",
    },
    board: {
      lightSquare: "#a0d040",
      darkSquare:  "#282828",
      premove:     "rgba(57,  255, 20,  0.65)",
      hint:        "rgba(57,  255, 20,  0.50)",
      selected:    "rgba(57,  255, 20,  0.40)",
      legalDest:   "rgba(57,  255, 20,  0.22)",
      dropTarget:  "rgba(57,  255, 20,  0.80)",
      arrow:       "rgba(57,  255, 20,  0.70)",
    },
  },

  // ── Bubblegum ─────────────────────────────────────────────────────────────
  bubblegum: {
    label: "Bubblegum",
    cssVars: {
      "--bg-page":          "#fef0f5",
      "--bg-surface":       "#fff5f8",
      "--bg-surface-deep":  "#fff0f4",
      "--bg-raised":        "#ffe4ef",
      "--bg-raised-hover":  "#ffd6e7",
      "--bg-raised-active": "#ffc8de",

      "--border-subtle":   "#f8d0e0",
      "--border-default":  "#f0b0cc",
      "--border-moderate": "#e890b0",
      "--border-muted":    "#d86898",

      "--text-primary":   "#2d0818",
      "--text-secondary": "#5a1a38",
      "--text-muted":     "#8a3060",
      "--text-dim":       "#b05080",
      "--text-dimmer":    "#c878a0",
      "--text-dimmest":   "#d898b8",

      "--accent":              "#d42070",
      "--accent-hover":        "#e84090",
      "--accent-bg":           "#ffe0ec",
      "--accent-button":       "#c01860",
      "--accent-button-hover": "#d82878",
      "--accent-text":         "#d42070",

      "--quality-correct-border":     "#40a050",
      "--quality-correct-label":      "#28863a",
      "--quality-alternative-border": "#4070c0",
      "--quality-alternative-label":  "#305aa0",
      "--quality-mistake-border":     "#c08000",
      "--quality-mistake-label":      "#9c6400",
      "--quality-blunder-border":     "#c02020",
      "--quality-blunder-label":      "#9a1010",
      "--quality-draw-border":        "#d898b8",
      "--quality-draw-label":         "#8a3060",
      "--quality-checkmate-border":   "#6020a0",
      "--quality-checkmate-label":    "#501880",

      "--quality-inaccuracy-bg":   "rgba(160, 120, 0,   0.15)",
      "--quality-inaccuracy-line": "#a07800",
      "--quality-mistake-bg":      "rgba(160, 60,  0,   0.15)",
      "--quality-mistake-line":    "#a04000",
      "--quality-blunder-bg":      "rgba(160, 20,  20,  0.15)",
      "--quality-blunder-line":    "#a01414",

      "--quality-mistake-badge":     "#9c6400",
      "--quality-blunder-badge":     "#9a1010",
      "--quality-alternative-badge": "#28863a",
    },
    board: {
      lightSquare: "#ffd6e8",
      darkSquare:  "#e890b8",
      premove:     "rgba(212, 32,  112, 0.60)",
      hint:        "rgba(100, 50,  200, 0.50)",
      selected:    "rgba(212, 32,  112, 0.30)",
      legalDest:   "rgba(100, 180, 80,  0.30)",
      dropTarget:  "rgba(212, 32,  112, 0.70)",
      arrow:       "rgba(212, 32,  112, 0.70)",
    },
  },

  // ── Leather ───────────────────────────────────────────────────────────────
  leather: {
    label: "Leather",
    cssVars: {
      "--bg-page":          "#160e06",
      "--bg-surface":       "#1e1408",
      "--bg-surface-deep":  "#100a04",
      "--bg-raised":        "#2a1c0c",
      "--bg-raised-hover":  "#342210",
      "--bg-raised-active": "#3e2a14",

      "--border-subtle":   "#2a1c0c",
      "--border-default":  "#3e2a14",
      "--border-moderate": "#56361c",
      "--border-muted":    "#6e4424",

      "--text-primary":   "#f5e6c8",
      "--text-secondary": "#d8c4a0",
      "--text-muted":     "#b89c70",
      "--text-dim":       "#8a7448",
      "--text-dimmer":    "#6a5430",
      "--text-dimmest":   "#504020",

      "--accent":              "#d4a030",
      "--accent-hover":        "#e8c060",
      "--accent-bg":           "#2a1a04",
      "--accent-button":       "#6e4818",
      "--accent-button-hover": "#8a5c20",
      "--accent-text":         "#d4a030",

      "--quality-correct-border":     "#2e6820",
      "--quality-correct-label":      "#68c050",
      "--quality-alternative-border": "#284a6a",
      "--quality-alternative-label":  "#60a0d0",
      "--quality-mistake-border":     "#7a5000",
      "--quality-mistake-label":      "#d4a030",
      "--quality-blunder-border":     "#6a1818",
      "--quality-blunder-label":      "#cc4040",
      "--quality-draw-border":        "#6e4424",
      "--quality-draw-label":         "#b89c70",
      "--quality-checkmate-border":   "#3a1870",
      "--quality-checkmate-label":    "#9060d0",

      "--quality-inaccuracy-bg":   "rgba(180, 140, 0,   0.20)",
      "--quality-inaccuracy-line": "#b48c00",
      "--quality-mistake-bg":      "rgba(180, 80,  0,   0.25)",
      "--quality-mistake-line":    "#b45000",
      "--quality-blunder-bg":      "rgba(160, 30,  30,  0.25)",
      "--quality-blunder-line":    "#a01e1e",

      "--quality-mistake-badge":     "#d4a030",
      "--quality-blunder-badge":     "#cc4040",
      "--quality-alternative-badge": "#68c050",
    },
    board: {
      lightSquare: "#d4b896",
      darkSquare:  "#7c4e2a",
      premove:     "rgba(212, 160, 48,  0.70)",
      hint:        "rgba(212, 160, 48,  0.55)",
      selected:    "rgba(212, 160, 48,  0.40)",
      legalDest:   "rgba(80,  160, 80,  0.30)",
      dropTarget:  "rgba(212, 160, 48,  0.80)",
      arrow:       "rgba(212, 160, 48,  0.70)",
    },
  },
};

export const PIECE_SETS: Record<PieceSetId, { label: string }> = {
  default: { label: "Default" },
};

export const SOUND_THEMES: Record<SoundThemeId, { label: string }> = {
  default: { label: "Default" },
};
