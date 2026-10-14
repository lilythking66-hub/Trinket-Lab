export interface InputPolicy {
  delay: number;
  threshold: number;
}
export const DesktopAdapter: InputPolicy = { delay: 0, threshold: 5 };
export const MobileAdapter: InputPolicy = { delay: 360, threshold: 9 };
export function adapterFor(event: PointerEvent) {
  return event.pointerType === "mouse" ? DesktopAdapter : MobileAdapter;
}
