import { reject } from "../../../platform/errors.ts";

export function createLoginLimiter(now = Date.now) {
  const attempts = new Map<string, { count: number; until: number }>();
  let global = { count: 0, until: 0 };
  let hashing = 0;
  return {
    acquire(login: string): () => void {
      const time = now();
      for (const [key, value] of attempts) if (value.until <= time) attempts.delete(key);
      if (global.until <= time) global = { count: 0, until: time + 60_000 };
      const name = attempts.get(login) ?? { count: 0, until: time + 60_000 };
      if (global.count >= 60 || name.count >= 10 || hashing >= 2 || attempts.size >= 1000)
        reject("rate_limited");
      global.count++;
      name.count++;
      attempts.set(login, name);
      hashing++;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          hashing--;
        }
      };
    },
  };
}
