// R2: tracked timeouts that can all be cancelled at once (unmount / quit / restart) and never fire afterwards.
export interface TimerBag {
  later(fn: () => void, ms: number): void;
  clear(): void;
  readonly pending: number;
}

export function createTimerBag(): TimerBag {
  const ids = new Set<ReturnType<typeof setTimeout>>();
  let disposed = false;
  return {
    later(fn, ms) {
      if (disposed) return;
      const id = setTimeout(() => {
        ids.delete(id);
        if (!disposed) fn();
      }, ms);
      ids.add(id);
    },
    clear() {
      disposed = true;
      ids.forEach(clearTimeout);
      ids.clear();
    },
    get pending() {
      return ids.size;
    },
  };
}
