/**
 * Skin tokens for the shelf base. Appearance only: no layout rules, no state.
 * Colors drawn by Pixi are numbers (0xRRGGBB); colors drawn by canvas/CSS are strings.
 * DOM surfaces (foreground book, reader, labels) are themed with CSS custom properties,
 * see `surfaceVars` and the `--bsl-*` variables in the base stylesheets.
 */
export interface ShelfSkin {
  /** Top face of the plank (the thin band you look down on). */
  top: number;
  /** Front face of the plank. */
  front: number;
  /** 1px highlight where top meets front. */
  highlight: number;
  /** 1px bottom edge of the front face. */
  edge: number;
  /** Optional fine grain lines on the front face; alpha 0 disables them. */
  grain: number;
  grainAlpha: number;
  /** Soft contact shadow below the plank. */
  shadow: number;
  shadowAlpha: number;
  /** Height of the front face in px. */
  thickness: number;
  /** Visible depth of the top face (seen from slightly above) in px. */
  depth: number;
  /** Back panel behind each row; alpha 0 = open shelf. */
  wall: number;
  wallAlpha: number;
  /** Side uprights framing each row. */
  posts: boolean;
  /** Horizontal inset of the plank from the container edge in px. */
  inset: number;
}
export interface SpineSkin {
  /** Font stack for vertical CJK titles. */
  fontCJK: string;
  /** Font stack for rotated Latin titles. */
  fontLatin: string;
  /** Ink used on light / dark book colors. */
  inkOnLight: string;
  inkOnDark: string;
  /** Thin head/tail bands (foil lines). */
  bands: boolean;
  bandColor: string;
  /** Deterministic cloth fibre texture. */
  texture: boolean;
  /** Small mark printed near the tail (publisher / series). null = none. */
  mark: string | null;
  /** Head of the book seen from above: page block between the boards. */
  headColor: string | null;
  /** Soft shadow cast to the right onto the back panel, and contact shadow at the base. */
  shadows: boolean;
}
export interface SurfaceSkin {
  /** Wash behind a book held in the foreground. */
  veil: string;
  paper: string;
  paperEdge: string;
  ink: string;
  muted: string;
  accent: string;
  serif: string;
  sans: string;
}
export interface BookshelfTheme {
  shelf: ShelfSkin;
  spine: SpineSkin;
  surface: SurfaceSkin;
  /** Outline of the slot a dragged book will drop into. */
  dropTarget: number;
}
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K];
};
export type ThemeOverrides = DeepPartial<BookshelfTheme>;

/** Repository master: warm white, soft charcoal, no material, no branding. */
export const neutralTheme: BookshelfTheme = {
  shelf: {
    top: 0xeae6df,
    front: 0xdcd7ce,
    highlight: 0xf6f4f0,
    edge: 0xc2bcb2,
    grain: 0x000000,
    grainAlpha: 0,
    shadow: 0x3a3936,
    shadowAlpha: 1,
    thickness: 10,
    depth: 9,
    wall: 0xe7e3dc,
    wallAlpha: 1,
    posts: true,
    inset: 4,
  },
  spine: {
    fontCJK: '"Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", serif',
    fontLatin: 'Georgia, "Times New Roman", serif',
    inkOnLight: "#3f3f3c",
    inkOnDark: "#f4f2ee",
    bands: true,
    bandColor: "#ffffff4d",
    texture: true,
    mark: null,
    headColor: "#f3efe6",
    shadows: true,
  },
  surface: {
    veil: "rgba(244, 242, 238, 0.86)",
    paper: "#fbfaf7",
    paperEdge: "#dedad2",
    ink: "#3f3f3c",
    muted: "#8a8781",
    accent: "#5b5b5b",
    serif: '"Songti SC", "Noto Serif CJK SC", Georgia, serif',
    sans: 'system-ui, -apple-system, "PingFang SC", "Segoe UI", sans-serif',
  },
  dropTarget: 0x5b5b5b,
};

export function defineTheme(
  overrides: ThemeOverrides = {},
  base: BookshelfTheme = neutralTheme,
): BookshelfTheme {
  return {
    shelf: { ...base.shelf, ...overrides.shelf },
    spine: { ...base.spine, ...overrides.spine },
    surface: { ...base.surface, ...overrides.surface },
    dropTarget: overrides.dropTarget ?? base.dropTarget,
  };
}

/** CSS custom properties for DOM surfaces; apply to an element or :root. */
export function surfaceVars(surface: Partial<SurfaceSkin>) {
  const map: Record<keyof SurfaceSkin, string> = {
    veil: "--bsl-veil",
    paper: "--bsl-paper",
    paperEdge: "--bsl-paper-edge",
    ink: "--bsl-ink",
    muted: "--bsl-muted",
    accent: "--bsl-accent",
    serif: "--bsl-serif",
    sans: "--bsl-sans",
  };
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(surface))
    if (v) vars[map[k as keyof SurfaceSkin]] = v;
  return vars;
}
export function applySurface(el: HTMLElement, surface: Partial<SurfaceSkin>) {
  for (const [k, v] of Object.entries(surfaceVars(surface)))
    el.style.setProperty(k, v);
}

/** Relative luminance check shared by spine, cover and host UI. */
export function isLightColor(color: string) {
  const hex = color.replace("#", "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex.slice(0, 6);
  const rgb = parseInt(full, 16);
  if (!Number.isFinite(rgb)) return true;
  return (
    (rgb >> 16) * 0.299 + ((rgb >> 8) & 255) * 0.587 + (rgb & 255) * 0.114 > 145
  );
}
export function inkFor(color: string, light: string, dark: string) {
  return isLightColor(color) ? light : dark;
}
