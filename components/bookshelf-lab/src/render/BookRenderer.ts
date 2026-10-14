import { Container, Graphics, Sprite, Texture } from "pixi.js";
import type { Book } from "../core/Book";
import { neutralTheme, isLightColor, type SpineSkin } from "../theme/Theme";
/** Paints one spine. Pure function of book + skin; no external assets. */
export function paintSpine(
  book: Pick<Book, "id" | "title" | "color" | "width" | "height">,
  skin: SpineSkin,
) {
  const { width: w, height: h, color, title } = book;
  const d = 3;
  const canvas = document.createElement("canvas");
  canvas.width = w * d;
  canvas.height = h * d;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(d, d);
  const gradient = ctx.createLinearGradient(0, 0, w, 0);
  gradient.addColorStop(0, "#000000");
  gradient.addColorStop(0.035, color);
  gradient.addColorStop(0.14, color);
  gradient.addColorStop(1, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  const shade = ctx.createLinearGradient(0, 0, w, 0);
  shade.addColorStop(0, "#0007");
  shade.addColorStop(0.07, "#fff3");
  shade.addColorStop(0.2, "#fff0");
  shade.addColorStop(0.75, "#0000");
  shade.addColorStop(1, "#0005");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
  // Deterministic woven fibers; no external assets or random re-render flicker.
  if (skin.texture) {
    let seed = book.id.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
    for (let i = 0; i < (w * h) / 5; i++) {
      seed = (seed * 16807) % 2147483647;
      const x = seed % w;
      seed = (seed * 16807) % 2147483647;
      ctx.fillStyle = i % 2 ? "#ffffff0a" : "#0000000c";
      ctx.fillRect(x, seed % h, 0.35, 1.8);
    }
  }
  if (skin.bands) {
    ctx.strokeStyle = skin.bandColor;
    ctx.lineWidth = 0.65;
    for (const y of [6, 9, h - 13, h - 10]) {
      ctx.beginPath();
      ctx.moveTo(4, y);
      ctx.lineTo(w - 4, y);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = "#00000022";
  ctx.beginPath();
  ctx.moveTo(w - 4, 12);
  ctx.lineTo(w - 4, h - 16);
  ctx.stroke();
  ctx.fillStyle = isLightColor(color) ? skin.inkOnLight : skin.inkOnDark;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (/[\u3400-\u9fff]/.test(title)) {
    const size = Math.min(w * 0.5, 15, (h - 46) / title.length - 1.5);
    ctx.font = `500 ${size}px ${skin.fontCJK}`;
    [...title].forEach((char, i) =>
      ctx.fillText(char, w / 2, 25 + i * (size + 2)),
    );
  } else {
    ctx.save();
    ctx.translate(w / 2, h / 2 - 3);
    ctx.rotate(Math.PI / 2);
    ctx.font = `500 ${Math.min(12, w * 0.42)}px ${skin.fontLatin}`;
    ctx.fillText(title, 0, 0, h - 42);
    ctx.restore();
  }
  if (skin.mark) {
    ctx.font = `6px ${skin.fontLatin}`;
    ctx.fillText(skin.mark, w / 2, h - 21, w - 6);
  }
  return canvas;
}
/** A procedural spine texture is created once per book (and per skin), never on animation frames. */
export class BookRenderer extends Container {
  texture: Texture;
  private canvas: HTMLCanvasElement;
  private sprite: Sprite;
  private decor = new Graphics();
  private image?: string;
  constructor(
    public book: Book,
    skin: SpineSkin = neutralTheme.spine,
  ) {
    super();
    const { width: w, height: h } = book;
    this.canvas = paintSpine(book, skin);
    this.texture = Texture.from(this.canvas);
    this.sprite = new Sprite(this.texture);
    this.sprite.width = w;
    this.sprite.height = h;
    this.sprite.position.set(-w / 2, -h);
    this.addChild(this.decor, this.sprite);
    this.paintDecor(skin);
    this.skin = skin;
    this.signature = BookRenderer.signature(book);
    this.label = book.id;
  }
  /** Volume cues drawn behind/around the spine: cast shadow, contact shadow and the head seen from above. */
  private paintDecor(skin: SpineSkin) {
    const { width: w, height: h, color } = this.book;
    const g = this.decor.clear();
    if (skin.shadows) {
      for (let i = 0; i < 9; i++)
        g.rect(w / 2 + i, -h * 0.96 + i * 2, 1, h * 0.96 - i * 2).fill({
          color: 0x000000,
          alpha: 0.075 * (1 - i / 9),
        });
      g.rect(-w / 2 - 1, -2, w + 3, 2).fill({ color: 0x000000, alpha: 0.16 });
    }
    if (skin.headColor) {
      const board = parseInt(color.slice(1), 16);
      g.poly([
        -w / 2,
        -h,
        w / 2,
        -h,
        w / 2 - 1,
        -h - 3.5,
        -w / 2 + 1,
        -h - 3.5,
      ]).fill(board);
      g.rect(-w / 2 + 2, -h - 3, w - 4, 3).fill(skin.headColor);
      g.rect(-w / 2 + 2, -h - 3, w - 4, 3).fill({
        color: 0x000000,
        alpha: 0.04,
      });
    }
  }
  /** Cheap identity of everything the spine painting depends on. */
  static signature(b: Book) {
    return [b.title, b.color, b.width, b.height].join("|");
  }
  signature = "";
  private skin: SpineSkin = neutralTheme.spine;
  /** Swap in edited metadata (title, colour, size) and repaint in place. */
  setBook(book: Book) {
    this.book = book;
    this.restyle(this.skin);
  }
  /** Repaint for a new skin in place; position, tweens and z-order are untouched. */
  restyle(skin: SpineSkin) {
    this.skin = skin;
    this.signature = BookRenderer.signature(this.book);
    const old = this.texture;
    this.canvas = paintSpine(this.book, skin);
    this.texture = Texture.from(this.canvas);
    this.sprite.texture = this.texture;
    this.sprite.width = this.book.width;
    this.sprite.height = this.book.height;
    this.paintDecor(skin);
    this.image = undefined;
    old.destroy(true);
  }
  /** Encoded lazily: only the book taken into the foreground needs a data URL. */
  get spineImage() {
    return (this.image ??= this.canvas.toDataURL());
  }
  dispose() {
    this.destroy({ children: true });
    this.texture.destroy(true);
  }
}
