/**
 * Deterministic pseudo-random helpers for the sandbox fixtures.
 *
 * The whole demo dataset is generated from a single fixed seed so every
 * prospect sees the same cabinet, and so counts/charts are reproducible
 * across reloads and across server/client renders. No crypto here — this is
 * a fake dataset, nothing is security-sensitive.
 */

/** mulberry32 — tiny, fast, good-enough PRNG. Returns a [0,1) generator. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Small bundle of convenience methods around a seeded generator. */
export class Rng {
  private next: () => number

  constructor(seed = 0x5a4d2b11) {
    this.next = mulberry32(seed)
  }

  /** Float in [0, 1). */
  float(): number {
    return this.next()
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p
  }

  /** Pick one element. */
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]
  }

  /** Pick a weighted element. `weights` must align with `items`. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((a, b) => a + b, 0)
    let r = this.next() * total
    for (let i = 0; i < items.length; i++) {
      r -= weights[i]
      if (r <= 0) return items[i]
    }
    return items[items.length - 1]
  }

  /** Fisher–Yates shuffle (returns a new array). */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice()
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }
}

/**
 * Deterministic UUID-shaped id from a seeded counter. Not a real UUID (no
 * entropy) but matches the `xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx` shape so it
 * drops into fixtures and URLs like the real ids do.
 */
export function fakeId(prefix: string, n: number): string {
  const hex = (n >>> 0).toString(16).padStart(12, '0')
  const p = prefix.padEnd(8, '0').slice(0, 8)
  return `${p}-0000-4000-8000-${hex}`
}
