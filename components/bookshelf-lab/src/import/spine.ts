/** Book proportions and colours for books that arrive without any artwork. */
export const spinePalette = [
  "#b4a9b4",
  "#d2d0be",
  "#684447",
  "#9fac8c",
  "#b58e94",
  "#969f70",
  "#709a9b",
  "#c8b676",
  "#d5b287",
  "#8e9d91",
  "#a77462",
  "#8f9ca5",
  "#c3b49b",
  "#667476",
  "#b5a17b",
  "#8b655e",
  "#8c9ea8",
  "#a4b8b1",
  "#657a68",
  "#9a8fb0",
  "#b97f6a",
  "#7f8a6a",
];
function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export interface SpineSpec {
  width: number;
  height: number;
  color: string;
}
/**
 * Thickness follows length on a log scale (a 1k-character note is a pamphlet,
 * 500k characters is a brick); height and colour are stable per title.
 * Empty books get a mid-range thickness.
 */
export function generateSpine(
  title: string,
  length: number,
  options: {
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
  } = {},
): SpineSpec {
  const {
    minWidth = 20,
    maxWidth = 48,
    minHeight = 198,
    maxHeight = 246,
  } = options;
  const h = hash(title || "untitled");
  const t =
    length > 0
      ? Math.min(1, Math.max(0, (Math.log10(Math.max(length, 1000)) - 3) / 2.7))
      : 0.35;
  const width = Math.round(minWidth + (maxWidth - minWidth) * t);
  const height = Math.round(
    minHeight + (((h >>> 8) % 1000) / 1000) * (maxHeight - minHeight),
  );
  return { width, height, color: spinePalette[h % spinePalette.length] };
}
