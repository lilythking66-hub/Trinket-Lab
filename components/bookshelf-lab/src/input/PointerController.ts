import { adapterFor } from "./Adapters";
export interface PointerCallbacks {
  select(id: string): void;
  start(id: string, x: number, y: number): void;
  move(id: string, x: number, y: number): void;
  end(cancel: boolean): void;
  hover(id: string, active: boolean): void;
}
export class PointerController {
  private abort = new AbortController();
  private pending?: {
    id: string;
    pointer: number;
    x: number;
    y: number;
    drag: boolean;
    target: HTMLElement;
  };
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    private root: HTMLElement,
    private callbacks: PointerCallbacks,
  ) {
    const signal = this.abort.signal;
    root.addEventListener("pointerdown", this.down, { signal });
    root.addEventListener("pointermove", this.move, { signal });
    root.addEventListener("pointerup", this.up, { signal });
    root.addEventListener("pointercancel", this.cancel, { signal });
    root.addEventListener(
      "lostpointercapture",
      () => {
        if (this.pending) this.finish(true);
      },
      { signal },
    );
    root.addEventListener(
      "click",
      (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>("[data-book]");
        if (e.detail === 0 && b) this.callbacks.select(b.dataset.book!);
      },
      { signal },
    );
    root.addEventListener(
      "pointerover",
      (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>("[data-book]");
        if (b && e.pointerType === "mouse" && !this.pending)
          this.callbacks.hover(b.dataset.book!, true);
      },
      { signal },
    );
    root.addEventListener(
      "pointerout",
      (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>("[data-book]");
        if (b && e.pointerType === "mouse" && !this.pending)
          this.callbacks.hover(b.dataset.book!, false);
      },
      { signal },
    );
    // Keep ordinary vertical scrolling until long press activates the drag.
    root.addEventListener(
      "touchmove",
      (e) => {
        if (this.pending?.drag) e.preventDefault();
      },
      { signal, passive: false },
    );
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape" && this.pending) this.finish(true);
      },
      { signal },
    );
    window.addEventListener("blur", () => this.finish(true), { signal });
  }
  private down = (e: PointerEvent) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(
      "[data-book]",
    );
    if (!target || e.button !== 0 || this.pending) return;
    this.pending = {
      id: target.dataset.book!,
      pointer: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      drag: false,
      target,
    };
    target.setPointerCapture(e.pointerId);
    const policy = adapterFor(e);
    if (policy.delay) this.timer = setTimeout(() => this.start(), policy.delay);
  };
  private start() {
    const p = this.pending;
    if (!p) return;
    p.drag = true;
    clearTimeout(this.timer);
    this.root.classList.add("is-dragging");
    this.callbacks.start(p.id, p.x, p.y);
  }
  private move = (e: PointerEvent) => {
    const p = this.pending;
    if (!p || p.pointer !== e.pointerId) return;
    const distance = Math.hypot(e.clientX - p.x, e.clientY - p.y);
    const policy = adapterFor(e);
    if (!p.drag && distance > policy.threshold) {
      if (policy.delay) {
        this.finish(true);
        return;
      }
      this.start();
    }
    if (p.drag) {
      e.preventDefault();
      this.callbacks.move(p.id, e.clientX, e.clientY);
    }
  };
  private up = (e: PointerEvent) => {
    const p = this.pending;
    if (!p || p.pointer !== e.pointerId) return;
    if (!p.drag) this.callbacks.select(p.id);
    this.finish(false);
  };
  private cancel = () => this.finish(true);
  private finish(cancel: boolean) {
    const p = this.pending;
    if (!p) return;
    clearTimeout(this.timer);
    this.pending = undefined;
    this.root.classList.remove("is-dragging");
    if (p.target.hasPointerCapture(p.pointer))
      p.target.releasePointerCapture(p.pointer);
    if (p.drag) this.callbacks.end(cancel);
  }
  cancelActive() {
    this.finish(true);
  }
  destroy() {
    this.finish(true);
    this.abort.abort();
  }
}
