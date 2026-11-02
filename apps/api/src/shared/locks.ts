const queues = new Map<string, Promise<void>>();

export async function withKeyLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  queues.set(key, queued);
  await previous;
  try { return await work(); }
  finally {
    release();
    if (queues.get(key) === queued) queues.delete(key);
  }
}

