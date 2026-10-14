import { gsap } from "gsap";
import { readingGeometry } from "../responsive/ReaderLayout";
import type { Book } from "../core/Book";
import { ReaderState } from "../core/ReaderState";
import type { ReaderRenderer, ReaderCallbacks } from "./ReaderRenderer";
import { defaultReaderLabels, type ReaderLabels } from "../theme/Labels";
import { applySurface, type SurfaceSkin } from "../theme/Theme";
import {
  createMeasurer,
  pageAt,
  pageHTML,
  paginate,
  type TextPage,
} from "./paginate";
import "./simple-page-reader.css";
export interface SimplePageReaderOptions {
  labels?: Partial<ReaderLabels>;
  surface?: Partial<SurfaceSkin>;
}
export class SimplePageReader implements ReaderRenderer {
  private closing = false;
  private abort = new AbortController();
  private dialog = document.createElement("dialog");
  private book?: Book;
  private state = new ReaderState(0);
  private start?: { x: number; y: number };
  private labels: ReaderLabels;
  private tocOpen = false;
  /** Pages of a continuous-text book (Book.text); undefined for pre-split books. */
  private textPages?: TextPage[];
  private layoutRun = 0;
  private resizeTimer?: ReturnType<typeof setTimeout>;
  private static count = 0;
  constructor(
    private callbacks: ReaderCallbacks,
    options: SimplePageReaderOptions = {},
  ) {
    this.labels = { ...defaultReaderLabels, ...options.labels };
    const titleId = `reader-title-${++SimplePageReader.count}`;
    this.dialog.className = "reader";
    this.dialog.setAttribute("aria-labelledby", titleId);
    if (options.surface) applySurface(this.dialog, options.surface);
    this.dialog.innerHTML = `<div class="reader-top"><button class="reader-close"></button><span class="reader-header"></span><button class="reader-toc-button" aria-expanded="false" hidden></button></div><div class="reader-toc-scrim" hidden></div><aside class="reader-toc" hidden><div class="reader-toc-head"><span class="reader-toc-title"></span><button class="reader-toc-close">×</button></div><ol class="reader-toc-list"></ol></aside><article class="reader-page"><div class="reader-eyebrow"></div><h1 id="${titleId}" class="reader-title"></h1><div class="reader-author"></div><div class="reader-body" tabindex="0"></div></article><footer class="reader-footer"><button class="page-prev">← <span class="page-prev-text"></span></button><div><div class="page-count" aria-live="polite"></div><progress max="1" value="0"></progress></div><button class="page-next"><span class="page-next-text"></span> →</button></footer>`;
    this.applyLabels();
    document.body.append(this.dialog);
    window.addEventListener(
      "resize",
      () => {
        this.fit();
        if (!this.book?.text || !this.dialog.open) return;
        clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(
          () => void this.layoutText(this.currentOffset()),
          160,
        );
      },
      { signal: this.abort.signal },
    );
    this.dialog
      .querySelector(".reader-close")!
      .addEventListener("click", () => this.close());
    this.dialog
      .querySelector(".page-prev")!
      .addEventListener("click", () => this.previousPage());
    this.dialog
      .querySelector(".page-next")!
      .addEventListener("click", () => this.nextPage());
    this.dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      if (this.tocOpen) this.toggleToc(false);
      else this.close();
    });
    this.dialog
      .querySelector(".reader-toc-button")!
      .addEventListener("click", () => this.toggleToc());
    this.dialog
      .querySelector(".reader-toc-close")!
      .addEventListener("click", () => this.toggleToc(false));
    this.dialog
      .querySelector(".reader-toc-scrim")!
      .addEventListener("click", () => this.toggleToc(false));
    this.dialog
      .querySelector(".reader-toc-list")!
      .addEventListener("click", (e) => {
        const item = (e.target as HTMLElement).closest<HTMLElement>(
          "[data-chapter]",
        );
        if (!item || !this.textPages) return;
        const chapter = Number(item.dataset.chapter);
        const page = this.textPages.findIndex((p) => p.chapter === chapter);
        if (page < 0) return;
        this.toggleToc(false);
        this.goToPage(page);
      });
    // Listen on the document: when a page button becomes disabled at the last page,
    // focus falls back to <body> and a dialog-level listener would stop hearing arrows.
    document.addEventListener(
      "keydown",
      (e) => {
        if (!this.dialog.open || this.closing || this.tocOpen) return;
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        )
          return;
        if (e.key === "ArrowRight") {
          e.preventDefault();
          this.nextPage();
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          this.previousPage();
        }
      },
      { signal: this.abort.signal },
    );
    const body = this.dialog.querySelector<HTMLElement>(".reader-body")!;
    body.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse")
        this.start = { x: e.clientX, y: e.clientY };
    });
    body.addEventListener("pointerup", (e) => {
      if (!this.start) return;
      const dx = e.clientX - this.start.x,
        dy = e.clientY - this.start.y;
      this.start = undefined;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        if (dx < 0) this.nextPage();
        else this.previousPage();
      }
    });
    body.addEventListener("pointercancel", () => (this.start = undefined));
  }
  open(book: Book) {
    this.book = book;
    this.textPages = undefined;
    this.toggleToc(false);
    this.state = new ReaderState(
      book.text ? 0 : book.pages.length,
      book.progress,
    );
    this.dialog.querySelector(".reader-title")!.textContent = book.title;
    this.dialog.querySelector(".reader-author")!.textContent =
      book.author ?? "";
    this.render();
    this.closing = false;
    this.fit();
    gsap.set(this.dialog, { opacity: 0 });
    document.body.classList.add("reader-open");
    this.dialog.showModal();
    if (book.text) void this.layoutText(book.progress * book.text.length);
    gsap.to(this.dialog, {
      opacity: 1,
      duration: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 0.25,
    });
  }
  private fit() {
    const g = readingGeometry();
    this.dialog.style.setProperty("--reader-left", `${g.hinge}px`);
    this.dialog.style.setProperty("--reader-top", `${g.top}px`);
    this.dialog.style.setProperty("--reader-width", `${g.pageWidth}px`);
    this.dialog.style.setProperty("--reader-height", `${g.pageHeight}px`);
  }
  close() {
    if (!this.dialog.open || this.closing) return;
    this.toggleToc(false);
    this.closing = true;
    gsap.to(this.dialog, {
      opacity: 0,
      duration: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 0.18,
      overwrite: true,
      onComplete: () => {
        this.dialog.close();
        document.body.classList.remove("reader-open");
        this.callbacks.onClose();
        this.closing = false;
      },
    });
  }
  /** Paginate Book.text for the current page box and land on the page containing `offset`. */
  private async layoutText(offset: number) {
    const book = this.book;
    if (!book?.text) return;
    const run = ++this.layoutRun;
    const body = this.dialog.querySelector<HTMLElement>(".reader-body")!;
    await new Promise((r) => requestAnimationFrame(r));
    if (run !== this.layoutRun || body.clientHeight < 40) return;
    const count = this.dialog.querySelector(".page-count")!;
    if (!this.textPages) count.textContent = this.labels.paginating;
    const measurer = createMeasurer(body);
    try {
      const pages = await paginate(book.text, book.chapters, measurer.fits, {
        isCancelled: () => run !== this.layoutRun || this.book !== book,
        onProgress: (n) => {
          if (!this.textPages)
            count.textContent = `${this.labels.paginating} ${n}`;
        },
      });
      if (!pages || run !== this.layoutRun || this.book !== book) return;
      this.textPages = pages;
      this.state = new ReaderState(pages.length);
      this.state.goTo(
        offset >= book.text.length ? pages.length - 1 : pageAt(pages, offset),
      );
      this.render();
    } finally {
      measurer.dispose();
    }
  }
  private currentOffset() {
    const page = this.textPages?.[this.state.index];
    return page
      ? page.start
      : (this.book?.progress ?? 0) * (this.book?.text?.length ?? 0);
  }
  private get progress() {
    const book = this.book;
    if (book?.text && this.textPages) {
      if (this.state.index >= this.textPages.length - 1) return 1;
      return (
        this.textPages[this.state.index].start / Math.max(1, book.text.length)
      );
    }
    return this.state.progress;
  }
  goToPage(index: number) {
    if (!this.book || !this.state.count) return;
    this.state.goTo(index);
    this.callbacks.onProgress(this.book.id, this.progress);
    this.render();
  }
  nextPage() {
    this.goToPage(this.state.index + 1);
  }
  previousPage() {
    this.goToPage(this.state.index - 1);
  }
  private render() {
    if (!this.book) return;
    const body = this.dialog.querySelector<HTMLElement>(".reader-body")!;
    const text = this.book.text;
    const laying = !!text && !this.textPages;
    const hasPages = this.state.count > 0;
    if (text && this.textPages)
      body.innerHTML = pageHTML(text, this.textPages[this.state.index]);
    else if (laying) body.textContent = "";
    else
      body.textContent = hasPages
        ? this.book.pages[this.state.index]
        : this.labels.emptyBody(this.book);
    body.scrollTop = 0;
    this.dialog.querySelector(".page-count")!.textContent = laying
      ? this.labels.paginating
      : hasPages
        ? `${String(this.state.index + 1).padStart(2, "0")} / ${String(this.state.count).padStart(2, "0")}`
        : this.labels.noPages;
    this.dialog.querySelector<HTMLElement>(".reader-toc-button")!.hidden =
      !this.tocChapters.length;
    if (this.tocOpen) this.renderToc();
    const progress = this.dialog.querySelector("progress")!;
    progress.hidden = !hasPages;
    progress.value = this.progress;
    const prev = this.dialog.querySelector<HTMLButtonElement>(".page-prev")!;
    const next = this.dialog.querySelector<HTMLButtonElement>(".page-next")!;
    const focused = document.activeElement;
    prev.disabled = !hasPages || this.state.index === 0;
    next.disabled = !hasPages || this.state.index === this.state.count - 1;
    // Keep focus inside the dialog when the focused page button just became disabled.
    if (
      (focused === prev && prev.disabled) ||
      (focused === next && next.disabled)
    )
      body.focus({ preventScroll: true });
  }
  /** Chapters worth listing: a continuous text with at least two titled chapters. */
  private get tocChapters() {
    const chapters = this.book?.text ? (this.book.chapters ?? []) : [];
    const titled = chapters.map((c, i) => ({ ...c, i })).filter((c) => c.title);
    return titled.length >= 2 ? titled : [];
  }
  private toggleToc(open = !this.tocOpen) {
    const panel = this.dialog.querySelector<HTMLElement>(".reader-toc")!;
    const button =
      this.dialog.querySelector<HTMLElement>(".reader-toc-button")!;
    open = open && this.tocChapters.length > 0;
    this.tocOpen = open;
    panel.hidden = !open;
    this.dialog.querySelector<HTMLElement>(".reader-toc-scrim")!.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (!open) return;
    this.renderToc();
    const current = panel.querySelector<HTMLElement>('[aria-current="true"]');
    current?.scrollIntoView({ block: "center" });
    (
      current ?? panel.querySelector<HTMLElement>("button[data-chapter]")
    )?.focus({ preventScroll: true });
  }
  private renderToc() {
    const list = this.dialog.querySelector<HTMLElement>(".reader-toc-list")!;
    const pages = this.textPages;
    const here = pages?.[this.state.index]?.chapter;
    list.replaceChildren(
      ...this.tocChapters.map((c) => {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.dataset.chapter = String(c.i);
        b.style.setProperty("--toc-level", String(Math.min(3, c.level ?? 0)));
        const title = document.createElement("span");
        title.textContent = c.title;
        const page = document.createElement("span");
        page.className = "reader-toc-page";
        const first = pages?.findIndex((p) => p.chapter === c.i) ?? -1;
        page.textContent = first >= 0 ? String(first + 1) : "";
        b.append(title, page);
        b.disabled = !pages;
        if (here === c.i) b.setAttribute("aria-current", "true");
        li.append(b);
        return li;
      }),
    );
  }
  private applyLabels() {
    const q = <T extends HTMLElement = HTMLElement>(sel: string) =>
      this.dialog.querySelector<T>(sel)!;
    q(".reader-close").textContent = this.labels.back;
    q(".reader-header").textContent = this.labels.header;
    q(".reader-header").hidden = !this.labels.header;
    q(".reader-eyebrow").textContent = this.labels.eyebrow;
    q(".reader-eyebrow").hidden = !this.labels.eyebrow;
    q(".page-prev").setAttribute("aria-label", this.labels.previous);
    q(".page-next").setAttribute("aria-label", this.labels.next);
    q(".page-prev-text").textContent = this.labels.previous;
    q(".page-next-text").textContent = this.labels.next;
    q("progress").setAttribute("aria-label", this.labels.progress);
    q(".reader-toc-button").textContent = this.labels.contents;
    q(".reader-toc-title").textContent = this.labels.contents;
    q(".reader-toc-close").setAttribute(
      "aria-label",
      this.labels.closeContents,
    );
    q(".reader-toc").setAttribute("aria-label", this.labels.contents);
  }
  /** Replace copy at runtime (e.g. language switch). */
  setLabels(labels: Partial<ReaderLabels>) {
    this.labels = { ...this.labels, ...labels };
    this.applyLabels();
    this.render();
  }
  setSurface(surface: Partial<SurfaceSkin>) {
    applySurface(this.dialog, surface);
  }
  destroy() {
    this.layoutRun++;
    clearTimeout(this.resizeTimer);
    this.abort.abort();
    gsap.killTweensOf(this.dialog);
    this.dialog.remove();
    document.body.classList.remove("reader-open");
  }
}
