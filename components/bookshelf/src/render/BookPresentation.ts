import { gsap } from "gsap";
import type { Book } from "../core/Book";
import "./book-presentation.css";
import { readingGeometry } from "../responsive/ReaderLayout";
import { applySurface, inkFor, type SurfaceSkin } from "../theme/Theme";
import {
  defaultPresentationLabels,
  type PresentationLabels,
} from "../theme/Labels";

export interface BookFaces {
  /** The cover button. Title/author nodes are filled by the engine. */
  cover: HTMLElement;
  /** Inside of the front cover, visible on the left of an open spread. */
  endpaper: HTMLElement;
}
export interface PresentationOptions {
  labels?: Partial<PresentationLabels>;
  /** Optional surface overrides (CSS variables) for the foreground layer. */
  surface?: Partial<SurfaceSkin>;
  /** Called each time a book is taken; hosts may add ornaments, imagery or a publisher mark. */
  decorate?(faces: BookFaces, book: Book): void;
}

export interface BookPose {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}
export interface BookSceneBridge {
  takeBook(id: string): BookPose & { spineImage: string };
  slotPose(id: string): BookPose | undefined;
  restoreBook(id: string): void;
}
export type PresentationPhase =
  | "idle"
  | "pulling"
  | "turning"
  | "cover"
  | "opening"
  | "open"
  | "reading"
  | "closing"
  | "turning-back"
  | "returning";
interface Pose {
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  angle: number;
  turn: number;
  open: number;
  leftSpan: number;
  shade: number;
}
/** One book travels from its exact spine pose through cover and open spread, then back.
 * Uses flat DOM faces and GSAP; no page curl, physics, or WebGL 3D scene. */
export class BookPresentation {
  readonly element = document.createElement("div");
  private actor: HTMLElement;
  private spine: HTMLImageElement;
  private front: HTMLElement;
  private leaf: HTMLElement;
  private paper: HTMLElement;
  private veil: HTMLElement;
  private actions: HTMLElement;
  private openButton: HTMLButtonElement;
  private labels: PresentationLabels;
  private book?: Book;
  private timeline?: gsap.core.Timeline;
  private resolveMotion?: (finished: boolean) => void;
  private revision = 0;
  private closed: Promise<void> = Promise.resolve();
  private abort = new AbortController();
  private pose: Pose = {
    x: 0,
    y: 0,
    width: 100,
    height: 150,
    depth: 40,
    angle: 0,
    turn: 0,
    open: 0,
    leftSpan: 100,
    shade: 0,
  };
  phase: PresentationPhase = "idle";
  constructor(
    private scene: BookSceneBridge,
    private callbacks: {
      onOpen(book: Book): void;
      onReturn(): void;
      onPhase?(phase: PresentationPhase): void;
    },
    private options: PresentationOptions = {},
  ) {
    this.labels = { ...defaultPresentationLabels, ...options.labels };
    this.element.className = "book-foreground";
    this.element.hidden = true;
    if (options.surface) applySurface(this.element, options.surface);
    this.element.innerHTML = `<div class="foreground-veil"></div><div class="book-actor"><img class="foreground-spine" alt=""/><div class="foreground-front"><div class="foreground-paper"></div><div class="foreground-leaf"><button class="foreground-cover"><span class="cover-top"></span><strong class="cover-title"></strong><span class="cover-author"></span><span class="cover-invitation"></span></button><div class="foreground-endpaper"><span class="endpaper-top"></span><h2 class="endpaper-title"></h2><span class="endpaper-author"></span><span class="endpaper-bottom"></span></div></div></div></div><div class="foreground-actions"><span class="foreground-hint"></span><button class="foreground-return"></button></div>`;
    this.actor = this.element.querySelector(".book-actor")!;
    this.spine = this.element.querySelector(".foreground-spine")!;
    this.front = this.element.querySelector(".foreground-front")!;
    this.leaf = this.element.querySelector(".foreground-leaf")!;
    this.paper = this.element.querySelector(".foreground-paper")!;
    this.veil = this.element.querySelector(".foreground-veil")!;
    this.actions = this.element.querySelector(".foreground-actions")!;
    this.openButton = this.element.querySelector(".foreground-cover")!;
    this.applyLabels();
    document.body.append(this.element);
    const signal = this.abort.signal;
    this.openButton.addEventListener("click", () => void this.open(), {
      signal,
    });
    this.element
      .querySelector(".foreground-return")!
      .addEventListener("click", () => void this.close(), { signal });
    this.veil.addEventListener(
      "click",
      () => {
        if (this.phase === "cover") void this.close();
      },
      { signal },
    );
    window.addEventListener(
      "keydown",
      (e) => {
        if (
          e.key === "Escape" &&
          this.phase !== "idle" &&
          this.phase !== "reading"
        ) {
          e.preventDefault();
          void this.close();
        }
      },
      { signal },
    );
    window.addEventListener("resize", this.resize, { signal });
  }
  private applyLabels() {
    const hint = this.element.querySelector<HTMLElement>(".foreground-hint")!;
    hint.textContent = this.labels.actionHint;
    hint.hidden = !this.labels.actionHint;
    const invite =
      this.element.querySelector<HTMLElement>(".cover-invitation")!;
    invite.textContent = this.labels.coverHint;
    invite.hidden = !this.labels.coverHint;
    this.element.querySelector(".foreground-return")!.textContent =
      this.labels.returnToShelf;
    if (this.book)
      this.openButton.setAttribute(
        "aria-label",
        this.labels.openBook(this.book),
      );
  }
  /** Replace copy at runtime (e.g. language switch). */
  setLabels(labels: Partial<PresentationLabels>) {
    this.labels = { ...this.labels, ...labels };
    this.applyLabels();
  }
  setSurface(surface: Partial<SurfaceSkin>) {
    applySurface(this.element, surface);
  }
  /** Cover width / height: the artwork's own shape when there is one, else a classic 0.7. */
  private get aspect() {
    const a = this.book?.coverAspect;
    return a && Number.isFinite(a) ? Math.min(0.85, Math.max(0.55, a)) : 0.7;
  }
  private setPhase(phase: PresentationPhase) {
    this.phase = phase;
    this.element.dataset.phase = phase;
    document.body.dataset.bookPhase = phase;
    this.openButton.disabled = phase !== "cover";
    this.actions.style.opacity = phase === "cover" ? "1" : "0";
    this.actions.style.pointerEvents = phase === "cover" ? "auto" : "none";
    this.callbacks.onPhase?.(phase);
  }
  private preview() {
    const mobile = innerWidth < 600;
    const height = Math.min(
      mobile ? 248 : 310,
      innerHeight * (mobile ? 0.32 : 0.44),
    );
    return {
      x: innerWidth * (mobile ? 0.5 : 0.44),
      y: mobile
        ? (innerHeight - 190 + height) / 2
        : innerHeight * 0.48 + height / 2,
      width: height * this.aspect,
      height,
      // Keep the book's real spine/height ratio so the spine never thins or swells while turning.
      depth: this.book
        ? (height * this.book.width) / this.book.height
        : height * 0.09,
      angle: 0,
      turn: 1,
      open: 0,
      leftSpan: height * this.aspect,
    };
  }
  private render = () => {
    const p = this.pose;
    const theta = (p.turn * Math.PI) / 2;
    const sw = p.depth * Math.max(0, Math.cos(theta));
    const face = Math.max(0, Math.sin(theta));
    const total = sw + p.width * face;
    Object.assign(this.actor.style, {
      left: `${p.x}px`,
      top: `${p.y}px`,
      width: `${total}px`,
      height: `${p.height}px`,
      transform: `translate(-50%, -100%) rotate(${p.angle}deg)`,
    });
    Object.assign(this.spine.style, {
      width: `${p.depth}px`,
      height: `${p.height}px`,
      transform: `scaleX(${Math.max(0, Math.cos(theta))})`,
      opacity: p.turn > 0.998 ? "0" : "1",
    });
    Object.assign(this.front.style, {
      left: `${sw}px`,
      width: `${p.width}px`,
      height: `${p.height}px`,
      transform: `scaleX(${face})`,
    });
    this.leaf.style.transform = `rotateY(${-180 * p.open}deg) scaleX(${1 - (1 - p.leftSpan / p.width) * p.open})`;
    this.paper.style.opacity = String(Math.min(1, p.open * 8));
    this.front.style.setProperty("--book-font", `${p.width * 0.115}px`);
    this.front.style.setProperty(
      "--endpaper-content",
      String(Math.max(0, Math.min(1, (p.leftSpan / p.width - 0.2) / 0.4))),
    );
    this.front.style.setProperty(
      "--book-small",
      `${Math.max(5, p.width * 0.027)}px`,
    );
    this.veil.style.opacity = String(p.shade);
    Object.assign(this.actions.style, {
      left: `${p.x}px`,
      top: `${p.y + 28}px`,
    });
  };
  private cancelMotion() {
    this.timeline?.kill();
    this.timeline = undefined;
    this.resolveMotion?.(false);
    this.resolveMotion = undefined;
  }
  private play(build: (tl: gsap.core.Timeline) => void): Promise<boolean> {
    this.cancelMotion();
    return new Promise((resolve) => {
      this.resolveMotion = resolve;
      const tl = gsap.timeline({
        paused: true,
        onUpdate: this.render,
        onComplete: () => {
          this.resolveMotion = undefined;
          this.timeline = undefined;
          this.render();
          resolve(true);
        },
      });
      this.timeline = tl;
      build(tl);
      if (matchMedia("(prefers-reduced-motion: reduce)").matches)
        tl.timeScale(12);
      tl.play();
    });
  }
  async select(book: Book) {
    if (this.book?.id === book.id && this.phase !== "idle") return;
    const request = ++this.revision;
    this.cancelMotion();
    if (this.book) await this.retract();
    if (request !== this.revision) return;
    this.book = book;
    const slot = this.scene.takeBook(book.id);
    this.pose = {
      x: slot.x,
      y: slot.y,
      width: book.height * this.aspect * slot.scale,
      height: book.height * slot.scale,
      depth: book.width * slot.scale,
      angle: slot.rotation,
      turn: 0,
      open: 0,
      leftSpan: book.height * this.aspect * slot.scale,
      shade: 0,
    };
    this.spine.src = slot.spineImage;
    this.element.style.setProperty("--book-color", book.color);
    this.element.style.setProperty(
      "--book-ink",
      inkFor(
        book.color,
        "var(--bsl-cover-ink-light, #33332f)",
        "var(--bsl-cover-ink-dark, #f6f4ef)",
      ),
    );
    this.resetFaces(book);
    const art = book.coverImage;
    this.openButton.classList.toggle("has-cover-image", !!art);
    this.openButton.style.setProperty(
      "--cover-image",
      art ? `url("${art.replace(/"/g, "%22")}")` : "none",
    );
    this.openButton.setAttribute("aria-label", this.labels.openBook(book));
    this.options.decorate?.(
      {
        cover: this.openButton,
        endpaper: this.element.querySelector(".foreground-endpaper")!,
      },
      book,
    );
    this.element.dataset.bookId = book.id;
    this.element.hidden = false;
    document.body.classList.add("book-in-hand");
    this.render();
    this.setPhase("pulling");
    const preview = this.preview();
    const finished = await this.play((tl) => {
      tl.to(this.pose, {
        y: Math.max(
          this.pose.height + 12,
          this.pose.y - (innerWidth < 600 ? 50 : 40),
        ),
        angle: 0,
        duration: 0.3,
        ease: "power2.out",
      });
      tl.call(() => this.setPhase("turning"));
      tl.to(this.pose, {
        ...preview,
        shade: 1,
        duration: 0.78,
        ease: "power2.inOut",
      });
    });
    if (finished && request === this.revision) {
      this.setPhase("cover");
      this.openButton.focus({ preventScroll: true });
    }
  }
  async open() {
    if (this.phase !== "cover") return;
    const request = this.revision;
    this.setPhase("opening");
    const g = readingGeometry();
    const finished = await this.play((tl) => {
      if (innerWidth < 600) {
        const small = this.smallSpread();
        tl.to(this.pose, {
          ...small,
          open: 1,
          duration: 0.72,
          ease: "power2.inOut",
        });
        tl.call(() => this.setPhase("open"));
        tl.to({}, { duration: 0.22 });
        tl.to(this.pose, {
          x: g.hinge + g.pageWidth / 2,
          y: g.top + g.pageHeight,
          width: g.pageWidth,
          height: g.pageHeight,
          depth: 5,
          leftSpan: g.pageWidth * g.leftRatio,
          duration: 0.48,
          ease: "power2.inOut",
        });
        tl.to({}, { duration: 0.18 });
      } else {
        tl.to(this.pose, {
          x: g.hinge + g.pageWidth / 2,
          y: g.top + g.pageHeight,
          width: g.pageWidth,
          height: g.pageHeight,
          depth: 5,
          open: 1,
          leftSpan: g.pageWidth,
          duration: 0.95,
          ease: "power2.inOut",
        });
        tl.call(() => this.setPhase("open"));
        tl.to({}, { duration: 0.4 });
      }
    });
    if (finished && request === this.revision && this.book) {
      this.setPhase("reading");
      this.callbacks.onOpen(this.book);
    }
  }
  /** Restore engine-owned face content; decorations from a previous book are dropped. */
  private resetFaces(book: Book) {
    const set = (sel: string, text: string) => {
      const el = this.element.querySelector<HTMLElement>(sel)!;
      el.textContent = text;
      el.hidden = !text;
    };
    for (const sel of [".cover-top", ".endpaper-top", ".endpaper-bottom"])
      set(sel, "");
    set(".cover-title", book.title);
    set(".cover-author", book.author ?? "");
    set(".endpaper-title", book.title);
    set(".endpaper-author", book.author ?? "");
    this.openButton
      .querySelectorAll("[data-decoration]")
      .forEach((n) => n.remove());
    this.element
      .querySelectorAll(".foreground-endpaper [data-decoration]")
      .forEach((n) => n.remove());
    const invite =
      this.element.querySelector<HTMLElement>(".cover-invitation")!;
    invite.textContent = this.labels.coverHint;
    invite.hidden = !this.labels.coverHint;
  }
  private smallSpread() {
    const width = (innerWidth - 56) / 2;
    const height = Math.min(248, innerHeight * 0.32);
    return {
      x: innerWidth / 2 + width / 2,
      y: (innerHeight - 140 + height) / 2,
      width,
      height,
      depth: 5,
      leftSpan: width,
    };
  }
  close(): Promise<void> {
    if (this.phase === "idle") return Promise.resolve();
    if (["closing", "turning-back", "returning"].includes(this.phase))
      return this.closed;
    ++this.revision;
    this.cancelMotion();
    this.closed = this.retract().then(() => this.callbacks.onReturn());
    return this.closed;
  }
  private async retract() {
    const book = this.book;
    if (!book) return;
    const preview = this.preview();
    this.setPhase("closing");
    let complete = await this.play((tl) => {
      if (this.pose.open > 0) {
        if (innerWidth < 600)
          tl.to(this.pose, {
            ...this.smallSpread(),
            duration: 0.4,
            ease: "power2.inOut",
          });
        tl.to(this.pose, { ...preview, duration: 0.7, ease: "power2.inOut" });
      }
      tl.call(() => this.setPhase("turning-back"));
      tl.to(this.pose, { turn: 0, duration: 0.42, ease: "power2.inOut" });
    });
    if (!complete) return;
    // Measure the current slot after any resize/filter; never reuse stale coordinates.
    const slot = this.scene.slotPose(book.id);
    this.setPhase("returning");
    complete = await this.play((tl) => {
      if (slot)
        tl.to(this.pose, {
          x: slot.x,
          y: slot.y,
          width: book.height * this.aspect * slot.scale,
          height: book.height * slot.scale,
          depth: book.width * slot.scale,
          angle: slot.rotation,
          shade: 0,
          duration: 0.65,
          ease: "power3.inOut",
        });
      else tl.to(this.pose, { shade: 0, duration: 0.15 });
    });
    if (!complete) return;
    this.element.hidden = true;
    this.scene.restoreBook(book.id);
    this.book = undefined;
    document.body.classList.remove("book-in-hand");
    this.setPhase("idle");
  }
  private resize = () => {
    if (this.phase === "cover") {
      Object.assign(this.pose, this.preview());
      this.render();
    }
    if (this.phase === "reading") this.fitReading();
    // Interrupted transitions reverse from their current pose rather than teleport.
    if (["pulling", "turning", "opening", "open"].includes(this.phase))
      void this.close();
  };
  fitReading() {
    const g = readingGeometry();
    Object.assign(this.pose, {
      x: g.hinge + g.pageWidth / 2,
      y: g.top + g.pageHeight,
      width: g.pageWidth,
      height: g.pageHeight,
      depth: 5,
      open: 1,
      leftSpan: g.pageWidth * g.leftRatio,
    });
    this.render();
  }
  destroy() {
    ++this.revision;
    this.cancelMotion();
    this.abort.abort();
    if (this.book) this.scene.restoreBook(this.book.id);
    this.element.remove();
    document.body.classList.remove("book-in-hand");
    delete document.body.dataset.bookPhase;
  }
}
