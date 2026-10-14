export class ReaderState {
  index = 0;
  constructor(
    public readonly count: number,
    progress = 0,
  ) {
    this.goTo(Math.round(progress * Math.max(0, count - 1)));
  }
  goTo(index: number) {
    this.index = Math.min(
      Math.max(0, Math.floor(index)),
      Math.max(0, this.count - 1),
    );
  }
  get progress() {
    return this.count === 0
      ? 0
      : this.count === 1
        ? 1
        : this.index / (this.count - 1);
  }
}
