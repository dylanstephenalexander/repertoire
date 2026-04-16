import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  THEMES,
  type ThemeDef,
  type ThemeId,
  type PieceSetId,
  type SoundThemeId,
} from "../themes";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserSettings {
  uiTheme:        ThemeId;
  boardStyle:     ThemeId;
  pieceSet:       PieceSetId;
  soundTheme:     SoundThemeId;
  evalBarVisible: boolean;
  notationMode:   "algebraic" | "readable" | "both";
}

// ─── Persistence ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "repertoire:settings";

const DEFAULTS: UserSettings = {
  uiTheme:        "obsidian",
  boardStyle:     "obsidian",
  pieceSet:       "default",
  soundTheme:     "default",
  evalBarVisible: true,
  notationMode:   "readable",
};

const VALID_THEME_IDS = new Set<string>(Object.keys(THEMES));
const VALID_NOTATION  = new Set(["algebraic", "readable", "both"]);

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

// ─── Theme application ────────────────────────────────────────────────────────
// Writes CSS variables directly to :root. Only called from SettingsProvider —
// never exported, so no component can create a second competing writer.

function applyTheme(theme: ThemeDef) {
  const root = document.documentElement;
  for (const [prop, value] of Object.entries(theme.cssVars)) {
    root.style.setProperty(prop, value);
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface SettingsCtxValue {
  settings:   UserSettings;
  update:     <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
  boardStyle: typeof THEMES[ThemeId]["board"];
}

const SettingsContext = createContext<SettingsCtxValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
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

  return (
    <SettingsContext.Provider value={{ settings, update, boardStyle }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettingsContext(): SettingsCtxValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettingsContext must be used inside <SettingsProvider>");
  return ctx;
}
