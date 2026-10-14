/** Shared geometry: the foreground paper and the reader content align exactly. */
export function readingGeometry(width = innerWidth, height = innerHeight) {
  const mobile = width < 600;
  const pageWidth = mobile
    ? Math.max(180, width - 56)
    : Math.min(440, (width - 88) / 2);
  const pageHeight = Math.max(190, Math.min(660, height - 152));
  const leftRatio = mobile ? 18 / pageWidth : 1;
  const hinge =
    (width - pageWidth * (1 + leftRatio)) / 2 + pageWidth * leftRatio;
  return {
    pageWidth,
    pageHeight,
    leftRatio,
    hinge,
    top: Math.max(65, (height - pageHeight) / 2),
  };
}
