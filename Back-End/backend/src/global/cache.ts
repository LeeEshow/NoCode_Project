import NodeCache from 'node-cache';

const cache = new NodeCache();

export { cache as nodeCache };

export const getOrSet = async <T>(
  key: string,
  factory: () => Promise<T>,
  ttlSeconds = 60,
  shouldCache?: (value: T) => boolean
): Promise<T> => {
  const cached = cache.get<T>(key);
  if (cached !== undefined) return cached;

  const value = await factory();
  const ok = shouldCache ? shouldCache(value) : true;
  if (ok) cache.set(key, value, ttlSeconds);
  return value;
};
