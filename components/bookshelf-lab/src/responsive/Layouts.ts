export type LayoutMode = "desktop" | "tablet" | "mobile";
export interface LayoutConfig {
  mode: LayoutMode;
  width: number;
  padding: number;
  gap: number;
  rowHeight: number;
  bookScale: number;
  pull: number;
  duration: number;
  selectedScale: number;
  /** Distance from the plank top to the bottom of its row (room for the plank and its label). */
  baseline: number;
  /** Minimum free space kept above the tallest book in a row. */
  headroom: number;
  /** Distance from the plank top to the shelf label. */
  labelOffset: number;
  /**
   * How books lean. "auto": every book stands upright except the last one in a row with
   * free space after it, which leans back onto its neighbour (3–7°, stable per book).
   * "manual": use each Book.rotation. "none": all upright.
   */
  lean: "auto" | "manual" | "none";
}
export interface LayoutOptions {
  /** Which width picks the mode. "container" suits embedded scenes; "viewport" matches page-level breakpoints. */
  basis?: "viewport" | "container";
  breakpoints?: { mobile: number; tablet: number };
  /** Per-mode tuning, applied after the defaults. */
  overrides?:
    | Partial<Omit<LayoutConfig, "mode" | "width">>
    | ((config: LayoutConfig) => Partial<Omit<LayoutConfig, "mode" | "width">>);
}
export const defaultBreakpoints = { mobile: 600, tablet: 1000 };
export function responsiveLayout(
  width: number,
  viewport: number = width,
  options: LayoutOptions = {},
): LayoutConfig {
  const bp = options.breakpoints ?? defaultBreakpoints;
  const basisWidth = options.basis === "container" ? width : viewport;
  const mode: LayoutMode =
    basisWidth < bp.mobile
      ? "mobile"
      : basisWidth < bp.tablet
        ? "tablet"
        : "desktop";
  const config: LayoutConfig = {
    mode,
    width,
    padding: mode === "mobile" ? 16 : 28,
    gap: 1.25,
    rowHeight: mode === "mobile" ? 262 : 312,
    bookScale: mode === "mobile" ? 0.8 : 1,
    pull: mode === "mobile" ? 22 : 34,
    duration: mode === "mobile" ? 0.32 : 0.46,
    selectedScale: mode === "mobile" ? 1.045 : 1.07,
    baseline: 46,
    headroom: 44,
    labelOffset: 27,
    lean: "auto",
  };
  const extra =
    typeof options.overrides === "function"
      ? options.overrides(config)
      : options.overrides;
  return { ...config, ...extra, mode, width };
}
