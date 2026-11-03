import { safeEqual } from './safe-equal';

describe('safeEqual', () => {
  it('is true only for identical strings', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });

  it('compares multi-byte strings by their UTF-8 bytes', () => {
    expect(safeEqual('é', 'é')).toBe(true);
    // Same UTF-16 length, different UTF-8 length: must not throw.
    expect(safeEqual('é', 'e')).toBe(false);
  });
});
