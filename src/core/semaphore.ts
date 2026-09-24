interface Waiter {
  resolve: () => void;
  next?: Waiter;
}

export class Semaphore {
  private first?: Waiter;
  private last?: Waiter;
  private active = 0;
  private readonly limit: number;

  constructor(limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new RangeError("Concurrency limit must be a positive safe integer");
    }
    this.limit = limit;
  }

  async acquire(): Promise<() => void> {
    if (this.active < this.limit) {
      this.active++;
    } else {
      await new Promise<void>((resolve) => {
        const waiter: Waiter = { resolve };
        if (this.last) this.last.next = waiter;
        else this.first = waiter;
        this.last = waiter;
      });
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.release();
    };
  }

  private release() {
    const next = this.first;
    if (next) {
      this.first = next.next;
      if (!this.first) this.last = undefined;
      // Transfer the permit without exposing a free slot before the waiter resumes.
      next.resolve();
    } else {
      this.active--;
    }
  }

  get activeCount() {
    return this.active;
  }
}
