// A loaded renderer owns one camera lifetime. Release synchronously revokes that
// owner and queues cleanup once; completing old cleanup never changes the new owner.
export function rendererLifetime(stop: () => Promise<void>) {
  let ready = false;
  let cleanup = Promise.resolve();
  return {
    get ready() { return ready; },
    loaded() { ready = true; },
    release(): Promise<void> {
      if (!ready) return cleanup;
      ready = false;
      cleanup = stop().catch(() => undefined);
      return cleanup;
    },
  };
}
