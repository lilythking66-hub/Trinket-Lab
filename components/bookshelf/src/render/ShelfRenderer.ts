import { Container, Graphics } from "pixi.js";
import type { Layout } from "../core/LayoutEngine";
import type { LayoutConfig } from "../responsive/Layouts";
import type { ShelfSkin } from "../theme/Theme";
/**
 * Draws the case: back panel per row, side posts, and planks seen from slightly above
 * (a visible top face plus a front edge). Shelf labels are DOM (see BookshelfView).
 */
export class ShelfRenderer extends Container {
  draw(layout: Layout, width: number, skin: ShelfSkin, config: LayoutConfig) {
    this.removeChildren().forEach((c) => c.destroy());
    const g = new Graphics();
    const { inset, thickness: t, depth: d } = skin;
    const post = skin.posts ? Math.min(9, Math.max(6, config.padding - 6)) : 0;
    const left = inset + post;
    const right = width - inset - post;
    const rows = layout.rows;
    if (!rows.length) {
      this.addChild(g);
      return;
    }
    const caseTop = skin.posts
      ? 0
      : rows[0].y - (config.rowHeight - config.baseline);
    const topBoard = skin.posts ? t : 0;
    const bottom = rows[rows.length - 1].y + d + t;

    // Back panel, cubby by cubby, with the shade cast by the board above and ambient occlusion at the plank.
    if (skin.wallAlpha > 0)
      rows.forEach((row, i) => {
        const top = i === 0 ? caseTop + topBoard : rows[i - 1].y + d + t;
        const h = row.y - top;
        g.rect(left, top, right - left, h).fill({
          color: skin.wall,
          alpha: skin.wallAlpha,
        });
        for (let k = 0; k < 18; k++)
          g.rect(left, top + k * 2, right - left, 2).fill({
            color: skin.shadow,
            alpha: 0.075 * (1 - k / 18) * skin.shadowAlpha,
          });
        for (let k = 0; k < 10; k++)
          g.rect(left, row.y - (k + 1) * 2, right - left, 2).fill({
            color: skin.shadow,
            alpha: 0.04 * (1 - k / 10) * skin.shadowAlpha,
          });
        if (skin.posts) {
          for (let k = 0; k < 6; k++) {
            const a = 0.05 * (1 - k / 6) * skin.shadowAlpha;
            g.rect(left + k * 2, top, 2, h).fill({
              color: skin.shadow,
              alpha: a,
            });
            g.rect(right - (k + 1) * 2, top, 2, h).fill({
              color: skin.shadow,
              alpha: a,
            });
          }
        }
      });

    // Planks: top face recedes towards the back panel, front edge faces the viewer.
    const plank = (y: number, x0: number, x1: number) => {
      g.poly([x0 + 4, y, x1 - 4, y, x1, y + d, x0, y + d]).fill(skin.top);
      g.rect(x0 + 4, y, x1 - x0 - 8, 1).fill({
        color: skin.shadow,
        alpha: 0.1 * skin.shadowAlpha,
      });
      g.rect(x0, y + d, x1 - x0, t).fill(skin.front);
      g.rect(x0, y + d, x1 - x0, 1).fill(skin.highlight);
      g.rect(x0, y + d + t - 1, x1 - x0, 1).fill(skin.edge);
      if (skin.grainAlpha > 0)
        for (let j = 0; j < Math.min(4, t - 3); j++)
          g.rect(x0 + 6, y + d + 2 + j * 1.6, x1 - x0 - 12, 0.3).fill({
            color: skin.grain,
            alpha: skin.grainAlpha,
          });
    };
    for (const row of rows) plank(row.y, left, right);

    if (skin.posts) {
      // Top board and side posts frame the case.
      g.rect(inset, caseTop, width - inset * 2, topBoard).fill(skin.front);
      g.rect(inset, caseTop, width - inset * 2, 1).fill(skin.highlight);
      g.rect(inset, caseTop + topBoard - 1, width - inset * 2, 1).fill(
        skin.edge,
      );
      for (const x of [inset, right]) {
        g.rect(x, caseTop, post, bottom - caseTop).fill(skin.front);
        g.rect(x, caseTop, 1, bottom - caseTop).fill(skin.highlight);
        g.rect(x + post - 1, caseTop, 1, bottom - caseTop).fill(skin.edge);
      }
    }
    // Soft shadow under the whole case / each open plank.
    if (skin.shadowAlpha > 0) {
      const under = skin.posts ? [bottom] : rows.map((r) => r.y + d + t);
      for (const y of under)
        for (let i = 10; i > 0; i--)
          g.rect(inset + 4, y + 1, width - (inset + 4) * 2, i * 1.5).fill({
            color: skin.shadow,
            alpha: 0.008 * (11 - i) * skin.shadowAlpha,
          });
    }
    this.addChild(g);
  }
}
