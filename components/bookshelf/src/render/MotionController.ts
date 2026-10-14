import { gsap } from "gsap";
import type { Slot } from "../core/LayoutEngine";
import type { BookRenderer } from "./BookRenderer";
import type { LayoutConfig } from "../responsive/Layouts";
export class MotionController {
  private reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  constructor(private render: () => void) {}
  place(
    view: BookRenderer,
    slot: Slot,
    config: LayoutConfig,
    selected = false,
    immediate = false,
  ) {
    gsap.killTweensOf([view, view.scale]);
    view.zIndex = selected ? 1000 : slot.row * 10;
    const duration = immediate || this.reduced ? 0 : config.duration;
    gsap.to(view, {
      x: slot.x + slot.width / 2,
      y: slot.y - (selected ? config.pull : 0),
      angle: selected ? 0 : slot.rotation,
      duration,
      ease: "power3.out",
      onUpdate: this.render,
    });
    gsap.to(view.scale, {
      x: slot.scale * (selected ? config.selectedScale : 1),
      y: slot.scale * (selected ? config.selectedScale : 1),
      duration,
      ease: "power3.out",
      onUpdate: this.render,
    });
  }
  lift(view: BookRenderer, scale: number) {
    gsap.killTweensOf([view, view.scale]);
    view.zIndex = 2000;
    gsap.to(view, { angle: 0, duration: 0.18, onUpdate: this.render });
    gsap.to(view.scale, {
      x: scale * 1.06,
      y: scale * 1.06,
      duration: 0.18,
      onUpdate: this.render,
    });
  }
  hover(view: BookRenderer, y: number) {
    gsap.to(view, {
      y,
      duration: this.reduced ? 0 : 0.22,
      ease: "power2.out",
      overwrite: "auto",
      onUpdate: this.render,
    });
  }
  stop(view: BookRenderer) {
    gsap.killTweensOf([view, view.scale]);
  }
}
