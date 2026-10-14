import { Application, Container, Graphics } from "pixi.js";
import { BookshelfEngine } from "../core/BookshelfEngine";
import { layoutBooks, insertionAt, type Layout } from "../core/LayoutEngine";
import {
  responsiveLayout,
  type LayoutConfig,
  type LayoutOptions,
} from "../responsive/Layouts";
import { neutralTheme, type BookshelfTheme } from "../theme/Theme";
import { defaultShelfLabels, type BookshelfLabels } from "../theme/Labels";
import "./bookshelf.css";
import { BookRenderer } from "./BookRenderer";
import { ShelfRenderer } from "./ShelfRenderer";
import { MotionController } from "./MotionController";
import { PointerController } from "../input/PointerController";
export interface BookshelfViewOptions {
  theme?: BookshelfTheme;
  labels?: Partial<BookshelfLabels>;
  layout?: LayoutOptions;
}
export class BookshelfView {
  private app = new Application();
  private held = new Set<string>();
  private views = new Map<string, BookRenderer>();
  private buttons = new Map<string, HTMLButtonElement>();
  private shelf = new ShelfRenderer();
  private booksLayer = new Container();
  private marker = new Graphics();
  private motion = new MotionController(() => this.scheduleRender());
  private input?: PointerController;
  private observer?: ResizeObserver;
  private unsubscribe?: () => void;
  private frame = 0;
  private resizeFrame = 0;
  private resizeKey = "";
  private config!: LayoutConfig;
  private layout!: Layout;
  private overlay = document.createElement("div");
  private labelLayer = document.createElement("div");
  private theme: BookshelfTheme;
  private labels: BookshelfLabels;
  private layoutOptions: LayoutOptions;
  private query = "";
  private readingOnly = false;
  private dragOffset = { x: 0, y: 0 };
  private lastPointer?: { x: number; y: number };
  private autoScrollFrame = 0;
  private alive = true;
  constructor(
    private root: HTMLElement,
    public engine: BookshelfEngine,
    options: BookshelfViewOptions = {},
  ) {
    this.theme = options.theme ?? neutralTheme;
    this.labels = { ...defaultShelfLabels, ...options.labels };
    this.layoutOptions = options.layout ?? {};
  }
  async init() {
    await this.app.init({
      width: Math.max(1, this.root.clientWidth),
      height: 700,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(devicePixelRatio, 2),
      autoDensity: true,
      autoStart: false,
      preference: "webgl",
    });
    this.root.classList.add("bookshelf-stage");
    this.root.setAttribute("role", "group");
    this.root.setAttribute("aria-label", this.labels.shelf);
    this.root.append(this.app.canvas);
    this.app.canvas.setAttribute("aria-hidden", "true");
    this.booksLayer.sortableChildren = true;
    this.app.stage.addChild(this.shelf, this.booksLayer, this.marker);
    this.labelLayer.className = "shelf-labels";
    this.labelLayer.setAttribute("aria-hidden", "true");
    this.overlay.className = "book-targets";
    this.root.append(this.labelLayer, this.overlay);
    this.syncBooks();
    this.relayout(true);
    this.input = new PointerController(this.overlay, {
      select: (id) => {
        if (
          this.engine.state.kind === "selected" &&
          this.engine.state.id === id
        )
          this.engine.close();
        else this.engine.select(id);
      },
      start: (id, x, y) => {
        const v = this.views.get(id)!;
        const point = this.local(x, y);
        this.dragOffset = { x: v.x - point.x, y: v.y - point.y - 12 };
        this.engine.beginDrag(id);
        this.motion.lift(v, this.layout.slots.get(id)!.scale);
        this.root.setAttribute("aria-label", this.labels.rearranging);
      },
      move: (id, x, y) => {
        this.lastPointer = { x, y };
        this.drag(id, x, y);
        if (!this.autoScrollFrame)
          this.autoScrollFrame = requestAnimationFrame(this.autoScroll);
      },
      end: (cancel) => {
        cancelAnimationFrame(this.autoScrollFrame);
        this.autoScrollFrame = 0;
        this.lastPointer = undefined;
        this.marker.clear();
        this.engine.endDrag(cancel);
        this.root.setAttribute("aria-label", this.labels.shelf);
      },
      hover: (id, active) => {
        if (this.engine.state.kind !== "idle") return;
        const s = this.layout.slots.get(id);
        if (s) this.motion.hover(this.views.get(id)!, s.y - (active ? 7 : 0));
      },
    });
    this.unsubscribe = this.engine.subscribe((change) => {
      if (change === "layout") {
        this.syncBooks();
        this.relayout();
      }
      if (change === "selection") this.updateSelection();
      if (change === "progress") {
        if (this.readingOnly) this.relayout();
        this.updateLabels();
      }
    });
    this.observer = new ResizeObserver(() => {
      const key = `${this.root.clientWidth}:${innerWidth}`;
      if (key === this.resizeKey) return;
      this.resizeKey = key;
      // ResizeObserver runs after layout and before paint: relayout here so the canvas
      // never paints a frame at the old width (it would overflow a narrowed page).
      this.input?.cancelActive();
      this.relayout();
    });
    this.observer.observe(this.root);
  }
  private syncBooks() {
    const ids = new Set(this.engine.books.map((b) => b.id));
    for (const [id, v] of this.views)
      if (!ids.has(id)) {
        this.motion.stop(v);
        v.dispose();
        this.views.delete(id);
        this.buttons.get(id)?.remove();
        this.buttons.delete(id);
      }
    for (const b of this.engine.books) {
      const existing = this.views.get(b.id);
      if (existing) {
        if (existing.signature !== BookRenderer.signature(b))
          existing.setBook(b);
        this.buttons.get(b.id)?.setAttribute("aria-label", this.labels.book(b));
        if (this.buttons.get(b.id)) this.buttons.get(b.id)!.title = b.title;
        continue;
      }
      {
        const view = new BookRenderer(b, this.theme.spine);
        this.views.set(b.id, view);
        this.booksLayer.addChild(view);
        const button = document.createElement("button");
        button.className = "book-target";
        button.dataset.book = b.id;
        button.setAttribute("aria-label", this.labels.book(b));
        button.setAttribute("aria-pressed", "false");
        button.title = b.title;
        this.buttons.set(b.id, button);
        this.overlay.append(button);
        button.addEventListener("keydown", (e) => {
          if (
            e.altKey &&
            ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
          ) {
            e.preventDefault();
            this.keyboardMove(b.id, e.key);
          }
        });
      }
    }
  }
  private keyboardMove(id: string, key: string) {
    const b = this.engine.book(id);
    const list = this.engine.books
      .filter((x) => x.shelfId === b.shelfId)
      .sort((a, b) => a.order - b.order);
    const i = list.findIndex((x) => x.id === id);
    this.engine.beginDrag(id);
    if (key === "ArrowLeft" && i > 0)
      this.engine.move(id, b.shelfId, list[i - 1].id);
    if (key === "ArrowRight" && i < list.length - 1)
      this.engine.move(id, b.shelfId, list[i + 2]?.id);
    if (key === "ArrowUp" || key === "ArrowDown") {
      const si =
        this.engine.shelves.findIndex((s) => s.id === b.shelfId) +
        (key === "ArrowUp" ? -1 : 1);
      if (this.engine.shelves[si])
        this.engine.move(id, this.engine.shelves[si].id);
    }
    this.engine.endDrag();
    this.buttons.get(id)?.focus();
  }
  private local(x: number, y: number) {
    const r = this.root.getBoundingClientRect();
    return { x: x - r.left, y: y - r.top };
  }
  private drag(id: string, x: number, y: number) {
    const p = this.local(x, y);
    const v = this.views.get(id)!;
    v.position.set(p.x + this.dragOffset.x, p.y + this.dragOffset.y);
    const target = insertionAt(this.layout, p.x, p.y, id);
    this.engine.move(id, target.shelfId, target.beforeId);
    const slot = this.layout.slots.get(id);
    if (slot) {
      this.marker
        .clear()
        .roundRect(
          slot.x - 3,
          slot.y - slot.height - 5,
          slot.width + 6,
          slot.height + 7,
          3,
        )
        .fill({ color: this.theme.dropTarget, alpha: 0.08 })
        .stroke({ color: this.theme.dropTarget, width: 1, alpha: 0.6 });
    }
    this.scheduleRender();
  }
  private autoScroll = () => {
    this.autoScrollFrame = 0;
    if (!this.lastPointer || this.engine.state.kind !== "dragging") return;
    const { x, y } = this.lastPointer;
    const speed = y < 80 ? -8 : y > innerHeight - 80 ? 8 : 0;
    if (speed) {
      window.scrollBy(0, speed);
      this.drag(this.engine.state.id, x, y);
    }
    this.autoScrollFrame = requestAnimationFrame(this.autoScroll);
  };
  setFilter(query: string, readingOnly = false) {
    this.input?.cancelActive();
    this.engine.close();
    this.query = query.trim().toLocaleLowerCase();
    this.readingOnly = readingOnly;
    this.relayout();
  }
  private relayout(immediate = false) {
    const width = this.root.clientWidth;
    this.config = responsiveLayout(width, innerWidth, this.layoutOptions);
    const books = this.engine.books.filter(
      (b) =>
        (!this.query ||
          `${b.title} ${b.author}`.toLocaleLowerCase().includes(this.query)) &&
        (!this.readingOnly || b.progress > 0),
    );
    this.layout = layoutBooks(books, this.engine.shelves, this.config);
    const previousHeight = this.root.style.height;
    this.root.style.height = `${this.layout.height}px`;
    if (
      this.app.screen.width !== width ||
      previousHeight !== this.root.style.height
    )
      this.app.renderer.resize(Math.max(1, width), this.layout.height);
    this.shelf.draw(this.layout, width, this.theme.shelf, this.config);
    this.drawLabels();
    for (const [id, view] of this.views) {
      const s = this.layout.slots.get(id);
      view.visible = !!s && !this.held.has(id);
      const button = this.buttons.get(id)!;
      button.hidden = !s;
      if (!s) continue;
      if (
        !this.held.has(id) &&
        !(this.engine.state.kind === "dragging" && this.engine.state.id === id)
      )
        this.motion.place(view, s, this.config, false, immediate);
      Object.assign(button.style, {
        left: `${s.x - this.config.gap / 2}px`,
        top: `${s.y - s.height}px`,
        width: `${s.width + this.config.gap}px`,
        height: `${s.height}px`,
      });
    }
    // DOM order follows visual order for keyboard and screen-reader navigation.
    if (this.engine.state.kind !== "dragging")
      for (const b of books
        .slice()
        .sort(
          (a, b) =>
            this.engine.shelves.findIndex((s) => s.id === a.shelfId) -
              this.engine.shelves.findIndex((s) => s.id === b.shelfId) ||
            a.order - b.order,
        ))
        this.overlay.append(this.buttons.get(b.id)!);
    this.root.dataset.visible = String(books.length);
    this.scheduleRender();
  }
  private drawLabels() {
    const { labelOffset } = this.config;
    const nodes = this.layout.rows.map((row) => {
      const text = this.labels.shelfRow(row);
      const el = document.createElement("span");
      el.className = "shelf-label";
      el.dataset.row = String(row.index);
      el.dataset.shelf = row.shelfId;
      if (row.continuation) el.dataset.continuation = "";
      el.textContent = text;
      el.hidden = !text;
      el.style.top = `${row.y + labelOffset}px`;
      el.style.left = `${this.config.padding}px`;
      return el;
    });
    this.labelLayer.replaceChildren(...nodes);
  }
  private updateLabels() {
    for (const b of this.engine.books)
      this.buttons.get(b.id)?.setAttribute("aria-label", this.labels.book(b));
  }
  /** Swap the skin at runtime. Spine textures are repainted in place; order and state are kept. */
  setTheme(theme: BookshelfTheme) {
    this.input?.cancelActive();
    this.theme = theme;
    for (const v of this.views.values()) v.restyle(theme.spine);
    this.relayout(true);
  }
  /** Replace shelf copy at runtime (e.g. language switch). */
  setLabels(labels: Partial<BookshelfLabels>) {
    this.labels = { ...this.labels, ...labels };
    this.root.setAttribute("aria-label", this.labels.shelf);
    this.updateLabels();
    this.drawLabels();
  }
  private updateSelection() {
    for (const [id, v] of this.views) {
      const s = this.layout.slots.get(id);
      if (!s) continue;
      const selected =
        this.engine.state.kind === "selected" && this.engine.state.id === id;
      this.buttons.get(id)!.setAttribute("aria-pressed", String(selected));
      if (
        this.held.has(id) ||
        (this.engine.state.kind === "dragging" && this.engine.state.id === id)
      )
        continue;
      this.motion.place(v, s, this.config, false);
    }
    this.scheduleRender();
  }
  /** Transfer the exact visible spine to a viewport foreground, outside canvas bounds. */
  takeBook(id: string) {
    const v = this.views.get(id)!;
    this.motion.stop(v);
    const r = this.root.getBoundingClientRect();
    this.held.add(id);
    v.visible = false;
    this.app.render();
    return {
      x: r.left + v.x,
      y: r.top + v.y,
      scale: v.scale.x,
      rotation: v.angle,
      spineImage: v.spineImage,
    };
  }
  slotPose(id: string) {
    const s = this.layout.slots.get(id);
    if (!s) return undefined;
    const r = this.root.getBoundingClientRect();
    return {
      x: r.left + s.x + s.width / 2,
      y: r.top + s.y,
      scale: s.scale,
      rotation: s.rotation,
    };
  }
  restoreBook(id: string) {
    this.held.delete(id);
    const v = this.views.get(id),
      s = this.layout.slots.get(id);
    if (v && s) {
      this.motion.place(v, s, this.config, false, true);
      v.visible = true;
      this.app.render();
    }
    this.buttons.get(id)?.focus({ preventScroll: true });
  }
  private scheduleRender() {
    if (!this.frame && this.alive)
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        if (this.alive) this.app.render();
      });
  }
  destroy() {
    this.alive = false;
    this.input?.destroy();
    this.unsubscribe?.();
    this.observer?.disconnect();
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.resizeFrame);
    cancelAnimationFrame(this.autoScrollFrame);
    for (const v of this.views.values()) {
      this.motion.stop(v);
      v.dispose();
    }
    this.app.destroy(true, { children: true });
    this.overlay.remove();
    this.labelLayer.remove();
  }
}
