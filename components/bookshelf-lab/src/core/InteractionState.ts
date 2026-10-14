export type InteractionState =
  | { kind: "idle" }
  | { kind: "selected"; id: string }
  | { kind: "dragging"; id: string }
  | { kind: "reading"; id: string };
