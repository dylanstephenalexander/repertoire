import { useCallback, useEffect, useState } from "react";
import {
  THEMES,
  type ThemeDef,
  type ThemeId,
  type PieceSetId,
  type SoundThemeId,
} from "../themes";

/**
 * All user-configurable settings.
 *
 * Shape maps 1:1 to a future `user_configs` DB table:
 *   ui_theme, board_style, piece_set, sound_theme, eval_bar_visible, notation_mode
 *
 * Persisted in localStorage under "repertoire:settings" until a backend exists.
 */
export interface UserSettings {
  uiTheme:        ThemeId;
  boardStyle:     ThemeId;
  pieceSet:       PieceSetId;
  soundTheme:     SoundThemeId;
  evalBarVisible: boolean;
  notationMode:   "algebraic" | "readable" | "both";
}

const STORAGE_KEY = "repertoire:settings";

const DEFAULTS: UserSettings = {
  uiTheme:        "obsidian",
  boardStyle:     "obsidian",
  pieceSet:       "default",
  soundTheme:     "default",
  evalBarVisible: true,
  notationMode:   "readable",
};

const VALID_THEME_IDS    = new Set<string>(Object.keys(THEMES));
const VALID_NOTATION     = new Set(["algebraic", "readable", "both"]);

function validThemeId(v: unknown): v is ThemeId {
  return typeof v === "string" && VALID_THEME_IDS.has(v);
}

function load(): UserSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Record<string, unknown>;
    return {
      uiTheme:        validThemeId(p.uiTheme)        ? p.uiTheme        : DEFAULTS.uiTheme,
      boardStyle:     validThemeId(p.boardStyle)      ? p.boardStyle     : DEFAULTS.boardStyle,
      pieceSet:       p.pieceSet       === "default"  ? "default"        : DEFAULTS.pieceSet,
      soundTheme:     p.soundTheme     === "default"  ? "default"        : DEFAULTS.soundTheme,
      evalBarVisible: typeof p.evalBarVisible === "boolean" ? p.evalBarVisible : DEFAULTS.evalBarVisible,
      notationMode:   VALID_NOTATION.has(p.notationMode as string)
                        ? (p.notationMode as UserSettings["notationMode"])
                        : DEFAULTS.notationMode,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(s: UserSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch { /* ignore quota errors */ }
}

/** Write all CSS variables for the given theme directly to the root element. */
function applyTheme(theme: ThemeDef) {
  const root = document.documentElement;
  for (const [prop, value] of Object.entries(theme.cssVars)) {
    root.style.setProperty(prop, value);
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(() => {
    const s = load();
    applyTheme(THEMES[s.uiTheme]);
    return s;
  });

  useEffect(() => {
    applyTheme(THEMES[settings.uiTheme]);
  }, [settings.uiTheme]);

  const update = useCallback(<K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K],
  ) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      save(next);
      return next;
    });
  }, []);

  const boardStyle = THEMES[settings.boardStyle].board;

  return { settings, update, boardStyle };
}
