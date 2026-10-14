/**
 * Cover artwork helpers (browser): the cover's aspect ratio, and a spine colour taken from
 * the artwork so the spine on the shelf belongs to the cover you see when it is pulled out.
 */
export interface CoverInfo {
  aspect: number;
  color: string;
}
export async function coverInfo(blob: Blob): Promise<CoverInfo | undefined> {
  try {
    const bmp = await createImageBitmap(blob);
    const aspect = bmp.width / bmp.height;
    const n = 12;
    const canvas = document.createElement("canvas");
    canvas.width = n;
    canvas.height = n;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    // Sample the left third: that is the edge that wraps round to the spine.
    ctx.drawImage(bmp, 0, 0, bmp.width / 3, bmp.height, 0, 0, n, n);
    bmp.close();
    const px = ctx.getImageData(0, 0, n, n).data;
    let r = 0,
      g = 0,
      b = 0,
      count = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue;
      r += px[i];
      g += px[i + 1];
      b += px[i + 2];
      count++;
    }
    if (!count) return { aspect, color: "#9a9a96" };
    // Average, then soften: spines read better slightly muted.
    const mute = (v: number) => Math.round(v / count) * 0.85 + 128 * 0.15;
    const hex = [mute(r), mute(g), mute(b)]
      .map((v) => Math.round(v).toString(16).padStart(2, "0"))
      .join("");
    return { aspect, color: `#${hex}` };
  } catch {
    return undefined;
  }
}
