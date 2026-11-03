import { timingSafeEqual } from 'crypto';

/**
 * Constant-time string comparison for shared secrets. `!==` stops at the first
 * differing byte, which leaks how much of a guess matched. Unequal lengths
 * return false straight away, which reveals only the length.
 */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
